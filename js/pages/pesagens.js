// =====================================================================
// PESAGENS E DESEMPENHO — pesagem coletiva, histórico e GMD por lote/categoria
// =====================================================================
import { sb } from '../supabase.js';
import { store, pode, param } from '../store.js';
import { esc, icones, fmtData, fmtNum, fmtKg, hojeISO, addDias, diasEntre, montarTabela, vazio, erroCarga, baixarCSV } from '../ui.js';
import { grafico, CORES, semDados } from '../components/graficos.js';
import { listarAnimais } from '../components/animais-comum.js';
import { todos } from '../components/consulta.js';
import { abrirPesagem, abrirPesagemColetiva, abrirEdicaoPesagem } from '../components/pesagem.js';
import { porAnimal, calcularGmd, resumir, agrupar, arrobas, DIAS_MIN } from '../components/desempenho.js';

const ABAS = [['desempenho', 'Desempenho (GMD)'], ['historico', 'Histórico de pesagens'], ['atrasadas', 'Sem pesagem recente']];
const TIPO = { rotina: 'Rotina', nascimento: 'Nascimento', desmame: 'Desmame', entrada: 'Entrada', saida: 'Saída' };
const linkAnimal = (a) => (a ? `<a href="#/animais/${a.id}"><b>${esc(a.brinco)}</b></a>` : '—');
const fmtGmd = (v) => (v == null ? '—' : `${fmtNum(v, 3)} kg/dia`);

export async function render(el) {
  const p = store.prop.id;
  let animais, pesagens;
  try {
    [animais, pesagens] = await Promise.all([
      listarAnimais(),
      todos(() => sb.from('pesagens').select('id, animal_id, data_pesagem, peso_kg, tipo, grupo_id, responsavel_nome, observacoes, criado_em')
        .eq('propriedade_id', p).order('data_pesagem', { ascending: false }).order('id')),
    ]);
  } catch (e) { el.innerHTML = erroCarga(e); icones(); return; }

  pesagens.sort((x, y) => y.data_pesagem.localeCompare(x.data_pesagem) || String(y.criado_em).localeCompare(String(x.criado_em)));
  const hoje = hojeISO();
  const editar = pode('pesagens');
  const porId = new Map(animais.map((a) => [a.id, a]));
  const nomeLote = (id) => store.base.lotes.find((l) => l.id === id)?.nome || '';
  const ativos = animais.filter((a) => a.conta_no_rebanho);
  const mapa = porAnimal(pesagens);
  const recarregar = () => render(el).then(icones);
  const ini30 = addDias(hoje, -30);
  const ult30 = pesagens.filter((x) => x.data_pesagem >= ini30);
  const comPeso = ativos.filter((a) => a.peso_atual);
  const pesoMedio = comPeso.length ? comPeso.reduce((s, a) => s + Number(a.peso_atual), 0) / comPeso.length : null;
  const gmd90 = resumir(calcularGmd(ativos, mapa, addDias(hoje, -90), hoje));
  const atraso = 90;
  const atrasadas = ativos.filter((a) => !a.data_ultima_pesagem || diasEntre(a.data_ultima_pesagem, hoje) > atraso);

  el.innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>Pesagens e desempenho</h1><p>Pesagens individuais e coletivas, ganho médio diário (GMD) por animal, lote e categoria.</p></div>
      ${editar ? '<div class="acoes"><button class="btn btn-primario" data-col><i data-lucide="scale"></i> Pesagem coletiva</button><button class="btn" data-ind><i data-lucide="plus"></i> Pesagem individual</button></div>' : ''}
    </div>
    <div class="grade grade-kpi" style="margin-bottom:18px">
      <div class="card kpi destaque"><span class="rotulo"><i data-lucide="scale"></i>Pesagens em 30 dias</span><span class="valor">${fmtNum(ult30.length)}</span><span class="detalhe">${fmtNum(new Set(ult30.map((x) => x.animal_id)).size)} animal(is)</span></div>
      <div class="card kpi"><span class="rotulo"><i data-lucide="weight"></i>Peso médio (ativos)</span><span class="valor">${pesoMedio ? fmtNum(pesoMedio, 0) : '—'}<small> kg</small></span><span class="detalhe">${fmtNum(comPeso.length)} com peso · ${pesoMedio ? `${fmtNum(arrobas(pesoMedio, { rendimentoPct: param('rendimento_carcaca_pct'), pesoArroba: param('peso_arroba_kg') }), 1)} @` : ''}</span></div>
      <div class="card kpi"><span class="rotulo"><i data-lucide="trending-up"></i>GMD (90 dias)</span><span class="valor">${gmd90.gmd == null ? '—' : fmtNum(gmd90.gmd, 3)}<small> kg/dia</small></span><span class="detalhe">${fmtNum(gmd90.n)} animal(is) com 2 pesagens</span></div>
      <div class="card kpi"><span class="rotulo"><i data-lucide="clock"></i>Sem pesagem há +${atraso} dias</span><span class="valor">${fmtNum(atrasadas.length)}</span><span class="detalhe">de ${fmtNum(ativos.length)} ativos</span></div>
    </div>
    <div class="abas" style="margin-top:0">${ABAS.map(([k, t]) => `<button class="aba" data-aba="${k}">${t}</button>`).join('')}</div>
    <div id="painel-pes"></div>`;
  el.querySelector('[data-col]')?.addEventListener('click', () => abrirPesagemColetiva({}, recarregar));
  el.querySelector('[data-ind]')?.addEventListener('click', () => abrirPesagem(null, recarregar));
  const painel = el.querySelector('#painel-pes');
  const mostrar = (k) => {
    el.querySelectorAll('.aba').forEach((x) => x.classList.toggle('ativa', x.dataset.aba === k));
    ({ desempenho: abaDesempenho, historico: abaHistorico, atrasadas: abaAtrasadas })[k]();
    icones();
  };
  el.querySelector('.abas').addEventListener('click', (e) => { const x = e.target.closest('[data-aba]'); if (x) mostrar(x.dataset.aba); });

  // ---------------- Desempenho ----------------
  function abaDesempenho() {
    painel.innerHTML = `
      <div class="filtro-periodo"><h2 style="margin:0">Período</h2>
        <select id="d-per" aria-label="Período"><option value="30">Últimos 30 dias</option><option value="90" selected>Últimos 90 dias</option><option value="180">Últimos 6 meses</option><option value="365">Últimos 12 meses</option><option value="x">Personalizado</option></select>
        <span id="d-datas" class="oculto" style="display:inline-flex;gap:6px;align-items:center"><input type="date" id="d-ini" max="${hoje}"> a <input type="date" id="d-fim" max="${hoje}" value="${hoje}"></span>
        <span class="small muted" id="d-txt"></span></div>
      <div id="d-corpo"></div>
      <p class="small muted">GMD = (peso final − peso inicial) ÷ dias entre as pesagens. Peso inicial: última pesagem até o início do período (ou a primeira dentro dele); peso final: última pesagem dentro do período. Entram só animais ativos com duas pesagens a pelo menos ${DIAS_MIN} dias de distância. A média do grupo é a média simples dos animais. Lote e categoria são os atuais de cada animal.</p>`;
    const sel = painel.querySelector('#d-per');
    const desenhar = () => {
      const pers = sel.value === 'x';
      painel.querySelector('#d-datas').classList.toggle('oculto', !pers);
      const ini = pers ? painel.querySelector('#d-ini').value : addDias(hoje, -Number(sel.value));
      const fim = pers ? painel.querySelector('#d-fim').value || hoje : hoje;
      const corpo = painel.querySelector('#d-corpo');
      if (!ini || ini >= fim) { corpo.innerHTML = '<div class="alerta aviso">Escolha a data inicial e final do período.</div>'; return; }
      painel.querySelector('#d-txt').textContent = `${fmtData(ini)} a ${fmtData(fim)}`;
      const res = calcularGmd(ativos, mapa, ini, fim);
      const geral = resumir(res);
      const porCat = agrupar(res, (a) => a.categoria_id, (a) => a.categoria_nome || 'Sem categoria');
      const porLote = agrupar(res, (a) => a.lote_id, (a) => (a.lote_id ? `Lote ${nomeLote(a.lote_id)}` : 'Sem lote'));
      const tabelaGrupo = (lista, titulo) => `<div class="tabela-wrap"><table class="tabela responsiva"><thead><tr><th>${titulo}</th><th class="dir">Animais</th><th class="dir">GMD médio</th><th class="dir">Menor / maior</th><th class="dir">Ganho médio</th><th class="dir">Peso final médio</th></tr></thead><tbody>
        ${lista.map((g) => `<tr><td class="primaria" data-rotulo="${titulo}"><b>${esc(g.rotulo)}</b></td><td class="dir" data-rotulo="Animais">${fmtNum(g.n)}</td><td class="dir" data-rotulo="GMD médio"><b>${fmtGmd(g.gmd)}</b></td>
          <td class="dir" data-rotulo="Menor / maior">${fmtNum(g.min, 3)} / ${fmtNum(g.max, 3)}</td><td class="dir" data-rotulo="Ganho médio">${fmtNum(g.ganho, 1)} kg</td><td class="dir" data-rotulo="Peso final médio">${fmtKg(g.pesoFinal)}</td></tr>`).join('')}</tbody></table></div>`;
      corpo.innerHTML = res.length ? `
        <div class="grade grade-kpi" style="margin-bottom:16px">
          <div class="card kpi destaque"><span class="rotulo">GMD médio do período</span><span class="valor">${fmtNum(geral.gmd, 3)}<small> kg/dia</small></span><span class="detalhe">${fmtNum(geral.n)} animal(is)</span></div>
          <div class="card kpi"><span class="rotulo">Ganho médio por animal</span><span class="valor">${fmtNum(geral.ganho, 1)}<small> kg</small></span></div>
          <div class="card kpi"><span class="rotulo">Menor GMD</span><span class="valor">${fmtNum(geral.min, 3)}</span></div>
          <div class="card kpi"><span class="rotulo">Maior GMD</span><span class="valor">${fmtNum(geral.max, 3)}</span></div>
        </div>
        <div class="grade grade-2">
          <div class="card"><div class="card-titulo"><h3>GMD por categoria</h3></div><div class="grafico"><canvas id="g-cat"></canvas></div></div>
          <div class="card"><div class="card-titulo"><h3>GMD por lote</h3></div><div class="grafico"><canvas id="g-lote"></canvas></div></div>
        </div>
        <section class="secao"><h2>Por categoria</h2><div class="card">${tabelaGrupo(porCat, 'Categoria')}</div></section>
        <section class="secao"><h2>Por lote</h2><div class="card">${tabelaGrupo(porLote, 'Lote')}</div></section>
        <section class="secao"><div class="cabecalho-pagina" style="margin-bottom:8px"><h2 style="margin:0">Por animal</h2><button class="btn btn-sm" id="d-csv"><i data-lucide="download"></i> Exportar CSV</button></div><div class="card"><div id="t-gmd"></div></div></section>`
        : vazio({ icone: 'trending-up', titulo: 'Sem dados suficientes no período', texto: `É preciso ter pelo menos duas pesagens do mesmo animal, com ${DIAS_MIN} dias ou mais de intervalo. Use a pesagem coletiva para pesar o lote inteiro de uma vez.` });
      if (!res.length) { icones(); return; }
      const barra = (canvas, grupos, cor) => grafico(canvas, { type: 'bar', data: { labels: grupos.map((g) => g.rotulo), datasets: [{ label: 'GMD (kg/dia)', data: grupos.map((g) => Number(g.gmd.toFixed(3))), backgroundColor: cor, borderRadius: 4 }] },
        options: { indexAxis: grupos.length > 6 ? 'y' : 'x', scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } } });
      barra(corpo.querySelector('#g-cat'), porCat, CORES[0]);
      barra(corpo.querySelector('#g-lote'), porLote, CORES[1]);
      const cols = [
        { chave: 'brinco', titulo: 'Animal', primaria: true, valor: (x) => x.a.brinco, render: (x) => `${linkAnimal(x.a)} <span class="small muted">${esc(x.a.categoria_nome || '')}</span>`, csv: (x) => x.a.brinco },
        { chave: 'cat', titulo: 'Categoria', valor: (x) => x.a.categoria_nome, render: (x) => esc(x.a.categoria_nome || '—'), csv: (x) => x.a.categoria_nome },
        { chave: 'lote', titulo: 'Lote', valor: (x) => nomeLote(x.a.lote_id), render: (x) => esc(nomeLote(x.a.lote_id) || '—'), csv: (x) => nomeLote(x.a.lote_id) },
        { chave: 'ini', titulo: 'Peso inicial', classe: 'dir', valor: (x) => Number(x.inicial.peso_kg), render: (x) => `${fmtKg(x.inicial.peso_kg)} <span class="small muted">${fmtData(x.inicial.data_pesagem)}</span>`, csv: (x) => `${x.inicial.peso_kg} (${fmtData(x.inicial.data_pesagem)})` },
        { chave: 'fim', titulo: 'Peso final', classe: 'dir', valor: (x) => Number(x.final.peso_kg), render: (x) => `${fmtKg(x.final.peso_kg)} <span class="small muted">${fmtData(x.final.data_pesagem)}</span>`, csv: (x) => `${x.final.peso_kg} (${fmtData(x.final.data_pesagem)})` },
        { chave: 'dias', titulo: 'Dias', classe: 'dir', csv: (x) => x.dias },
        { chave: 'ganho', titulo: 'Ganho', classe: 'dir', render: (x) => `${fmtNum(x.ganho, 1)} kg`, csv: (x) => x.ganho.toFixed(1) },
        { chave: 'gmd', titulo: 'GMD', classe: 'dir', render: (x) => `<b>${fmtGmd(x.gmd)}</b>`, csv: (x) => x.gmd.toFixed(3) },
      ];
      const ordenado = [...res].sort((a, b) => b.gmd - a.gmd);
      montarTabela(corpo.querySelector('#t-gmd'), { colunas: cols, linhas: ordenado, idLinha: (x) => x.a.id });
      corpo.querySelector('#d-csv').addEventListener('click', () => baixarCSV(`gmd-${ini}-a-${fim}.csv`, cols, ordenado));
      icones();
    };
    sel.addEventListener('change', () => { if (sel.value === 'x' && !painel.querySelector('#d-ini').value) painel.querySelector('#d-ini').value = addDias(hoje, -90); desenhar(); });
    painel.querySelector('#d-ini').addEventListener('change', desenhar);
    painel.querySelector('#d-fim').addEventListener('change', desenhar);
    desenhar();
  }

  // ---------------- Histórico ----------------
  function abaHistorico() {
    // Diferença em relação à pesagem anterior do mesmo animal
    const anterior = new Map();
    for (const lista of mapa.values()) lista.forEach((x, i) => { if (i) anterior.set(x.id, lista[i - 1]); });
    const grupos = new Map();
    pesagens.filter((x) => x.grupo_id).forEach((x) => {
      if (!grupos.has(x.grupo_id)) grupos.set(x.grupo_id, { id: x.grupo_id, data: x.data_pesagem, resp: x.responsavel_nome, itens: [] });
      grupos.get(x.grupo_id).itens.push(x);
    });
    const sessoes = [...grupos.values()].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 12);
    const cols = [
      { chave: 'data_pesagem', titulo: 'Data', primaria: true, render: (x) => fmtData(x.data_pesagem), csv: (x) => fmtData(x.data_pesagem) },
      { chave: 'brinco', titulo: 'Animal', valor: (x) => porId.get(x.animal_id)?.brinco, render: (x) => linkAnimal(porId.get(x.animal_id)), csv: (x) => porId.get(x.animal_id)?.brinco },
      { chave: 'peso_kg', titulo: 'Peso', classe: 'dir', valor: (x) => Number(x.peso_kg), render: (x) => `<b>${fmtKg(x.peso_kg)}</b>`, csv: (x) => x.peso_kg },
      { chave: 'tipo', titulo: 'Tipo', valor: (x) => TIPO[x.tipo], render: (x) => `${esc(TIPO[x.tipo] || x.tipo)}${x.grupo_id ? ' <span class="badge info">coletiva</span>' : ''}`, csv: (x) => TIPO[x.tipo] },
      { chave: 'dif', titulo: 'Desde a anterior', classe: 'dir', valor: (x) => { const a = anterior.get(x.id); return a ? Number(x.peso_kg) - Number(a.peso_kg) : null; },
        render: (x) => { const a = anterior.get(x.id); if (!a) return '—'; const d = diasEntre(a.data_pesagem, x.data_pesagem); const g = Number(x.peso_kg) - Number(a.peso_kg); return `${g >= 0 ? '+' : ''}${fmtNum(g, 1)} kg${d > 0 ? ` <span class="small muted">${fmtNum(g / d, 3)} kg/dia</span>` : ''}`; },
        csv: (x) => { const a = anterior.get(x.id); return a ? (Number(x.peso_kg) - Number(a.peso_kg)).toFixed(1) : ''; } },
      { chave: 'resp', titulo: 'Responsável', render: (x) => esc(x.responsavel_nome || '—'), csv: (x) => x.responsavel_nome || '' },
    ];
    painel.innerHTML = `
      ${sessoes.length ? `<section class="secao" style="margin-top:0"><h2>Pesagens coletivas recentes</h2><div class="grade grade-3">${sessoes.map((s) => {
        const vals = s.itens.map((x) => Number(x.peso_kg));
        return `<div class="card"><div class="small muted">${fmtData(s.data)}${s.resp ? ` · ${esc(s.resp)}` : ''}</div><div style="font-size:1.3rem;font-weight:700">${fmtNum(s.itens.length)} animal(is)</div>
          <div class="small">Peso médio <b>${fmtKg(vals.reduce((a, b) => a + b, 0) / vals.length)}</b> · de ${fmtKg(Math.min(...vals))} a ${fmtKg(Math.max(...vals))}</div></div>`;
      }).join('')}</div></section>` : ''}
      <div class="filtro-periodo"><select id="h-tipo" aria-label="Tipo"><option value="">Todos os tipos</option>${Object.entries(TIPO).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
        <button class="btn btn-sm" id="h-csv" style="margin-left:auto"><i data-lucide="download"></i> Exportar CSV</button></div>
      <div class="card">${pesagens.length ? '<div id="t-hist"></div>' : vazio({ icone: 'scale', titulo: 'Nenhuma pesagem registrada' })}</div>
      ${editar ? '<p class="small muted">Toque em uma pesagem para corrigir o peso ou a data.</p>' : ''}`;
    if (!pesagens.length) return;
    const tabela = montarTabela(painel.querySelector('#t-hist'), {
      colunas: cols, linhas: pesagens,
      aoClicar: editar ? (id) => { const x = pesagens.find((y) => y.id === id); abrirEdicaoPesagem(x, porId.get(x.animal_id), recarregar); } : null,
    });
    const filtradas = () => pesagens.filter((x) => !painel.querySelector('#h-tipo').value || x.tipo === painel.querySelector('#h-tipo').value);
    painel.querySelector('#h-tipo').addEventListener('change', () => tabela.atualizar(filtradas()));
    painel.querySelector('#h-csv').addEventListener('click', () => baixarCSV(`pesagens-${hoje}.csv`, cols, filtradas()));
  }

  // ---------------- Sem pesagem recente ----------------
  function abaAtrasadas() {
    const cols = [
      { chave: 'brinco', titulo: 'Animal', primaria: true, render: (a) => `${linkAnimal(a)} <span class="small muted">${esc(a.categoria_nome || '')}</span>`, csv: (a) => a.brinco },
      { chave: 'lote', titulo: 'Lote', valor: (a) => nomeLote(a.lote_id), render: (a) => esc(nomeLote(a.lote_id) || '—'), csv: (a) => nomeLote(a.lote_id) },
      { chave: 'peso_atual', titulo: 'Último peso', classe: 'dir', valor: (a) => (a.peso_atual ? Number(a.peso_atual) : null), render: (a) => fmtKg(a.peso_atual), csv: (a) => a.peso_atual ?? '' },
      { chave: 'data_ultima_pesagem', titulo: 'Última pesagem', render: (a) => (a.data_ultima_pesagem ? `${fmtData(a.data_ultima_pesagem)} <span class="small muted">há ${fmtNum(diasEntre(a.data_ultima_pesagem, hoje))} dias</span>` : '<span class="badge aviso">nunca pesado</span>'), csv: (a) => fmtData(a.data_ultima_pesagem) },
    ];
    painel.innerHTML = `<div class="filtro-periodo"><span class="muted">Animais ativos sem pesagem há mais de ${atraso} dias.</span><button class="btn btn-sm" id="a-csv" style="margin-left:auto"><i data-lucide="download"></i> Exportar CSV</button></div>
      <div class="card">${atrasadas.length ? '<div id="t-atr"></div>' : vazio({ icone: 'check-circle-2', titulo: 'Todos os animais ativos foram pesados recentemente' })}</div>`;
    if (atrasadas.length) montarTabela(painel.querySelector('#t-atr'), { colunas: cols, linhas: atrasadas, aoClicar: (id) => { location.hash = `#/animais/${id}`; } });
    painel.querySelector('#a-csv').addEventListener('click', () => baixarCSV(`sem-pesagem-${hoje}.csv`, cols, atrasadas));
  }

  mostrar('desempenho');
}
