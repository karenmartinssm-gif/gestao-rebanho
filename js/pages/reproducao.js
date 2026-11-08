// =====================================================================
// REPRODUÇÃO E CRIA
// =====================================================================
import { sb } from '../supabase.js';
import { store, pode, param, carregarBase, podeExcluir } from '../store.js';
import {
  esc, icones, fmtData, fmtNum, fmtKg, fmtPct, idadeTexto, hojeISO, addDias, montarTabela, vazio, erroCarga, baixarCSV, ROTULO_SITUACAO_REPRO, ROTULO_SEXO,
} from '../ui.js';
import { listarAnimais } from '../components/animais-comum.js';
import { calcularIndicadores, desempenhoMatriz, situacaoExibida } from '../components/reproducao-indicadores.js';
import * as F from '../components/reproducao-forms.js';
import { todos } from '../components/consulta.js';

const pl = (n, um, varios) => `${fmtNum(n)} ${n === 1 ? um : varios}`;
const ABAS = [['geral', 'Visão geral'], ['matrizes', 'Matrizes'], ['coberturas', 'Coberturas'], ['nascimentos', 'Nascimentos'], ['desmames', 'Desmames'], ['reprodutores', 'Touros e sêmen']];
const CHAVE_ABA = 'rebanho.repro.aba';
const classeSit = { prenhe: 'ativo', proxima_parto: 'aviso', vazia: 'inativo', aguardando_diagnostico: 'info', coberta: 'info', em_reproducao: '', pos_parto: '' };

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
      <div><h1>Reprodução e cria</h1><p>Matrizes, coberturas, partos e desmames com indicadores calculados a partir dos registros.</p></div>
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

  // ---------------- VISÃO GERAL ----------------
  function abaGeral() {
    const anos = [...new Set([...coberturas.map((c) => c.data_cobertura), ...nascimentos.map((n) => n.data_nascimento)].map((d) => d.slice(0, 4)))].sort().reverse();
    const hoje = hojeISO();
    const contaSit = (s) => ativas.filter((m) => m.sit === s).length;
    const partos30 = ativas.filter((m) => m.cob?.situacao === 'prenhe' && m.cob.data_prevista_parto && m.cob.data_prevista_parto <= addDias(hoje, 30)).length;
    const aoPe = animais.filter((a) => a.conta_no_rebanho && a.categoria_grupo === 'bezerro' && a.origem === 'nascido' && !desmamados.has(a.id)).length;
    painel.innerHTML = `
      <div class="grade grade-kpi" style="margin-bottom:20px">
        <div class="card kpi destaque"><span class="rotulo"><i data-lucide="heart"></i>Matrizes e novilhas ativas</span><span class="valor">${fmtNum(ativas.length)}</span></div>
        <div class="card kpi"><span class="rotulo"><i data-lucide="heart-pulse"></i>Prenhes</span><span class="valor">${fmtNum(contaSit('prenhe') + contaSit('proxima_parto'))}</span><span class="detalhe">${fmtNum(contaSit('proxima_parto'))} próximas do parto</span></div>
        <div class="card kpi"><span class="rotulo"><i data-lucide="scan-search"></i>Aguardando diagnóstico</span><span class="valor">${fmtNum(contaSit('aguardando_diagnostico') + contaSit('coberta'))}</span></div>
        <div class="card kpi"><span class="rotulo"><i data-lucide="heart-off"></i>Vazias</span><span class="valor">${fmtNum(contaSit('vazia'))}</span></div>
        <div class="card kpi"><span class="rotulo"><i data-lucide="calendar-clock"></i>Partos nos próximos 30 dias</span><span class="valor">${fmtNum(partos30)}</span></div>
        <div class="card kpi"><span class="rotulo"><i data-lucide="baby"></i>Bezerros ao pé (sem desmame)</span><span class="valor">${fmtNum(aoPe)}</span></div>
      </div>
      <div class="filtro-periodo"><h2 style="margin:0">Indicadores do período</h2>
        <select id="periodo" aria-label="Período"><option value="12m">Últimos 12 meses</option>${anos.map((y) => `<option value="${y}">Ano de ${y}</option>`).join('')}</select>
        <span class="small muted" id="periodo-txt"></span></div>
      <div class="grade grade-3" id="indicadores"></div>
      <p class="small muted">Os indicadores consideram apenas eventos registrados no sistema. Quando o denominador é zero, o indicador aparece como “—”.</p>`;
    const sel = painel.querySelector('#periodo');
    const desenhar = () => {
      const v = sel.value;
      const [ini, fim] = v === '12m' ? [addDias(hoje, -365), hoje] : [`${v}-01-01`, `${v}-12-31`];
      painel.querySelector('#periodo-txt').textContent = `${fmtData(ini)} a ${fmtData(fim)}`;
      const r = calcularIndicadores(dados, ini, fim, param('periodo_gestacao_dias'), param('idade_desmame_dias'));
      const card = (titulo, valor, conta, formula) => `<div class="card indicador"><span class="small muted" style="font-weight:600">${titulo}</span>
        <span class="valor">${valor}</span><span class="conta">${conta}</span>
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
          'Média dos dias entre partos consecutivos da mesma matriz, considerando os partos (vivos ou natimortos) ocorridos no período. Abortos não contam como parto.'),
        card('Peso médio ao desmame', r.pesoDesmame.valor ? fmtKg(r.pesoDesmame.valor) : '—', `${r.pesoDesmame.n} desmame(s) com peso registrado${r.pesoDesmame.idade ? ` · idade média ${fmtNum(r.pesoDesmame.idade)} dias` : ''}`,
          'Média dos pesos informados nos desmames do período. Desmames sem peso não entram na média.'),
      ].join('');
    };
    sel.addEventListener('change', desenhar);
    desenhar();
  }

  // ---------------- MATRIZES ----------------
  function abaMatrizes() {
    painel.innerHTML = `<div class="filtro-periodo"><label class="check"><input type="checkbox" id="m-inativas"> Mostrar também as que saíram do rebanho</label>
      <button class="btn btn-sm" id="m-csv" style="margin-left:auto"><i data-lucide="download"></i> Exportar CSV</button></div>
      <div class="card"><div id="t-matrizes"></div></div>
      <p class="small muted">Matrizes e novilhas entram aqui automaticamente pela categoria do animal. A situação é atualizada por coberturas, diagnósticos e partos.</p>`;
    const cols = [
      { chave: 'brinco', titulo: 'Matriz', primaria: true, valor: (m) => m.a.brinco, render: (m) => `${linkAnimal(m.a.id)}${m.a.nome ? ` <span class="small muted">${esc(m.a.nome)}</span>` : ''}<div class="small muted">${esc(m.a.categoria_nome)}${!m.apta_reproducao ? ' · <b>descarte</b>' : ''}</div>`, csv: (m) => m.a.brinco },
      { chave: 'idade', titulo: 'Idade', valor: (m) => m.a.idade_meses, render: (m) => idadeTexto(m.a.data_nascimento), csv: (m) => idadeTexto(m.a.data_nascimento) },
      { chave: 'sit', titulo: 'Situação', valor: (m) => ROTULO_SITUACAO_REPRO[m.sit], render: (m) => (m.a.conta_no_rebanho ? `<span class="badge ${classeSit[m.sit] ?? ''}">${esc(ROTULO_SITUACAO_REPRO[m.sit])}</span>` : `<span class="badge inativo">${esc(m.a.status_nome)}</span>`), csv: (m) => ROTULO_SITUACAO_REPRO[m.sit] },
      { chave: 'prev', titulo: 'Previsão de parto', valor: (m) => (m.cob?.situacao === 'prenhe' ? m.cob.data_prevista_parto : null), render: (m) => (m.cob?.situacao === 'prenhe' ? fmtData(m.cob.data_prevista_parto) : '—'), csv: (m) => (m.cob?.situacao === 'prenhe' ? fmtData(m.cob.data_prevista_parto) : '') },
      { chave: 'partos', titulo: 'Partos', classe: 'dir', valor: (m) => m.d.partos, render: (m) => fmtNum(m.d.partos), csv: (m) => m.d.partos },
      { chave: 'vivos', titulo: 'Bezerros vivos', classe: 'dir', valor: (m) => m.d.vivos, render: (m) => fmtNum(m.d.vivos), csv: (m) => m.d.vivos },
      { chave: 'abortos', titulo: 'Abortos', classe: 'dir', valor: (m) => m.d.abortos, render: (m) => fmtNum(m.d.abortos), csv: (m) => m.d.abortos },
      { chave: 'ultimo', titulo: 'Último parto', valor: (m) => m.d.ultimoParto, render: (m) => fmtData(m.d.ultimoParto), csv: (m) => fmtData(m.d.ultimoParto) },
      { chave: 'iep', titulo: 'IEP médio', classe: 'dir', valor: (m) => m.d.iep, render: (m) => (m.d.iep ? `${fmtNum(m.d.iep)} d` : '—'), csv: (m) => (m.d.iep ? Math.round(m.d.iep) : '') },
      { chave: 'peso', titulo: 'Peso médio desmame (filhos)', classe: 'dir', valor: (m) => m.d.pesoDesmameMedio, render: (m) => (m.d.pesoDesmameMedio ? fmtKg(m.d.pesoDesmameMedio) : '—'), csv: (m) => m.d.pesoDesmameMedio?.toFixed(1) ?? '' },
      ...(editar ? [{ chave: 'acao', titulo: '', render: (m) => (m.a.conta_no_rebanho ? `<button class="btn btn-sm" data-sit="${m.id}" title="Ajustar situação">Situação</button>` : '') }] : []),
    ];
    const box = painel.querySelector('#t-matrizes');
    const linhas = () => (painel.querySelector('#m-inativas').checked ? listaMatrizes : ativas);
    const t = montarTabela(box, {
      colunas: cols, linhas: linhas(),
      vazioHtml: vazio({ icone: 'heart', titulo: 'Nenhuma matriz', texto: 'Cadastre fêmeas nas categorias Novilha ou Matriz para que apareçam aqui.' }),
      aoClicar: (id) => { const m = listaMatrizes.find((x) => x.id === id); if (m) location.hash = `#/animais/${m.a.id}`; },
    });
    painel.querySelector('#m-inativas').addEventListener('change', () => t.atualizar(linhas()));
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
    painel.innerHTML = `<div class="card">${coberturas.length ? '<div id="t-cob"></div>' : vazio({ icone: 'heart', titulo: 'Nenhuma cobertura registrada', texto: 'Registre montas naturais, inseminações e IATF para acompanhar a previsão de parto e a taxa de prenhez.', acao: editar ? '<button class="btn btn-primario" data-novo>Registrar cobertura</button>' : '' })}</div>`;
    painel.querySelector('[data-novo]')?.addEventListener('click', () => F.abrirCobertura(null, recarregar));
    if (!coberturas.length) return;
    montarTabela(painel.querySelector('#t-cob'), {
      colunas: [
        { chave: 'data_cobertura', titulo: 'Data', primaria: true, render: (c) => `${fmtData(c.data_cobertura)}${c.data_fim ? ` a ${fmtData(c.data_fim)}` : ''}` },
        { chave: 'matriz', titulo: 'Matriz', valor: (c) => porId.get(c.matriz_id)?.brinco, render: (c) => linkAnimal(c.matriz_id) },
        { chave: 'tipo', titulo: 'Tipo', valor: (c) => F.ROTULO_TIPO_COB[c.tipo], render: (c) => esc(F.ROTULO_TIPO_COB[c.tipo]) },
        { chave: 'rep', titulo: 'Touro / sêmen', valor: (c) => nomeRep(c.reprodutor_id), render: (c) => `${esc(nomeRep(c.reprodutor_id))}${c.acasalamento ? `<div class="small muted">${esc(c.acasalamento)}</div>` : ''}` },
        { chave: 'prev', titulo: 'Previsão de parto', valor: (c) => c.data_prevista_parto, render: (c) => `${fmtData(c.data_prevista_parto)}${c.previsao_manual ? ' <span class="badge" title="Corrigida manualmente ou pelo diagnóstico">ajustada</span>' : ''}` },
        { chave: 'situacao', titulo: 'Situação', valor: (c) => F.ROTULO_SIT_COB[c.situacao], render: (c) => `<span class="badge ${{ prenhe: 'ativo', vazia: 'inativo', parida: 'sucesso', aborto: 'perigo', aguardando_diagnostico: 'info' }[c.situacao] ?? ''}">${esc(F.ROTULO_SIT_COB[c.situacao])}</span>` },
        { chave: 'resp', titulo: 'Responsável', render: (c) => esc(c.responsavel_nome || '—') },
        ...(editar || excluir ? [{ chave: 'acao', titulo: '', render: (c) => `<span class="acoes">${editar && c.situacao === 'aguardando_diagnostico' && porId.get(c.matriz_id)?.conta_no_rebanho ? `<button class="btn btn-sm" data-diag="${c.matriz_id}">Diagnóstico</button>` : ''}${excluir && !['parida', 'aborto'].includes(c.situacao) ? `<button class="btn btn-sm btn-texto" data-excluir-cob="${c.id}" title="Excluir cobertura" aria-label="Excluir cobertura"><i data-lucide="trash-2"></i></button>` : ''}</span>` }] : []),
      ],
      linhas: coberturas,
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
    painel.innerHTML = `<div class="card">${nascimentos.length ? '<div id="t-nasc"></div>' : vazio({ icone: 'baby', titulo: 'Nenhum nascimento registrado', texto: 'Ao registrar um nascimento, a ficha do bezerro é criada automaticamente e vinculada à mãe e ao pai.', acao: editar ? '<button class="btn btn-primario" data-novo>Registrar nascimento</button>' : '' })}</div>`;
    painel.querySelector('[data-novo]')?.addEventListener('click', () => F.abrirNascimento(null, recarregar));
    if (!nascimentos.length) return;
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
    painel.innerHTML = `
      ${previstos.length ? `<div class="alerta aviso" style="margin-bottom:14px"><i data-lucide="milk-off"></i><div><b>${previstos.length} bezerro(s)</b> com desmame previsto nos próximos ${param('dias_alerta_desmame')} dias ou atrasado: ${previstos.slice(0, 12).map((a) => esc(a.brinco)).join(', ')}${previstos.length > 12 ? '…' : ''}</div></div>` : ''}
      <div class="card">${desmames.length ? '<div id="t-desm"></div>' : vazio({ icone: 'milk-off', titulo: 'Nenhum desmame registrado', texto: `Há ${pendentes.length} bezerro(s) ativo(s) sem desmame.`, acao: editar && pendentes.length ? '<button class="btn btn-primario" data-novo>Registrar desmame</button>' : '' })}</div>`;
    painel.querySelector('[data-novo]')?.addEventListener('click', () => F.abrirDesmame(null, recarregar));
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
        { chave: 'matrizes', titulo: 'Matrizes vinculadas', classe: 'dir', render: (r) => fmtNum(r.matrizes) },
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
