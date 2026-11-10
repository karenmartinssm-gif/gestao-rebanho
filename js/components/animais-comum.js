// Consultas e seletor de animais reutilizados por várias telas
import { sb } from '../supabase.js';
import { store, pode } from '../store.js';
import { esc } from '../ui.js';
import { ehErroDeRede } from '../sync.js';
import { todos } from './consulta.js';

// A última lista baixada fica guardada no aparelho para os formulários de campo
// funcionarem sem internet (apenas para consulta; o servidor continua sendo a referência).
const chaveCache = () => `rebanho.animais.${store.prop.id}`;

export async function listarAnimais({ somenteAtivos = false } = {}) {
  let data = null, error = null;
  try { data = await todos(() => sb.from('vw_animais').select('*').eq('propriedade_id', store.prop.id).order('brinco').order('id')); }
  catch (e) { error = e; }
  let lista = data;
  if (error) {
    if (!ehErroDeRede(error)) throw error;
    try { lista = JSON.parse(localStorage.getItem(chaveCache()) || 'null'); } catch { lista = null; }
    if (!lista) throw error;
  } else {
    try { localStorage.setItem(chaveCache(), JSON.stringify(lista)); } catch { /* sem espaço: ignora */ }
  }
  return somenteAtivos ? lista.filter((a) => a.conta_no_rebanho) : lista;
}

/** Campo de busca por brinco com lista de sugestões. Retorna função que devolve o animal escolhido. */
export function campoAnimal(container, animais, { id = 'sel-animal', rotulo = 'Animal (brinco)', obrigatorio = true, filtro = () => true } = {}) {
  const lista = animais.filter(filtro);
  container.innerHTML = `<div class="campo"><label for="${id}">${esc(rotulo)} ${obrigatorio ? '<span class="obrig">*</span>' : ''}</label>
    <input id="${id}" list="${id}-lista" autocomplete="off" placeholder="Digite o número do brinco" ${obrigatorio ? 'required' : ''}>
    <datalist id="${id}-lista">${lista.map((a) => `<option value="${esc(a.brinco)}">${esc([a.nome, a.categoria_nome].filter(Boolean).join(' · '))}</option>`).join('')}</datalist>
    <span class="ajuda" id="${id}-info"></span></div>`;
  const input = container.querySelector('input');
  const info = container.querySelector(`#${id}-info`);
  const achar = () => lista.find((a) => a.brinco.trim().toUpperCase() === input.value.trim().toUpperCase()) || null;
  input.addEventListener('input', () => {
    const a = achar();
    info.textContent = a ? `${a.categoria_nome} · ${a.sexo === 'F' ? 'Fêmea' : 'Macho'}${a.lote_nome ? ` · Lote ${a.lote_nome}` : ''}` : (input.value ? 'Brinco não encontrado entre os animais ativos.' : '');
    input.setCustomValidity(input.value && !a ? 'Selecione um brinco válido da lista.' : '');
    container.dispatchEvent(new CustomEvent('animal', { detail: a }));
  });
  return achar;
}

/**
 * Bezerra que completou a idade de novilha passa a ser Novilha.
 * A idade é a "idade mínima" da categoria Novilha (Configurações › Categorias; padrão 12 meses).
 * Roda ao abrir o sistema, só para quem pode editar o rebanho e com internet. Retorna quantas mudaram.
 */
export async function promoverBezerras() {
  if (!store.prop || !pode('rebanho_editar') || !navigator.onLine) return 0;
  const novilha = store.base.categorias
    .filter((c) => c.ativo && c.grupo === 'novilha' && (!c.sexo || c.sexo === 'F'))
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))[0];
  if (!novilha) return 0;
  const meses = Number(novilha.idade_min_meses ?? 12);
  if (!(meses > 0)) return 0;
  const d = new Date(); d.setMonth(d.getMonth() - meses);
  const limite = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  try {
    const { data, error } = await sb.from('vw_animais').select('id').eq('propriedade_id', store.prop.id)
      .eq('categoria_grupo', 'bezerro').eq('sexo', 'F').eq('conta_no_rebanho', true)
      .not('data_nascimento', 'is', null).lte('data_nascimento', limite);
    if (error || !data?.length) return 0;
    const { error: e2 } = await sb.from('animais').update({ categoria_id: novilha.id }).in('id', data.map((x) => x.id));
    if (e2) { console.warn(e2); return 0; }
    try { localStorage.removeItem(chaveCache()); } catch { /* ignora */ }
    return data.length;
  } catch (e) { console.warn(e); return 0; }
}

/**
 * Primípara que já teve 2 partos (sem contar aborto) passa a ser Vaca.
 * ids: confere só estes animais (ex.: logo depois de registrar um parto); sem ids, confere todas as primíparas.
 * Só para quem pode editar o rebanho e com internet. Retorna quantas mudaram.
 */
export async function promoverPrimiparas(ids = null) {
  if (!store.prop || !pode('rebanho_editar') || !navigator.onLine) return 0;
  const nome = (c) => c.nome.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const doGrupo = store.base.categorias.filter((c) => c.ativo && c.grupo === 'matriz' && (!c.sexo || c.sexo === 'F'));
  const prim = doGrupo.find((c) => nome(c) === 'primipara');
  const vaca = doGrupo.find((c) => nome(c) === 'vaca');
  if (!prim || !vaca) return 0;
  try {
    let q = sb.from('vw_animais').select('id').eq('propriedade_id', store.prop.id).eq('categoria_id', prim.id).eq('conta_no_rebanho', true);
    if (ids) q = q.in('id', ids);
    const { data: prims, error } = await q;
    if (error || !prims?.length) return 0;
    const { data: nasc, error: e1 } = await sb.from('nascimentos').select('matriz_id, resultado').in('matriz_id', prims.map((x) => x.id));
    if (e1) return 0;
    const partos = new Map();
    (nasc || []).filter((n) => n.resultado !== 'aborto').forEach((n) => partos.set(n.matriz_id, (partos.get(n.matriz_id) || 0) + 1));
    const viram = prims.map((x) => x.id).filter((id) => (partos.get(id) || 0) >= 2);
    if (!viram.length) return 0;
    const { error: e2 } = await sb.from('animais').update({ categoria_id: vaca.id }).in('id', viram);
    if (e2) { console.warn(e2); return 0; }
    try { localStorage.removeItem(chaveCache()); } catch { /* ignora */ }
    return viram.length;
  } catch (e) { console.warn(e); return 0; }
}
