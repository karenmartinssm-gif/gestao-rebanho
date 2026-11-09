// =====================================================================
// REPRODUÇÃO E CRIA
// =====================================================================
import { sb } from '../supabase.js';
import { store, pode, param, carregarBase, podeExcluir } from '../store.js';
import {
  esc, icones, abrirModal, fmtData, fmtNum, fmtKg, fmtPct, idadeTexto, hojeISO, addDias, montarTabela, vazio, erroCarga, baixarCSV, ROTULO_SITUACAO_REPRO, ROTULO_SEXO,
} from '../ui.js';
import { listarAnimais } from '../components/animais-comum.js';
import { calcularIndicadores, desempenhoMatriz, situacaoExibida } from '../components/reproducao-indicadores.js';
import * as F from '../components/reproducao-forms.js';
import { todos } from '../components/consulta.js';
import { grafico, CORES } from '../components/graficos.js';

const pl = (n, um, varios) => `${fmtNum(n)} ${n === 1 ? um : varios}`;
const ABAS = [['geral', 'Visão geral'], ['matrizes', 'Vacas e novilhas'], ['coberturas', 'Coberturas'], ['nascimentos', 'Nascimentos'], ['desmames', 'Desmames'], ['reprodutores', 'Touros e sêmen']];
const CHAVE_ABA = 'rebanho.repro.aba';
const classeSit = { prenhe: 'ativo', proxima_parto: 'aviso', vazia: 'inativo', aguardando_diagnostico: 'info', aguardando_confirmacao_te: 'info', coberta: 'info', em_reproducao: '', pos_parto: '' };

async function q(promessa) {
  const { data, error } = await promessa;
  if (error) throw error;
  return data || [];
}

export async function render(el) {
  const p = store.prop.id;
  let animais, matrizes, coberturas, nascimentos, desmames;
  try {
    await carregarBase();
    [animais, matrizes, coberturas, nascimentos, desmames] = await Promise.all([
      listarAnimais(),
      todos(() => sb.from('matrizes').select('*').eq('propriedade_id', p).order('id')),
      todos(() => sb.from('coberturas').select('*').eq('propriedade_id', p).order('data_cobertura', { ascending: false }).order('id')),
      todos(() => sb.from('nascimentos').select('*').eq('propriedade_id', p).order('data_nascimento', { ascending: false }).order('id')),
      todos(() => sb.from('desmames').select('*').eq('propriedade_id', p).order('data_desmame', { ascending: false }).order('id')),
    ]);
  } catch (e) { el.innerHTML = erroCarga(e); icones(); return; }

  const dados = { animais, matrizes, coberturas, nascimentos, desmames };
  const porId = new Map(animais.map((a) => [a.id, a]));
  const reprodutores = store.base.reprodutores;
  const nomeRep = (id) => { const r = reprodutores.find((x) => x.id === id); return r ? `${r.identificacao}${r.tipo === 'semen' ? ' (sêmen)' : ''}` : '—'; };
  const linkAnimal = (id, txt) => (id && porId.get(id) ? `<a href="#/animais/${id}">${esc(txt ?? porId.get(id).brinco)}</a>` : esc(txt ?? '—'));
  const cobAberta = new Map();
  [...coberturas].reverse().forEach((c) => { if (['aguardando_diagnostico', 'prenhe'].includes(c.situacao)) cobAberta.set(c.matriz_id, c); });
  const prazos = { diasDiag: param('dias_diagnostico_gestacao'), diasAlertaParto: param('dias_alerta_parto') };
  const desmamados = new Set(desmames.map((d) => d.bezerro_id));
  const editar = pode('reproducao');
  const recarregar = () => render(el).then(icones);

  // Matrizes ativas com dados calculados
  const listaMatrizes = matrizes.map((m) => {
    const a = porId.get(m.animal_id);
    if (!a) return null;
    const cob = cobAberta.get(m.animal_id);
    return { ...m, a, cob, sit: situacaoExibida(m.situacao_reprodutiva, cob, prazos), d: desempenhoMatriz(m.animal_id, dados) };
  }).filter(Boolean);
  const ativas = listaMatrizes.filter((m) => m.a.conta_no_rebanho);

  let aba = 'geral';
  try { aba = sessionStorage.getItem(CHAVE_ABA) || 'geral'; } catch { /* ignora */ }

  el.innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>Reprodução e cria</h1><p>Vacas, coberturas, partos e desmames com indicadores calculados a partir dos registros.</p></div>
      ${editar ? `<div class="acoes">
        <button class="btn" data-acao="cobertura"><i data-lucide="heart"></i> Cobertura</button>
        <button class="btn" data-acao="diagnostico"><i data-lucide="scan-search"></i> Diagnóstico</button>
        <button class="btn btn-primario" data-acao="nascimento"><i data-lucide="baby"></i> Nascimento</button>
        <button class="btn" data-acao="desmame"><i data-lucide="milk-off"></i> Desmame</button></div>` : ''}
    </div>
    <div class="abas" style="margin-top:0">${ABAS.map(([k, t]) => `<button class="aba" data-aba="${k}">${t}</button>`).join('')}</div>
    <div id="painel-repro"></div>`;
  const painel = el.querySelector('#painel-repro');

  el.querySelectorAll('[data-acao]').forEach((b) => b.addEventListener('click', () => {
    const m = { cobertura: F.abrirCobertura, diagnostico: F.abrirDiagnostico, nascimento: F.abrirNascimento, desmame: F.abrirDesmame }[b.dataset.acao];
    m(null, recarregar);
  }));

  const mostrar = (k) => {
    aba = k;
    try { sessionStorage.setItem(CHAVE_ABA, k); } catch { /* ignora */ }
    el.querySelectorAll('.aba').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === k));
    ({ geral: abaGeral, matrizes: abaMatrizes, coberturas: abaCoberturas, nascimentos: abaNascimentos, desmames: abaDesmames, reprodutores: abaReprodutores })[k]();
    icones();
  };
  el.querySelector('.abas').addEventListener('click', (e) => { const b = e.target.closest('[data-aba]'); if (b) mostrar(b.dataset.aba); });

  // Lista dos animais por trás de um número (abre ao clicar no quadro)
  function abrirLista(titulo, itens) {
    const ordenados = [...itens].filter((it) => porId.get(it.id))
      .sort((x, y) => (x.grupo ?? 0) - (y.grupo ?? 0) || (x.ordem ?? 0) - (y.ordem ?? 0) || String(porId.get(x.id).brinco).localeCompare(String(porId.get(y.id).brinco), 'pt-BR', { numeric: true }));
    const linha = (it) => {
      const a = porId.get(it.id);
      const mae = it.mae && porId.get(it.mae);
      return `<li><a href="#/animais/${a.id}" data-fechar><b>${esc(a.brinco)}</b>${a.nome ? ` <span class="muted">${esc(a.nome)}</span>` : ''}</a>
        <span class="small muted">${esc([a.categoria_nome, a.data_nascimento ? idadeTexto(a.data_nascimento) : '', mae ? `mãe ${mae.brinco}` : ''].filter(Boolean).join(' · '))}</span>
        ${it.info ? `<span class="small lista-info">${esc(it.info)}</span>` : ''}</li>`;
    };
    abrirModal({
      titulo: `${titulo} (${fmtNum(ordenados.length)})`,
      html: ordenados.length ? `<p class="small muted" style="margin:0 0 10px">Toque no brinco para abrir a ficha do animal.</p><ul class="lista-animais">${ordenados.map(linha).join('')}</ul>`
        : '<p class="muted">Nenhum animal neste número.</p>',
    });
  }

  // ---------------- VISÃO GERAL ----------------
  function abaGeral() {
    const anos = [...new Set([...coberturas.map((c) => c.data_cobertura), ...nascimentos.map((n) => n.data_nascimento)].map((d) => d.slice(0, 4)))].sort().reverse();
    const hoje = hojeISO();
    const doSit = (...ss) => ativas.filter((m) => ss.includes(m.sit));
    const contaSit = (s) => doSit(s).length;
    const lPartos30 = ativas.filter((m) => m.cob?.situacao === 'prenhe' && m.cob.data_prevista_parto && m.cob.data_prevista_parto <= addDias(hoje, 30));
    const partos30 = lPartos30.length;
    const lAoPe = animais.filter((a) => a.conta_no_rebanho && a.categoria_grupo === 'bezerro' && a.origem === 'nascido' && !desmamados.has(a.id));
    const aoPe = lAoPe.length;
    const maeDe = new Map(nascimentos.filter((n) => n.bezerro_id).map((n) => [n.bezerro_id, n.matriz_id]));
    const sitTxt = (m) => ROTULO_SITUACAO_REPRO[m.sit] || '';
    const listas = {
      ativas: ['Vacas e novilhas ativas', ativas.map((m) => ({ id: m.a.id, info: sitTxt(m) }))],
      prenhes: ['Prenhes', doSit('proxima_parto', 'prenhe').map((m) => ({ id: m.a.id, grupo: m.sit === 'proxima_parto' ? 0 : 1, ordem: m.cob?.data_prevista_parto ? Date.parse(m.cob.data_prevista_parto) : 0, info: m.cob?.data_prevista_parto ? `Parto previsto ${fmtData(m.cob.data_prevista_parto)}` : sitTxt(m) }))],
      aguardando: ['Aguardando diagnóstico', doSit('aguardando_diagnostico', 'coberta', 'aguardando_confirmacao_te').map((m) => ({ id: m.a.id, info: m.cob?.data_cobertura ? `Coberta em ${fmtData(m.cob.data_cobertura)}` : sitTxt(m) }))],
      vazias: ['Vazias', doSit('vazia').map((m) => ({ id: m.a.id, info: 'Vazia' }))],
      partos30: ['Partos nos próximos 30 dias', lPartos30.map((m) => ({ id: m.a.id, ordem: Date.parse(m.cob.data_prevista_parto), info: `Parto previsto ${fmtData(m.cob.data_prevista_parto)}` }))],
      aoPe: ['Bezerros ao pé (sem desmame)', lAoPe.map((a) => ({ id: a.id, mae: maeDe.get(a.id), info: a.sexo ? ROTULO_SEXO[a.sexo] : '' }))],
    };
    painel.innerHTML = `
      <div class="grade grade-kpi" style="margin-bottom:20px">
        <div class="card kpi clicavel" role="button" tabindex="0" data-lista="ativas" title="Ver quais animais" destaque"><span class="rotulo"><i data-lucide="heart"></i>Vacas e novilhas ativas</span><span class="valor">${fmtNum(ativas.length)}</span></div>
        <div class="card kpi clicavel" role="button" tabindex="0" data-lista="prenhes" title="Ver quais animais""><span class="rotulo"><i data-lucide="heart-pulse"></i>Prenhes</span><span class="valor">${fmtNum(contaSit('prenhe') + contaSit('proxima_parto'))}</span><span class="detalhe">${fmtNum(contaSit('proxima_parto'))} próximas do parto</span></div>
        <div class="card kpi clicavel" role="button" tabindex="0" data-lista="aguardando" title="Ver quais animais""><span class="rotulo"><i data-lucide="scan-search"></i>Aguardando diagnóstico</span><span class="valor">${fmtNum(contaSit('aguardando_diagnostico') + contaSit('coberta') + contaSit('aguardando_confirmacao_te'))}</span></div>
        <div class="card kpi clicavel" role="button" tabindex="0" data-lista="vazias" title="Ver quais animais""><span class="rotulo"><i data-lucide="heart-off"></i>Vazias</span><span class="valor">${fmtNum(contaSit('vazia'))}</span></div>
        <div class="card kpi clicavel" role="button" tabindex="0" data-lista="partos30" title="Ver quais animais""><span class="rotulo"><i data-lucide="calendar-clock"></i>Partos nos próximos 30 dias</span><span class="valor">${fmtNum(partos30)}</span></div>
        <div class="card kpi clicavel" role="button" tabindex="0" data-lista="aoPe" title="Ver quais animais""><span class="rotulo"><i data-lucide="baby"></i>Bezerros ao pé (sem desmame)</span><span class="valor">${fmtNum(aoPe)}</span></div>
      </div>
      <div class="filtro-periodo"><h2 style="margin:0">Indicadores do período</h2>
        <select id="periodo" aria-label="Período"><option value="12m">Últimos 12 meses</option>${anos.map((y) => `<option value="${y}">Ano de ${y}</option>`).join('')}</select>
        <span class="small muted" id="periodo-txt"></span></div>
      <div class="grade grade-3" id="indicadores"></div>
      <p class="small muted">Os indicadores consideram apenas eventos registrados no sistema. Quando o denominador é zero, o indicador aparece como “—”.</p>`;
    let listasPeriodo = {};
    const abrirDoCartao = (alvo) => {
      if (alvo.closest('details')) return;   // "Como é calculado" abre normalmente
      const k = alvo.closest('[data-lista]');
      if (k) { abrirLista(...listas[k.dataset.lista]); return; }
      const kp = alvo.closest('[data-lista-periodo]');
      if (kp) abrirLista(...listasPeriodo[kp.dataset.listaPeriodo]);
    };
    painel.addEventListener('click', (e) => abrirDoCartao(e.target));
    painel.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.clicavel')) { e.preventDefault(); abrirDoCartao(e.target); } });
    const sel = painel.querySelector('#periodo');
    const desenhar = () => {
      const v = sel.value;
      const [ini, fim] = v === '12m' ? [addDias(hoje, -365), hoje] : [`${v}-01-01`, `${v}-12-31`];
      painel.querySelector('#periodo-txt').textContent = `${fmtData(ini)} a ${fmtData(fim)}`;
      const r = calcularIndicadores(dados, ini, fim, param('periodo_gestacao_dias'), param('idade_desmame_dias'));
      listasPeriodo = { prenhez: ['Taxa de prenhez', r.prenhez.itens], natalidade: ['Taxa de natalidade', r.natalidade.itens], desmame: ['Taxa de desmame', r.desmame.itens],
        mortalidade: ['Mortalidade de bezerros', r.mortalidade.itens], iep: ['Intervalo entre partos', r.iep.itens], peso: ['Peso médio ao desmame', r.pesoDesmame.itens] };
      const chaves = { 'Taxa de prenhez': 'prenhez', 'Taxa de natalidade': 'natalidade', 'Taxa de desmame': 'desmame', 'Mortalidade de bezerros': 'mortalidade', 'Intervalo entre partos': 'iep', 'Peso médio ao desmame': 'peso' };
      const card = (titulo, valor, conta, formula) => `<div class="card indicador clicavel" role="button" tabindex="0" data-lista-periodo="${chaves[titulo]}" title="Ver quais animais"><span class="small muted" style="font-weight:600">${titulo}</span>
        <span class="valor">${valor}</span><span class="conta">${conta}</span><span class="small ver-animais"><i data-lucide="list"></i> Ver animais</span>
        <details><summary>Como é calculado</summary>${formula}</details></div>`;
      painel.querySelector('#indicadores').innerHTML = [
        card('Taxa de prenhez', fmtPct(r.prenhez.valor), `${pl(r.prenhez.num, 'prenhe', 'prenhes')} de ${pl(r.prenhez.den, 'fêmea diagnosticada', 'fêmeas diagnosticadas')}${r.prenhez.extra ? ` · ${r.prenhez.extra} sem diagnóstico ainda` : ''}`,
          'Fêmeas que ficaram prenhes ÷ fêmeas cobertas no período que já têm resultado (prenhe, vazia, parida ou aborto) × 100. Fêmeas sem diagnóstico ficam fora da conta.'),
        card('Taxa de natalidade', fmtPct(r.natalidade.valor), `${pl(r.natalidade.num, 'nascido vivo', 'nascidos vivos')} ÷ ${pl(r.natalidade.den, 'fêmea exposta', 'fêmeas expostas')}`,
          `Bezerros nascidos vivos no período ÷ fêmeas cobertas uma gestação antes (${fmtData(r.natalidade.iniExp)} a ${fmtData(r.natalidade.fimExp)}) × 100.`),
        card('Taxa de desmame', fmtPct(r.desmame.valor), `${pl(r.desmame.num, 'desmamado', 'desmamados')} de ${pl(r.desmame.den, 'bezerro elegível', 'bezerros elegíveis')}${r.desmame.aguardando ? ` · ${pl(r.desmame.aguardando, 'ainda novo demais', 'ainda novos demais')}` : ''}`,
          `Bezerros nascidos vivos no período e desmamados ÷ bezerros nascidos vivos no período que já atingiram a idade de desmame (${param('idade_desmame_dias')} dias) × 100.`),
        card('Mortalidade de bezerros', fmtPct(r.mortalidade.valor), `${pl(r.mortalidade.num, 'morte', 'mortes')} de ${pl(r.mortalidade.den, 'nascido vivo', 'nascidos vivos')} · ${pl(r.mortalidade.natimortos, 'natimorto', 'natimortos')} · ${pl(r.mortalidade.abortos, 'aborto', 'abortos')}`,
          'Bezerros nascidos vivos no período que morreram antes do desmame ÷ nascidos vivos no período × 100. Natimortos e abortos são mostrados à parte e não entram nesta taxa.'),
        card('Intervalo entre partos', r.iep.valor ? `${fmtNum(r.iep.valor)} dias` : '—', r.iep.n ? `média de ${r.iep.n} intervalo(s) · ${fmtNum(r.iep.valor / 30.44, 1)} meses` : 'Necessário: matrizes com 2 ou mais partos',
          'Média dos dias entre partos consecutivos da mesma vaca, considerando os partos (vivos ou natimortos) ocorridos no período. Abortos não contam como parto.'),
        card('Peso médio ao desmame', r.pesoDesmame.valor ? fmtKg(r.pesoDesmame.valor) : '—', `${r.pesoDesmame.n} desmame(s) com peso registrado${r.pesoDesmame.idade ? ` · idade média ${fmtNum(r.pesoDesmame.idade)} dias` : ''}`,
          'Média dos pesos informados nos desmames do período. Desmames sem peso não entram na média.'),
      ].join('');
      icones();
    };
    sel.addEventListener('change', desenhar);
    desenhar();
  }

  // ---------------- MATRIZES ----------------
  function abaMatrizes() {
    // Quadros de resumo (rebanho ativo) — clicar filtra a tabela; clicar de novo tira o filtro
    const CAT = { vacas: ['Vacas', 'heart', (m) => m.a.categoria_grupo !== 'novilha'], novilhas: ['Novilhas', 'sprout', (m) => m.a.categoria_grupo === 'novilha'] };
    const SIT = {
      pos_parto: ['Recuperação pós-parto', 'baby', (m) => m.sit === 'pos_parto'],
      proxima_parto: ['Próxima do parto', 'calendar-clock', (m) => m.sit === 'proxima_parto'],
      vazia: ['Vazia', 'heart-off', (m) => m.sit === 'vazia'],
      prenhe: ['Prenhe', 'heart-pulse', (m) => m.sit === 'prenhe' || m.sit === 'proxima_parto'],
    };
    const filtro = { cat: null, sit: null };
    const conta = (fn) => ativas.filter(fn).length;
    const quadro = (tipo, k, [titulo, icone, fn], detalhe = '') => `<div class="card kpi clicavel" role="button" tabindex="0" data-f-${tipo}="${k}" title="Filtrar a tabela">
      <span class="rotulo"><i data-lucide="${icone}"></i>${titulo}</span><span class="valor">${fmtNum(conta(fn))}</span>${detalhe ? `<span class="detalhe">${detalhe}</span>` : ''}</div>`;
    const nProx = conta(SIT.proxima_parto[2]);
    painel.innerHTML = `<div class="vacas-resumo">
        <div class="vacas-resumo-cat">${Object.entries(CAT).map(([k, d]) => quadro('cat', k, d)).join('')}</div>
        <div class="vacas-resumo-sit">${Object.entries(SIT).map(([k, d]) => quadro('sit', k, d, k === 'prenhe' && nProx ? `inclui ${fmtNum(nProx)} próxima${nProx === 1 ? '' : 's'} do parto` : '')).join('')}</div>
      </div>
      <div class="filtro-periodo"><label class="check"><input type="checkbox" id="m-inativas"> Mostrar também as que saíram do rebanho</label>
      <button class="btn btn-sm" id="m-csv" style="margin-left:auto"><i data-lucide="download"></i> Exportar CSV</button></div>
      <div id="m-filtro" class="small" hidden></div>
      <div class="card tabela-vacas"><div id="t-matrizes"></div></div>
      <p class="small muted">Vacas e novilhas entram aqui automaticamente pela categoria do animal. A situação é atualizada por coberturas, diagnósticos e partos.</p>`;
    const cols = [
      { chave: 'brinco', titulo: 'Vaca', primaria: true, valor: (m) => m.a.brinco, render: (m) => `${linkAnimal(m.a.id)}${m.a.nome ? ` <span class="small muted">${esc(m.a.nome)}</span>` : ''}<div class="small muted">${esc(m.a.categoria_nome)}${!m.apta_reproducao ? ' · <b>descarte</b>' : ''}</div>`, csv: (m) => m.a.brinco },
      { chave: 'idade', titulo: 'Idade', valor: (m) => m.a.idade_meses, render: (m) => idadeTexto(m.a.data_nascimento), csv: (m) => idadeTexto(m.a.data_nascimento) },
      { chave: 'sit', titulo: 'Situação', valor: (m) => ROTULO_SITUACAO_REPRO[m.sit], render: (m) => (m.a.conta_no_rebanho ? `<span class="badge ${classeSit[m.sit] ?? ''}">${esc(ROTULO_SITUACAO_REPRO[m.sit])}</span>` : `<span class="badge inativo">${esc(m.a.status_nome)}</span>`), csv: (m) => ROTULO_SITUACAO_REPRO[m.sit] },
      { chave: 'prev', titulo: 'Previsão de parto', valor: (m) => (m.cob?.situacao === 'prenhe' ? m.cob.data_prevista_parto : null), render: (m) => (m.cob?.situacao === 'prenhe' ? fmtData(m.cob.data_prevista_parto) : '—'), csv: (m) => (m.cob?.situacao === 'prenhe' ? fmtData(m.cob.data_prevista_parto) : '') },
      { chave: 'partos', titulo: 'Partos', classe: 'dir', valor: (m) => m.d.partos, render: (m) => fmtNum(m.d.partos), csv: (m) => m.d.partos },
      { chave: 'vivos', titulo: 'Bezerros vivos', classe: 'dir', valor: (m) => m.d.vivos, render: (m) => fmtNum(m.d.vivos), csv: (m) => m.d.vivos },
      { chave: 'abortos', titulo: 'Abortos', classe: 'dir', valor: (m) => m.d.abortos, render: (m) => fmtNum(m.d.abortos), csv: (m) => m.d.abortos },
      { chave: 'ultimo', titulo: 'Último parto', valor: (m) => m.d.ultimoParto, render: (m) => fmtData(m.d.ultimoParto), csv: (m) => fmtData(m.d.ultimoParto) },
      { chave: 'iep', titulo: 'IEP médio', classe: 'dir', valor: (m) => m.d.iep, render: (m) => (m.d.iep ? `${fmtNum(m.d.iep)} d` : '—'), csv: (m) => (m.d.iep ? Math.round(m.d.iep) : '') },
      { chave: 'peso', titulo: 'Peso desmame (filhos)', classe: 'dir', valor: (m) => m.d.pesoDesmameMedio, render: (m) => (m.d.pesoDesmameMedio ? fmtKg(m.d.pesoDesmameMedio) : '—'), csv: (m) => m.d.pesoDesmameMedio?.toFixed(1) ?? '' },
      ...(editar ? [{ chave: 'acao', titulo: '', classe: 'col-acao', render: (m) => (m.a.conta_no_rebanho ? `<button class="btn btn-sm" data-sit="${m.id}" title="Ajustar situação">Situação</button>` : '') }] : []),
    ];
    const box = painel.querySelector('#t-matrizes');
    const linhas = () => (painel.querySelector('#m-inativas').checked ? listaMatrizes : ativas)
      .filter((m) => (!filtro.cat || CAT[filtro.cat][2](m)) && (!filtro.sit || (m.a.conta_no_rebanho && SIT[filtro.sit][2](m))));
    const t = montarTabela(box, {
      colunas: cols, linhas: linhas(),
      vazioHtml: vazio({ icone: 'heart', titulo: 'Nenhuma vaca', texto: 'Cadastre fêmeas nas categorias Novilha, Primípara ou Vaca para que apareçam aqui.' }),
      aoClicar: (id) => { const m = listaMatrizes.find((x) => x.id === id); if (m) location.hash = `#/animais/${m.a.id}`; },
    });
    painel.querySelector('#m-inativas').addEventListener('change', () => t.atualizar(linhas()));
    const aviso = painel.querySelector('#m-filtro');
    const aplicarFiltro = () => {
      painel.querySelectorAll('[data-f-cat]').forEach((q) => q.classList.toggle('selecionado', q.dataset.fCat === filtro.cat));
      painel.querySelectorAll('[data-f-sit]').forEach((q) => q.classList.toggle('selecionado', q.dataset.fSit === filtro.sit));
      const partes = [filtro.cat && CAT[filtro.cat][0], filtro.sit && SIT[filtro.sit][0]].filter(Boolean);
      aviso.hidden = !partes.length;
      aviso.innerHTML = partes.length ? `<span>Mostrando: <b>${esc(partes.join(' · '))}</b></span> <button type="button" class="btn btn-texto btn-sm" data-limpar-filtro><i data-lucide="x"></i> Tirar filtro</button>` : '';
      t.atualizar(linhas());
      icones();
    };
    const clicarQuadro = (alvo) => {
      const q = alvo.closest('[data-f-cat],[data-f-sit]');
      if (q) {
        if (q.dataset.fCat) filtro.cat = filtro.cat === q.dataset.fCat ? null : q.dataset.fCat;
        else filtro.sit = filtro.sit === q.dataset.fSit ? null : q.dataset.fSit;
        aplicarFiltro();
      } else if (alvo.closest('[data-limpar-filtro]')) { filtro.cat = null; filtro.sit = null; aplicarFiltro(); }
    };
    painel.querySelector('.vacas-resumo').addEventListener('click', (e) => clicarQuadro(e.target));
    painel.querySelector('.vacas-resumo').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clicarQuadro(e.target); } });
    aviso.addEventListener('click', (e) => clicarQuadro(e.target));
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sit]'); if (!b) return;
      e.stopPropagation();
      const m = listaMatrizes.find((x) => x.id === b.dataset.sit);
      F.abrirSituacao(m, m.a, recarregar);
    });
    painel.querySelector('#m-csv').addEventListener('click', () => baixarCSV(`matrizes-${hojeISO()}.csv`, cols.filter((c) => c.chave !== 'acao'), linhas()));
  }

  // ---------------- COBERTURAS ----------------
  function abaCoberturas() {
    const excluir = podeExcluir('reproducao');
    const validas = coberturas.filter((c) => c.situacao !== 'cancelada');
    const doTipo = (...t) => validas.filter((c) => t.includes(c.tipo));
    const ia = doTipo('inseminacao', 'iatf'), te = doTipo('tetf');
    const nIatf = doTipo('iatf').length, nIa = doTipo('inseminacao').length;
    const conferir = te.filter((c) => c.situacao === 'aguardando_diagnostico').length;
    const resultado = (lista, proc) => {
      const prenhes = lista.filter((c) => ['prenhe', 'parida'].includes(c.situacao)).length;
      const abortos = lista.filter((c) => c.situacao === 'aborto').length;
      return `<span class="cob-result"><button type="button" class="badge ativo badge-filtro" data-f-res="prenhe" data-proc="${proc}" title="Mostrar só estas na tabela">${fmtNum(prenhes)} ${prenhes === 1 ? 'prenhe' : 'prenhes'}</button><button type="button" class="badge perigo badge-filtro" data-f-res="aborto" data-proc="${proc}" title="Mostrar só estas na tabela">${fmtNum(abortos)} ${abortos === 1 ? 'aborto' : 'abortos'}</button></span>`;
    };
    const resumo = coberturas.length ? `<div class="cob-resumo">
        <div class="card kpi clicavel" role="button" tabindex="0" data-f-proc="ia" title="Filtrar a tabela"><span class="rotulo"><i data-lucide="syringe"></i>Inseminação artificial (IA)</span><span class="valor">${fmtNum(ia.length)}</span>
          <span class="detalhe">${[nIatf && `${fmtNum(nIatf)} IATF`, nIa && `${fmtNum(nIa)} IA convencional`].filter(Boolean).join(' · ') || 'Nenhuma registrada'}</span>
          ${resultado(ia, 'ia')}</div>
        <div class="card kpi clicavel" role="button" tabindex="0" data-f-proc="te" title="Filtrar a tabela"><span class="rotulo"><i data-lucide="microscope"></i>Transferência de embrião (TE)</span><span class="valor">${fmtNum(te.length)}</span>
          <span class="detalhe">${conferir ? `${fmtNum(conferir)} aguardando confirmação` : te.length ? 'Todas conferidas' : 'Nenhuma registrada'}</span>
          ${resultado(te, 'te')}</div>
        <div class="card cob-pizza"><span class="rotulo-card">Coberturas por touro / sêmen</span><div class="cob-pizza-area"><canvas id="g-touros" aria-label="Gráfico: coberturas por touro ou sêmen"></canvas></div></div>
      </div>` : '';
    painel.innerHTML = `${resumo}<div id="c-filtro" class="small filtro-ativo" hidden></div><div class="card">${coberturas.length ? '<div id="t-cob"></div>' : vazio({ icone: 'heart', titulo: 'Nenhuma cobertura registrada', texto: 'Registre montas naturais, inseminações e IATF para acompanhar a previsão de parto e a taxa de prenhez.', acao: editar ? '<button class="btn btn-primario" data-novo>Registrar cobertura</button>' : '' })}</div>`;
    painel.querySelector('[data-novo]')?.addEventListener('click', () => F.abrirCobertura(null, recarregar));
    if (!coberturas.length) return;
    // pizza: coberturas por touro/sêmen, do maior para o menor (até 7 fatias + "Outros")
    const porTouro = new Map();
    validas.forEach((c) => { const k = c.reprodutor_id ? nomeRep(c.reprodutor_id) : 'Não informado'; porTouro.set(k, (porTouro.get(k) || 0) + 1); });
    let fatias = [...porTouro].sort((a, b) => b[1] - a[1]);
    const nomesOutros = new Set();
    if (fatias.length > 8) { fatias.slice(7).forEach(([t]) => nomesOutros.add(t)); fatias = [...fatias.slice(0, 7), ['Outros', fatias.slice(7).reduce((s2, f) => s2 + f[1], 0)]]; }
    // Filtros: procedimento (IA/TE), resultado (prenhe/aborto) e touro — clicar de novo tira
    const PROC = { ia: ['IA', ['inseminacao', 'iatf']], te: ['TE', ['tetf']] };
    const RES = { prenhe: ['prenhes', ['prenhe', 'parida']], aborto: ['abortos', ['aborto']] };
    const filtro = { proc: null, res: null, touro: null };
    const touroDe = (c) => (c.reprodutor_id ? nomeRep(c.reprodutor_id) : 'Não informado');
    const linhas = () => coberturas.filter((c) => (!filtro.proc || PROC[filtro.proc][1].includes(c.tipo))
      && (!filtro.res || RES[filtro.res][1].includes(c.situacao))
      && (!filtro.touro || (filtro.touro === 'Outros' ? nomesOutros.has(touroDe(c)) : touroDe(c) === filtro.touro)));
    let tabela;
    const aviso = painel.querySelector('#c-filtro');
    const aplicar = () => {
      painel.querySelectorAll('[data-f-proc]').forEach((q) => q.classList.toggle('selecionado', q.dataset.fProc === filtro.proc && !filtro.res));
      painel.querySelectorAll('[data-f-res]').forEach((q) => q.classList.toggle('selecionado', q.dataset.fRes === filtro.res && q.dataset.proc === filtro.proc));
      const partes = [filtro.proc && PROC[filtro.proc][0], filtro.res && RES[filtro.res][0], filtro.touro && `touro/sêmen ${filtro.touro}`].filter(Boolean);
      aviso.hidden = !partes.length;
      aviso.innerHTML = partes.length ? `<span>Mostrando: <b>${esc(partes.join(' · '))}</b></span> <button type="button" class="btn btn-texto btn-sm" data-limpar-filtro><i data-lucide="x"></i> Tirar filtro</button>` : '';
      tabela?.atualizar(linhas());
      icones();
    };
    const clicar = (alvo) => {
      const r = alvo.closest('[data-f-res]');
      if (r) {
        const mesmo = filtro.res === r.dataset.fRes && filtro.proc === r.dataset.proc;
        filtro.res = mesmo ? null : r.dataset.fRes; filtro.proc = mesmo ? null : r.dataset.proc;
        return aplicar();
      }
      const q = alvo.closest('[data-f-proc]');
      if (q) { filtro.proc = filtro.proc === q.dataset.fProc && !filtro.res ? null : q.dataset.fProc; filtro.res = null; return aplicar(); }
      if (alvo.closest('[data-limpar-filtro]')) { filtro.proc = null; filtro.res = null; filtro.touro = null; aplicar(); }
    };
    painel.querySelector('.cob-resumo').addEventListener('click', (e) => clicar(e.target));
    painel.querySelector('.cob-resumo').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-f-proc]')) { e.preventDefault(); clicar(e.target); } });
    aviso.addEventListener('click', (e) => clicar(e.target));
    grafico(painel.querySelector('#g-touros'), {
      type: 'pie',
      data: { labels: fatias.map(([t, n]) => `${t}: ${fmtNum(n)}`), datasets: [{ data: fatias.map((f) => f[1]), backgroundColor: fatias.map(([t], k) => (t === 'Não informado' ? '#c9ccc4' : CORES[k % CORES.length])), borderColor: '#fff', borderWidth: 2 }] },
      options: {
        onClick: (_e, els) => { if (!els.length) return; const nome = fatias[els[0].index][0]; filtro.touro = filtro.touro === nome ? null : nome; aplicar(); },
        onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
        plugins: { legend: { display: true, position: innerWidth < 720 ? 'bottom' : 'right', labels: { boxWidth: 12, boxHeight: 12, padding: 8 },
          onClick: (_e, item) => { const nome = fatias[item.index][0]; filtro.touro = filtro.touro === nome ? null : nome; aplicar(); } },
        tooltip: { backgroundColor: '#1b3524', padding: 10, cornerRadius: 6, callbacks: { label: (c) => ` ${fmtNum(c.raw)} (${fmtNum((c.raw / validas.length) * 100, 0)}%)` } } } },
    });
    tabela = montarTabela(painel.querySelector('#t-cob'), {
      colunas: [
        { chave: 'data_cobertura', titulo: 'Data', primaria: true, render: (c) => `${fmtData(c.data_cobertura)}${c.data_fim ? ` a ${fmtData(c.data_fim)}` : ''}` },
        { chave: 'matriz', titulo: 'Vaca', valor: (c) => porId.get(c.matriz_id)?.brinco, render: (c) => linkAnimal(c.matriz_id) },
        { chave: 'tipo', titulo: 'Tipo', valor: (c) => F.ROTULO_TIPO_COB[c.tipo], render: (c) => esc(F.ROTULO_TIPO_COB[c.tipo]) },
        { chave: 'rep', titulo: 'Touro / sêmen', valor: (c) => nomeRep(c.reprodutor_id), render: (c) => `${esc(nomeRep(c.reprodutor_id))}${c.acasalamento ? `<div class="small muted">${esc(c.acasalamento)}</div>` : ''}` },
        { chave: 'prev', titulo: 'Previsão de parto', valor: (c) => c.data_prevista_parto, render: (c) => `${fmtData(c.data_prevista_parto)}${c.previsao_manual ? ' <span class="badge" title="Corrigida manualmente ou pelo diagnóstico">ajustada</span>' : ''}` },
        { chave: 'situacao', titulo: 'Situação', valor: (c) => F.rotuloSitCob(c), render: (c) => `<span class="badge ${{ prenhe: 'ativo', vazia: 'inativo', parida: 'sucesso', aborto: 'perigo', aguardando_diagnostico: 'info' }[c.situacao] ?? ''}">${esc(F.rotuloSitCob(c))}</span>` },
        { chave: 'resp', titulo: 'Responsável', render: (c) => esc(c.responsavel_nome || '—') },
        ...(editar || excluir ? [{ chave: 'acao', titulo: '', render: (c) => `<span class="acoes">${editar && c.situacao === 'aguardando_diagnostico' && porId.get(c.matriz_id)?.conta_no_rebanho ? `<button class="btn btn-sm" data-diag="${c.matriz_id}">Diagnóstico</button>` : ''}${excluir && !['parida', 'aborto'].includes(c.situacao) ? `<button class="btn btn-sm btn-texto" data-excluir-cob="${c.id}" title="Excluir cobertura" aria-label="Excluir cobertura"><i data-lucide="trash-2"></i></button>` : ''}</span>` }] : []),
      ],
      linhas: linhas(),
    });
    painel.querySelector('#t-cob').addEventListener('click', (e) => {
      const x = e.target.closest('[data-excluir-cob]');
      if (x) { const c = coberturas.find((y) => y.id === x.dataset.excluirCob); F.excluirCobertura(c, porId.get(c.matriz_id)?.brinco, recarregar); return; }
      const b = e.target.closest('[data-diag]'); if (!b) return;
      F.abrirDiagnostico(porId.get(b.dataset.diag), recarregar);
    });
  }

  // ---------------- NASCIMENTOS ----------------
  function abaNascimentos() {
    const nRes = (r) => nascimentos.filter((n) => n.resultado === r).length;
    const [vivos, abortos, natimortos] = [nRes('vivo'), nRes('aborto'), nRes('natimorto')];
    const media = (l) => (l.length ? l.reduce((s, n) => s + Number(n.peso_nascimento), 0) / l.length : null);
    const comPeso = nascimentos.filter((n) => n.resultado === 'vivo' && Number(n.peso_nascimento) > 0);
    const [pM, pF] = ['M', 'F'].map((sx) => media(comPeso.filter((n) => n.sexo === sx)));
    const resumo = nascimentos.length ? `<div class="nasc-resumo">
        <div class="card kpi destaque"><span class="rotulo"><i data-lucide="baby"></i>Total de nascimentos</span><span class="valor">${fmtNum(nascimentos.length)}</span>
          <span class="detalhe">${fmtNum(vivos)} ${vivos === 1 ? 'bezerro vivo' : 'bezerros vivos'}</span></div>
        <div class="card nasc-pizza"><span class="rotulo-card">Resultado dos partos</span><div class="nasc-pizza-area"><canvas id="g-nasc" aria-label="Gráfico: bezerros vivos, abortos e natimortos"></canvas></div></div>
        <div class="card kpi"><span class="rotulo"><i data-lucide="scale"></i>Peso médio ao nascer</span><span class="valor">${media(comPeso) ? fmtKg(media(comPeso)) : '—'}</span>
          <span class="detalhe">${comPeso.length ? `${fmtNum(comPeso.length)} ${comPeso.length === 1 ? 'bezerro pesado' : 'bezerros pesados'}` : 'Nenhum peso registrado'}${pM || pF ? `<br>${[pM && `Machos ${fmtKg(pM)}`, pF && `Fêmeas ${fmtKg(pF)}`].filter(Boolean).join(' · ')}` : ''}</span></div>
      </div>` : '';
    painel.innerHTML = `${resumo}<div class="card">${nascimentos.length ? '<div id="t-nasc"></div>' : vazio({ icone: 'baby', titulo: 'Nenhum nascimento registrado', texto: 'Ao registrar um nascimento, a ficha do bezerro é criada automaticamente e vinculada à mãe e ao pai.', acao: editar ? '<button class="btn btn-primario" data-novo>Registrar nascimento</button>' : '' })}</div>`;
    painel.querySelector('[data-novo]')?.addEventListener('click', () => F.abrirNascimento(null, recarregar));
    if (!nascimentos.length) return;
    // pizza: maior para o menor
    const fatias = [['Bezerro vivo', vivos, '#2e5a3d'], ['Aborto', abortos, '#b5654a'], ['Natimorto', natimortos, '#c9a43a']].filter((f) => f[1] > 0).sort((a, b) => b[1] - a[1]);
    grafico(painel.querySelector('#g-nasc'), {
      type: 'pie',
      data: { labels: fatias.map(([t, n]) => `${t}: ${fmtNum(n)}`), datasets: [{ data: fatias.map((f) => f[1]), backgroundColor: fatias.map((f) => f[2]), borderColor: '#fff', borderWidth: 2 }] },
      options: { plugins: { legend: { display: true, position: 'right', labels: { boxWidth: 12, boxHeight: 12, padding: 10 } },
        tooltip: { backgroundColor: '#1b3524', padding: 10, cornerRadius: 6, callbacks: { label: (c) => ` ${fmtNum(c.raw)} (${fmtNum((c.raw / nascimentos.length) * 100, 0)}%)` } } } },
    });
    montarTabela(painel.querySelector('#t-nasc'), {
      colunas: [
        { chave: 'data_nascimento', titulo: 'Data', primaria: true, render: (n) => fmtData(n.data_nascimento) },
        { chave: 'mae', titulo: 'Mãe', valor: (n) => porId.get(n.matriz_id)?.brinco, render: (n) => linkAnimal(n.matriz_id) },
        { chave: 'bezerro', titulo: 'Bezerro', valor: (n) => porId.get(n.bezerro_id)?.brinco, render: (n) => (n.bezerro_id ? linkAnimal(n.bezerro_id) : '—') },
        { chave: 'sexo', titulo: 'Sexo', valor: (n) => ROTULO_SEXO[n.sexo], render: (n) => esc(ROTULO_SEXO[n.sexo] || '—') },
        { chave: 'peso', titulo: 'Peso ao nascer', classe: 'dir', valor: (n) => n.peso_nascimento, render: (n) => fmtKg(n.peso_nascimento) },
        { chave: 'resultado', titulo: 'Resultado', valor: (n) => F.ROTULO_RESULTADO[n.resultado], render: (n) => `<span class="badge ${n.resultado === 'vivo' ? 'ativo' : 'perigo'}">${esc(F.ROTULO_RESULTADO[n.resultado])}</span>` },
        { chave: 'pai', titulo: 'Pai', valor: (n) => nomeRep(n.reprodutor_id), render: (n) => esc(n.reprodutor_id ? nomeRep(n.reprodutor_id) : (porId.get(n.bezerro_id)?.pai_externo || '—')) },
        { chave: 'tipo', titulo: 'Parto', render: (n) => esc({ normal: 'Normal', assistido: 'Assistido', cesariana: 'Cesariana' }[n.tipo_parto] || '—') },
        { chave: 'ocorrencias', titulo: 'Ocorrências', render: (n) => esc(n.ocorrencias || '—') },
      ],
      linhas: nascimentos,
    });
  }

  // ---------------- DESMAMES ----------------
  function abaDesmames() {
    const idade = param('idade_desmame_dias');
    const pendentes = animais.filter((a) => a.conta_no_rebanho && a.categoria_grupo === 'bezerro' && !desmamados.has(a.id));
    const previstos = pendentes.filter((a) => a.data_nascimento && addDias(a.data_nascimento, idade) <= addDias(hojeISO(), param('dias_alerta_desmame')));
    const hoje = hojeISO();
    const dataPrev = (x) => addDias(x.data_nascimento, idade);
    previstos.sort((x, y) => dataPrev(x).localeCompare(dataPrev(y)));
    painel.innerHTML = `
      ${previstos.length ? `<h2 class="titulo-secao">Desmame previsto <span class="muted">(${fmtNum(previstos.length)})</span></h2>
        <p class="small muted" style="margin:-4px 0 10px">Bezerros que chegam à idade de desmame (${fmtNum(idade)} dias) nos próximos ${param('dias_alerta_desmame')} dias ou que já passaram dela.</p>
        <div class="card" style="margin-bottom:20px"><div id="t-prev"></div></div>` : ''}
      <h2 class="titulo-secao">Desmames realizados <span class="muted">(${fmtNum(desmames.length)})</span></h2>
      <div class="card">${desmames.length ? '<div id="t-desm"></div>' : vazio({ icone: 'milk-off', titulo: 'Nenhum desmame registrado', texto: `Há ${pendentes.length} bezerro(s) ativo(s) sem desmame.`, acao: editar && pendentes.length ? '<button class="btn btn-primario" data-novo>Registrar desmame</button>' : '' })}</div>`;
    painel.querySelector('[data-novo]')?.addEventListener('click', () => F.abrirDesmame(null, recarregar));
    if (previstos.length) {
      const boxPrev = painel.querySelector('#t-prev');
      montarTabela(boxPrev, {
        busca: false,
        colunas: [
          { chave: 'brinco', titulo: 'Bezerro', primaria: true, valor: (a) => a.brinco, render: (a) => linkAnimal(a.id) },
          { chave: 'mae', titulo: 'Mãe', valor: (a) => porId.get(a.mae_id)?.brinco, render: (a) => (a.mae_id ? linkAnimal(a.mae_id) : '—') },
          { chave: 'sexo', titulo: 'Sexo', valor: (a) => ROTULO_SEXO[a.sexo], render: (a) => esc(ROTULO_SEXO[a.sexo] || '—') },
          { chave: 'nasc', titulo: 'Nascimento', valor: (a) => a.data_nascimento, render: (a) => fmtData(a.data_nascimento) },
          { chave: 'idade', titulo: 'Idade', valor: (a) => a.data_nascimento, render: (a) => idadeTexto(a.data_nascimento) },
          { chave: 'prev', titulo: 'Desmame previsto', valor: dataPrev, render: (a) => {
            const d = dataPrev(a); const atraso = d < hoje ? Math.round((Date.parse(hoje) - Date.parse(d)) / 864e5) : 0;
            return `${fmtData(d)}${atraso ? ` <span class="badge perigo">${fmtNum(atraso)} ${atraso === 1 ? 'dia' : 'dias'} de atraso</span>` : ''}`;
          } },
          ...(editar ? [{ chave: 'acao', titulo: '', classe: 'col-acao', render: (a) => `<button class="btn btn-sm" data-desmamar="${a.id}"><i data-lucide="milk-off"></i> Registrar desmame</button>` }] : []),
        ],
        linhas: previstos,
        aoClicar: (id) => { location.hash = `#/animais/${id}`; },
      });
      boxPrev.addEventListener('click', (e) => {
        const b = e.target.closest('[data-desmamar]'); if (!b) return;
        e.stopPropagation();
        F.abrirDesmame(porId.get(b.dataset.desmamar), recarregar);
      });
    }
    if (!desmames.length) return;
    montarTabela(painel.querySelector('#t-desm'), {
      colunas: [
        { chave: 'data_desmame', titulo: 'Data', primaria: true, render: (d) => fmtData(d.data_desmame) },
        { chave: 'bezerro', titulo: 'Bezerro', valor: (d) => porId.get(d.bezerro_id)?.brinco, render: (d) => linkAnimal(d.bezerro_id) },
        { chave: 'mae', titulo: 'Mãe', valor: (d) => porId.get(d.mae_id)?.brinco, render: (d) => (d.mae_id ? linkAnimal(d.mae_id) : '—') },
        { chave: 'idade_dias', titulo: 'Idade', classe: 'dir', render: (d) => (d.idade_dias ? `${fmtNum(d.idade_dias)} dias` : '—') },
        { chave: 'peso_desmame', titulo: 'Peso', classe: 'dir', valor: (d) => (d.peso_desmame ? Number(d.peso_desmame) : null), render: (d) => fmtKg(d.peso_desmame) },
        { chave: 'resp', titulo: 'Responsável', render: (d) => esc(d.responsavel_nome || '—') },
      ],
      linhas: desmames,
    });
  }

  // ---------------- REPRODUTORES ----------------
  function abaReprodutores() {
    const linhas = reprodutores.map((r) => {
      const cobs = coberturas.filter((c) => c.reprodutor_id === r.id);
      const filhos = animais.filter((a) => a.pai_id === r.id);
      const ultima = cobs[0]?.data_cobertura;
      return { ...r, a: porId.get(r.animal_id), cobs: cobs.length, matrizes: new Set(cobs.map((c) => c.matriz_id)).size, filhos: filhos.length, ultima,
        prenhez: (() => { const d = cobs.filter((c) => ['prenhe', 'vazia', 'parida', 'aborto'].includes(c.situacao)); return d.length ? (d.filter((c) => c.situacao !== 'vazia').length / d.length) * 100 : null; })() };
    });
    painel.innerHTML = `${editar ? '<div class="acoes" style="margin-bottom:12px"><button class="btn btn-primario" data-semen><i data-lucide="plus"></i> Cadastrar sêmen</button></div>' : ''}
      <div class="card">${linhas.length ? '<div id="t-rep"></div>' : vazio({ icone: 'shield', titulo: 'Nenhum reprodutor', texto: 'Touros do rebanho aparecem aqui automaticamente quando cadastrados na categoria Touro. Para inseminação, cadastre o sêmen.' })}</div>
      <p class="small muted">Taxa de prenhez por reprodutor = coberturas que resultaram em prenhez ÷ coberturas com resultado conhecido. Toque em um sêmen para editar, desativar ou excluir; touros do rebanho abrem a ficha do animal.</p>`;
    painel.querySelector('[data-semen]')?.addEventListener('click', () => F.abrirSemen(null, recarregar));
    if (!linhas.length) return;
    montarTabela(painel.querySelector('#t-rep'), {
      colunas: [
        { chave: 'identificacao', titulo: 'Reprodutor', primaria: true, render: (r) => `${r.animal_id ? linkAnimal(r.animal_id, r.identificacao) : `<b>${esc(r.identificacao)}</b>`}${r.registro ? `<div class="small muted">${esc(r.registro)}</div>` : ''}` },
        { chave: 'tipo', titulo: 'Tipo', valor: (r) => (r.tipo === 'semen' ? 'Sêmen' : 'Touro'), render: (r) => (r.tipo === 'semen' ? `<span class="badge info">Sêmen</span>${r.central_semen ? `<div class="small muted">${esc(r.central_semen)}</div>` : ''}` : '<span class="badge">Touro do rebanho</span>') },
        { chave: 'raca', titulo: 'Raça', valor: (r) => store.base.racas.find((x) => x.id === (r.raca_id || r.a?.raca_id))?.nome, render: (r) => esc(store.base.racas.find((x) => x.id === (r.raca_id || r.a?.raca_id))?.nome || '—') },
        { chave: 'peso', titulo: 'Peso', classe: 'dir', valor: (r) => r.a?.peso_atual, render: (r) => (r.a?.peso_atual ? fmtKg(r.a.peso_atual) : '—') },
        { chave: 'cobs', titulo: 'Coberturas', classe: 'dir', render: (r) => fmtNum(r.cobs) },
        { chave: 'matrizes', titulo: 'Vacas vinculadas', classe: 'dir', render: (r) => fmtNum(r.matrizes) },
        { chave: 'filhos', titulo: 'Filhos', classe: 'dir', render: (r) => fmtNum(r.filhos) },
        { chave: 'prenhez', titulo: 'Prenhez', classe: 'dir', render: (r) => fmtPct(r.prenhez) },
        { chave: 'ultima', titulo: 'Último uso', render: (r) => fmtData(r.ultima) },
        { chave: 'ativo', titulo: 'Situação', valor: (r) => (r.ativo ? 'Ativo' : 'Inativo'), render: (r) => (r.ativo ? '<span class="badge ativo">Ativo</span>' : '<span class="badge inativo">Inativo</span>') },
      ],
      linhas,
      aoClicar: (id) => { const r = linhas.find((x) => x.id === id); if (r.animal_id) location.hash = `#/animais/${r.animal_id}`; else F.abrirSemen(r, recarregar); },
    });
  }

  mostrar(ABAS.some(([k]) => k === aba) ? aba : 'geral');
}
