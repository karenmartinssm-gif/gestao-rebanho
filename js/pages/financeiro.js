// =====================================================================
// FINANCEIRO — receitas, despesas, realizado × previsto, custo por cabeça e por lote
// =====================================================================
import { sb } from '../supabase.js';
import { store } from '../store.js';
import { esc, icones, fmtData, fmtNum, fmtMoeda, fmtPct, hojeISO, addDias, mesesEntre, montarTabela, vazio, erroCarga, baixarCSV, ultimosMeses, rotuloMes } from '../ui.js';
import { grafico, CORES, semDados } from '../components/graficos.js';
import { listarAnimais } from '../components/animais-comum.js';
import { todos } from '../components/consulta.js';
import { abrirLancamento, confirmarLancamento, CAT_RECEITA, CAT_DESPESA, rotuloSituacao } from '../components/financeiro-forms.js';

const ABAS = [['resumo', 'Resumo'], ['lancamentos', 'Lançamentos'], ['pendentes', 'A pagar e a receber'], ['lotes', 'Custo por lote']];
// Aba e período escolhidos continuam os mesmos depois de salvar um lançamento
const lembrar = { aba: 'resumo', per: '12m', ini: '', fim: '' };
const catRotulo = (l) => (l._tipo === 'receita' ? CAT_RECEITA : CAT_DESPESA)[l.categoria] || l.categoria;

export async function render(el) {
  const p = store.prop.id;
  let receitas, despesas, animais, fornec, manejos;
  try {
    [receitas, despesas, animais, fornec, manejos] = await Promise.all([
      todos(() => sb.from('receitas').select('*').eq('propriedade_id', p).order('data_lancamento', { ascending: false }).order('id')),
      todos(() => sb.from('despesas').select('*').eq('propriedade_id', p).order('data_lancamento', { ascending: false }).order('id')),
      listarAnimais(),
      todos(() => sb.from('fornecimentos').select('id, data_fornecimento, lote_id, custo').eq('propriedade_id', p).not('custo', 'is', null).order('id')),
      todos(() => sb.from('manejos_sanitarios').select('id, data_aplicacao, lote_id, custo').eq('propriedade_id', p).not('custo', 'is', null).order('id')),
    ]);
  } catch (e) { el.innerHTML = erroCarga(e); icones(); return; }

  const hoje = hojeISO();
  const recarregar = () => render(el).then(icones);
  const todosL = [...receitas.map((x) => ({ ...x, _tipo: 'receita' })), ...despesas.map((x) => ({ ...x, _tipo: 'despesa' }))]
    .sort((a, b) => b.data_lancamento.localeCompare(a.data_lancamento));
  const pendentes = todosL.filter((l) => l.situacao !== 'realizado');
  const soma = (lista) => lista.reduce((s, l) => s + Number(l.valor), 0);
  const lotes = new Map(store.base.lotes.map((l) => [l.id, l]));
  // Cabeças no rebanho numa data: entrou até a data e não tinha saído
  const cabecasEm = (d) => animais.filter((a) => a.data_entrada <= d && (!a.data_saida || a.data_saida > d)).length;
  const anos = [...new Set([hoje.slice(0, 4), ...todosL.map((l) => l.data_lancamento.slice(0, 4))])].filter((y) => y <= hoje.slice(0, 4)).sort().reverse();

  el.innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>Financeiro</h1><p>Receitas e despesas da fazenda, o que já foi pago/recebido e o que está previsto.</p></div>
      <div class="acoes"><button class="btn btn-primario" data-desp><i data-lucide="minus-circle"></i> Nova despesa</button><button class="btn" data-rec><i data-lucide="plus-circle"></i> Nova receita</button></div>
    </div>
    <div class="filtro-periodo"><h2 style="margin:0">Período</h2>
      <select id="f-per" aria-label="Período"><option value="mes">Este mês</option><option value="3m">Últimos 3 meses</option><option value="12m" selected>Últimos 12 meses</option>
        ${anos.map((y) => `<option value="${y}">Ano de ${y}</option>`).join('')}<option value="x">Personalizado</option></select>
      <span id="f-datas" class="oculto" style="display:inline-flex;gap:6px;align-items:center"><input type="date" id="f-ini"> a <input type="date" id="f-fim" value="${hoje}"></span>
      <span class="small muted" id="f-txt"></span></div>
    <div class="grade grade-kpi" id="f-kpis" style="margin-bottom:18px"></div>
    <div class="abas" style="margin-top:0">${ABAS.map(([k, t]) => `<button class="aba" data-aba="${k}">${t}</button>`).join('')}</div>
    <div id="painel-fin"></div>`;
  el.querySelector('[data-desp]').addEventListener('click', () => abrirLancamento(null, recarregar, { tipo: 'despesa' }));
  el.querySelector('[data-rec]').addEventListener('click', () => abrirLancamento(null, recarregar, { tipo: 'receita' }));
  const painel = el.querySelector('#painel-fin');
  let aba = lembrar.aba;
  if ([...el.querySelectorAll('#f-per option')].some((o) => o.value === lembrar.per)) el.querySelector('#f-per').value = lembrar.per;
  if (lembrar.ini) el.querySelector('#f-ini').value = lembrar.ini;
  if (lembrar.fim) el.querySelector('#f-fim').value = lembrar.fim;
  let ini, fim;

  const periodo = () => {
    const v = el.querySelector('#f-per').value;
    el.querySelector('#f-datas').classList.toggle('oculto', v !== 'x');
    if (v === 'mes') return [`${hoje.slice(0, 7)}-01`, hoje];
    if (v === '3m') return [addDias(hoje, -91), hoje];
    if (v === '12m') return [addDias(hoje, -365), hoje];
    if (v === 'x') return [el.querySelector('#f-ini').value, el.querySelector('#f-fim').value || hoje];
    return [`${v}-01-01`, `${v}-12-31`];
  };
  const noPeriodo = (l) => l.data_lancamento >= ini && l.data_lancamento <= fim;

  const atualizar = () => {
    [ini, fim] = periodo();
    Object.assign(lembrar, { per: el.querySelector('#f-per').value, ini: el.querySelector('#f-ini').value, fim: el.querySelector('#f-fim').value });
    if (!ini || ini > fim) { el.querySelector('#f-kpis').innerHTML = '<div class="alerta aviso">Escolha a data inicial e final.</div>'; painel.innerHTML = ''; return; }
    el.querySelector('#f-txt').textContent = `${fmtData(ini)} a ${fmtData(fim)}`;
    const per = todosL.filter(noPeriodo);
    const rec = soma(per.filter((l) => l._tipo === 'receita' && l.situacao === 'realizado'));
    const desp = soma(per.filter((l) => l._tipo === 'despesa' && l.situacao === 'realizado'));
    const operacional = soma(per.filter((l) => l._tipo === 'despesa' && l.situacao === 'realizado' && l.categoria !== 'compra_animais'));
    const fimRef = fim > hoje ? hoje : fim;
    const media = (cabecasEm(ini) + cabecasEm(fimRef)) / 2;
    const meses = Math.max(1, mesesEntre(ini, fimRef) || 1);
    const aRec = soma(pendentes.filter((l) => l._tipo === 'receita'));
    const aPag = soma(pendentes.filter((l) => l._tipo === 'despesa'));
    el.querySelector('#f-kpis').innerHTML = `
      <div class="card kpi"><span class="rotulo"><i data-lucide="trending-up"></i>Receitas recebidas</span><span class="valor" style="font-size:1.3rem">${fmtMoeda(rec)}</span></div>
      <div class="card kpi"><span class="rotulo"><i data-lucide="trending-down"></i>Despesas pagas</span><span class="valor" style="font-size:1.3rem">${fmtMoeda(desp)}</span></div>
      <div class="card kpi destaque"><span class="rotulo"><i data-lucide="scale"></i>Resultado</span><span class="valor" style="font-size:1.3rem">${fmtMoeda(rec - desp)}</span><span class="detalhe">recebido − pago no período</span></div>
      <div class="card kpi"><span class="rotulo"><i data-lucide="beef"></i>Custo por cabeça</span><span class="valor" style="font-size:1.3rem">${media ? fmtMoeda(operacional / media) : '—'}</span><span class="detalhe">${media ? `${fmtMoeda(operacional / media / meses)}/mês · rebanho médio ${fmtNum(media, 0)}` : 'sem animais no período'}</span></div>
      <div class="card kpi"><span class="rotulo"><i data-lucide="clock"></i>A receber / a pagar</span><span class="valor" style="font-size:1.1rem">${fmtMoeda(aRec)} / ${fmtMoeda(aPag)}</span><span class="detalhe">todos os pendentes</span></div>`;
    mostrar(aba);
  };

  const mostrar = (k) => {
    aba = k; lembrar.aba = k;
    el.querySelectorAll('.aba').forEach((x) => x.classList.toggle('ativa', x.dataset.aba === k));
    ({ resumo: abaResumo, lancamentos: abaLancamentos, pendentes: abaPendentes, lotes: abaLotes })[k]();
    icones();
  };
  el.querySelector('.abas').addEventListener('click', (e) => { const x = e.target.closest('[data-aba]'); if (x) mostrar(x.dataset.aba); });
  el.querySelector('#f-per').addEventListener('change', () => {
    if (el.querySelector('#f-per').value === 'x' && !el.querySelector('#f-ini').value) el.querySelector('#f-ini').value = `${hoje.slice(0, 4)}-01-01`;
    atualizar();
  });
  el.querySelector('#f-ini').addEventListener('change', atualizar);
  el.querySelector('#f-fim').addEventListener('change', atualizar);

  // ---------------- Resumo ----------------
  function abaResumo() {
    const per = todosL.filter(noPeriodo);
    const linhasCat = (tipo, cats) => Object.entries(cats).map(([k, t]) => {
      const l = per.filter((x) => x._tipo === tipo && x.categoria === k);
      return { k, t, real: soma(l.filter((x) => x.situacao === 'realizado')), pend: soma(l.filter((x) => x.situacao !== 'realizado')), n: l.length };
    }).filter((x) => x.n);
    const cd = linhasCat('despesa', CAT_DESPESA).sort((a, b) => b.real - a.real);
    const cr = linhasCat('receita', CAT_RECEITA);
    const totD = cd.reduce((s, x) => s + x.real, 0);
    const tabela = (linhas, tipo, total) => `<div class="tabela-wrap"><table class="tabela responsiva"><thead><tr><th>Categoria</th><th class="dir">${tipo === 'receita' ? 'Recebido' : 'Pago'}</th><th class="dir">${tipo === 'receita' ? 'A receber' : 'A pagar'}</th><th class="dir">Total</th>${total ? '<th class="dir">% do pago</th>' : ''}</tr></thead><tbody>
      ${linhas.map((x) => `<tr><td class="primaria" data-rotulo="Categoria">${esc(x.t)}</td><td class="dir" data-rotulo="${tipo === 'receita' ? 'Recebido' : 'Pago'}"><b>${fmtMoeda(x.real)}</b></td><td class="dir" data-rotulo="${tipo === 'receita' ? 'A receber' : 'A pagar'}">${x.pend ? fmtMoeda(x.pend) : '—'}</td><td class="dir" data-rotulo="Total">${fmtMoeda(x.real + x.pend)}</td>${total ? `<td class="dir" data-rotulo="% do pago">${fmtPct(x.real / total * 100)}</td>` : ''}</tr>`).join('')}
      </tbody></table></div>`;
    const meses = ultimosMeses(12);
    const porMes = (tipo) => meses.map((m) => soma(todosL.filter((l) => l._tipo === tipo && l.situacao === 'realizado' && l.data_lancamento.startsWith(m))));
    painel.innerHTML = `
      <div class="grade grade-2">
        <div class="card"><div class="card-titulo"><h3>Recebido × pago por mês (últimos 12 meses)</h3></div><div class="grafico" id="w-mes"><canvas id="g-mes"></canvas></div></div>
        <div class="card"><div class="card-titulo"><h3>Despesas pagas por categoria</h3></div><div class="grafico" id="w-cat"><canvas id="g-cat"></canvas></div></div>
      </div>
      <section class="secao"><h2>Despesas por categoria</h2><div class="card">${cd.length ? tabela(cd, 'despesa', totD) : vazio({ icone: 'wallet', titulo: 'Nenhuma despesa no período' })}</div></section>
      <section class="secao"><h2>Receitas por categoria</h2><div class="card">${cr.length ? tabela(cr, 'receita', 0) : vazio({ icone: 'wallet', titulo: 'Nenhuma receita no período' })}</div></section>
      <p class="small muted">Custo por cabeça = despesas pagas no período, sem a compra de animais (que é investimento), ÷ rebanho médio (média entre as cabeças no início e no fim do período). O valor por mês divide pelo número de meses do período. "A pagar/a receber" são lançamentos previstos ainda não confirmados.</p>`;
    const rM = porMes('receita'), dM = porMes('despesa');
    if (rM.some(Boolean) || dM.some(Boolean)) {
      grafico(painel.querySelector('#g-mes'), { type: 'bar', data: { labels: meses.map(rotuloMes), datasets: [
        { label: 'Recebido', data: rM, backgroundColor: CORES[1], borderRadius: 3 },
        { label: 'Pago', data: dM, backgroundColor: CORES[7], borderRadius: 3 },
        { type: 'line', label: 'Resultado', data: rM.map((v, i) => v - dM[i]), borderColor: CORES[0], backgroundColor: CORES[0], tension: 0.25, pointRadius: 3 }] },
        options: { plugins: { legend: { display: true, position: 'bottom' } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: (v) => `R$ ${fmtNum(v)}` } } } } });
    } else painel.querySelector('#w-mes').innerHTML = semDados('Nenhum lançamento pago ou recebido nos últimos 12 meses.');
    if (cd.some((x) => x.real)) {
      const c = cd.filter((x) => x.real);
      grafico(painel.querySelector('#g-cat'), { type: 'doughnut', data: { labels: c.map((x) => x.t.replace(/ \(.*\)$/, '')), datasets: [{ data: c.map((x) => x.real), backgroundColor: c.map((_, i) => CORES[i % CORES.length]) }] },
        options: { plugins: { legend: { display: true, position: 'bottom' }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${fmtMoeda(ctx.raw)}` } } }, scales: { x: { display: false }, y: { display: false } } } });
    } else painel.querySelector('#w-cat').innerHTML = semDados('Nenhuma despesa paga no período.');
  }

  // ---------------- Lançamentos ----------------
  const colunas = () => [
    { chave: 'data_lancamento', titulo: 'Data', primaria: true, render: (l) => fmtData(l.data_lancamento), csv: (l) => fmtData(l.data_lancamento) },
    { chave: '_tipo', titulo: 'Tipo', valor: (l) => (l._tipo === 'receita' ? 'Receita' : 'Despesa'), render: (l) => `<span class="badge ${l._tipo === 'receita' ? 'sucesso' : 'perigo'}">${l._tipo === 'receita' ? 'Receita' : 'Despesa'}</span>`, csv: (l) => (l._tipo === 'receita' ? 'Receita' : 'Despesa') },
    { chave: 'descricao', titulo: 'Descrição', render: (l) => `<b>${esc(l.descricao)}</b>`, csv: (l) => l.descricao },
    { chave: 'categoria', titulo: 'Categoria', valor: catRotulo, render: (l) => esc(catRotulo(l)), csv: catRotulo },
    { chave: 'lote', titulo: 'Lote', valor: (l) => lotes.get(l.lote_id)?.nome, render: (l) => esc(lotes.get(l.lote_id)?.nome || '—'), csv: (l) => lotes.get(l.lote_id)?.nome || '' },
    { chave: 'valor', titulo: 'Valor', classe: 'dir', valor: (l) => (l._tipo === 'receita' ? 1 : -1) * Number(l.valor), render: (l) => `<b class="${l._tipo === 'receita' ? 'valor-pos' : 'valor-neg'}">${l._tipo === 'receita' ? '+' : '−'} ${fmtMoeda(l.valor)}</b>`, csv: (l) => ((l._tipo === 'receita' ? 1 : -1) * Number(l.valor)).toFixed(2) },
    { chave: 'situacao', titulo: 'Situação', valor: (l) => rotuloSituacao(l._tipo, l.situacao), render: (l) => `<span class="badge ${l.situacao === 'realizado' ? 'ativo' : l.data_lancamento < hoje ? 'perigo' : 'aviso'}">${rotuloSituacao(l._tipo, l.situacao)}${l.situacao !== 'realizado' && l.data_lancamento < hoje ? ' (vencido)' : ''}</span>`, csv: (l) => rotuloSituacao(l._tipo, l.situacao) },
    { chave: 'forma_pagamento', titulo: 'Pagamento', render: (l) => esc(l.forma_pagamento || '—'), csv: (l) => l.forma_pagamento || '' },
    { chave: 'acoes', titulo: '', render: (l) => (l.situacao !== 'realizado' ? `<button class="btn btn-sm" data-conf="${l._tipo}:${l.id}">${l._tipo === 'receita' ? 'Recebido' : 'Pago'}</button>` : ''), csv: () => '' },
  ];
  const ligarTabela = (container, linhas) => {
    const cols = colunas();
    const t = montarTabela(container, { colunas: cols, linhas, idLinha: (l) => `${l._tipo}:${l.id}`, aoClicar: (id) => abrirLancamento(todosL.find((l) => `${l._tipo}:${l.id}` === id), recarregar) });
    container.addEventListener('click', (e) => {
      const b = e.target.closest('[data-conf]'); if (!b) return;
      confirmarLancamento(todosL.find((l) => `${l._tipo}:${l.id}` === b.dataset.conf), recarregar);
    });
    return { t, cols };
  };

  function abaLancamentos() {
    const per = todosL.filter(noPeriodo);
    const cats = { ...Object.fromEntries(Object.entries(CAT_DESPESA).map(([k, v]) => [`despesa:${k}`, v])), ...Object.fromEntries(Object.entries(CAT_RECEITA).map(([k, v]) => [`receita:${k}`, v])) };
    painel.innerHTML = `<div class="filtro-periodo">
        <select id="l-tipo" aria-label="Tipo"><option value="">Receitas e despesas</option><option value="receita">Só receitas</option><option value="despesa">Só despesas</option></select>
        <select id="l-sit" aria-label="Situação"><option value="">Todas as situações</option><option value="realizado">Pagos / recebidos</option><option value="pendente">A pagar / a receber</option></select>
        <select id="l-cat" aria-label="Categoria"><option value="">Todas as categorias</option>${Object.entries(cats).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <button class="btn btn-sm" id="l-csv" style="margin-left:auto"><i data-lucide="download"></i> Exportar CSV</button></div>
      <div class="card">${per.length ? '<div id="t-lanc"></div>' : vazio({ icone: 'wallet', titulo: 'Nenhum lançamento no período', texto: 'Registre as despesas e receitas da fazenda. Compras e vendas de animais podem ser lançadas automaticamente.' })}</div>
      <p class="small muted" id="l-tot"></p>`;
    if (!per.length) return;
    const { t, cols } = ligarTabela(painel.querySelector('#t-lanc'), per);
    const filtradas = () => {
      const tp = painel.querySelector('#l-tipo').value, st = painel.querySelector('#l-sit').value, ct = painel.querySelector('#l-cat').value;
      return per.filter((l) => (!tp || l._tipo === tp) && (!st || (st === 'realizado' ? l.situacao === 'realizado' : l.situacao !== 'realizado')) && (!ct || `${l._tipo}:${l.categoria}` === ct));
    };
    const totais = () => {
      const f = filtradas();
      painel.querySelector('#l-tot').textContent = `${f.length} lançamento(s) · receitas ${fmtMoeda(soma(f.filter((l) => l._tipo === 'receita')))} · despesas ${fmtMoeda(soma(f.filter((l) => l._tipo === 'despesa')))} (pagos e previstos)`;
    };
    ['#l-tipo', '#l-sit', '#l-cat'].forEach((s) => painel.querySelector(s).addEventListener('change', () => { t.atualizar(filtradas()); totais(); }));
    painel.querySelector('#l-csv').addEventListener('click', () => baixarCSV(`financeiro-${ini}-a-${fim}.csv`, cols.filter((c) => c.chave !== 'acoes'), filtradas()));
    totais();
  }

  // ---------------- Pendentes ----------------
  function abaPendentes() {
    const lista = [...pendentes].sort((a, b) => a.data_lancamento.localeCompare(b.data_lancamento));
    const venc = lista.filter((l) => l.data_lancamento < hoje);
    painel.innerHTML = `${venc.length ? `<div class="alerta perigo" style="margin-bottom:14px"><i data-lucide="alert-triangle"></i><div><b>${venc.length} lançamento(s) com data vencida</b> ainda sem confirmação de pagamento/recebimento.</div></div>` : ''}
      <div class="card">${lista.length ? '<div id="t-pend"></div>' : vazio({ icone: 'check-circle-2', titulo: 'Nada a pagar ou a receber', texto: 'Lançamentos marcados como "a pagar" ou "a receber" aparecem aqui até serem confirmados.' })}</div>
      <p class="small muted">Esta lista mostra todos os pendentes, independentemente do período escolhido.</p>`;
    if (lista.length) ligarTabela(painel.querySelector('#t-pend'), lista);
  }

  // ---------------- Custo por lote ----------------
  function abaLotes() {
    const dentro = (d) => d >= ini && d <= fim;
    const ativos = animais.filter((a) => a.conta_no_rebanho);
    const linhas = [...store.base.lotes].map((l) => {
      const desp = soma(despesas.filter((x) => x.lote_id === l.id && x.situacao === 'realizado' && dentro(x.data_lancamento)));
      const rec = soma(receitas.filter((x) => x.lote_id === l.id && x.situacao === 'realizado' && dentro(x.data_lancamento)));
      const ali = fornec.filter((x) => x.lote_id === l.id && dentro(x.data_fornecimento)).reduce((s, x) => s + Number(x.custo), 0);
      const san = manejos.filter((x) => x.lote_id === l.id && dentro(x.data_aplicacao)).reduce((s, x) => s + Number(x.custo), 0);
      const cab = ativos.filter((a) => a.lote_id === l.id).length;
      return { id: l.id, nome: l.nome, ativo: l.ativo, desp, rec, ali, san, total: desp + ali + san, cab };
    }).filter((x) => x.total || x.rec || (x.ativo && x.cab));
    painel.innerHTML = `<div class="card">${linhas.length ? '<div id="t-lotes"></div>' : vazio({ icone: 'layers', titulo: 'Sem custos por lote no período', texto: 'Informe o lote nos lançamentos do financeiro, nos fornecimentos de suplemento e nos manejos sanitários coletivos.' })}</div>
      <p class="small muted">Custo do lote = despesas pagas lançadas no lote + custo dos fornecimentos de suplemento feitos ao lote + custo dos manejos sanitários aplicados ao lote, no período. Custo por cabeça usa as cabeças <b>atuais</b> do lote. Se a mesma compra de suplemento ou vacina também foi lançada como despesa do lote, ela aparece duas vezes. Nesse caso, lance a despesa sem lote ("Geral da fazenda").</p>`;
    if (!linhas.length) return;
    const cols = [
      { chave: 'nome', titulo: 'Lote', primaria: true, render: (x) => `<b>${esc(x.nome)}</b>${x.ativo ? '' : ' <span class="badge inativo">inativo</span>'}`, csv: (x) => x.nome },
      { chave: 'cab', titulo: 'Cabeças hoje', classe: 'dir', csv: (x) => x.cab },
      { chave: 'desp', titulo: 'Despesas lançadas', classe: 'dir', render: (x) => fmtMoeda(x.desp), csv: (x) => x.desp.toFixed(2) },
      { chave: 'ali', titulo: 'Alimentação', classe: 'dir', render: (x) => fmtMoeda(x.ali), csv: (x) => x.ali.toFixed(2) },
      { chave: 'san', titulo: 'Sanidade', classe: 'dir', render: (x) => fmtMoeda(x.san), csv: (x) => x.san.toFixed(2) },
      { chave: 'total', titulo: 'Custo total', classe: 'dir', render: (x) => `<b>${fmtMoeda(x.total)}</b>`, csv: (x) => x.total.toFixed(2) },
      { chave: 'porcab', titulo: 'Por cabeça', classe: 'dir', valor: (x) => (x.cab ? x.total / x.cab : null), render: (x) => (x.cab ? fmtMoeda(x.total / x.cab) : '—'), csv: (x) => (x.cab ? (x.total / x.cab).toFixed(2) : '') },
      { chave: 'rec', titulo: 'Receitas', classe: 'dir', render: (x) => (x.rec ? fmtMoeda(x.rec) : '—'), csv: (x) => x.rec.toFixed(2) },
    ];
    montarTabela(painel.querySelector('#t-lotes'), { colunas: cols, linhas: linhas.sort((a, b) => b.total - a.total), busca: false });
  }

  atualizar();
}
