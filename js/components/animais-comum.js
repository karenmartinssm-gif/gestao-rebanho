// Consultas e seletor de animais reutilizados por várias telas
import { sb } from '../supabase.js';
import { store } from '../store.js';
import { esc } from '../ui.js';
import { ehErroDeRede } from '../sync.js';

// A última lista baixada fica guardada no aparelho para os formulários de campo
// funcionarem sem internet (apenas para consulta; o servidor continua sendo a referência).
const chaveCache = () => `rebanho.animais.${store.prop.id}`;

export async function listarAnimais({ somenteAtivos = false } = {}) {
  const q = sb.from('vw_animais').select('*').eq('propriedade_id', store.prop.id).order('brinco').range(0, 9999);
  const { data, error } = await q;
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
