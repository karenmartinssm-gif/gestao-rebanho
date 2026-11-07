// =====================================================================
// Inicialização, autenticação, layout e rotas
// =====================================================================
import { sb, configurado, chaveInsegura } from './supabase.js';
import { store, carregarVinculos, selecionarPropriedade, pode, ehProprietario } from './store.js';
import { esc, icones, toast, traduzirErro, abrirModal, carregando, fmtDataHora } from './ui.js';
import * as sync from './sync.js';

const raiz = document.getElementById('raiz');

// ---------- Menu ----------
const MENU = [
  { grupo: 'Principal' },
  { rota: 'painel', titulo: 'Painel', icone: 'layout-dashboard' },
  { rota: 'animais', titulo: 'Rebanho', icone: 'tag' },
  { grupo: 'Manejo' },
  { rota: 'reproducao', titulo: 'Reprodução e cria', icone: 'heart', etapa: 2 },
  { rota: 'sanidade', titulo: 'Sanidade', icone: 'syringe', etapa: 3 },
  { rota: 'pastagens', titulo: 'Pastagens e lotes', icone: 'map', etapa: 3 },
  { rota: 'alimentacao', titulo: 'Alimentação', icone: 'wheat', etapa: 3 },
  { rota: 'pesagens', titulo: 'Pesagens', icone: 'scale', etapa: 4 },
  { rota: 'movimentacoes', titulo: 'Movimentações', icone: 'arrow-left-right', etapa: 4 },
  { grupo: 'Gestão' },
  { rota: 'financeiro', titulo: 'Financeiro', icone: 'wallet', etapa: 4, perm: 'financeiro' },
  { rota: 'relatorios', titulo: 'Relatórios', icone: 'file-text', etapa: 5 },
  { rota: 'equipe', titulo: 'Equipe e permissões', icone: 'users', dono: true },
  { rota: 'configuracoes', titulo: 'Configurações', icone: 'settings', perm: 'configuracoes' },
];

// ---------- Rotas ----------
const ROTAS = [
  { re: /^painel$/, pagina: () => import('./pages/painel.js'), titulo: 'Painel' },
  { re: /^animais$/, pagina: () => import('./pages/animais.js'), titulo: 'Rebanho' },
  { re: /^animais\/novo$/, pagina: () => import('./pages/animal-form.js'), titulo: 'Cadastrar animal', perm: 'rebanho_editar' },
  { re: /^animais\/([0-9a-f-]{36})\/editar$/, pagina: () => import('./pages/animal-form.js'), titulo: 'Editar animal', perm: 'rebanho_editar' },
  { re: /^animais\/([0-9a-f-]{36})$/, pagina: () => import('./pages/animal-ficha.js'), titulo: 'Ficha do animal' },
  { re: /^equipe$/, pagina: () => import('./pages/equipe.js'), titulo: 'Equipe e permissões', dono: true },
  { re: /^configuracoes$/, pagina: () => import('./pages/configuracoes.js'), titulo: 'Configurações', perm: 'configuracoes' },
  { re: /^(reproducao|sanidade|pastagens|alimentacao|pesagens|movimentacoes|financeiro|relatorios)$/, pagina: () => import('./pages/em-breve.js'), titulo: null },
];

export function navegar(rota) { location.hash = `#/${rota}`; }

async function rotear() {
  const caminho = location.hash.replace(/^#\/?/, '') || 'painel';
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

// ---------- Layout ----------
function renderLayout() {
  const nome = store.perfil?.nome || store.usuario.email;
  const iniciais = nome.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  raiz.innerHTML = `
  <div class="app">
    <aside class="lateral" aria-label="Menu principal">
      <div class="marca">
        <div class="marca-logo">GR</div>
        <div><div class="marca-nome">Gestão de Rebanho</div><div class="marca-prop">${esc(store.prop.nome)}</div></div>
      </div>
      <nav>
        ${MENU.filter((m) => !m.perm || pode(m.perm)).filter((m) => !m.dono || ehProprietario()).map((m) => m.grupo
          ? `<div class="nav-grupo">${esc(m.grupo)}</div>`
          : `<a class="nav-item" href="#/${m.rota}" data-rota="${m.rota}"><i data-lucide="${m.icone}"></i>${esc(m.titulo)}${m.etapa ? `<span class="etapa" title="Disponível na etapa ${m.etapa}">E${m.etapa}</span>` : ''}</a>`).join('')}
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

  document.getElementById('btn-menu').onclick = () => document.querySelector('.app').classList.add('menu-aberto');
  document.querySelector('[data-fechar-menu]').onclick = () => document.querySelector('.app').classList.remove('menu-aberto');
  document.getElementById('btn-sair').onclick = async () => {
    if (sync.estado.pendentes && !confirm(`Há ${sync.estado.pendentes} registro(s) ainda não sincronizado(s) neste aparelho. Se sair agora, eles continuam guardados aqui e serão enviados no próximo acesso com este usuário. Sair mesmo assim?`)) return;
    await sb.auth.signOut();
  };
  document.getElementById('troca-prop')?.addEventListener('change', async (e) => {
    await selecionarPropriedade(e.target.value);
    renderLayout(); rotear();
  });
  document.getElementById('fab').onclick = () => import('./components/atalhos.js').then((m) => m.abrirAtalhos());
  document.getElementById('conexao').onclick = abrirPainelSync;
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
    <section class="acesso-arte">
      <div><div class="marca-logo" style="width:48px;height:48px;font-size:1.1rem">GR</div>
        <h1>Gestão de Rebanho</h1>
        <p>Controle de cria para gado de corte: animais, reprodução, sanidade, pastagens, pesagens e financeiro em um só lugar.</p>
        <ul><li>Ficha individual com todo o histórico</li><li>Indicadores calculados a partir dos seus registros</li><li>Funciona no computador, tablet e celular</li></ul>
      </div>
      <p class="small">Os dados ficam no banco de dados da sua conta Supabase, protegidos por usuário e propriedade.</p>
    </section>
    <section class="acesso-form">
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
        ${modo === 'cadastrar' ? '<p class="small muted" style="margin:0">Funcionário: use o mesmo e-mail que o proprietário cadastrou no convite.</p>' : ''}
      </div></div>
    </section>
  </div>`;
  raiz.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => telaLogin(b.dataset.modo)));
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

function telaSemPropriedade() {
  raiz.innerHTML = `<div class="acesso-form" style="min-height:100vh"><div class="card acesso-caixa" style="max-width:520px"><div class="card-corpo">
    <h1>Bem-vindo(a)!</h1>
    <p class="muted" style="margin:0">Sua conta ainda não está vinculada a nenhuma propriedade.</p>
    <div class="alerta"><i data-lucide="info"></i><div><b>É funcionário?</b> Peça ao proprietário para cadastrar o e-mail <b>${esc(store.usuario.email)}</b> na equipe e depois clique em “Verificar convites”.</div></div>
    <button class="btn" id="btn-convites"><i data-lucide="refresh-cw"></i> Verificar convites</button>
    <hr style="border:0;border-top:1px solid var(--borda);width:100%">
    <h2>Sou o proprietário: cadastrar propriedade</h2>
    <form id="f-prop" class="grade" style="gap:12px">
      <div class="campo"><label for="pn">Nome da propriedade <span class="obrig">*</span></label><input id="pn" name="nome" required></div>
      <div class="grade grade-2" style="gap:12px">
        <div class="campo"><label for="pm">Município</label><input id="pm" name="municipio"></div>
        <div class="campo"><label for="pu">UF</label><input id="pu" name="uf" maxlength="2" style="text-transform:uppercase"></div>
      </div>
      <div class="campo"><label for="pa">Área total (ha)</label><input id="pa" name="area_total_ha" inputmode="decimal"></div>
      <button class="btn btn-primario" type="submit">Criar propriedade</button>
    </form>
    <button class="btn btn-texto" id="btn-sair2"><i data-lucide="log-out"></i> Sair</button>
  </div></div></div>`;
  icones();
  document.getElementById('btn-sair2').onclick = () => sb.auth.signOut();
  document.getElementById('btn-convites').onclick = () => iniciarSessao();
  document.getElementById('f-prop').addEventListener('submit', async (e) => {
    e.preventDefault();
    sync.exigirConexao();
    const d = Object.fromEntries(new FormData(e.target));
    d.area_total_ha = d.area_total_ha ? d.area_total_ha.replace(',', '.') : '';
    const btn = e.target.querySelector('button'); btn.disabled = true;
    const { error } = await sb.rpc('criar_propriedade', { p_nome: d.nome, p_dados: d });
    btn.disabled = false;
    if (error) return toast(traduzirErro(error), 'erro');
    toast('Propriedade criada com sucesso.');
    iniciarSessao();
  });
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
  window.addEventListener('rebanho:sincronizado', (e) => {
    toast(`${e.detail.enviados} registro(s) sincronizado(s) com o servidor.`);
    rotear();
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
