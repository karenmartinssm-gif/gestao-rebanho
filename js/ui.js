// =====================================================================
// Utilitários de interface e formatação (pt-BR)
// =====================================================================

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const icones = () => window.lucide?.createIcons({ attrs: { 'aria-hidden': 'true' } });

// ---------- Datas ----------
export function hojeISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
export function fmtData(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
export function fmtDataHora(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
const paraData = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00`);
export function diasEntre(a, b) {
  return Math.round((paraData(b) - paraData(a)) / 86400000);
}
export function addDias(iso, n) {
  const d = paraData(iso);
  d.setDate(d.getDate() + Number(n));
  return d.toISOString().slice(0, 10);
}
export function mesesEntre(a, b) {
  const x = paraData(a), y = paraData(b);
  let m = (y.getFullYear() - x.getFullYear()) * 12 + (y.getMonth() - x.getMonth());
  if (y.getDate() < x.getDate()) m -= 1;
  return Math.max(0, m);
}
export function idadeTexto(nasc, ref = hojeISO()) {
  if (!nasc) return '—';
  const dias = diasEntre(nasc, ref);
  if (dias < 0) return '—';
  if (dias < 60) return `${dias} dia${dias === 1 ? '' : 's'}`;
  const m = mesesEntre(nasc, ref);
  if (m < 24) return `${m} meses`;
  const a = Math.floor(m / 12), r = m % 12;
  return r ? `${a} a ${r} m` : `${a} anos`;
}
export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const rotuloMes = (chave) => { const [y, m] = chave.split('-'); return `${MESES[Number(m) - 1]}/${y.slice(2)}`; };
export function ultimosMeses(n, ref = hojeISO()) {
  const d = paraData(ref); d.setDate(1);
  const lista = [];
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    lista.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`);
  }
  return lista;
}
export function fimDoMes(chave) {
  const [y, m] = chave.split('-').map(Number);
  const d = new Date(y, m, 0);
  return `${y}-${String(m).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- Números ----------
export const fmtNum = (v, casas = 0) =>
  v === null || v === undefined || v === '' || Number.isNaN(Number(v))
    ? '—'
    : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
export const fmtKg = (v) => (v == null ? '—' : `${fmtNum(v, 1)} kg`);
export const fmtMoeda = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
export const fmtPct = (v, casas = 1) => (v == null || !Number.isFinite(v) ? '—' : `${fmtNum(v, casas)}%`);
// Aceita o jeito brasileiro: "1.500,75", "1500,75", "R$ 1.500", "312.5" e "1.500" (mil e quinhentos)
export const numOuNulo = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = String(v).trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (t === '') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
export const textoOuNulo = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());

export const ROTULO_SEXO = { M: 'Macho', F: 'Fêmea' };
export const ROTULO_ORIGEM = { nascido: 'Nascido na propriedade', comprado: 'Comprado', outro: 'Outro' };
export const ROTULO_MOV = {
  cadastro: 'Cadastro inicial', entrada_nascimento: 'Nascimento', entrada_compra: 'Compra', entrada_outra: 'Entrada',
  saida_venda: 'Venda', saida_morte: 'Morte', saida_perda: 'Perda/Desaparecimento', saida_transferencia: 'Transferência',
  saida_doacao: 'Doação', saida_outra: 'Outra saída', troca_pasto: 'Troca de pasto', troca_lote: 'Troca de lote',
  correcao_status: 'Correção de status',
};
export const ROTULO_SITUACAO_REPRO = {
  vazia: 'Vazia', em_reproducao: 'Em reprodução', coberta: 'Coberta', aguardando_diagnostico: 'Aguardando diagnóstico',
  prenhe: 'Prenhe', proxima_parto: 'Próxima do parto', pos_parto: 'Recuperação pós-parto',
};

// ---------- Mensagens ----------
export function toast(msg, tipo = 'sucesso', ms = 4500) {
  const caixa = document.getElementById('toasts');
  const el = document.createElement('div');
  const icone = { sucesso: 'check-circle-2', erro: 'alert-circle', aviso: 'cloud-off', info: 'info' }[tipo] || 'info';
  el.className = `toast ${tipo}`;
  el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
  el.innerHTML = `<i data-lucide="${icone}"></i><div>${esc(msg)}</div>`;
  caixa.appendChild(el);
  icones();
  setTimeout(() => el.remove(), ms);
}

export function traduzirErro(e) {
  if (!e) return 'Erro desconhecido.';
  const msg = e.message || String(e);
  if (/fetch|network|Load failed|NetworkError/i.test(msg) && !e.code) return 'Sem conexão com o servidor. Verifique a internet e tente novamente.';
  if (e.code === '23505') {
    if (/brinco/i.test(msg)) return 'Já existe um animal com este número de brinco.';
    return 'Já existe um registro com estes dados (duplicidade).';
  }
  if (e.code === '23503') return 'Este registro possui histórico ou vínculos e não pode ser excluído. Desative-o ou registre uma movimentação.';
  if (e.code === '42501' || /row-level security|permission denied/i.test(msg)) return 'Você não tem permissão para esta operação.';
  if (e.code === '23514') return 'Algum valor informado é inválido. Confira os campos.';
  if (e.code === 'P0001') return msg;
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(msg)) return 'Confirme seu e-mail pelo link enviado antes de entrar.';
  if (/User already registered/i.test(msg)) return 'Este e-mail já possui cadastro. Use "Entrar" ou "Esqueci a senha".';
  if (/Password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 8 caracteres.';
  return msg;
}

// ---------- Modal ----------
export function abrirModal({ titulo, html, largo = false, rodape = '', aoMontar }) {
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `
    <div class="modal ${largo ? 'largo' : ''}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <div class="modal-cab"><h2>${esc(titulo)}</h2>
        <button class="btn btn-icone btn-texto" data-fechar aria-label="Fechar"><i data-lucide="x"></i></button></div>
      <div class="modal-corpo">${html}</div>
      ${rodape ? `<div class="modal-rodape">${rodape}</div>` : ''}
    </div>`;
  document.body.appendChild(fundo);
  const fechar = () => { fundo.remove(); document.removeEventListener('keydown', esc_); };
  const esc_ = (ev) => { if (ev.key === 'Escape') fechar(); };
  document.addEventListener('keydown', esc_);
  fundo.addEventListener('click', (ev) => { if (ev.target === fundo || ev.target.closest('[data-fechar]')) fechar(); });
  icones();
  aoMontar?.(fundo.querySelector('.modal'), fechar);
  fundo.querySelector('input:not([type=hidden]), select, textarea')?.focus();
  return { el: fundo.querySelector('.modal'), fechar };
}

export function confirmar({ titulo = 'Confirmar', mensagem, botao = 'Confirmar', perigo = false }) {
  return new Promise((resolve) => {
    let ok = false;
    const { el, fechar } = abrirModal({
      titulo,
      html: `<p style="margin:0">${mensagem}</p>`,
      rodape: `<button class="btn" data-fechar>Cancelar</button>
               <button class="btn ${perigo ? 'btn-perigo' : 'btn-primario'}" data-ok>${esc(botao)}</button>`,
    });
    el.querySelector('[data-ok]').addEventListener('click', () => { ok = true; fechar(); });
    const obs = new MutationObserver(() => { if (!document.body.contains(el)) { obs.disconnect(); resolve(ok); } });
    obs.observe(document.body, { childList: true });
  });
}

// ---------- Blocos ----------
export const carregando = (txt = 'Carregando…') => `<div class="carregando"><div class="spinner"></div>${esc(txt)}</div>`;

export function vazio({ icone = 'inbox', titulo, texto = '', acao = '' }) {
  return `<div class="vazio"><div class="icone"><i data-lucide="${icone}"></i></div>
    <h3>${esc(titulo)}</h3>${texto ? `<p>${texto}</p>` : ''}${acao}</div>`;
}

export function erroCarga(e) {
  return `<div class="alerta perigo"><i data-lucide="alert-triangle"></i><div><b>Não foi possível carregar os dados.</b><br>${esc(traduzirErro(e))}</div></div>`;
}

export function badgeStatus(a) {
  const classe = a.conta_no_rebanho ? 'ativo' : (a.status === 'morto' ? 'perigo' : 'inativo');
  return `<span class="badge ${classe}">${esc(a.status_nome || a.status)}</span>`;
}

// ---------- Tabela com busca, ordenação e paginação ----------
// colunas: [{ chave, titulo, render?(linha) -> html, valor?(linha) -> ordenação/busca, classe, primaria }]
export function montarTabela(container, { colunas, linhas, porPagina = 25, aoClicar, busca = true, vazioHtml, idLinha = (l) => l.id, semTotal = false }) {
  let pagina = 1, termo = '', ordem = null, dir = 1;
  const valor = (c, l) => (c.valor ? c.valor(l) : l[c.chave]);
  container.innerHTML = `
    ${busca ? `<div class="tabela-busca"><div class="busca-wrap"><i data-lucide="search"></i>
      <input type="search" placeholder="Buscar nesta tabela…" aria-label="Buscar na tabela"></div></div>` : ''}
    <div class="tabela-wrap"><table class="tabela responsiva"><thead><tr>
      ${colunas.map((c, i) => `<th class="ordenavel ${c.classe || ''}" data-i="${i}">${esc(c.titulo)}</th>`).join('')}
    </tr></thead><tbody></tbody></table></div>
    <div class="paginacao"></div>`;
  const tbody = container.querySelector('tbody');
  const pag = container.querySelector('.paginacao');

  function filtradas() {
    let r = linhas;
    if (termo) {
      const t = termo.toLowerCase();
      r = r.filter((l) => colunas.some((c) => String(valor(c, l) ?? '').toLowerCase().includes(t)));
    }
    if (ordem !== null) {
      const c = colunas[ordem];
      r = [...r].sort((a, b) => {
        const x = valor(c, a), y = valor(c, b);
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR', { numeric: true })) * dir;
      });
    }
    return r;
  }

  function desenhar() {
    const r = filtradas();
    const total = r.length;
    const paginas = Math.max(1, Math.ceil(total / porPagina));
    pagina = Math.min(pagina, paginas);
    const fatia = r.slice((pagina - 1) * porPagina, pagina * porPagina);
    if (!total) {
      tbody.innerHTML = `<tr><td colspan="${colunas.length}" style="display:table-cell">${vazioHtml || vazio({ icone: 'search-x', titulo: termo ? 'Nenhum resultado para a busca' : 'Nenhum registro' })}</td></tr>`;
    } else {
      tbody.innerHTML = fatia.map((l) => `<tr class="${aoClicar ? 'clicavel' : ''}" data-id="${esc(idLinha(l))}">
        ${colunas.map((c) => `<td class="${c.classe || ''} ${c.primaria ? 'primaria' : ''}" data-rotulo="${esc(c.titulo)}">${c.render ? c.render(l) : esc(l[c.chave] ?? '—')}</td>`).join('')}
      </tr>`).join('');
    }
    pag.innerHTML = total > porPagina
      ? `<span>${fmtNum((pagina - 1) * porPagina + 1)}–${fmtNum(Math.min(pagina * porPagina, total))} de ${fmtNum(total)}</span>
         <span class="acoes"><button class="btn btn-sm" data-p="-1" ${pagina === 1 ? 'disabled' : ''}><i data-lucide="chevron-left"></i> Anterior</button>
         <button class="btn btn-sm" data-p="1" ${pagina === paginas ? 'disabled' : ''}>Próxima <i data-lucide="chevron-right"></i></button></span>`
      : total && !semTotal ? `<span>${fmtNum(total)} registro${total === 1 ? '' : 's'}</span>` : '';
    icones();
  }

  container.querySelector('input[type=search]')?.addEventListener('input', (e) => { termo = e.target.value.trim(); pagina = 1; desenhar(); });
  container.querySelector('thead').addEventListener('click', (e) => {
    const th = e.target.closest('th'); if (!th) return;
    const i = Number(th.dataset.i);
    if (ordem === i) dir = -dir; else { ordem = i; dir = 1; }
    desenhar();
  });
  pag.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) { pagina += Number(b.dataset.p); desenhar(); } });
  if (aoClicar) tbody.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && !e.target.closest('a,button')) aoClicar(tr.dataset.id); });
  desenhar();
  return { atualizar(novas) { linhas = novas; desenhar(); } };
}

// ---------- Exportação simples para CSV (Excel) ----------
export function baixarCSV(nome, colunas, linhas) {
  const cel = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const conteudo = [colunas.map((c) => cel(c.titulo)).join(';'),
    ...linhas.map((l) => colunas.map((c) => cel(c.csv ? c.csv(l) : l[c.chave])).join(';'))].join('\r\n');
  const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- Formulário em etapas (celular) ----------
export function ativarWizard(form) {
  const etapas = [...form.querySelectorAll('fieldset.etapa-form')];
  if (etapas.length < 2) return;
  form.classList.add('wizard');
  let i = 0;
  const prog = document.createElement('div');
  prog.className = 'wizard-progresso';
  form.prepend(prog);
  const nav = document.createElement('div');
  nav.className = 'wizard-nav';
  nav.innerHTML = `<button type="button" class="btn" data-w="-1">Voltar</button><button type="button" class="btn btn-primario" data-w="1">Próximo</button>`;
  form.appendChild(nav);
  const btnAvancar = nav.querySelector('[data-w="1"]');
  function mostrar() {
    etapas.forEach((f, k) => f.classList.toggle('atual', k === i));
    prog.textContent = `Etapa ${i + 1} de ${etapas.length} — ${etapas[i].querySelector('legend')?.textContent.trim() || ''}`;
    nav.querySelector('[data-w="-1"]').disabled = i === 0;
    btnAvancar.textContent = i === etapas.length - 1 ? 'Salvar' : 'Próximo';
    window.scrollTo({ top: 0 });
  }
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('[data-w]'); if (!b) return;
    const passo = Number(b.dataset.w);
    if (passo > 0) {
      const invalido = [...etapas[i].querySelectorAll('input,select,textarea')].find((c) => !c.checkValidity());
      if (invalido) { invalido.reportValidity(); return; }
      if (i === etapas.length - 1) { form.requestSubmit(); return; }
    }
    i = Math.max(0, Math.min(etapas.length - 1, i + passo));
    mostrar();
  });
  form.addEventListener('invalid', (e) => {
    const k = etapas.findIndex((f) => f.contains(e.target));
    if (k >= 0 && k !== i) { i = k; mostrar(); }
  }, true);
  mostrar();
}

// ---------- Redimensiona imagem antes do envio (internet rural) ----------
export async function comprimirImagem(arquivo, max = 1600, qualidade = 0.82) {
  if (!arquivo.type.startsWith('image/')) return arquivo;
  const bmp = await createImageBitmap(arquivo).catch(() => null);
  if (!bmp) return arquivo;
  const escala = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * escala);
  c.height = Math.round(bmp.height * escala);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', qualidade));
  return blob ? new File([blob], arquivo.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : arquivo;
}

export function opcoes(lista, { valor = 'id', rotulo = 'nome', selecionado, vazio: txtVazio = 'Selecione…' } = {}) {
  return `${txtVazio !== null ? `<option value="">${esc(txtVazio)}</option>` : ''}` +
    lista.map((o) => `<option value="${esc(o[valor])}" ${String(o[valor]) === String(selecionado ?? '') ? 'selected' : ''}>${esc(typeof rotulo === 'function' ? rotulo(o) : o[rotulo])}</option>`).join('');
}
