// =====================================================================
// Inicialização, autenticação, layout e rotas
// =====================================================================
import { sb, configurado, chaveInsegura } from './supabase.js';
import { store, carregarVinculos, selecionarPropriedade, pode, ehProprietario, limparCopiaLocal, estadoCarga } from './store.js';
import { esc, icones, toast, traduzirErro, abrirModal, carregando, fmtDataHora } from './ui.js';
import * as sync from './sync.js';
import { registrarAplicativo } from './components/instalar.js';
import { promoverBezerras } from './components/animais-comum.js';

const raiz = document.getElementById('raiz');

// ---------- Menu ----------
const MENU = [
  { grupo: 'Principal' },
  { rota: 'painel', titulo: 'Painel', icone: 'layout-dashboard' },
  { rota: 'animais', titulo: 'Rebanho', icone: 'tag' },
  { rota: 'graficos', titulo: 'Gráficos', icone: 'chart-column' },
  { rota: 'pendencias', titulo: 'Pendências', icone: 'bell-ring' },
  { grupo: 'Manejo' },
  { rota: 'reproducao', titulo: 'Reprodução e cria', icone: 'heart' },
  { rota: 'sanidade', titulo: 'Sanidade', icone: 'syringe' },
  { rota: 'pastagens', titulo: 'Pastagens e lotes', icone: 'map' },
  { rota: 'alimentacao', titulo: 'Alimentação', icone: 'wheat' },
  { rota: 'pesagens', titulo: 'Pesagens', icone: 'scale' },
  { rota: 'movimentacoes', titulo: 'Movimentações', icone: 'arrow-left-right' },
  { grupo: 'Gestão' },
  { rota: 'financeiro', titulo: 'Financeiro', icone: 'wallet', perm: 'financeiro' },
  { rota: 'relatorios', titulo: 'Relatórios', icone: 'file-text' },
  { rota: 'equipe', titulo: 'Equipe e permissões', icone: 'users', dono: true },
  { rota: 'configuracoes', titulo: 'Configurações', icone: 'settings', perm: 'configuracoes' },
  { rota: 'ajuda', titulo: 'Ajuda', icone: 'circle-help' },
];

// ---------- Rotas ----------
const ROTAS = [
  { re: /^painel$/, pagina: () => import('./pages/painel.js'), titulo: 'Painel' },
  { re: /^pendencias$/, pagina: () => import('./pages/pendencias.js'), titulo: 'Pendências' },
  { re: /^graficos$/, pagina: () => import('./pages/graficos.js'), titulo: 'Gráficos' },
  { re: /^animais$/, pagina: () => import('./pages/animais.js'), titulo: 'Rebanho' },
  { re: /^animais\/novo$/, pagina: () => import('./pages/animal-form.js'), titulo: 'Cadastrar animal', perm: 'rebanho_editar' },
  { re: /^animais\/([0-9a-f-]{36})\/editar$/, pagina: () => import('./pages/animal-form.js'), titulo: 'Editar animal', perm: 'rebanho_editar' },
  { re: /^animais\/([0-9a-f-]{36})$/, pagina: () => import('./pages/animal-ficha.js'), titulo: 'Ficha do animal' },
  { re: /^sanidade$/, pagina: () => import('./pages/sanidade.js'), titulo: 'Sanidade' },
  { re: /^pastagens$/, pagina: () => import('./pages/pastagens.js'), titulo: 'Pastagens e lotes' },
  { re: /^alimentacao$/, pagina: () => import('./pages/alimentacao.js'), titulo: 'Alimentação e suplementação' },
  { re: /^reproducao$/, pagina: () => import('./pages/reproducao.js'), titulo: 'Reprodução e cria' },
  { re: /^equipe$/, pagina: () => import('./pages/equipe.js'), titulo: 'Equipe e permissões', dono: true },
  { re: /^configuracoes$/, pagina: () => import('./pages/configuracoes.js'), titulo: 'Configurações', perm: 'configuracoes' },
  { re: /^pesagens$/, pagina: () => import('./pages/pesagens.js'), titulo: 'Pesagens e desempenho' },
  { re: /^movimentacoes$/, pagina: () => import('./pages/movimentacoes.js'), titulo: 'Movimentações' },
  { re: /^financeiro$/, pagina: () => import('./pages/financeiro.js'), titulo: 'Financeiro', perm: 'financeiro' },
  { re: /^relatorios(?:\/([a-z]+))?$/, pagina: () => import('./pages/relatorios.js'), titulo: 'Relatórios' },
  { re: /^ajuda$/, pagina: () => import('./pages/ajuda.js'), titulo: 'Ajuda' },
];

export function navegar(rota) { location.hash = `#/${rota}`; }

async function rotear() {
  const caminho = location.hash.replace(/^#\/?/, '').split('?')[0] || 'painel';   // "?…" = filtros da página
  const rota = ROTAS.find((r) => r.re.test(caminho));
  const conteudo = document.getElementById('conteudo');
  if (!conteudo) return;
  document.querySelector('.app')?.classList.remove('menu-aberto');
  document.querySelectorAll('.nav-item').forEach((a) => a.classList.toggle('ativo', caminho === a.dataset.rota || caminho.startsWith(`${a.dataset.rota}/`)));

  if (!rota) { conteudo.innerHTML = `<div class="alerta aviso">Página não encontrada. <a href="#/painel">Voltar ao painel</a></div>`; return; }
  if ((rota.perm && !pode(rota.perm)) || (rota.dono && !ehProprietario())) {
    conteudo.innerHTML = `<div class="alerta aviso"><i data-lucide="lock"></i><div>Você não tem permissão para acessar esta área. Fale com o proprietário.</div></div>`;
    icones(); return;
  }
  const params = caminho.match(rota.re).slice(1);
  const item = MENU.find((m) => m.rota === params[0]);
  document.getElementById('titulo-pagina').textContent = rota.titulo || item?.titulo || '';
  document.title = `${rota.titulo || item?.titulo || 'Gestão'} · ${store.prop?.nome || 'Gestão de Rebanho'}`;
  conteudo.innerHTML = carregando();
  window.scrollTo({ top: 0 });
  try {
    const mod = await rota.pagina();
    await mod.render(conteudo, params, { caminho, item });
  } catch (e) {
    console.error(e);
    conteudo.innerHTML = `<div class="alerta perigo"><i data-lucide="alert-triangle"></i><div>${esc(traduzirErro(e))}</div></div>`;
  }
  icones();
}

// ---------- Avisos (sino) ----------
let sinoLigado = false;
async function atualizarSino(forcar = false) {
  try {
    const m = await import('./components/avisos.js');
    if (!sinoLigado) { sinoLigado = true; m.aoAtualizar((lista) => desenharSino(m.naoVistos(lista).length)); }
    desenharSino(m.naoVistos(await m.carregarAvisos(forcar)).length);
  } catch (e) { console.warn('Avisos indisponíveis:', e); }
}
function desenharSino(n) {
  const b = document.getElementById('avisos-n');
  if (!b) return;
  b.textContent = n > 99 ? '99+' : String(n);
  b.classList.toggle('oculto', !n);
  document.getElementById('btn-avisos')?.setAttribute('aria-label', n ? `Avisos: ${n} novo(s)` : 'Avisos');
}

// ---------- Layout ----------
function menuRecolhido() {
  try { return localStorage.getItem('menu.recolhido') === '1'; } catch { return false; }
}

function renderLayout() {
  const nome = store.perfil?.nome || store.usuario.email;
  const iniciais = nome.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  raiz.innerHTML = `
  <div class="app${menuRecolhido() ? ' lateral-recolhida' : ''}">
    <aside class="lateral" aria-label="Menu principal">
      <div class="marca">
        <div class="marca-logo"><img src="img/cabeca-branca.png" alt="Rebanho Pucci"></div>
        <div class="marca-texto"><div class="marca-nome">Gestão de Rebanho</div><div class="marca-prop">${esc(store.prop.nome)}</div></div>
        <button type="button" class="btn-recolher" id="btn-recolher" title="Recolher menu" aria-label="Recolher menu"><i data-lucide="panel-left-close"></i></button>
      </div>
      <nav>
        ${MENU.filter((m) => !m.perm || pode(m.perm)).filter((m) => !m.dono || ehProprietario()).map((m) => m.grupo
          ? `<div class="nav-grupo">${esc(m.grupo)}</div>`
          : `<a class="nav-item" href="#/${m.rota}" data-rota="${m.rota}" title="${esc(m.titulo)}"><i data-lucide="${m.icone}"></i>${esc(m.titulo)}${m.etapa ? `<span class="etapa" title="Disponível na etapa ${m.etapa}">E${m.etapa}</span>` : ''}</a>`).join('')}
      </nav>
      <div class="rodape-lateral">
        ${store.vinculos.length > 1 ? `<label class="small" for="troca-prop" style="color:#a9bcae">Propriedade</label>
          <select id="troca-prop">${store.vinculos.map((v) => `<option value="${v.propriedade.id}" ${v.propriedade.id === store.prop.id ? 'selected' : ''}>${esc(v.propriedade.nome)}</option>`).join('')}</select>`
        : `<span style="color:#a9bcae">${store.papel === 'proprietario' ? 'Proprietário' : 'Funcionário'}</span>`}
      </div>
    </aside>
    <div class="fundo-menu" data-fechar-menu></div>
    <div class="principal">
      <header class="topo">
        <button class="btn btn-icone btn-texto btn-menu" id="btn-menu" aria-label="Abrir menu"><i data-lucide="menu"></i></button>
        <div class="titulo" id="titulo-pagina"></div>
        <button class="btn btn-icone btn-texto sino" id="btn-avisos" title="Avisos" aria-label="Avisos"><i data-lucide="bell"></i><span class="sino-n oculto" id="avisos-n"></span></button>
        <button class="conexao" id="conexao" title="Status da conexão e sincronização"></button>
        <div class="usuario-menu">
          <div class="avatar" title="${esc(nome)}">${esc(iniciais || '?')}</div>
          <span class="nome small">${esc(nome)}</span>
          <button class="btn btn-icone btn-texto" id="btn-sair" title="Sair" aria-label="Sair"><i data-lucide="log-out"></i></button>
        </div>
      </header>
      <main class="conteudo" id="conteudo"></main>
    </div>
    <button class="fab" id="fab" aria-label="Atalhos rápidos"><i data-lucide="plus"></i></button>
  </div>`;
  icones();

  const btnRecolher = document.getElementById('btn-recolher');
  const marcarRecolher = () => {
    const rec = document.querySelector('.app').classList.contains('lateral-recolhida');
    btnRecolher.title = rec ? 'Abrir menu' : 'Recolher menu';
    btnRecolher.setAttribute('aria-label', btnRecolher.title);
    btnRecolher.innerHTML = `<i data-lucide="${rec ? 'panel-left-open' : 'panel-left-close'}"></i>`;
    icones();
  };
  btnRecolher.onclick = () => {
    const rec = document.querySelector('.app').classList.toggle('lateral-recolhida');
    try { localStorage.setItem('menu.recolhido', rec ? '1' : '0'); } catch { /* sem armazenamento */ }
    marcarRecolher();
    window.dispatchEvent(new Event('resize'));   // gráficos se ajustam à nova largura
  };
  marcarRecolher();
  document.getElementById('btn-menu').onclick = () => (window.innerWidth > 960 ? btnRecolher.click() : document.querySelector('.app').classList.add('menu-aberto'));
  document.querySelector('[data-fechar-menu]').onclick = () => document.querySelector('.app').classList.remove('menu-aberto');
  document.getElementById('btn-sair').onclick = async () => {
    if (sync.estado.pendentes && !confirm(`Há ${sync.estado.pendentes} registro(s) ainda não sincronizado(s) neste aparelho. Se sair agora, eles continuam guardados aqui e serão enviados no próximo acesso com este usuário. Sair mesmo assim?`)) return;
    await sb.auth.signOut();
    limparCopiaLocal();
  };
  document.getElementById('troca-prop')?.addEventListener('change', async (e) => {
    await selecionarPropriedade(e.target.value);
    renderLayout(); rotear(); verificarBezerras();
  });
  document.getElementById('fab').onclick = () => import('./components/atalhos.js').then((m) => m.abrirAtalhos());
  document.getElementById('conexao').onclick = abrirPainelSync;
  document.getElementById('btn-avisos').onclick = () => import('./components/avisos.js').then((m) => m.abrirAvisos());
  atualizarSino();
  sync.aoMudar(desenharConexao);
}

function desenharConexao(st) {
  const el = document.getElementById('conexao');
  if (!el) return;
  let classe = '', txt = 'Online';
  if (!st.online) { classe = 'offline'; txt = 'Sem conexão'; }
  if (st.pendentes) { classe = st.online ? 'pendente' : 'offline'; txt = `${st.online ? '' : 'Sem conexão · '}${st.pendentes} não sincronizado${st.pendentes > 1 ? 's' : ''}`; }
  if (st.sincronizando) txt = 'Sincronizando…';
  el.className = `conexao ${classe}`;
  const curto = st.sincronizando ? 'Sinc…' : st.pendentes ? `${st.pendentes} pend.` : (!st.online ? 'Offline' : '');
  el.innerHTML = `<span class="ponto"></span><span class="txt">${esc(txt)}</span>${curto ? `<span class="txt-curto">${esc(curto)}</span>` : ''}`;
  el.setAttribute('aria-label', txt);
}

function abrirPainelSync() {
  const itens = sync.fila();
  const { el, fechar } = abrirModal({
    titulo: 'Sincronização',
    html: `
      <p>${navigator.onLine ? '<span class="badge ativo">Conectado</span>' : '<span class="badge perigo">Sem conexão</span>'}</p>
      ${itens.length ? `<p class="muted small">Estes registros estão salvos <b>somente neste aparelho</b> e ainda não chegaram ao servidor.</p>
        <ul class="linha-tempo">${itens.map((i) => `<li>
          <div><b>${esc(i.descricao || i.tabela)}</b></div>
          <div class="quando">Registrado em ${fmtDataHora(i.criado)}</div>
          ${i.erro ? `<div class="alerta perigo small" style="margin-top:6px">${esc(traduzirErro(i.erro))}
            <button class="btn btn-sm" data-descartar="${i.registro.id}">Descartar</button></div>` : ''}
        </li>`).join('')}</ul>`
      : '<div class="alerta sucesso"><i data-lucide="check-circle-2"></i><div>Todos os registros deste aparelho já foram confirmados pelo servidor.</div></div>'}`,
    rodape: `<button class="btn" data-fechar>Fechar</button>${itens.length ? '<button class="btn btn-primario" data-sinc><i data-lucide="refresh-cw"></i> Tentar agora</button>' : ''}`,
  });
  el.querySelector('[data-sinc]')?.addEventListener('click', async () => { await sync.sincronizar(); fechar(); abrirPainelSync(); });
  el.querySelectorAll('[data-descartar]').forEach((b) => b.addEventListener('click', () => {
    if (confirm('Descartar este registro? Ele não será enviado ao servidor.')) { sync.descartar(b.dataset.descartar); fechar(); abrirPainelSync(); }
  }));
}

// ---------- Telas sem sessão ----------
function telaConfiguracao(msg) {
  raiz.innerHTML = `<div class="acesso-form" style="min-height:100vh"><div class="card acesso-caixa" style="max-width:620px"><div class="card-corpo">
    <h1>Configuração necessária</h1>
    ${msg}
  </div></div></div>`;
}

function telaLogin(modo = 'entrar') {
  raiz.innerHTML = `
  <div class="tela-acesso">
    <section class="acesso-form">
      <div class="acesso-marca"><span class="acesso-logo" role="img" aria-label="Logo Rebanho Pucci"></span><h1>Rebanho Pucci</h1></div>
      <div class="card acesso-caixa"><div class="card-corpo">
        <div class="abas-acesso" role="tablist">
          <button data-modo="entrar" class="${modo === 'entrar' ? 'ativa' : ''}">Entrar</button>
          <button data-modo="cadastrar" class="${modo === 'cadastrar' ? 'ativa' : ''}">Criar conta</button>
        </div>
        <form id="form-acesso" class="grade" style="gap:12px">
          ${modo === 'cadastrar' ? `<div class="campo"><label for="nome">Seu nome</label><input id="nome" name="nome" required autocomplete="name"></div>` : ''}
          <div class="campo"><label for="email">E-mail</label><input id="email" name="email" type="email" required autocomplete="email"></div>
          ${modo !== 'recuperar' ? `<div class="campo"><label for="senha">Senha</label><input id="senha" name="senha" type="password" required minlength="8" autocomplete="${modo === 'cadastrar' ? 'new-password' : 'current-password'}">
            ${modo === 'cadastrar' ? '<span class="ajuda">Mínimo de 8 caracteres.</span>' : ''}</div>` : ''}
          <div id="msg-acesso"></div>
          <button class="btn btn-primario btn-bloco" type="submit">${{ entrar: 'Entrar', cadastrar: 'Criar conta', recuperar: 'Enviar link de recuperação' }[modo]}</button>
          ${modo === 'entrar' ? '<button type="button" class="btn btn-texto" data-modo="recuperar">Esqueci minha senha</button>' : ''}
          ${modo === 'recuperar' ? '<button type="button" class="btn btn-texto" data-modo="entrar">Voltar para o login</button>' : ''}
        </form>
        ${modo === 'cadastrar' ? '<div class="alerta small"><i data-lucide="info"></i><div>Acesso somente para pessoas liberadas pelo proprietário. Use o <b>mesmo e-mail</b> que foi cadastrado em Equipe e permissões.</div></div>' : ''}
      </div></div>
    </section>
  </div>`;
  raiz.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => telaLogin(b.dataset.modo)));
  icones();
  const form = document.getElementById('form-acesso');
  const msg = document.getElementById('msg-acesso');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    msg.innerHTML = '';
    const d = Object.fromEntries(new FormData(form));
    try {
      if (modo === 'entrar') {
        const { error } = await sb.auth.signInWithPassword({ email: d.email.trim(), password: d.senha });
        if (error) throw error;
      } else if (modo === 'cadastrar') {
        const { data, error } = await sb.auth.signUp({
          email: d.email.trim(), password: d.senha,
          options: { data: { nome: d.nome.trim() }, emailRedirectTo: location.origin + location.pathname },
        });
        if (error) throw error;
        if (!data.session) msg.innerHTML = '<div class="alerta sucesso">Conta criada! Enviamos um link de confirmação para o seu e-mail. Confirme e depois entre.</div>';
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(d.email.trim(), { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        msg.innerHTML = '<div class="alerta sucesso">Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.</div>';
      }
    } catch (err) {
      msg.innerHTML = `<div class="alerta perigo">${esc(traduzirErro(err))}</div>`;
    } finally {
      btn.disabled = false;
    }
  });
}

function telaNovaSenha() {
  const { el, fechar } = abrirModal({
    titulo: 'Definir nova senha',
    html: `<form id="f-senha" class="grade" style="gap:12px"><div class="campo"><label for="ns">Nova senha</label>
      <input id="ns" type="password" minlength="8" required autocomplete="new-password"></div></form>`,
    rodape: '<button class="btn btn-primario" form="f-senha" type="submit">Salvar senha</button>',
  });
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: el.querySelector('#ns').value });
    if (error) return toast(traduzirErro(error), 'erro');
    toast('Senha alterada com sucesso.');
    fechar();
  });
}

let verificadorConvite = null;
function telaSemPropriedade() {
  raiz.innerHTML = `<div class="acesso-form" style="min-height:100vh"><div class="card acesso-caixa" style="max-width:480px"><div class="card-corpo">
    <div class="marca-logo" style="width:44px;height:44px"><img src="img/cabeca-branca.png" alt="Rebanho Pucci"></div>
    <h1>Aguardando liberação</h1>
    <p style="margin:0">Sua conta foi criada, mas o acesso ao sistema ainda não foi liberado.</p>
    <div class="alerta"><i data-lucide="info"></i><div>Peça ao proprietário para liberar o e-mail <b>${esc(store.usuario.email)}</b> em <b>Equipe e permissões</b>. Assim que for liberado, você entra automaticamente.</div></div>
    <button class="btn btn-primario" id="btn-convites"><i data-lucide="refresh-cw"></i> Já fui liberado(a) — entrar</button>
    <button class="btn btn-texto" id="btn-sair2"><i data-lucide="log-out"></i> Sair</button>
  </div></div></div>`;
  icones();
  document.getElementById('btn-sair2').onclick = () => { clearInterval(verificadorConvite); sb.auth.signOut(); };
  document.getElementById('btn-convites').onclick = () => { clearInterval(verificadorConvite); iniciarSessao(); };
  // Confere sozinho a cada 30 segundos se o acesso já foi liberado
  clearInterval(verificadorConvite);
  verificadorConvite = setInterval(async () => {
    if (!navigator.onLine) return;
    const { data } = await sb.rpc('aceitar_convites');
    if (data > 0) { clearInterval(verificadorConvite); iniciarSessao(); }
  }, 30000);
}

// Bezerras que completaram a idade de novilha mudam de categoria (em segundo plano)
async function verificarBezerras() {
  const n = await promoverBezerras();
  if (n) { toast(`${n} bezerra${n > 1 ? 's' : ''} completou${n > 1 ? 'ram' : ''} a idade e passou${n > 1 ? 'ram' : ''} para Novilha.`); rotear(); }
}

// ---------- Sessão ----------
let sessaoIniciada; // undefined até o primeiro evento de autenticação
async function iniciarSessao() {
  raiz.innerHTML = carregando('Carregando sua propriedade…');
  try {
    await sb.rpc('aceitar_convites');
    await carregarVinculos();
    if (!store.vinculos.length) { telaSemPropriedade(); return; }
    await selecionarPropriedade();
    sync.iniciarMonitor();
    renderLayout();
    rotear();
    verificarBezerras();
    if (estadoCarga.offline) toast('Sem internet: o sistema abriu com os dados guardados neste aparelho. Registros novos ficam na fila até a conexão voltar.', 'aviso', 9000);
  } catch (e) {
    raiz.innerHTML = `<div class="conteudo"><div class="alerta perigo"><i data-lucide="alert-triangle"></i><div>
      <b>Não foi possível carregar os dados.</b><br>${esc(traduzirErro(e))}<br><br>
      <button class="btn" onclick="location.reload()">Tentar novamente</button></div></div></div>`;
    icones();
  }
}

async function iniciar() {
  if (!configurado) {
    telaConfiguracao(`<p>Informe a URL do projeto e a chave pública (anon) do Supabase no arquivo <code>js/config.js</code>.
      O passo a passo completo está no arquivo <code>README.md</code>.</p>`);
    return;
  }
  if (chaveInsegura) {
    telaConfiguracao(`<div class="alerta perigo"><i data-lucide="shield-alert"></i><div><b>Chave secreta detectada.</b>
      O arquivo <code>js/config.js</code> contém a chave <i>service_role/secret</i>, que dá acesso total ao banco e
      <b>nunca</b> pode ficar no navegador. Substitua pela chave <i>anon public</i> e gere uma nova chave secreta no painel do Supabase.</div></div>`);
    icones();
    return;
  }
  window.addEventListener('hashchange', rotear);
  window.addEventListener('hashchange', () => { if (store.prop) atualizarSino(); });
  registrarAplicativo();
  window.addEventListener('rebanho:sincronizado', (e) => {
    toast(`${e.detail.enviados} registro(s) sincronizado(s) com o servidor.`);
    rotear();
    atualizarSino(true);
  });

  sb.auth.onAuthStateChange((evento, sessao) => {
    if (evento === 'PASSWORD_RECOVERY') { setTimeout(telaNovaSenha, 300); }
    const uid = sessao?.user?.id || null;
    if (uid === sessaoIniciada) return;
    sessaoIniciada = uid;
    store.sessao = sessao;
    store.usuario = sessao?.user || null;
    // Executa fora do callback para não travar o cliente de autenticação
    setTimeout(() => (uid ? iniciarSessao() : telaLogin()), 0);
  });
}

iniciar();
