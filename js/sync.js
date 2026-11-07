// =====================================================================
// Conexão e sincronização
// * Inclusões feitas sem internet ficam numa fila NESTE aparelho e são
//   enviadas quando a conexão voltar. Cada registro já nasce com um UUID,
//   então reenviar nunca duplica o dado.
// * A interface só diz "salvo na nuvem" depois da confirmação do servidor.
// * Alterações, exclusões e mudanças de status exigem conexão.
// =====================================================================
import { sb } from './supabase.js';
import { store } from './store.js';

const ouvintes = new Set();
export const estado = { online: navigator.onLine, pendentes: 0, comErro: 0, sincronizando: false };

const chave = () => `rebanho.fila.${store.usuario?.id || 'anon'}`;
function lerFila() {
  try { return JSON.parse(localStorage.getItem(chave()) || '[]'); } catch { return []; }
}
function gravarFila(f) {
  try { localStorage.setItem(chave(), JSON.stringify(f)); } catch { /* armazenamento indisponível */ }
  estado.pendentes = f.length;
  estado.comErro = f.filter((i) => i.erro).length;
  avisar();
}
export const fila = () => lerFila();

export function aoMudar(fn) { ouvintes.add(fn); fn(estado); return () => ouvintes.delete(fn); }
function avisar() { ouvintes.forEach((fn) => fn(estado)); }

export function ehErroDeRede(e) {
  if (!e) return false;
  if (!navigator.onLine) return true;
  const m = `${e.message || ''} ${e.details || ''}`;
  return !e.code && /fetch|network|Load failed|NetworkError|timeout/i.test(m);
}
const ehDuplicidadeDoId = (e) => e?.code === '23505' && /_pkey/.test(e.message || '');

/**
 * Inclui um registro. Retorna { sincronizado: true } quando o servidor confirmou,
 * ou { sincronizado: false } quando ficou na fila deste aparelho.
 * Erros de validação (brinco duplicado, permissão...) são lançados.
 */
export async function incluir(tabela, linha, descricao = '') {
  const registro = { ...linha, id: linha.id || crypto.randomUUID() };
  if (!navigator.onLine) {
    enfileirar({ tabela, registro, descricao });
    return { sincronizado: false, id: registro.id };
  }
  const { error } = await sb.from(tabela).insert(registro);
  if (!error || ehDuplicidadeDoId(error)) return { sincronizado: true, id: registro.id };
  if (ehErroDeRede(error)) {
    enfileirar({ tabela, registro, descricao });
    return { sincronizado: false, id: registro.id };
  }
  throw error;
}

function enfileirar(item) {
  const f = lerFila();
  f.push({ ...item, propriedade_id: store.prop?.id, criado: new Date().toISOString(), erro: null });
  gravarFila(f);
}

export async function sincronizar() {
  if (estado.sincronizando || !navigator.onLine || !sb) return;
  const f = lerFila();
  if (!f.length) return;
  estado.sincronizando = true; avisar();
  let enviados = 0;
  const restantes = [];
  for (const item of f) {
    const { error } = await sb.from(item.tabela).insert(item.registro);
    if (!error || ehDuplicidadeDoId(error)) { enviados++; continue; }
    if (ehErroDeRede(error)) { restantes.push(item, ...f.slice(f.indexOf(item) + 1)); break; }
    restantes.push({ ...item, erro: { code: error.code, message: error.message } });
  }
  estado.sincronizando = false;
  gravarFila(restantes);
  if (enviados) window.dispatchEvent(new CustomEvent('rebanho:sincronizado', { detail: { enviados } }));
}

export function descartar(id) {
  gravarFila(lerFila().filter((i) => i.registro.id !== id));
}

let monitorando = false;
export function iniciarMonitor() {
  if (monitorando) { gravarFila(lerFila()); sincronizar(); return; }
  monitorando = true;
  const atualizar = () => { estado.online = navigator.onLine; avisar(); if (estado.online) sincronizar(); };
  window.addEventListener('online', atualizar);
  window.addEventListener('offline', atualizar);
  setInterval(() => { if (navigator.onLine && lerFila().length) sincronizar(); }, 30000);
  gravarFila(lerFila());
  atualizar();
}

/** Garante conexão antes de operações que não podem ficar na fila. */
export function exigirConexao() {
  if (!navigator.onLine) {
    const e = new Error('Esta operação precisa de internet para ser confirmada pelo servidor. Tente novamente quando a conexão voltar.');
    e.code = 'OFFLINE';
    throw e;
  }
}
