// =====================================================================
// REBANHO — lista com filtros
// =====================================================================
import { store, pode, nomePasto, podeExcluir } from '../store.js';
import { esc, icones, fmtNum, montarTabela, vazio, erroCarga, badgeStatus, opcoes, fmtData, toast, traduzirErro, ROTULO_SEXO } from '../ui.js';
import { listarAnimais } from '../components/animais-comum.js';
import { sb, BUCKET } from '../supabase.js';

const FAIXAS = [
  { v: '0-12', r: 'Até 12 meses', min: 0, max: 12 },
  { v: '12-24', r: '12 a 24 meses', min: 12, max: 24 },
  { v: '24-36', r: '24 a 36 meses', min: 24, max: 36 },
  { v: '36-', r: 'Acima de 36 meses', min: 36, max: Infinity },
  { v: 'sem', r: 'Sem data de nascimento' },
];

const CHAVE_FILTROS = 'rebanho.filtros.animais';
// Idade curta: até 23 meses em meses; a partir de 2 anos, em anos
const idadeCurta = (m) => (m == null ? null : m < 24 ? `${m} ${m === 1 ? 'mês' : 'meses'}` : `${Math.floor(m / 12)} anos`);
const pesoCurto = (v) => (v == null ? null : `${fmtNum(Number(v), Number.isInteger(Number(v)) ? 0 : 1)} kg`);

export async function render(el) {
  let animais;
  try { animais = await listarAnimais(); } catch (e) { el.innerHTML = erroCarga(e); icones(); return; }
  const b = store.base;
  let f = {};
  try { f = JSON.parse(sessionStorage.getItem(CHAVE_FILTROS) || '{}'); } catch { /* ignora */ }
  // Vindo de um quadro do Painel (#/animais?categoria=…): usa só os filtros do link
  const doLink = new URLSearchParams(location.hash.split('?')[1] || '');
  if ([...doLink.keys()].length) f = Object.fromEntries(doLink);
  f = { situacao: 'ativos', ...f };
  const editar = pode('rebanho_editar');
  const excluir = podeExcluir('rebanho_editar');

  el.innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>Rebanho</h1><p>Cadastro individual dos animais. Animais vendidos ou mortos permanecem com a ficha preservada.</p></div>
      <div class="acoes">
        <div class="menu-suspenso" id="menu-exportar">
          <button class="btn" type="button" id="btn-exportar" aria-haspopup="true" aria-expanded="false"><i data-lucide="download"></i> Exportar <i data-lucide="chevron-down"></i></button>
          <div class="menu oculto" role="menu">
            <button type="button" role="menuitem" data-exp="xlsx"><i data-lucide="sheet"></i> Planilha Excel</button>
            <button type="button" role="menuitem" data-exp="pdf"><i data-lucide="file-text"></i> PDF</button>
          </div>
        </div>
        ${editar ? '<a class="btn btn-primario" href="#/animais/novo"><i data-lucide="plus"></i> Cadastrar animal</a>' : ''}
      </div>
    </div>

    <div class="card card-filtros-rebanho">
      <form id="filtros" class="filtros-rebanho" role="search">
        <div class="filtros-linha">
          <div class="campo busca"><label for="f-busca">Brinco ou nome</label>
            <div class="busca-wrap"><i data-lucide="search"></i><input id="f-busca" name="busca" type="search" placeholder="Ex.: 1234" value="${esc(f.busca || '')}"></div></div>
          <button type="button" class="btn btn-mais-filtros" id="btn-filtros" aria-expanded="false" aria-controls="mais-filtros">
            Mais filtros <span class="contador-filtros oculto" id="n-filtros"></span> <i data-lucide="chevron-down"></i></button>
        </div>
        <div class="mais-filtros oculto" id="mais-filtros">
          <div class="campo"><label for="f-sit">Situação</label><select id="f-sit" name="situacao">
            <option value="ativos">Ativos no rebanho</option><option value="inativos">Fora do rebanho</option><option value="todos">Todos</option>
            ${b.status.map((s) => `<option value="st:${esc(s.codigo)}">Status: ${esc(s.nome)}</option>`).join('')}</select></div>
          <div class="campo"><label for="f-sexo">Sexo</label><select id="f-sexo" name="sexo"><option value="">Todos</option><option value="M">Macho</option><option value="F">Fêmea</option></select></div>
          <div class="campo"><label for="f-cat-botao">Categoria</label>
            <div class="multi" id="f-cat-multi"><input type="hidden" name="categoria" id="f-cat">
              <button type="button" class="multi-botao" id="f-cat-botao" aria-haspopup="true" aria-expanded="false"><span class="multi-texto">Todas</span></button>
              <div class="multi-lista oculto" role="group" aria-label="Categorias">
                ${b.categorias.map((c) => `<label class="check"><input type="checkbox" value="${esc(c.id)}"> ${esc(c.nome)}</label>`).join('')}
                <button type="button" class="btn btn-sm btn-texto" data-cat-todas>Todas as categorias</button>
              </div></div></div>
          <div class="campo"><label for="f-raca">Raça</label><select id="f-raca" name="raca">${opcoes(b.racas, { vazio: 'Todas' })}<option value="__sem">Sem raça informada</option></select></div>
          <div class="campo"><label for="f-reg">Registro</label><select id="f-reg" name="registro"><option value="">Todos</option><option value="sim">Registrados</option><option value="nao">Não registrados</option></select></div>
          <div class="campo"><label for="f-idade">Idade</label><select id="f-idade" name="idade"><option value="">Todas</option>${FAIXAS.map((x) => `<option value="${x.v}">${x.r}</option>`).join('')}</select></div>
          <div class="campo"><label for="f-pasto">Pasto</label><select id="f-pasto" name="pasto">${opcoes(b.pastos, { vazio: 'Todos', rotulo: nomePasto })}<option value="__sem">Sem pasto</option></select></div>
          <div class="campo"><label for="f-lote">Lote</label><select id="f-lote" name="lote">${opcoes(b.lotes, { vazio: 'Todos' })}<option value="__sem">Sem lote</option></select></div>
        </div>
      </form>
      <div class="filtros-ativos oculto" id="filtros-ativos" aria-live="polite"></div>
    </div>

    <div class="card card-lista-rebanho">
      <div class="contagem-lista" id="contagem" aria-live="polite"></div>
      <div id="tabela" class="tabela-rebanho"></div>
    </div>`;
  icones();

  const form = el.querySelector('#filtros');
  const painelFiltros = el.querySelector('#mais-filtros');
  const btnFiltros = el.querySelector('#btn-filtros');
  const abrirFiltros = (sim) => { painelFiltros.classList.toggle('oculto', !sim); btnFiltros.setAttribute('aria-expanded', String(sim)); btnFiltros.classList.toggle('aberto', sim); };
  btnFiltros.addEventListener('click', () => abrirFiltros(painelFiltros.classList.contains('oculto')));

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

  // Menu "Exportar"
  const menuExp = el.querySelector('#menu-exportar');
  const abrirMenuExp = (sim) => { menuExp.querySelector('.menu').classList.toggle('oculto', !sim); menuExp.querySelector('#btn-exportar').setAttribute('aria-expanded', String(sim)); };
  menuExp.querySelector('#btn-exportar').addEventListener('click', () => abrirMenuExp(menuExp.querySelector('.menu').classList.contains('oculto')));

  // Fecha listas abertas ao clicar fora
  const fecharFora = (e) => {
    if (!el.isConnected) return document.removeEventListener('click', fecharFora);
    if (!multi.contains(e.target)) abrirCat(false);
    if (!menuExp.contains(e.target)) abrirMenuExp(false);
  };
  document.addEventListener('click', fecharFora);
  sincronizarCat();
  // "Mais filtros" começa sempre fechado; os filtros ativos aparecem nos chips e no contador

  // Celular: cada animal vira um cartão compacto (foto, brinco, situação e um resumo numa linha)
  const urlsFoto = new Map();
  const acoesHtml = (a) => `<span class="acoes-linha">
      ${editar ? `<a class="btn-acao" href="#/animais/${a.id}/editar" title="Editar" aria-label="Editar o animal ${esc(a.brinco)}"><i data-lucide="pencil"></i></a>` : ''}
      ${excluir ? `<button type="button" class="btn-acao perigo" data-excluir-animal="${a.id}" title="Excluir" aria-label="Excluir o animal ${esc(a.brinco)}"><i data-lucide="trash-2"></i></button>` : ''}</span>`;
  // Foto do animal (celular e computador); sem foto, quem pode editar já adiciona por ali
  const fotoHtml = (a, comTexto = true) => {
    const url = a.foto_path && urlsFoto.get(a.foto_path);
    return url ? `<span class="ca-foto"><img src="${esc(url)}" alt="Foto do animal ${esc(a.brinco)}" loading="lazy"></span>`
      : editar ? `<label class="ca-foto vazia" title="Adicionar foto"><i data-lucide="camera"></i>${comTexto ? '<span>Adicionar foto</span>' : ''}
          <input type="file" accept="image/*" class="oculto" data-foto-lista="${a.id}" aria-label="Adicionar foto do animal ${esc(a.brinco)}"></label>`
      : '<span class="ca-foto vazia"><i data-lucide="camera"></i></span>';
  };
  const cartao = (a) => {
    const foto = fotoHtml(a);
    const resumo = [a.categoria_nome ? `<b>${esc(a.categoria_nome)}</b>` : '', esc(ROTULO_SEXO[a.sexo] || ''), esc(a.raca_nome || ''),
    ].filter(Boolean);
    const local = [esc(idadeCurta(a.idade_meses) || ''), a.peso_atual ? esc(pesoCurto(a.peso_atual)) : '',
      a.pasto_codigo ? `Pasto ${esc(a.pasto_codigo)}` : '', a.lote_nome ? `Lote ${esc(a.lote_nome)}` : ''].filter(Boolean);
    return `<div class="cartao-animal">${foto}
      <div class="ca-info"><div class="ca-titulo"><b>Brinco ${esc(a.brinco)}</b>${badgeStatus(a)}</div>
        ${a.nome ? `<div class="ca-nome">${esc(a.nome)}</div>` : ''}
        <div class="ca-resumo">${resumo.map((x) => `<span>${x}</span>`).join('')}</div>
        ${local.length ? `<div class="ca-local">${local.map((x) => `<span>${x}</span>`).join('')}</div>` : ''}</div>
      ${editar || excluir ? acoesHtml(a) : ''}</div>`;
  };

  const colunas = [
    { chave: 'cartao', titulo: 'Animal', classe: 'col-cartao', valor: (a) => a.brinco, render: cartao },
    { chave: 'foto', titulo: 'Foto', classe: 'col-foto', valor: (a) => (a.foto_path ? 1 : 0), render: (a) => fotoHtml(a, false) },
    { chave: 'brinco', titulo: 'Brinco', primaria: true, render: (a) => `<b>${esc(a.brinco)}</b>${a.nome ? ` <span class="muted small">${esc(a.nome)}</span>` : ''}`, valor: (a) => a.brinco },
    { chave: 'sexo', titulo: 'Sexo', render: (a) => ROTULO_SEXO[a.sexo], valor: (a) => ROTULO_SEXO[a.sexo] },
    { chave: 'categoria_nome', titulo: 'Categoria' },
    { chave: 'raca_nome', titulo: 'Raça', render: (a) => esc(a.raca_nome || '—') },
    { chave: 'idade_meses', titulo: 'Idade', render: (a) => esc(idadeCurta(a.idade_meses) || '—') },
    { chave: 'peso_atual', titulo: 'Peso atual', valor: (a) => (a.peso_atual == null ? null : Number(a.peso_atual)),
      render: (a) => (a.peso_atual ? `<span title="Pesado em ${fmtData(a.data_ultima_pesagem)}">${pesoCurto(a.peso_atual)}</span>` : '<span class="muted">Não definido</span>') },
    { chave: 'pasto_codigo', titulo: 'Pasto', render: (a) => esc(a.pasto_codigo || '—') },
    { chave: 'lote_nome', titulo: 'Lote', render: (a) => esc(a.lote_nome || '—') },
    { chave: 'status_nome', titulo: 'Status', render: badgeStatus },
    ...(editar || excluir ? [{ chave: 'acoes', titulo: 'Ações', classe: 'dir col-acoes', valor: () => null, render: acoesHtml }] : []),
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
        acao: editar ? '<a class="btn btn-primario" href="#/animais/novo"><i data-lucide="plus"></i> Cadastrar animal</a>' : '' });

  const tabela = montarTabela(el.querySelector('#tabela'), {
    colunas, linhas: filtrar(), busca: false, vazioHtml, semTotal: true,
    aoClicar: (id) => { location.hash = `#/animais/${id}`; },
  });

  // Fotos (endereços temporários do arquivo privado), carregadas sem travar a lista
  const comFoto = [...new Set(animais.map((a) => a.foto_path).filter(Boolean))];
  if (comFoto.length) {
    (async () => {
      try {
        for (let i = 0; i < comFoto.length; i += 200) {
          const r = await sb.storage.from(BUCKET).createSignedUrls(comFoto.slice(i, i + 200), 3600);
          (r.data || []).forEach((x) => x.signedUrl && urlsFoto.set(x.path, x.signedUrl));
        }
        if (urlsFoto.size && el.isConnected) { tabela.atualizar(filtrar()); icones(); }
      } catch { /* sem internet: fica o ícone da câmera */ }
    })();
  }
  // "Adicionar foto" direto do cartão
  el.addEventListener('change', async (e) => {
    const inp = e.target.closest('[data-foto-lista]'); if (!inp) return;
    const arq = inp.files[0]; const a = animais.find((x) => x.id === inp.dataset.fotoLista);
    if (!arq || !a) return;
    if (!arq.type.startsWith('image/')) { toast('Escolha uma imagem (foto).', 'erro'); return; }
    const quadro = inp.closest('.ca-foto');
    try {
      quadro.classList.add('enviando');
      const { enviarFoto } = await import('./animal-form.js');
      toast('Enviando foto…', 'info');
      const ok = await enviarFoto(a, arq, { tipo: 'foto', definirComoPrincipal: true });
      if (ok) { toast('Foto salva.'); window.dispatchEvent(new HashChangeEvent('hashchange')); } else quadro.classList.remove('enviando');
    } catch (err) { quadro.classList.remove('enviando'); toast(traduzirErro(err), 'erro'); }
  });

  // Filtros ativos e "Limpar filtros"
  const PADRAO = { situacao: 'ativos' };
  const NOMES = { busca: 'Busca', situacao: 'Situação', sexo: 'Sexo', categoria: 'Categoria', raca: 'Raça', registro: 'Registro', idade: 'Idade', pasto: 'Pasto', lote: 'Lote' };
  const barra = el.querySelector('#filtros-ativos');
  const filtrosAtivos = () => Object.keys(NOMES).map((k) => {
    const c = form.elements[k]; if (!c) return null;
    const v = c.value.trim();
    if (!v || v === (PADRAO[k] || '')) return null;
    const texto = k === 'categoria' ? v.split(',').map((id) => b.categorias.find((x) => x.id === id)?.nome).filter(Boolean).join(', ')
      : c.tagName === 'SELECT' ? c.options[c.selectedIndex]?.text : `“${v}”`;
    return { k, texto };
  }).filter(Boolean);
  const desenharAtivos = () => {
    const ativosF = filtrosAtivos();
    barra.classList.toggle('oculto', !ativosF.length);
    barra.innerHTML = ativosF.length ? `<span class="small muted"><i data-lucide="filter"></i> Filtros ativos:</span>
      ${ativosF.map((x) => `<button type="button" class="chip chip-filtro" data-tirar="${x.k}" title="Tirar este filtro">${esc(NOMES[x.k])}: <b>${esc(x.texto)}</b> <i data-lucide="x"></i></button>`).join('')}
      <button type="button" class="btn btn-sm" data-limpar><i data-lucide="filter-x"></i> Limpar filtros</button>` : '';
    // Quantos filtros estão aplicados dentro de "Mais filtros"
    const n = ativosF.filter((x) => x.k !== 'busca').length;
    const badge = el.querySelector('#n-filtros');
    badge.textContent = n; badge.classList.toggle('oculto', !n);
    icones();
  };

  // Total de animais no início da lista
  const contagem = el.querySelector('#contagem');
  const desenharContagem = (n) => {
    contagem.innerHTML = n === animais.length
      ? `<b>${fmtNum(n)}</b> ${n === 1 ? 'animal cadastrado' : 'animais cadastrados'}`
      : `<b>${fmtNum(n)}</b> ${n === 1 ? 'animal encontrado' : 'animais encontrados'} <span class="muted">de ${fmtNum(animais.length)} cadastrados</span>`;
  };
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
  form.addEventListener('submit', (e) => e.preventDefault());
  desenharContagem(filtrar().length);
  desenharAtivos();

  el.querySelector('#tabela').addEventListener('click', (e) => {
    const x = e.target.closest('[data-excluir-animal]'); if (!x) return;
    const a = animais.find((y) => y.id === x.dataset.excluirAnimal);
    import('../components/excluir-animal.js').then((m) => m.excluirAnimal(a, () => window.dispatchEvent(new HashChangeEvent('hashchange'))));
  });

  // Exportar a lista filtrada (Excel ou PDF)
  menuExp.querySelector('.menu').addEventListener('click', async (e) => {
    const opcao = e.target.closest('[data-exp]'); if (!opcao) return;
    abrirMenuExp(false);
    const lista = filtrar();
    const C = (t, tipo = 'texto', casas) => ({ t, tipo, casas });
    const completo = opcao.dataset.exp === 'xlsx';
    const colunasExp = [C('Brinco'), C('Nome'), C('Sexo'), C('Categoria'), C('Raça'), C('Grau de pureza'), C('Registro'), C('Nascimento', 'data'), C('Idade (meses)', 'num'),
      C('Peso atual', 'kg'), C('Última pesagem', 'data'), C('Pasto'), C('Lote'), C('Status'), ...(completo ? [C('Mãe'), C('Pai'), C('Origem'), C('Data de saída', 'data')] : [])];
    const linhas = lista.map((a) => [a.brinco, a.nome, ROTULO_SEXO[a.sexo], a.categoria_nome, a.raca_nome, a.grau_pureza, a.registrado ? `Sim${a.numero_registro ? ` (${a.numero_registro})` : ''}` : 'Não',
      a.data_nascimento, a.idade_meses, a.peso_atual == null ? null : Number(a.peso_atual), a.data_ultima_pesagem, a.pasto_codigo, a.lote_nome, a.status_nome,
      ...(completo ? [a.mae_brinco || a.mae_externa, a.pai_identificacao || a.pai_externo, a.origem, a.data_saida] : [])]);
    const ativosF = filtrosAtivos();
    const rel = {
      titulo: 'Rebanho', filtrosTexto: ativosF.length ? `Filtros: ${ativosF.map((x) => `${NOMES[x.k]} ${x.texto}`).join(' · ')}` : 'Todos os animais ativos',
      resumo: [['Animais', fmtNum(lista.length)], ['Fêmeas', fmtNum(lista.filter((a) => a.sexo === 'F').length)], ['Machos', fmtNum(lista.filter((a) => a.sexo === 'M').length)]],
      secoes: [{ titulo: 'Animais', colunas: colunasExp, linhas }], notas: [],
    };
    const botao = menuExp.querySelector('#btn-exportar'); botao.disabled = true;
    try {
      const m = await import('../components/exportar.js');
      await (completo ? m.exportarExcel(rel) : m.exportarPDF(rel));
      toast(`${completo ? 'Planilha' : 'PDF'} gerado(a) com ${fmtNum(lista.length)} animais. Veja na pasta de downloads.`);
    } catch (err) { toast(traduzirErro(err), 'erro', 8000); }
    botao.disabled = false;
  });

}
