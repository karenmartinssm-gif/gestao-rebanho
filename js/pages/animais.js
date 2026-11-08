// =====================================================================
// REBANHO — lista com filtros
// =====================================================================
import { store, pode, nomePasto, podeExcluir } from '../store.js';
import { esc, icones, fmtNum, fmtKg, idadeTexto, montarTabela, vazio, erroCarga, badgeStatus, baixarCSV, opcoes, fmtData, hojeISO, ROTULO_SEXO } from '../ui.js';
import { listarAnimais } from '../components/animais-comum.js';

const FAIXAS = [
  { v: '0-12', r: 'Até 12 meses', min: 0, max: 12 },
  { v: '12-24', r: '12 a 24 meses', min: 12, max: 24 },
  { v: '24-36', r: '24 a 36 meses', min: 24, max: 36 },
  { v: '36-', r: 'Acima de 36 meses', min: 36, max: Infinity },
  { v: 'sem', r: 'Sem data de nascimento' },
];

const CHAVE_FILTROS = 'rebanho.filtros.animais';

export async function render(el) {
  let animais;
  try { animais = await listarAnimais(); } catch (e) { el.innerHTML = erroCarga(e); icones(); return; }
  const b = store.base;
  let f = {};
  try { f = JSON.parse(sessionStorage.getItem(CHAVE_FILTROS) || '{}'); } catch { /* ignora */ }
  // Vindo de um quadro do Painel (#/animais?categoria=g:matriz…): usa só os filtros do link
  const doLink = new URLSearchParams(location.hash.split('?')[1] || '');
  if ([...doLink.keys()].length) f = Object.fromEntries(doLink);
  f = { situacao: 'ativos', ...f };

  el.innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>Rebanho</h1><p>Cadastro individual dos animais. Animais vendidos ou mortos permanecem com a ficha preservada.</p></div>
      <div class="acoes">
        <button class="btn" id="btn-csv"><i data-lucide="download"></i> Exportar (Excel/CSV)</button>
        ${pode('rebanho_editar') ? '<a class="btn btn-primario" href="#/animais/novo"><i data-lucide="plus"></i> Cadastrar animal</a>' : ''}
      </div>
    </div>
    <div class="card">
      <div class="filtros-ativos oculto" id="filtros-ativos" aria-live="polite"></div>
      <form class="filtros" id="filtros" role="search">
        <div class="campo busca"><label for="f-busca">Brinco ou nome</label>
          <div class="busca-wrap"><i data-lucide="search"></i><input id="f-busca" name="busca" type="search" placeholder="Ex.: 1234" value="${esc(f.busca || '')}"></div></div>
        <button type="button" class="btn btn-sm btn-filtros" id="btn-filtros" aria-expanded="false"><i data-lucide="sliders-horizontal"></i> Mais filtros</button>
        <div class="campo"><label for="f-sit">Situação</label><select id="f-sit" name="situacao">
          <option value="ativos">Ativos no rebanho</option><option value="inativos">Fora do rebanho</option><option value="todos">Todos</option>
          ${b.status.map((s) => `<option value="st:${esc(s.codigo)}">Status: ${esc(s.nome)}</option>`).join('')}</select></div>
        <div class="campo"><label for="f-sexo">Sexo</label><select id="f-sexo" name="sexo"><option value="">Todos</option><option value="M">Macho</option><option value="F">Fêmea</option></select></div>
        <div class="campo"><label for="f-reg">Registro</label><select id="f-reg" name="registro"><option value="">Todos</option><option value="sim">Registrados</option><option value="nao">Não registrados</option></select></div>
        <div class="campo"><label for="f-cat-botao">Categoria</label>
          <div class="multi" id="f-cat-multi"><input type="hidden" name="categoria" id="f-cat">
            <button type="button" class="multi-botao" id="f-cat-botao" aria-haspopup="true" aria-expanded="false"><span class="multi-texto">Todas</span></button>
            <div class="multi-lista oculto" role="group" aria-label="Categorias">
              ${b.categorias.map((c) => `<label class="check"><input type="checkbox" value="${esc(c.id)}"> ${esc(c.nome)}</label>`).join('')}
              <button type="button" class="btn btn-sm btn-texto" data-cat-todas>Todas as categorias</button>
            </div></div></div>
        <div class="campo"><label for="f-raca">Raça</label><select id="f-raca" name="raca">${opcoes(b.racas, { vazio: 'Todas' })}<option value="__sem">Sem raça informada</option></select></div>
        <div class="campo"><label for="f-idade">Idade</label><select id="f-idade" name="idade"><option value="">Todas</option>${FAIXAS.map((x) => `<option value="${x.v}">${x.r}</option>`).join('')}</select></div>
        <div class="campo"><label for="f-pasto">Pasto</label><select id="f-pasto" name="pasto">${opcoes(b.pastos, { vazio: 'Todos', rotulo: nomePasto })}<option value="__sem">Sem pasto</option></select></div>
        <div class="campo"><label for="f-lote">Lote</label><select id="f-lote" name="lote">${opcoes(b.lotes, { vazio: 'Todos' })}<option value="__sem">Sem lote</option></select></div>
      </form>
      <div class="contagem-lista" id="contagem" aria-live="polite"></div>
      <div id="tabela"></div>
    </div>`;
  icones();

  const form = el.querySelector('#filtros');
  el.querySelector('#btn-filtros').addEventListener('click', (e) => {
    const aberto = form.classList.toggle('aberto');
    e.currentTarget.setAttribute('aria-expanded', String(aberto));
  });
  // Filtro antigo por grupo ("g:matriz") vira a lista de categorias desse grupo
  if (f.categoria?.startsWith('g:')) {
    const g = f.categoria.slice(2); const grupos = g === 'outros' ? ['garrote', 'boi', 'outro'] : [g];
    f.categoria = b.categorias.filter((c) => grupos.includes(c.grupo)).map((c) => c.id).join(',');
  }
  // Ignora categorias guardadas que não existem mais (ex.: categoria excluída)
  if (f.categoria) f.categoria = f.categoria.split(',').filter((id) => b.categorias.some((c) => c.id === id)).join(',');
  for (const [k, v] of Object.entries(f)) { const c = form.elements[k]; if (c && (c.tagName === 'SELECT' || c.type === 'hidden')) c.value = v; }

  // Categoria: várias opções marcáveis
  const multi = el.querySelector('#f-cat-multi');
  const campoCat = multi.querySelector('#f-cat');
  const botaoCat = multi.querySelector('.multi-botao');
  const listaCat = multi.querySelector('.multi-lista');
  const marcadas = () => [...listaCat.querySelectorAll('input:checked')].map((x) => x.value);
  const textoCat = (ids) => {
    if (!ids.length) return 'Todas';
    const nomes = ids.map((id) => b.categorias.find((c) => c.id === id)?.nome).filter(Boolean);
    return nomes.length <= 2 ? nomes.join(', ') : `${nomes.length} categorias`;
  };
  const sincronizarCat = () => {
    const ids = campoCat.value ? campoCat.value.split(',') : [];
    listaCat.querySelectorAll('input').forEach((x) => { x.checked = ids.includes(x.value); });
    botaoCat.querySelector('.multi-texto').textContent = textoCat(ids);
  };
  const abrirCat = (sim) => { listaCat.classList.toggle('oculto', !sim); botaoCat.setAttribute('aria-expanded', String(sim)); };
  botaoCat.addEventListener('click', () => abrirCat(listaCat.classList.contains('oculto')));
  listaCat.addEventListener('change', (e) => {
    e.stopPropagation();
    campoCat.value = marcadas().join(',');
    botaoCat.querySelector('.multi-texto').textContent = textoCat(marcadas());
    form.dispatchEvent(new Event('input', { bubbles: true }));
  });
  listaCat.querySelector('[data-cat-todas]').addEventListener('click', () => {
    campoCat.value = ''; sincronizarCat(); abrirCat(false);
    form.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const fecharFora = (e) => { if (!el.isConnected) return document.removeEventListener('click', fecharFora); if (!multi.contains(e.target)) abrirCat(false); };
  document.addEventListener('click', fecharFora);
  sincronizarCat();
  if ([...doLink.keys()].length) { form.classList.add('aberto'); el.querySelector('#btn-filtros').setAttribute('aria-expanded', 'true'); }

  const colunas = [
    { chave: 'brinco', titulo: 'Brinco', primaria: true, render: (a) => `<b>${esc(a.brinco)}</b>${a.nome ? ` <span class="muted small">${esc(a.nome)}</span>` : ''}`, valor: (a) => a.brinco, csv: (a) => a.brinco },
    { chave: 'sexo', titulo: 'Sexo', render: (a) => ROTULO_SEXO[a.sexo], valor: (a) => ROTULO_SEXO[a.sexo], csv: (a) => ROTULO_SEXO[a.sexo] },
    { chave: 'categoria_nome', titulo: 'Categoria' },
    { chave: 'raca_nome', titulo: 'Raça' },
    { chave: 'idade_meses', titulo: 'Idade', render: (a) => idadeTexto(a.data_nascimento, a.data_saida || hojeISO()), csv: (a) => a.idade_meses },
    { chave: 'peso_atual', titulo: 'Peso atual', classe: 'dir num', render: (a) => (a.peso_atual ? `<span>${fmtKg(a.peso_atual)} <span class="small muted">· ${fmtData(a.data_ultima_pesagem)}</span></span>` : '—'), valor: (a) => (a.peso_atual == null ? null : Number(a.peso_atual)) },
    { chave: 'pasto_codigo', titulo: 'Pasto', render: (a) => esc(a.pasto_codigo || '—') },
    { chave: 'lote_nome', titulo: 'Lote', render: (a) => esc(a.lote_nome || '—') },
    { chave: 'status_nome', titulo: 'Status', render: badgeStatus },
    ...(podeExcluir('rebanho_editar') ? [{ chave: 'acoes', titulo: '', render: (a) => `<button class="btn btn-sm btn-texto" data-excluir-animal="${a.id}" title="Excluir animal" aria-label="Excluir o animal ${esc(a.brinco)}"><i data-lucide="trash-2"></i></button>`, csv: () => '' }] : []),
  ];

  const filtrar = () => {
    const d = Object.fromEntries(new FormData(form));
    try { sessionStorage.setItem(CHAVE_FILTROS, JSON.stringify(d)); } catch { /* ignora */ }
    const t = (d.busca || '').trim().toUpperCase();
    const faixa = FAIXAS.find((x) => x.v === d.idade);
    return animais.filter((a) => {
      if (d.situacao === 'ativos' && !a.conta_no_rebanho) return false;
      if (d.situacao === 'inativos' && a.conta_no_rebanho) return false;
      if (d.situacao?.startsWith('st:') && a.status !== d.situacao.slice(3)) return false;
      if (t && !a.brinco.toUpperCase().includes(t) && !(a.nome || '').toUpperCase().includes(t)) return false;
      if (d.sexo && a.sexo !== d.sexo) return false;
      if (d.categoria && !d.categoria.split(',').includes(a.categoria_id)) return false;
      if (d.raca && (d.raca === '__sem' ? a.raca_id : a.raca_id !== d.raca)) return false;
      if (d.registro && !!a.registrado !== (d.registro === 'sim')) return false;
      if (d.pasto && (d.pasto === '__sem' ? a.pasto_id : a.pasto_id !== d.pasto)) return false;
      if (d.lote && (d.lote === '__sem' ? a.lote_id : a.lote_id !== d.lote)) return false;
      if (faixa) {
        if (faixa.v === 'sem') { if (a.data_nascimento) return false; }
        else if (a.idade_meses == null || a.idade_meses < faixa.min || a.idade_meses >= faixa.max) return false;
      }
      return true;
    });
  };

  const vazioHtml = animais.length
    ? vazio({ icone: 'search-x', titulo: 'Nenhum animal encontrado', texto: 'Ajuste os filtros para ver outros animais.' })
    : vazio({ icone: 'tag', titulo: 'Nenhum animal cadastrado', texto: 'Cadastre os animais da propriedade para acompanhar o histórico individual e os indicadores do rebanho.',
        acao: pode('rebanho_editar') ? '<a class="btn btn-primario" href="#/animais/novo"><i data-lucide="plus"></i> Cadastrar animal</a>' : '' });

  const tabela = montarTabela(el.querySelector('#tabela'), {
    colunas, linhas: filtrar(), busca: false, vazioHtml, semTotal: true,
    aoClicar: (id) => { location.hash = `#/animais/${id}`; },
  });
  // Filtros ativos (acima dos filtros) e "Limpar filtros"
  const PADRAO = { situacao: 'ativos' };
  const NOMES = { busca: 'Busca', situacao: 'Situação', sexo: 'Sexo', categoria: 'Categoria', raca: 'Raça', registro: 'Registro', idade: 'Idade', pasto: 'Pasto', lote: 'Lote' };
  const barra = el.querySelector('#filtros-ativos');
  const desenharAtivos = () => {
    const ativosF = Object.keys(NOMES).map((k) => {
      const c = form.elements[k]; if (!c) return null;
      const v = c.value.trim();
      if (!v || v === (PADRAO[k] || '')) return null;
      const texto = k === 'categoria' ? v.split(',').map((id) => b.categorias.find((x) => x.id === id)?.nome).filter(Boolean).join(', ')
        : c.tagName === 'SELECT' ? c.options[c.selectedIndex]?.text : `“${v}”`;
      return { k, texto };
    }).filter(Boolean);
    barra.classList.toggle('oculto', !ativosF.length);
    barra.innerHTML = ativosF.length ? `<span class="small muted"><i data-lucide="filter"></i> Filtros ativos:</span>
      ${ativosF.map((x) => `<button type="button" class="chip chip-filtro" data-tirar="${x.k}" title="Tirar este filtro">${esc(NOMES[x.k])}: <b>${esc(x.texto)}</b> <i data-lucide="x"></i></button>`).join('')}
      <button type="button" class="btn btn-sm" data-limpar><i data-lucide="filter-x"></i> Limpar filtros</button>` : '';
    icones();
  };
  // Total de animais no início da lista
  const contagem = el.querySelector('#contagem');
  const desenharContagem = (n) => { contagem.innerHTML = `<b>${fmtNum(n)}</b> ${n === 1 ? 'animal' : 'animais'}${n !== animais.length ? ` <span class="muted">de ${fmtNum(animais.length)} cadastrados</span>` : ''}`; };
  const aplicar = () => {
    if (location.hash.includes('?')) history.replaceState(null, '', '#/animais');   // o link do Painel vale só na entrada
    const lista = filtrar();
    tabela.atualizar(lista);
    desenharContagem(lista.length);
    desenharAtivos();
  };
  barra.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tirar]');
    if (t) { form.elements[t.dataset.tirar].value = PADRAO[t.dataset.tirar] || ''; sincronizarCat(); aplicar(); return; }
    if (e.target.closest('[data-limpar]')) {
      Object.keys(NOMES).forEach((k) => { if (form.elements[k]) form.elements[k].value = PADRAO[k] || ''; });
      sincronizarCat();
      aplicar();
    }
  });
  form.addEventListener('input', aplicar);
  desenharContagem(filtrar().length);
  desenharAtivos();
  el.querySelector('#tabela').addEventListener('click', (e) => {
    const b = e.target.closest('[data-excluir-animal]'); if (!b) return;
    const a = animais.find((x) => x.id === b.dataset.excluirAnimal);
    import('../components/excluir-animal.js').then((m) => m.excluirAnimal(a, () => window.dispatchEvent(new HashChangeEvent('hashchange'))));
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  el.querySelector('#btn-csv').addEventListener('click', () => {
    const cols = [
      ...colunas.filter((c) => !['peso_atual', 'status_nome', 'acoes'].includes(c.chave)),
      { chave: 'peso_atual', titulo: 'Peso atual (kg)' }, { chave: 'data_ultima_pesagem', titulo: 'Data últ. pesagem', csv: (a) => fmtData(a.data_ultima_pesagem) },
      { chave: 'data_nascimento', titulo: 'Nascimento', csv: (a) => fmtData(a.data_nascimento) },
      { chave: 'grau_pureza', titulo: 'Grau de pureza', csv: (a) => a.grau_pureza || '' },
      { chave: 'registrado', titulo: 'Registro', csv: (a) => (a.registrado ? `Sim${a.numero_registro ? ` (${a.numero_registro})` : ''}` : 'Não') },
      { chave: 'mae_brinco', titulo: 'Mãe', csv: (a) => a.mae_brinco || a.mae_externa }, { chave: 'pai_identificacao', titulo: 'Pai', csv: (a) => a.pai_identificacao || a.pai_externo },
      { chave: 'status_nome', titulo: 'Status' }, { chave: 'data_saida', titulo: 'Data de saída', csv: (a) => fmtData(a.data_saida) },
    ];
    baixarCSV(`rebanho-${hojeISO()}.csv`, cols, filtrar());
  });
}
