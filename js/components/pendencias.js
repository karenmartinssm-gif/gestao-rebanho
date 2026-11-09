// =====================================================================
// PENDÊNCIAS — vacinas, vermifugações, partos, diagnósticos, desmames,
// tratamentos, carências e estoque baixo. Usado pelo Painel (só os
// quadros com pendência) e pela página Pendências (todos os quadros).
// =====================================================================
import { sb } from '../supabase.js';
import { store, param } from '../store.js';
import { esc, fmtNum, fmtData, hojeISO, addDias, diasEntre, abrirModal, icones } from '../ui.js';

async function consulta(promessa) {
  const { data, error } = await promessa;
  if (error) { console.warn(error); return { erro: error, data: [] }; }
  return { data: data || [] };
}

/** Consultas usadas pelas pendências: [manejos, coberturas, desmames, estoque, partos]. */
export function consultasPendencias(p, hoje = hojeISO()) {
  return [
    consulta(sb.from('manejos_sanitarios').select('id, tipo_manejo_id, data_aplicacao, proxima_aplicacao, proxima_resolvida, situacao, carencia_ate, manejo_animais(animal_id)')
      .eq('propriedade_id', p).or(`situacao.eq.em_andamento,and(proxima_aplicacao.not.is.null,proxima_resolvida.eq.false),carencia_ate.gte.${hoje}`)),
    consulta(sb.from('coberturas').select('id, matriz_id, data_cobertura, data_prevista_parto, situacao, tipo').eq('propriedade_id', p).in('situacao', ['prenhe', 'aguardando_diagnostico', 'parida'])),
    consulta(sb.from('desmames').select('bezerro_id').eq('propriedade_id', p)),
    consulta(sb.from('vw_estoque_suplementos').select('id, nome, unidade, estoque_minimo, saldo, ativo').eq('propriedade_id', p).eq('ativo', true)),
    consulta(sb.from('nascimentos').select('matriz_id, cobertura_id, data_nascimento').eq('propriedade_id', p)),
  ];
}

/** Monta os quadros de pendência a partir dos dados carregados. */
export function montarPendencias({ animais, manejos, cobs, desm, estq, nasc = { data: [] } }) {
  const hoje = hojeISO();
  const porId = new Map(animais.map((a) => [a.id, a]));
  const ativos = animais.filter((a) => a.conta_no_rebanho);
  const ativo = (id) => porId.get(id)?.conta_no_rebanho;
  const tipoManejo = new Map(store.base.tiposManejo.map((t) => [t.id, t]));
  const emTratamento = new Set(manejos.data.filter((m) => m.situacao === 'em_andamento')
    .flatMap((m) => m.manejo_animais.map((x) => x.animal_id)).filter(ativo));
  const limiteManejo = addDias(hoje, param('dias_alerta_manejo'));
  const manejosPend = manejos.data.filter((m) => m.proxima_aplicacao && !m.proxima_resolvida && m.proxima_aplicacao <= limiteManejo && m.situacao !== 'cancelado');

  // ---------- Pendências ----------
  const descrAnimais = (m) => {
    const ids = m.manejo_animais.map((x) => x.animal_id).filter(ativo);
    if (ids.length === 1) return `Animal ${porId.get(ids[0]).brinco}`;
    return `${ids.length} animais`;
  };
  const quando = (d) => {
    const n = diasEntre(hoje, d);
    if (n < 0) return `<span class="badge perigo">atrasado ${-n}d</span>`;
    if (n === 0) return '<span class="badge aviso">hoje</span>';
    return `<span class="badge aviso">${fmtData(d)}</span>`;
  };
  const porClasse = (c) => manejosPend.filter((m) => tipoManejo.get(m.tipo_manejo_id)?.classe === c);
  const limiteParto = addDias(hoje, param('dias_alerta_parto'));
  const limiteDiag = addDias(hoje, -param('dias_diagnostico_gestacao'));
  const limiteTE = addDias(hoje, -param('dias_conferir_te'));
  const desmamados = new Set(desm.data.map((d) => d.bezerro_id));
  const limiteDesmame = addDias(hoje, param('dias_alerta_desmame'));

  // Cada item: [texto, detalhe (HTML), animais [{ id, brinco }], atrasado?, link]
  const animaisDe = (m) => m.manejo_animais.map((x) => x.animal_id).filter(ativo).map((id) => ({ id, brinco: porId.get(id).brinco }));
  const um = (id) => [{ id, brinco: porId.get(id).brinco }];
  const atrasado = (d) => d < hoje;
  const nomeTipo = (m) => tipoManejo.get(m.tipo_manejo_id)?.nome || 'Manejo';
  const desmameEm = (a) => addDias(a.data_nascimento, param('idade_desmame_dias'));

  // Vacas marcadas como paridas sem o parto registrado (ex.: vieram da planilha sem data nem bezerro).
  // Some quando o parto for registrado na ficha (qualquer parto da vaca a partir da data da cobertura).
  const temParto = (c) => nasc.data.some((n) => n.cobertura_id === c.id || (n.matriz_id === c.matriz_id && n.data_nascimento >= c.data_cobertura));
  const semParto = new Map();
  cobs.data.filter((c) => c.situacao === 'parida' && ativo(c.matriz_id) && !temParto(c))
    .forEach((c) => { if (!semParto.has(c.matriz_id) || semParto.get(c.matriz_id).data_cobertura < c.data_cobertura) semParto.set(c.matriz_id, c); });

  const pend = [
    { titulo: 'Vacinas próximas', icone: 'syringe', itens: porClasse('vacina').map((m) => [`${nomeTipo(m)} · ${descrAnimais(m)}`, quando(m.proxima_aplicacao), animaisDe(m), atrasado(m.proxima_aplicacao), '#/sanidade']) },
    { titulo: 'Vermifugações pendentes', icone: 'bug', itens: porClasse('vermifugacao').map((m) => [descrAnimais(m), quando(m.proxima_aplicacao), animaisDe(m), atrasado(m.proxima_aplicacao), '#/sanidade']) },
    { titulo: 'Outros manejos e retornos', icone: 'clipboard-list', itens: manejosPend.filter((m) => !['vacina', 'vermifugacao'].includes(tipoManejo.get(m.tipo_manejo_id)?.classe)).map((m) => [`${nomeTipo(m)} · ${descrAnimais(m)}`, quando(m.proxima_aplicacao), animaisDe(m), atrasado(m.proxima_aplicacao), '#/sanidade']) },
    { titulo: 'Previsões de parto', icone: 'baby', itens: cobs.data.filter((c) => c.situacao === 'prenhe' && c.data_prevista_parto && c.data_prevista_parto <= limiteParto && ativo(c.matriz_id)).sort((a, b) => a.data_prevista_parto.localeCompare(b.data_prevista_parto)).map((c) => [`Vaca ${porId.get(c.matriz_id).brinco}`, quando(c.data_prevista_parto), um(c.matriz_id), atrasado(c.data_prevista_parto), `#/animais/${c.matriz_id}?aba=reprodutivo`]) },
    { titulo: 'Partos sem registro', icone: 'clipboard-pen', itens: [...semParto.values()].sort((a, b) => porId.get(a.matriz_id).brinco.localeCompare(porId.get(b.matriz_id).brinco, 'pt-BR', { numeric: true })).map((c) => [`Vaca ${porId.get(c.matriz_id).brinco}`, '<span class="badge aviso">falta data do parto</span>', um(c.matriz_id), false, `#/animais/${c.matriz_id}?aba=reprodutivo`]) },
    { titulo: 'Conferir transferência de embrião (TE)', icone: 'microscope', itens: cobs.data.filter((c) => c.tipo === 'tetf' && c.situacao === 'aguardando_diagnostico' && c.data_cobertura <= limiteTE && ativo(c.matriz_id))
      .sort((a, b) => a.data_cobertura.localeCompare(b.data_cobertura)).map((c) => [`Vaca ${porId.get(c.matriz_id).brinco}`, `<span class="small muted">TE em ${fmtData(c.data_cobertura)}</span>`, um(c.matriz_id), false, `#/animais/${c.matriz_id}?aba=reprodutivo`]) },
    { titulo: 'Diagnósticos de gestação pendentes', icone: 'scan-search', itens: cobs.data.filter((c) => c.tipo !== 'tetf' && c.situacao === 'aguardando_diagnostico' && c.data_cobertura <= limiteDiag && ativo(c.matriz_id)).map((c) => [`Vaca ${porId.get(c.matriz_id).brinco}`, `<span class="small muted">coberta ${fmtData(c.data_cobertura)}</span>`, um(c.matriz_id), false, `#/animais/${c.matriz_id}?aba=reprodutivo`]) },
    { titulo: 'Desmames previstos', icone: 'milk-off', itens: ativos.filter((a) => a.categoria_grupo === 'bezerro' && a.origem === 'nascido' && a.data_nascimento && !desmamados.has(a.id) && desmameEm(a) <= limiteDesmame).map((a) => [`Bezerro(a) ${a.brinco}`, quando(desmameEm(a)), um(a.id), atrasado(desmameEm(a)), `#/animais/${a.id}`]) },
    { titulo: 'Tratamentos em andamento', icone: 'stethoscope', itens: [...emTratamento].map((id) => [`Animal ${porId.get(id).brinco}`, '<span class="badge info">em andamento</span>', um(id), false, `#/animais/${id}`]) },
    { titulo: 'Fim de carência', icone: 'timer', itens: manejos.data.filter((m) => m.carencia_ate && m.carencia_ate >= hoje).map((m) => [`${nomeTipo(m)} · ${descrAnimais(m)}`, `<span class="small">até ${fmtData(m.carencia_ate)}</span>`, animaisDe(m), false, '#/sanidade']) },
    { titulo: 'Suplementos com estoque baixo', icone: 'package-open', itens: estq.data.filter((s) => Number(s.estoque_minimo) > 0 && Number(s.saldo) <= Number(s.estoque_minimo)).map((s) => [s.nome, `<span class="badge perigo">${fmtNum(s.saldo, 1)} ${esc(s.unidade)}</span>`, [], Number(s.saldo) <= 0, '#/alimentacao']) },
  ];

  return { pend, emTratamento, manejosPend };
}

/** HTML dos quadros. soComItens: esconde os quadros sem pendência. limite: itens por quadro (0 = todos). */
export function htmlPendencias(pend, { soComItens = false, limite = 6 } = {}) {
  const lista = soComItens ? pend.filter((b) => b.itens.length) : pend;
  return `<div class="pendencias">${lista.map((b) => {
    const itens = limite ? b.itens.slice(0, limite) : b.itens;
    return `
    <div class="card"><div class="card-titulo"><h3><i data-lucide="${b.icone}"></i>${esc(b.titulo)}</h3>
      <span class="contador ${b.itens.length ? 'alerta-c' : ''}">${b.itens.length}</span></div>
      <ul class="lista-pend">${b.itens.length ? itens.map(([a, d, , , link]) => (link ? `<li class="clicavel"><a href="${esc(link)}" title="${esc(a)}"><span class="pend-texto">${esc(a)}</span>${d}</a></li>` : `<li><span class="pend-texto">${esc(a)}</span>${d}</li>`)).join('')
        + (b.itens.length > itens.length ? `<li class="vazia"><a href="#/pendencias">e mais ${b.itens.length - itens.length}…</a></li>` : '') : '<li class="vazia">Nada pendente.</li>'}</ul>
    </div>`; }).join('')}</div>`;
}

/** Quadros do tamanho dos do Painel: número de pendências, aviso e clique para ver a lista. */
export function htmlCardsPendencias(pend) {
  const ordem = pend.map((b, i) => ({ b, i })).sort((x, y) => y.b.itens.length - x.b.itens.length || x.i - y.i);
  return `<div class="grade grade-kpi">${ordem.map(({ b, i }) => {
    const n = b.itens.length;
    const atr = b.itens.filter((x) => x[3]).length;
    const detalhe = !n ? 'Nada pendente' : atr ? `${fmtNum(atr)} atrasado${atr > 1 ? 's' : ''} · toque para ver` : 'toque para ver';
    return `<button type="button" class="card kpi pend-card ${n ? (atr ? 'tem atrasado' : 'tem') : 'vazio'}" data-pend="${i}" ${n ? '' : 'disabled'} aria-label="${esc(b.titulo)}: ${n} pendência(s)">
      <span class="rotulo"><i data-lucide="${b.icone}"></i>${esc(b.titulo)}</span>
      <span class="valor">${fmtNum(n)}</span>
      <span class="detalhe">${detalhe}</span>
      ${n ? `<span class="pend-sinal" aria-hidden="true">${atr ? '!' : n > 99 ? '99+' : n}</span>` : ''}
    </button>`; }).join('')}</div>`;
}

/** Lista de um quadro (abre em janela): cada pendência e os animais envolvidos, com link para a ficha. */
export function abrirListaPendencia(b) {
  const linhas = b.itens.map(([texto, detalhe, animais, atr, link]) => `
    <li class="${atr ? 'perigo' : 'aviso'}">
      <div style="min-width:0"><a href="${esc(link)}" data-fechar><b>${esc(texto)}</b></a>
        ${animais.length > 1 ? `<div class="chips" style="margin-top:6px">${animais.map((a) => `<a class="chip" href="#/animais/${a.id}" data-fechar>${esc(a.brinco)}</a>`).join('')}</div>` : ''}</div>
      <span>${detalhe}</span></li>`).join('');
  const { el } = abrirModal({
    titulo: `${b.titulo} (${b.itens.length})`,
    largo: true,
    html: `<ul class="lista-avisos">${linhas}</ul>
      <p class="small muted" style="margin-bottom:0">Toque em um animal para abrir a ficha dele.</p>`,
    rodape: '<button class="btn btn-primario" data-fechar>Fechar</button>',
  });
  icones();
  return el;
}

export function ligarCardsPendencias(container, pend) {
  container.addEventListener('click', (e) => {
    const c = e.target.closest('[data-pend]'); if (!c || c.disabled) return;
    abrirListaPendencia(pend[Number(c.dataset.pend)]);
  });
}
