// =====================================================================
// PENDÊNCIAS — vacinas, vermifugações, partos, diagnósticos, desmames,
// tratamentos, carências e estoque baixo. Usado pelo Painel (só os
// quadros com pendência) e pela página Pendências (todos os quadros).
// =====================================================================
import { sb } from '../supabase.js';
import { store, param } from '../store.js';
import { esc, fmtNum, fmtData, hojeISO, addDias, diasEntre } from '../ui.js';

async function consulta(promessa) {
  const { data, error } = await promessa;
  if (error) { console.warn(error); return { erro: error, data: [] }; }
  return { data: data || [] };
}

/** Consultas usadas pelas pendências: [manejos, coberturas, desmames, estoque]. */
export function consultasPendencias(p, hoje = hojeISO()) {
  return [
    consulta(sb.from('manejos_sanitarios').select('id, tipo_manejo_id, data_aplicacao, proxima_aplicacao, proxima_resolvida, situacao, carencia_ate, manejo_animais(animal_id)')
      .eq('propriedade_id', p).or(`situacao.eq.em_andamento,and(proxima_aplicacao.not.is.null,proxima_resolvida.eq.false),carencia_ate.gte.${hoje}`)),
    consulta(sb.from('coberturas').select('id, matriz_id, data_cobertura, data_prevista_parto, situacao').eq('propriedade_id', p).in('situacao', ['prenhe', 'aguardando_diagnostico'])),
    consulta(sb.from('desmames').select('bezerro_id').eq('propriedade_id', p)),
    consulta(sb.from('vw_estoque_suplementos').select('id, nome, unidade, estoque_minimo, saldo, ativo').eq('propriedade_id', p).eq('ativo', true)),
  ];
}

/** Monta os quadros de pendência a partir dos dados carregados. */
export function montarPendencias({ animais, manejos, cobs, desm, estq }) {
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
  const desmamados = new Set(desm.data.map((d) => d.bezerro_id));
  const limiteDesmame = addDias(hoje, param('dias_alerta_desmame'));

  const pend = [
    { titulo: 'Vacinas próximas', icone: 'syringe', itens: porClasse('vacina').map((m) => [`${tipoManejo.get(m.tipo_manejo_id)?.nome} · ${descrAnimais(m)}`, quando(m.proxima_aplicacao)]) },
    { titulo: 'Vermifugações pendentes', icone: 'bug', itens: porClasse('vermifugacao').map((m) => [descrAnimais(m), quando(m.proxima_aplicacao)]) },
    { titulo: 'Outros manejos e retornos', icone: 'clipboard-list', itens: manejosPend.filter((m) => !['vacina', 'vermifugacao'].includes(tipoManejo.get(m.tipo_manejo_id)?.classe)).map((m) => [`${tipoManejo.get(m.tipo_manejo_id)?.nome} · ${descrAnimais(m)}`, quando(m.proxima_aplicacao)]) },
    { titulo: 'Previsões de parto', icone: 'baby', itens: cobs.data.filter((c) => c.situacao === 'prenhe' && c.data_prevista_parto && c.data_prevista_parto <= limiteParto && ativo(c.matriz_id)).sort((a, b) => a.data_prevista_parto.localeCompare(b.data_prevista_parto)).map((c) => [`Matriz ${porId.get(c.matriz_id).brinco}`, quando(c.data_prevista_parto)]) },
    { titulo: 'Diagnósticos de gestação pendentes', icone: 'scan-search', itens: cobs.data.filter((c) => c.situacao === 'aguardando_diagnostico' && c.data_cobertura <= limiteDiag && ativo(c.matriz_id)).map((c) => [`Matriz ${porId.get(c.matriz_id).brinco}`, `<span class="small muted">coberta ${fmtData(c.data_cobertura)}</span>`]) },
    { titulo: 'Desmames previstos', icone: 'milk-off', itens: ativos.filter((a) => a.categoria_grupo === 'bezerro' && a.origem === 'nascido' && a.data_nascimento && !desmamados.has(a.id) && addDias(a.data_nascimento, param('idade_desmame_dias')) <= limiteDesmame).map((a) => [`Bezerro(a) ${a.brinco}`, quando(addDias(a.data_nascimento, param('idade_desmame_dias')))]) },
    { titulo: 'Tratamentos em andamento', icone: 'stethoscope', itens: [...emTratamento].map((id) => [`Animal ${porId.get(id).brinco}`, '<span class="badge info">em andamento</span>']) },
    { titulo: 'Fim de carência', icone: 'timer', itens: manejos.data.filter((m) => m.carencia_ate && m.carencia_ate >= hoje).map((m) => [`${tipoManejo.get(m.tipo_manejo_id)?.nome} · ${descrAnimais(m)}`, `<span class="small">até ${fmtData(m.carencia_ate)}</span>`]) },
    { titulo: 'Suplementos com estoque baixo', icone: 'package-open', itens: estq.data.filter((s) => Number(s.estoque_minimo) > 0 && Number(s.saldo) <= Number(s.estoque_minimo)).map((s) => [s.nome, `<span class="badge perigo">${fmtNum(s.saldo, 1)} ${esc(s.unidade)}</span>`]) },
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
      <ul class="lista-pend">${b.itens.length ? itens.map(([a, d]) => `<li><span>${esc(a)}</span>${d}</li>`).join('')
        + (b.itens.length > itens.length ? `<li class="vazia"><a href="#/pendencias">e mais ${b.itens.length - itens.length}…</a></li>` : '') : '<li class="vazia">Nada pendente.</li>'}</ul>
    </div>`; }).join('')}</div>`;
}
