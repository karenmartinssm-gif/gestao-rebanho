// =====================================================================
// Estado da sessão: usuário, propriedade atual, permissões e cadastros base
// =====================================================================
import { sb } from './supabase.js';

// Cópia local (só para abrir sem internet). Apagada ao sair do sistema.
const ehRede = (e) => !navigator.onLine || (!e?.code && /fetch|network|Load failed|NetworkError|timeout/i.test(`${e?.message || ''}`));
const lerLocal = (k) => { try { return JSON.parse(localStorage.getItem(`rebanho.cache.${k}`) || 'null'); } catch { return null; } };
const gravarLocal = (k, v) => { try { localStorage.setItem(`rebanho.cache.${k}`, JSON.stringify(v)); } catch { /* sem espaço */ } };
export function limparCopiaLocal() {
  try { Object.keys(localStorage).filter((k) => k.startsWith('rebanho.cache.') || k.startsWith('rebanho.animais.')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignora */ }
}
export const estadoCarga = { offline: false };

export const PARAMETROS_PADRAO = {
  periodo_gestacao_dias: 290,
  dias_diagnostico_gestacao: 45,
  dias_conferir_te: 7,
  dias_alerta_parto: 30,
  idade_desmame_dias: 210,
  dias_alerta_desmame: 30,
  dias_alerta_manejo: 7,
  peso_ua_kg: 450,
  peso_arroba_kg: 15,
  rendimento_carcaca_pct: 50,
};

export const store = {
  sessao: null,
  usuario: null,
  perfil: null,
  vinculos: [],     // propriedades a que o usuário tem acesso
  prop: null,       // propriedade atual
  papel: null,
  permissoes: {},
  base: { racas: [], categorias: [], status: [], pastos: [], lotes: [], reprodutores: [], tiposManejo: [], tiposCapim: [], unidades: [] },
};

export const pode = (perm) => store.papel === 'proprietario' || store.permissoes?.[perm] === true;
export const ehProprietario = () => store.papel === 'proprietario';
// Excluir: proprietário sempre; gerente com a permissão "excluir" + a permissão da área (o banco confere o mesmo)
export const podeExcluir = (area) => ehProprietario() || (pode('excluir') && pode(area));
export const param = (chave) => ({ ...PARAMETROS_PADRAO, ...(store.prop?.parametros || {}) })[chave];

const CHAVE_PROP = 'rebanho.propriedade';

export async function carregarVinculos() {
  const chave = `vinculos.${store.usuario.id}`;
  const { data, error } = await sb
    .from('propriedade_membros')
    .select('id, papel, permissoes, propriedade:propriedades(*)')
    .eq('usuario_id', store.usuario.id)
    .eq('ativo', true);
  if (error) {
    const local = ehRede(error) && lerLocal(chave);
    if (!local) throw error;
    estadoCarga.offline = true;
    store.vinculos = local.vinculos; store.perfil = local.perfil;
    return store.vinculos;
  }
  estadoCarga.offline = false;
  store.vinculos = (data || []).filter((v) => v.propriedade);
  const { data: perfil } = await sb.from('usuarios').select('*').eq('id', store.usuario.id).maybeSingle();
  store.perfil = perfil;
  gravarLocal(chave, { vinculos: store.vinculos, perfil });
  return store.vinculos;
}

export async function selecionarPropriedade(id) {
  let salvo = null;
  try { salvo = localStorage.getItem(CHAVE_PROP); } catch { /* sem armazenamento local */ }
  const v = store.vinculos.find((x) => x.propriedade.id === (id || salvo)) || store.vinculos[0];
  if (!v) return null;
  store.prop = v.propriedade;
  store.papel = v.papel;
  store.permissoes = v.permissoes || {};
  try { localStorage.setItem(CHAVE_PROP, v.propriedade.id); } catch { /* ignora */ }
  await carregarBase();
  return v;
}

export async function recarregarPropriedade() {
  const { data, error } = await sb.from('propriedades').select('*').eq('id', store.prop.id).single();
  if (error) throw error;
  store.prop = data;
  const v = store.vinculos.find((x) => x.propriedade.id === data.id);
  if (v) v.propriedade = data;
}

export async function carregarBase() {
  const p = store.prop.id;
  const q = (t, ordem = 'nome') => sb.from(t).select('*').eq('propriedade_id', p).order(ordem);
  const res = await Promise.all([
    q('racas'), q('categorias_animais', 'ordem'), q('status_animais', 'ordem'), q('pastagens', 'codigo'),
    q('lotes'), q('reprodutores', 'identificacao'), q('tipos_manejo'), q('tipos_capim'), q('unidades_medida', 'sigla'),
  ]);
  const erro = res.find((r) => r.error);
  if (erro) {
    const local = ehRede(erro.error) && lerLocal(`base.${p}`);
    if (!local) throw erro.error;
    store.base = local;
    return;
  }
  const [racas, categorias, status, pastos, lotes, reprodutores, tiposManejo, tiposCapim, unidades] = res.map((r) => r.data || []);
  store.base = { racas, categorias, status, pastos, lotes, reprodutores, tiposManejo, tiposCapim, unidades };
  gravarLocal(`base.${p}`, store.base);
}

export const nomePasto = (p) => (p ? (p.nome ? `${p.codigo} — ${p.nome}` : p.codigo) : '');
