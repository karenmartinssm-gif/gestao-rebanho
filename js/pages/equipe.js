// =====================================================================
// EQUIPE E PERMISSÕES — quem tem acesso, nível de acesso, convites e histórico
// Somente o proprietário acessa esta página (o banco também garante isso).
// =====================================================================
import { sb } from '../supabase.js';
import { store } from '../store.js';
import { esc, icones, toast, traduzirErro, abrirModal, confirmar, montarTabela, vazio, erroCarga, fmtData, fmtDataHora, textoOuNulo } from '../ui.js';
import { exigirConexao } from '../sync.js';

// Áreas que podem ser liberadas para cada pessoa
export const AREAS = [
  ['rebanho_editar', 'Cadastrar e editar animais'],
  ['pesagens', 'Registrar pesagens'],
  ['reproducao', 'Reprodução, nascimentos e desmames'],
  ['sanidade', 'Sanidade (vacinas, vermífugos, tratamentos)'],
  ['movimentacoes', 'Movimentações (pasto, lote, mortes, perdas)'],
  ['suplementacao', 'Alimentação e estoque de suplementos'],
  ['pastagens', 'Cadastro de pastos e lotes'],
  ['comercial', 'Compras e vendas de animais'],
  ['financeiro', 'Financeiro (receitas e despesas)'],
  ['relatorios', 'Relatórios'],
  ['configuracoes', 'Configurações do sistema'],
  ['excluir', 'Excluir lançamentos feitos por engano (sêmen, pesagens e financeiro)'],
];
const todas = (v) => Object.fromEntries(AREAS.map(([k]) => [k, v]));

// Níveis prontos (atalhos para marcar as áreas)
const NIVEIS = {
  gerente: { nome: 'Gerente', desc: 'Quase tudo, inclusive financeiro e relatórios, e pode excluir lançamentos feitos por engano. Não altera configurações nem a equipe.', perms: { ...todas(true), configuracoes: false } },
  campo: { nome: 'Funcionário de campo', desc: 'Animais, pesagens, reprodução, sanidade, movimentações e suplementação. Sem financeiro nem compras/vendas.',
    perms: { ...todas(false), rebanho_editar: true, pesagens: true, reproducao: true, sanidade: true, movimentacoes: true, suplementacao: true } },
  consulta: { nome: 'Somente consulta', desc: 'Só visualiza o rebanho e as pendências. Não registra nada.', perms: todas(false) },
};

export function nomeNivel(papel, permissoes) {
  if (papel === 'proprietario') return 'Proprietário';
  const p = { ...todas(false), ...(permissoes || {}) };
  for (const n of Object.values(NIVEIS)) if (AREAS.every(([k]) => !!p[k] === !!n.perms[k])) return n.nome;
  return 'Personalizado';
}
// Convite antigo sem áreas marcadas recebe o padrão de funcionário de campo ao ser aceito (função aceitar_convites)
const permsConvite = (c) => (c.papel === 'funcionario' && !Object.keys(c.permissoes || {}).length ? NIVEIS.campo.perms : c.permissoes);
const classeNivel = (n) => ({ Proprietário: 'ativo', Gerente: 'info', 'Funcionário de campo': '', 'Somente consulta': 'inativo' }[n] ?? 'aviso');
const badgeNivel = (papel, perms) => { const n = nomeNivel(papel, perms); return `<span class="badge ${classeNivel(n)}">${esc(n)}</span>`; };

function resumoAreas(papel, perms) {
  if (papel === 'proprietario') return 'Acesso total';
  const lib = AREAS.filter(([k]) => perms?.[k]).map(([, r]) => r.split(' (')[0]);
  if (!lib.length) return 'Somente consulta';
  return lib.length > 3 ? `${lib.slice(0, 3).join(', ')} e mais ${lib.length - 3}` : lib.join(', ');
}

export async function render(el) {
  const p = store.prop.id;
  const [mem, conv, ult, hist] = await Promise.all([
    sb.from('propriedade_membros')
      .select('id, usuario_id, papel, permissoes, ativo, criado_em, atualizado_em')
      .eq('propriedade_id', p).order('criado_em'),
    sb.from('convites').select('*').eq('propriedade_id', p).is('aceito_em', null).order('criado_em', { ascending: false }),
    sb.rpc('ultimos_acessos', { p_prop: p }),
    sb.from('historico_alteracoes').select('*').eq('propriedade_id', p).in('tabela', ['propriedade_membros', 'convites'])
      .order('criado_em', { ascending: false }).limit(100),
  ]);
  if (mem.error) { el.innerHTML = erroCarga(mem.error); icones(); return; }
  if (conv.error) { el.innerHTML = erroCarga(conv.error); icones(); return; }

  const membros = mem.data || [];
  // Nome e e-mail de cada pessoa (consulta separada, sem depender do nome da chave estrangeira)
  if (membros.length) {
    const u = await sb.from('usuarios').select('id, nome, email').in('id', membros.map((m) => m.usuario_id));
    if (u.error) { el.innerHTML = erroCarga(u.error); icones(); return; }
    const porId = new Map((u.data || []).map((x) => [x.id, x]));
    membros.forEach((m) => { m.usuario = porId.get(m.usuario_id) || null; });
  }
  const convites = conv.data || [];
  const acessos = new Map((ult.data || []).map((u) => [u.usuario_id, u]));
  const nomes = new Map(membros.map((m) => [m.usuario_id, m.usuario?.nome || m.usuario?.email || 'Usuário']));
  const faltam = [...new Set((hist.data || []).map((h) => h.usuario_id).filter((u) => u && !nomes.has(u)))];
  if (faltam.length) {
    const r = await sb.from('usuarios').select('id, nome, email').in('id', faltam);
    (r.data || []).forEach((u) => nomes.set(u.id, u.nome || u.email));
  }
  const hoje = new Date().toISOString();
  const ativos = membros.filter((m) => m.ativo);

  el.innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>Equipe e permissões</h1><p>Todas as pessoas com acesso a <b>${esc(store.prop.nome)}</b> e o que cada uma pode fazer.</p></div>
      <div class="acoes"><button class="btn btn-primario" id="btn-convidar"><i data-lucide="user-plus"></i> Convidar pessoa</button></div>
    </div>
    ${ult.error ? `<div class="alerta aviso" style="margin-bottom:16px"><i data-lucide="info"></i><div>A coluna “Último acesso” fica disponível depois de rodar o arquivo <code>005_acessos.sql</code> no SQL Editor do Supabase.</div></div>` : ''}

    <div class="grade grade-kpi" style="margin-bottom:20px">
      <div class="card kpi destaque"><span class="rotulo"><i data-lucide="users"></i>Com acesso ativo</span><span class="valor">${ativos.length}</span></div>
      <div class="card kpi"><span class="rotulo"><i data-lucide="crown"></i>Proprietários</span><span class="valor">${ativos.filter((m) => m.papel === 'proprietario').length}</span></div>
      <div class="card kpi"><span class="rotulo"><i data-lucide="mail"></i>Convites pendentes</span><span class="valor">${convites.length}</span></div>
      <div class="card kpi"><span class="rotulo"><i data-lucide="user-x"></i>Acessos desativados</span><span class="valor">${membros.length - ativos.length}</span></div>
    </div>

    <div class="card"><div class="card-titulo"><h3><i data-lucide="users"></i> Pessoas com acesso</h3><span class="small muted">clique em uma pessoa para alterar</span></div>
      <div id="t-membros"></div></div>

    <section class="secao"><h2><i data-lucide="mail"></i> Convites pendentes</h2>
      <div class="card">${convites.length ? '<div id="t-convites"></div>' : vazio({ icone: 'mail-check', titulo: 'Nenhum convite pendente', texto: 'Use “Convidar pessoa” para dar acesso a um funcionário, gerente ou sócio.' })}</div>
    </section>

    <section class="secao"><h2><i data-lucide="history"></i> Histórico de acessos</h2>
      <div class="card"><div class="card-corpo">${histHtml(hist.data || [], nomes)}</div></div>
    </section>

    <section class="secao"><h2><i data-lucide="shield-check"></i> O que cada nível pode fazer</h2>
      <div class="card"><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Área</th><th>Proprietário</th>${Object.values(NIVEIS).map((n) => `<th>${esc(n.nome)}</th>`).join('')}</tr></thead>
      <tbody><tr><td>Ver rebanho, fichas e painel</td><td>✔</td>${Object.values(NIVEIS).map(() => '<td>✔</td>').join('')}</tr>
      ${AREAS.map(([k, r]) => `<tr><td>${esc(r)}</td><td>✔</td>${Object.values(NIVEIS).map((n) => `<td>${n.perms[k] ? '✔' : '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('')}
      <tr><td>Gerenciar equipe e permissões</td><td>✔</td>${Object.values(NIVEIS).map(() => '<td><span class="muted">—</span></td>').join('')}</tr></tbody></table></div>
      <div class="card-corpo small muted">Além dos níveis prontos, você pode marcar área por área (“Personalizado”).</div></div>
    </section>`;
  icones();

  const recarregar = () => render(el).then(icones);

  montarTabela(el.querySelector('#t-membros'), {
    colunas: [
      { chave: 'nome', titulo: 'Pessoa', primaria: true, valor: (m) => `${m.usuario?.nome || ''} ${m.usuario?.email || ''}`,
        render: (m) => `<b>${esc(m.usuario?.nome || 'Sem nome')}</b>${m.usuario_id === store.usuario.id ? ' <span class="badge">você</span>' : ''}<div class="small muted">${esc(m.usuario?.email || '')}</div>` },
      { chave: 'nivel', titulo: 'Nível de acesso', valor: (m) => nomeNivel(m.papel, m.permissoes), render: (m) => badgeNivel(m.papel, m.permissoes) },
      { chave: 'areas', titulo: 'Áreas liberadas', valor: (m) => resumoAreas(m.papel, m.permissoes),
        render: (m) => `<span class="small" title="${esc(resumoAreas(m.papel, m.permissoes))}">${m.papel === 'proprietario' ? 'Todas' : `${AREAS.filter(([k]) => m.permissoes?.[k]).length} de ${AREAS.length}`}</span>` },
      { chave: 'ativo', titulo: 'Situação', valor: (m) => (m.ativo ? 'Ativo' : 'Desativado'), render: (m) => (m.ativo ? '<span class="badge ativo">Ativo</span>' : '<span class="badge inativo">Desativado</span>') },
      { chave: 'criado_em', titulo: 'Acesso desde', render: (m) => fmtData(m.criado_em) },
      { chave: 'ultimo', titulo: 'Último acesso', valor: (m) => acessos.get(m.usuario_id)?.ultimo_acesso, render: (m) => fmtDataHora(acessos.get(m.usuario_id)?.ultimo_acesso) },
    ],
    linhas: membros,
    aoClicar: (id) => editarMembro(membros.find((m) => m.id === id), recarregar),
  });

  if (convites.length) {
    montarTabela(el.querySelector('#t-convites'), {
      colunas: [
        { chave: 'email', titulo: 'E-mail', primaria: true, render: (c) => `<b>${esc(c.email)}</b>${c.nome ? `<div class="small muted">${esc(c.nome)}</div>` : ''}` },
        { chave: 'nivel', titulo: 'Nível', valor: (c) => nomeNivel(c.papel, permsConvite(c)), render: (c) => badgeNivel(c.papel, permsConvite(c)) },
        { chave: 'criado_em', titulo: 'Convidado em', render: (c) => fmtData(c.criado_em) },
        { chave: 'expira_em', titulo: 'Validade', render: (c) => (c.expira_em && c.expira_em < hoje ? '<span class="badge perigo">expirado</span>' : `até ${fmtData(c.expira_em)}`) },
        { chave: 'acoes', titulo: 'Ações', render: (c) => `<span class="acoes">
            <button class="btn btn-sm" data-msg="${c.id}" title="Copiar mensagem de convite"><i data-lucide="copy"></i> Mensagem</button>
            ${c.expira_em && c.expira_em < hoje ? `<button class="btn btn-sm" data-renovar="${c.id}"><i data-lucide="refresh-cw"></i> Renovar</button>` : ''}
            <button class="btn btn-sm btn-texto" data-cancelar="${c.id}" style="color:var(--perigo)"><i data-lucide="x"></i> Cancelar</button></span>` },
      ],
      linhas: convites, busca: convites.length > 8,
    });
    const tc = el.querySelector('#t-convites');
    tc.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const c = convites.find((x) => x.id === (b.dataset.msg || b.dataset.renovar || b.dataset.cancelar));
      if (b.dataset.msg) return mostrarMensagem(c);
      try {
        exigirConexao();
        if (b.dataset.renovar) {
          const { error } = await sb.from('convites').update({ expira_em: new Date(Date.now() + 30 * 864e5).toISOString() }).eq('id', c.id);
          if (error) throw error;
          toast('Convite renovado por mais 30 dias.');
        } else {
          if (!(await confirmar({ titulo: 'Cancelar convite', mensagem: `Cancelar o convite de <b>${esc(c.email)}</b>? A pessoa não terá acesso, mesmo se criar a conta.`, botao: 'Cancelar convite', perigo: true }))) return;
          const { error } = await sb.from('convites').delete().eq('id', c.id);
          if (error) throw error;
          toast('Convite cancelado.');
        }
        recarregar();
      } catch (err) { toast(traduzirErro(err), 'erro'); }
    });
  }

  el.querySelector('#btn-convidar').addEventListener('click', () => convidar(membros, convites, recarregar));
}

// ---------- Formulário de nível de acesso (usado no convite e na edição) ----------
function htmlNivel(papel, perms) {
  const atual = papel === 'proprietario' ? 'proprietario' : (Object.entries(NIVEIS).find(([, n]) => nomeNivel('funcionario', perms) === n.nome)?.[0] || 'personalizado');
  const p = { ...todas(false), ...(perms || {}) };
  return `
    <div class="campo"><label>Nível de acesso <span class="obrig">*</span></label>
      <div class="grade" style="gap:8px">
        ${[['proprietario', 'Proprietário', 'Acesso total, inclusive financeiro, configurações e gerenciar a equipe.'],
          ...Object.entries(NIVEIS).map(([k, n]) => [k, n.nome, n.desc]),
          ['personalizado', 'Personalizado', 'Escolha área por área abaixo.']].map(([k, n, d]) => `
          <label class="check" style="align-items:flex-start;border:1px solid var(--borda);border-radius:8px;padding:10px 12px">
            <input type="radio" name="nivel" value="${k}" ${k === atual ? 'checked' : ''} style="margin-top:2px">
            <span><b>${esc(n)}</b><br><span class="small muted" style="font-weight:400">${esc(d)}</span></span></label>`).join('')}
      </div></div>
    <fieldset id="areas" style="border:1px solid var(--borda);border-radius:8px;padding:12px">
      <legend class="small" style="padding:0 6px;font-weight:600">Áreas liberadas (além de ver o rebanho)</legend>
      <div class="grade" style="gap:6px">${AREAS.map(([k, r]) => `<label class="check small"><input type="checkbox" name="perm" value="${k}" ${p[k] ? 'checked' : ''}> ${esc(r)}</label>`).join('')}</div>
    </fieldset>`;
}

function ligarNivel(form) {
  const areas = form.querySelector('#areas');
  const caixas = [...form.querySelectorAll('input[name=perm]')];
  const aplicar = () => {
    const v = form.querySelector('input[name=nivel]:checked')?.value;
    const dono = v === 'proprietario';
    areas.style.opacity = dono ? 0.5 : 1;
    caixas.forEach((c) => { c.disabled = dono; if (dono) c.checked = true; else if (NIVEIS[v]) c.checked = !!NIVEIS[v].perms[c.value]; });
  };
  form.querySelectorAll('input[name=nivel]').forEach((r) => r.addEventListener('change', aplicar));
  caixas.forEach((c) => c.addEventListener('change', () => {
    const perms = Object.fromEntries(caixas.map((x) => [x.value, x.checked]));
    const nome = nomeNivel('funcionario', perms);
    const chave = Object.entries(NIVEIS).find(([, n]) => n.nome === nome)?.[0] || 'personalizado';
    form.querySelector(`input[name=nivel][value=${chave}]`).checked = true;
  }));
  aplicar();
  return () => {
    const papel = form.querySelector('input[name=nivel]:checked')?.value === 'proprietario' ? 'proprietario' : 'funcionario';
    return { papel, permissoes: papel === 'proprietario' ? {} : Object.fromEntries(caixas.map((x) => [x.value, x.checked])) };
  };
}

// ---------- Convidar ----------
function convidar(membros, convites, depois) {
  const { el, fechar } = abrirModal({
    titulo: 'Convidar pessoa',
    largo: true,
    html: `<form id="f-conv" class="grade" style="gap:14px">
      <div class="grade grade-2" style="gap:14px">
        <div class="campo"><label for="cnome">Nome</label><input id="cnome" name="nome" placeholder="Ex.: João (vaqueiro)"></div>
        <div class="campo"><label for="cemail">E-mail da pessoa <span class="obrig">*</span></label><input id="cemail" name="email" type="email" required autocomplete="off"></div>
      </div>
      ${htmlNivel('funcionario', NIVEIS.campo.perms)}
      <div class="alerta small"><i data-lucide="info"></i><div>O sistema não envia e-mail automático. Depois de salvar, você copia uma mensagem pronta e manda para a pessoa (WhatsApp, por exemplo). Ela cria a conta com <b>este mesmo e-mail</b> e o acesso é liberado sozinho.</div></div>
    </form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-conv"><i data-lucide="user-plus"></i> Salvar convite</button>',
  });
  const form = el.querySelector('form');
  const lerNivel = ligarNivel(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim().toLowerCase();
    const ja = membros.find((m) => (m.usuario?.email || '').toLowerCase() === email);
    if (ja) return toast(ja.ativo ? 'Esta pessoa já tem acesso. Clique nela na lista para alterar o nível.' : 'Esta pessoa já esteve na equipe e está desativada. Clique nela na lista para reativar.', 'aviso', 7000);
    if (convites.some((c) => c.email.toLowerCase() === email)) return toast('Já existe um convite pendente para este e-mail.', 'aviso');
    const { papel, permissoes } = lerNivel();
    if (papel === 'proprietario' && !(await confirmar({ titulo: 'Convidar como proprietário', mensagem: `<b>${esc(email)}</b> terá acesso total, inclusive ao financeiro e à equipe, e poderá até tirar o seu acesso de proprietária. Confirma?`, botao: 'Sim, convidar', perigo: true }))) return;
    try {
      exigirConexao();
      const { data, error } = await sb.from('convites').insert({ propriedade_id: store.prop.id, email, nome: textoOuNulo(form.nome.value), papel, permissoes }).select().single();
      if (error) throw error;
      fechar();
      toast('Convite salvo.');
      depois();
      mostrarMensagem(data);
    } catch (err) {
      toast(err.code === '23505' ? 'Já existe um convite pendente para este e-mail.' : traduzirErro(err), 'erro', 7000);
    }
  });
}

function mostrarMensagem(c) {
  const endereco = `${location.origin}${location.pathname}`;
  const texto = `Olá${c.nome ? `, ${c.nome}` : ''}! Você recebeu acesso ao sistema de gestão do rebanho da ${store.prop.nome} (nível: ${nomeNivel(c.papel, permsConvite(c))}).

1. Acesse ${endereco}
2. Clique em "Criar conta" e use este e-mail: ${c.email}
3. Confirme a conta pelo link que vai chegar no seu e-mail
4. Entre com seu e-mail e senha — o acesso é liberado automaticamente.

O convite vale até ${fmtData(c.expira_em)}.`;
  const { el } = abrirModal({
    titulo: 'Mensagem de convite',
    html: `<p class="small muted" style="margin-top:0">Copie e envie para a pessoa:</p><textarea id="msg-conv" rows="11" readonly>${esc(texto)}</textarea>`,
    rodape: '<button class="btn" data-fechar>Fechar</button><button class="btn btn-primario" data-copiar><i data-lucide="copy"></i> Copiar mensagem</button>',
  });
  el.querySelector('[data-copiar]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(texto); toast('Mensagem copiada. Agora é só colar no WhatsApp ou e-mail.'); }
    catch { el.querySelector('textarea').select(); toast('Selecione o texto e copie (⌘+C / Ctrl+C).', 'info'); }
  });
}

// ---------- Editar pessoa ----------
function editarMembro(m, depois) {
  const eu = m.usuario_id === store.usuario.id;
  const nome = m.usuario?.nome || m.usuario?.email;
  const { el, fechar } = abrirModal({
    titulo: nome,
    largo: true,
    html: eu
      ? `<div class="alerta"><i data-lucide="info"></i><div>Este é o seu acesso (<b>${esc(nomeNivel(m.papel, m.permissoes))}</b>). Por segurança, você não pode alterar ou desativar o próprio acesso — outro proprietário pode fazer isso.</div></div>`
      : `<form id="f-mem" class="grade" style="gap:14px">
          <p class="muted" style="margin:0">${esc(m.usuario?.email || '')} · acesso desde ${fmtData(m.criado_em)} · ${m.ativo ? '<span class="badge ativo">Ativo</span>' : '<span class="badge inativo">Desativado</span>'}</p>
          ${htmlNivel(m.papel, m.permissoes)}
        </form>`,
    rodape: eu ? '<button class="btn" data-fechar>Fechar</button>'
      : `${m.ativo ? '<button class="btn btn-texto" data-alternar style="margin-right:auto;color:var(--perigo)"><i data-lucide="user-x"></i> Desativar acesso</button>'
          : '<button class="btn btn-texto" data-alternar style="margin-right:auto"><i data-lucide="user-check"></i> Reativar acesso</button>'}
        <button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-mem">Salvar nível de acesso</button>`,
  });
  if (eu) return;
  const form = el.querySelector('form');
  const lerNivel = ligarNivel(form);
  const salvar = async (dados, msg) => {
    try {
      exigirConexao();
      const { error } = await sb.from('propriedade_membros').update(dados).eq('id', m.id);
      if (error) throw error;
      toast(msg);
      fechar();
      depois();
    } catch (err) { toast(traduzirErro(err), 'erro', 7000); }
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { papel, permissoes } = lerNivel();
    if (papel === 'proprietario' && m.papel !== 'proprietario'
      && !(await confirmar({ titulo: 'Tornar proprietário', mensagem: `<b>${esc(nome)}</b> terá acesso total, inclusive ao financeiro e à equipe. Confirma?`, botao: 'Sim, tornar proprietário', perigo: true }))) return;
    salvar({ papel, permissoes }, `Nível de acesso de ${nome} atualizado.`);
  });
  el.querySelector('[data-alternar]').addEventListener('click', async () => {
    if (m.ativo) {
      if (!(await confirmar({ titulo: 'Desativar acesso', mensagem: `<b>${esc(nome)}</b> não conseguirá mais entrar nesta propriedade. Tudo o que essa pessoa registrou continua guardado no histórico. Você pode reativar depois.`, botao: 'Desativar acesso', perigo: true }))) return;
      salvar({ ativo: false }, `Acesso de ${nome} desativado.`);
    } else {
      salvar({ ativo: true }, `Acesso de ${nome} reativado.`);
    }
  });
}

// ---------- Histórico ----------
function histHtml(lista, nomes) {
  const itens = lista.map((h) => {
    const d = h.dados_depois || {}, a = h.dados_antes || {};
    const c = h.campos_alterados || [];
    const pessoa = nomes.get(d.usuario_id || a.usuario_id) || 'Pessoa';
    let txt = null;
    if (h.tabela === 'convites') {
      if (h.acao === 'INSERT') txt = `Convite criado para <b>${esc(d.email)}</b> como ${esc(nomeNivel(d.papel, permsConvite(d)))}`;
      else if (h.acao === 'DELETE') txt = `Convite de <b>${esc(a.email)}</b> cancelado`;
      else if (c.includes('aceito_em') && d.aceito_em) txt = `<b>${esc(d.email)}</b> criou a conta e aceitou o convite`;
      else if (c.includes('expira_em')) txt = `Convite de <b>${esc(d.email)}</b> renovado`;
    } else if (h.acao === 'INSERT') {
      txt = `<b>${esc(pessoa)}</b> passou a ter acesso como ${esc(nomeNivel(d.papel, d.permissoes))}`;
    } else if (h.acao === 'DELETE') {
      txt = `Acesso de <b>${esc(pessoa)}</b> removido`;
    } else if (c.includes('ativo')) {
      txt = d.ativo ? `Acesso de <b>${esc(pessoa)}</b> reativado` : `Acesso de <b>${esc(pessoa)}</b> desativado`;
    } else if (c.includes('papel') || c.includes('permissoes')) {
      const antes = nomeNivel(a.papel, a.permissoes), depois = nomeNivel(d.papel, d.permissoes);
      txt = antes === depois ? `Áreas liberadas para <b>${esc(pessoa)}</b> alteradas (${esc(depois)})` : `Nível de <b>${esc(pessoa)}</b> alterado: ${esc(antes)} → ${esc(depois)}`;
    }
    return txt && `<li><div class="quando">${fmtDataHora(h.criado_em)} · por ${esc(nomes.get(h.usuario_id) || 'sistema')}</div>${txt}</li>`;
  }).filter(Boolean);
  return itens.length ? `<ul class="linha-tempo">${itens.join('')}</ul>` : '<p class="muted" style="margin:0">Nenhuma alteração de acesso registrada ainda.</p>';
}
