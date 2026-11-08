// =====================================================================
// SANIDADE — calendário de pendências, registros, produtos e protocolos
// =====================================================================
import { sb } from '../supabase.js';
import { store, pode, param } from '../store.js';
import { esc, icones, fmtData, fmtNum, fmtMoeda, hojeISO, addDias, diasEntre, montarTabela, vazio, erroCarga, baixarCSV, MESES } from '../ui.js';
import { listarAnimais } from '../components/animais-comum.js';
import * as F from '../components/sanidade-forms.js';

const ABAS = [['agenda', 'Calendário e pendências'], ['registros', 'Registros'], ['produtos', 'Produtos e estoque'], ['protocolos', 'Protocolos']];
const SIT = { realizado: 'Realizado', em_andamento: 'Em andamento', concluido: 'Concluído', cancelado: 'Cancelado' };

export async function render(el) {
  const p = store.prop.id;
  let animais, manejos, produtos, protocolos;
  try {
    const q = async (x) => { const { data, error } = await x; if (error) throw error; return data || []; };
    [animais, manejos, produtos, protocolos] = await Promise.all([
      listarAnimais(),
      q(sb.from('manejos_sanitarios').select('*, manejo_animais(animal_id)').eq('propriedade_id', p).order('data_aplicacao', { ascending: false }).range(0, 4999)),
      q(sb.from('vw_estoque_sanitarios').select('*').eq('propriedade_id', p).order('nome')),
      q(sb.from('protocolos_sanitarios').select('*').eq('propriedade_id', p).order('nome')),
    ]);
  } catch (e) { el.innerHTML = erroCarga(e); icones(); return; }

  const porId = new Map(animais.map((a) => [a.id, a]));
  const tipos = new Map(store.base.tiposManejo.map((t) => [t.id, t]));
  const prods = new Map(produtos.map((x) => [x.id, x]));
  const lotes = new Map(store.base.lotes.map((l) => [l.id, l]));
  const editar = pode('sanidade');
  const hoje = hojeISO();
  const recarregar = () => render(el).then(icones);
  const ativosDe = (m) => m.manejo_animais.map((x) => x.animal_id).filter((id) => porId.get(id)?.conta_no_rebanho);
  const alvo = (m) => {
    const ids = m.manejo_animais.map((x) => x.animal_id);
    if (m.lote_id) return `Lote ${lotes.get(m.lote_id)?.nome || ''} (${ids.length})`;
    return ids.length === 1 ? `Animal ${porId.get(ids[0])?.brinco || ''}` : `${ids.length} animais`;
  };

  const pendentes = manejos.filter((m) => m.proxima_aplicacao && !m.proxima_resolvida && m.situacao !== 'cancelado' && ativosDe(m).length)
    .sort((a, b) => a.proxima_aplicacao.localeCompare(b.proxima_aplicacao));
  const atrasados = pendentes.filter((m) => m.proxima_aplicacao < hoje);
  const proximos = pendentes.filter((m) => m.proxima_aplicacao >= hoje && m.proxima_aplicacao <= addDias(hoje, param('dias_alerta_manejo')));
  const emTrat = manejos.filter((m) => m.situacao === 'em_andamento');
  const carencias = manejos.filter((m) => m.carencia_ate && m.carencia_ate >= hoje && ativosDe(m).length);
  const custoAno = manejos.filter((m) => m.data_aplicacao.startsWith(hoje.slice(0, 4))).reduce((s, m) => s + Number(m.custo || 0), 0);

  el.innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>Sanidade</h1><p>Calendário sanitário da propriedade. Produtos, doses e protocolos são definidos pelo responsável técnico.</p></div>
      ${editar ? `<div class="acoes"><button class="btn btn-primario" data-novo="vacina"><i data-lucide="syringe"></i> Vacinação / aplicação</button>
        <button class="btn" data-novo="tratamento"><i data-lucide="stethoscope"></i> Tratamento / ocorrência</button></div>` : ''}
    </div>
    <div class="grade grade-kpi" style="margin-bottom:18px">
      <div class="card kpi ${atrasados.length ? '' : 'destaque'}"><span class="rotulo"><i data-lucide="alarm-clock"></i>Aplicações atrasadas</span><span class="valor">${fmtNum(atrasados.length)}</span></div>
      <div class="card kpi"><span class="rotulo"><i data-lucide="calendar-clock"></i>Próximos ${param('dias_alerta_manejo')} dias</span><span class="valor">${fmtNum(proximos.length)}</span></div>
      <div class="card kpi"><span class="rotulo"><i data-lucide="stethoscope"></i>Tratamentos em andamento</span><span class="valor">${fmtNum(emTrat.length)}</span></div>
      <div class="card kpi"><span class="rotulo"><i data-lucide="timer"></i>Em carência</span><span class="valor">${fmtNum(new Set(carencias.flatMap(ativosDe)).size)}</span><span class="detalhe">animais</span></div>
      <div class="card kpi"><span class="rotulo"><i data-lucide="wallet"></i>Custo sanitário no ano</span><span class="valor" style="font-size:1.3rem">${fmtMoeda(custoAno)}</span><span class="detalhe">registros com custo informado</span></div>
    </div>
    <div class="abas" style="margin-top:0">${ABAS.map(([k, t]) => `<button class="aba" data-aba="${k}">${t}</button>`).join('')}</div>
    <div id="painel-san"></div>`;
  el.querySelectorAll('[data-novo]').forEach((b) => b.addEventListener('click', () => F.abrirManejo({ classe: b.dataset.novo }, recarregar)));
  const painel = el.querySelector('#painel-san');
  const mostrar = (k) => {
    el.querySelectorAll('.aba').forEach((x) => x.classList.toggle('ativa', x.dataset.aba === k));
    ({ agenda: abaAgenda, registros: abaRegistros, produtos: abaProdutos, protocolos: abaProtocolos })[k]();
    icones();
  };
  el.querySelector('.abas').addEventListener('click', (e) => { const x = e.target.closest('[data-aba]'); if (x) mostrar(x.dataset.aba); });

  // -------- Calendário e pendências --------
  function abaAgenda() {
    const item = (m, extra = '') => {
      const t = tipos.get(m.tipo_manejo_id); const pr = prods.get(m.produto_id);
      const n = diasEntre(hoje, m.proxima_aplicacao);
      return `<li><span><b>${esc(t?.nome || '')}</b>${pr ? ` · ${esc(pr.nome)}` : ''}<br><span class="small muted">${esc(alvo(m))} · última em ${fmtData(m.data_aplicacao)}</span></span>
        <span style="text-align:right">${n < 0 ? `<span class="badge perigo">atrasado ${-n}d</span>` : n === 0 ? '<span class="badge aviso">hoje</span>' : `<span class="badge aviso">${fmtData(m.proxima_aplicacao)}</span>`}
        ${editar ? `<br><button class="btn btn-sm" style="margin-top:4px" data-aplicar="${m.id}">Registrar aplicação</button>` : ''}${extra}</span></li>`;
    };
    const futuros = pendentes.filter((m) => m.proxima_aplicacao > addDias(hoje, param('dias_alerta_manejo')));
    const porMes = {};
    futuros.forEach((m) => { const k = m.proxima_aplicacao.slice(0, 7); (porMes[k] ||= []).push(m); });
    painel.innerHTML = `<div class="pendencias">
      <div class="card"><div class="card-titulo"><h3><i data-lucide="alarm-clock"></i> Atrasadas e próximas</h3><span class="contador ${atrasados.length + proximos.length ? 'alerta-c' : ''}">${atrasados.length + proximos.length}</span></div>
        <ul class="lista-pend">${[...atrasados, ...proximos].map((m) => item(m)).join('') || '<li class="vazia">Nada pendente.</li>'}</ul></div>
      <div class="card"><div class="card-titulo"><h3><i data-lucide="stethoscope"></i> Tratamentos em andamento</h3><span class="contador">${emTrat.length}</span></div>
        <ul class="lista-pend">${emTrat.map((m) => `<li><span><b>${esc(tipos.get(m.tipo_manejo_id)?.nome || '')}</b>${m.diagnostico ? ` · ${esc(m.diagnostico)}` : ''}<br><span class="small muted">${esc(alvo(m))} · desde ${fmtData(m.data_aplicacao)}</span></span>
          ${editar ? `<button class="btn btn-sm" data-concluir="${m.id}">Concluir</button>` : ''}</li>`).join('') || '<li class="vazia">Nenhum tratamento em andamento.</li>'}</ul></div>
      <div class="card"><div class="card-titulo"><h3><i data-lucide="timer"></i> Período de carência</h3><span class="contador">${carencias.length}</span></div>
        <ul class="lista-pend">${carencias.map((m) => `<li><span>${esc(prods.get(m.produto_id)?.nome || tipos.get(m.tipo_manejo_id)?.nome || '')}<br><span class="small muted">${esc(alvo(m))}</span></span><span class="badge aviso">até ${fmtData(m.carencia_ate)}</span></li>`).join('') || '<li class="vazia">Nenhum animal em carência.</li>'}</ul></div>
      </div>
      <section class="secao"><h2><i data-lucide="calendar"></i> Calendário dos próximos meses</h2>
        ${Object.keys(porMes).length ? Object.keys(porMes).sort().map((k) => `<div class="card" style="margin-bottom:12px"><div class="card-titulo"><h3>${MESES[Number(k.slice(5)) - 1]}/${k.slice(0, 4)}</h3><span class="contador">${porMes[k].length}</span></div>
          <ul class="lista-pend">${porMes[k].map((m) => item(m)).join('')}</ul></div>`).join('')
          : `<div class="card">${vazio({ icone: 'calendar', titulo: 'Nenhuma aplicação futura agendada', texto: 'Ao registrar um manejo, informe a “próxima aplicação” para que ele apareça aqui e nos alertas do painel.' })}</div>`}
      </section>`;
    painel.querySelectorAll('[data-aplicar]').forEach((b) => b.addEventListener('click', () => {
      const m = manejos.find((x) => x.id === b.dataset.aplicar);
      F.abrirManejo({ tipo_manejo_id: m.tipo_manejo_id, produto_id: m.produto_id, dosagem: m.dosagem, via: m.via_administracao,
        animais: m.lote_id ? undefined : ativosDe(m), lote_id: m.lote_id || undefined, manejo_anterior_id: m.id }, recarregar);
    }));
    painel.querySelectorAll('[data-concluir]').forEach((b) => b.addEventListener('click', () => F.concluirTratamento(manejos.find((x) => x.id === b.dataset.concluir), recarregar)));
  }

  // -------- Registros --------
  function abaRegistros() {
    painel.innerHTML = `<div class="acoes" style="margin-bottom:10px"><button class="btn btn-sm" id="r-csv"><i data-lucide="download"></i> Exportar CSV</button></div>
      <div class="card">${manejos.length ? '<div id="t-man"></div>' : vazio({ icone: 'syringe', titulo: 'Nenhum registro sanitário', texto: 'Registre vacinas, vermifugações, tratamentos e ocorrências. Aplicações em lote criam o histórico individual de cada animal.' })}</div>`;
    const cols = [
      { chave: 'data_aplicacao', titulo: 'Data', primaria: true, render: (m) => fmtData(m.data_aplicacao), csv: (m) => fmtData(m.data_aplicacao) },
      { chave: 'tipo', titulo: 'Procedimento', valor: (m) => tipos.get(m.tipo_manejo_id)?.nome, render: (m) => `<b>${esc(tipos.get(m.tipo_manejo_id)?.nome || '')}</b>${m.diagnostico ? `<div class="small muted">${esc(m.diagnostico)}</div>` : ''}`, csv: (m) => tipos.get(m.tipo_manejo_id)?.nome },
      { chave: 'produto', titulo: 'Produto', valor: (m) => prods.get(m.produto_id)?.nome, render: (m) => esc([prods.get(m.produto_id)?.nome, prods.get(m.produto_id)?.fabricante].filter(Boolean).join(' · ') || '—'), csv: (m) => prods.get(m.produto_id)?.nome || '' },
      { chave: 'alvo', titulo: 'Animais / lote', valor: alvo, render: (m) => esc(alvo(m)), csv: alvo },
      { chave: 'dose', titulo: 'Dose / via', valor: (m) => m.dosagem, render: (m) => esc([m.dosagem, m.via_administracao].filter(Boolean).join(' · ') || '—'), csv: (m) => [m.dosagem, m.via_administracao].filter(Boolean).join(' · ') },
      { chave: 'custo', titulo: 'Custo', classe: 'dir', valor: (m) => (m.custo ? Number(m.custo) : null), render: (m) => (m.custo ? fmtMoeda(m.custo) : '—'), csv: (m) => m.custo ?? '' },
      { chave: 'prox', titulo: 'Próxima', valor: (m) => m.proxima_aplicacao, render: (m) => (m.proxima_aplicacao ? `${fmtData(m.proxima_aplicacao)}${m.proxima_resolvida ? ' <span class="badge sucesso">feita</span>' : ''}` : '—'), csv: (m) => fmtData(m.proxima_aplicacao) },
      { chave: 'situacao', titulo: 'Situação', valor: (m) => SIT[m.situacao], render: (m) => `<span class="badge ${m.situacao === 'em_andamento' ? 'info' : 'ativo'}">${SIT[m.situacao]}</span>`, csv: (m) => SIT[m.situacao] },
      { chave: 'resp', titulo: 'Responsável', render: (m) => esc(m.responsavel_nome || '—'), csv: (m) => m.responsavel_nome || '' },
    ];
    if (manejos.length) montarTabela(painel.querySelector('#t-man'), { colunas: cols, linhas: manejos, aoClicar: (id) => detalhe(manejos.find((m) => m.id === id)) });
    painel.querySelector('#r-csv').addEventListener('click', () => baixarCSV(`sanidade-${hoje}.csv`, cols, manejos));
  }

  function detalhe(m) {
    import('../ui.js').then(({ abrirModal }) => {
      const ids = m.manejo_animais.map((x) => x.animal_id);
      abrirModal({
        titulo: `${tipos.get(m.tipo_manejo_id)?.nome} — ${fmtData(m.data_aplicacao)}`, largo: true,
        html: `<div class="dados-lista" style="margin-bottom:14px">
          ${[['Produto', [prods.get(m.produto_id)?.nome, prods.get(m.produto_id)?.fabricante].filter(Boolean).join(' · ')], ['Dosagem', m.dosagem], ['Via', m.via_administracao],
            ['Quantidade usada', m.quantidade_total ? `${fmtNum(m.quantidade_total, 2)} ${prods.get(m.produto_id)?.unidade || ''}` : null], ['Custo', m.custo ? fmtMoeda(m.custo) : null],
            ['Próxima aplicação', fmtData(m.proxima_aplicacao)], ['Fim da carência', fmtData(m.carencia_ate)], ['Situação', SIT[m.situacao]], ['Diagnóstico', m.diagnostico], ['Responsável', m.responsavel_nome]]
            .map(([r, v]) => `<div class="dado"><div class="r">${r}</div><div class="v">${esc(v || '—')}</div></div>`).join('')}</div>
          ${m.observacoes ? `<p>${esc(m.observacoes)}</p>` : ''}<h3 style="margin-bottom:8px">Animais (${ids.length})</h3>
          <p>${ids.map((id) => (porId.get(id) ? `<a href="#/animais/${id}">${esc(porId.get(id).brinco)}</a>` : '')).join(', ')}</p>`,
        rodape: '<button class="btn" data-fechar>Fechar</button>',
      });
    });
  }

  // -------- Produtos e estoque --------
  function abaProdutos() {
    painel.innerHTML = `${editar ? '<div class="acoes" style="margin-bottom:12px"><button class="btn btn-primario" data-np><i data-lucide="plus"></i> Cadastrar produto</button></div>' : ''}
      <div class="card">${produtos.length ? '<div id="t-prod"></div>' : vazio({ icone: 'package', titulo: 'Nenhum produto cadastrado', texto: 'Cadastre vacinas, vermífugos e medicamentos usados na propriedade, com fabricante e carência conforme a bula.' })}</div>
      <p class="small muted">Saldo = entradas − usos registrados ± ajustes. Informe a “quantidade total usada” no registro do manejo para baixar o estoque automaticamente.</p>`;
    painel.querySelector('[data-np]')?.addEventListener('click', () => F.abrirProdutoSanitario(null, recarregar));
    if (!produtos.length) return;
    montarTabela(painel.querySelector('#t-prod'), {
      colunas: [
        { chave: 'nome', titulo: 'Produto', primaria: true, render: (x) => `<b>${esc(x.nome)}</b>${!x.ativo ? ' <span class="badge inativo">inativo</span>' : ''}<div class="small muted">${esc([x.fabricante, x.principio_ativo].filter(Boolean).join(' · '))}</div>` },
        { chave: 'classe', titulo: 'Uso', valor: (x) => F.CLASSES[x.classe], render: (x) => esc(F.CLASSES[x.classe]) },
        { chave: 'carencia_dias', titulo: 'Carência', classe: 'dir', render: (x) => (x.carencia_dias ? `${x.carencia_dias} dias` : '—') },
        { chave: 'saldo', titulo: 'Estoque', classe: 'dir', valor: (x) => Number(x.saldo), render: (x) => `${fmtNum(x.saldo, 2)} ${esc(x.unidade)}${Number(x.estoque_minimo) > 0 && Number(x.saldo) <= Number(x.estoque_minimo) ? ' <span class="badge perigo">baixo</span>' : ''}` },
        { chave: 'estoque_minimo', titulo: 'Mínimo', classe: 'dir', render: (x) => (Number(x.estoque_minimo) ? `${fmtNum(x.estoque_minimo, 2)} ${esc(x.unidade)}` : '—') },
        ...(editar ? [{ chave: 'acoes', titulo: '', render: (x) => `<span class="acoes"><button class="btn btn-sm" data-ent="${x.id}">Entrada</button><button class="btn btn-sm" data-aj="${x.id}">Ajuste</button></span>` }] : []),
      ],
      linhas: produtos,
      aoClicar: editar ? (id) => F.abrirProdutoSanitario(produtos.find((x) => x.id === id), recarregar) : null,
    });
    painel.querySelector('#t-prod').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ent],[data-aj]'); if (!b) return;
      const produto = produtos.find((x) => x.id === (b.dataset.ent || b.dataset.aj));
      F.abrirMovEstoque({ produto, tipoProduto: 'sanitario', modo: b.dataset.ent ? 'entrada' : 'ajuste' }, recarregar);
    });
  }

  // -------- Protocolos --------
  function abaProtocolos() {
    painel.innerHTML = `${editar ? '<div class="acoes" style="margin-bottom:12px"><button class="btn btn-primario" data-npr><i data-lucide="plus"></i> Cadastrar protocolo</button></div>' : ''}
      <div class="card">${protocolos.length ? '<div id="t-prot"></div>' : vazio({ icone: 'clipboard-list', titulo: 'Nenhum protocolo cadastrado', texto: 'Cadastre os protocolos sanitários definidos pelo veterinário da propriedade. O sistema não impõe calendário nem sugere produtos.' })}</div>`;
    painel.querySelector('[data-npr]')?.addEventListener('click', () => F.abrirProtocolo(null, recarregar));
    if (!protocolos.length) return;
    montarTabela(painel.querySelector('#t-prot'), {
      colunas: [
        { chave: 'nome', titulo: 'Protocolo', primaria: true, render: (x) => `<b>${esc(x.nome)}</b>${!x.ativo ? ' <span class="badge inativo">inativo</span>' : ''}${x.publico_alvo ? `<div class="small muted">${esc(x.publico_alvo)}</div>` : ''}` },
        { chave: 'tipo', titulo: 'Tipo', valor: (x) => tipos.get(x.tipo_manejo_id)?.nome, render: (x) => esc(tipos.get(x.tipo_manejo_id)?.nome || '—') },
        { chave: 'produto', titulo: 'Produto', valor: (x) => prods.get(x.produto_id)?.nome, render: (x) => esc(prods.get(x.produto_id)?.nome || '—') },
        { chave: 'dosagem', titulo: 'Dose / via', render: (x) => esc([x.dosagem, x.via_administracao].filter(Boolean).join(' · ') || '—') },
        { chave: 'intervalo_dias', titulo: 'Repetir a cada', classe: 'dir', render: (x) => (x.intervalo_dias ? `${x.intervalo_dias} dias` : '—') },
        ...(editar ? [{ chave: 'usar', titulo: '', render: (x) => `<button class="btn btn-sm" data-usar="${x.id}">Aplicar</button>` }] : []),
      ],
      linhas: protocolos,
      aoClicar: editar ? (id) => F.abrirProtocolo(protocolos.find((x) => x.id === id), recarregar) : null,
    });
    painel.querySelector('#t-prot').addEventListener('click', (e) => {
      const b = e.target.closest('[data-usar]'); if (!b) return;
      const x = protocolos.find((y) => y.id === b.dataset.usar);
      F.abrirManejo({ tipo_manejo_id: x.tipo_manejo_id, produto_id: x.produto_id, dosagem: x.dosagem, via: x.via_administracao }, recarregar)
        .then(() => { const s = document.querySelector('#s-prot'); if (s) { s.value = x.id; s.dispatchEvent(new Event('change')); } });
    });
  }

  mostrar(atrasados.length || proximos.length || emTrat.length ? 'agenda' : (manejos.length ? 'registros' : 'agenda'));
}
