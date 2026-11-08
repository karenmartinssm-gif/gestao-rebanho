// =====================================================================
// Desempenho de peso (GMD = ganho médio diário)
// Para cada animal, no período [ini, fim]:
//   ponto inicial = última pesagem até a data inicial; se não houver,
//                   a primeira pesagem dentro do período;
//   ponto final   = última pesagem dentro do período.
//   GMD = (peso final − peso inicial) ÷ dias entre as duas pesagens.
// Só entra no cálculo quem tem as duas pesagens com pelo menos DIAS_MIN dias
// de intervalo (intervalos curtos distorcem o resultado).
// Média do grupo = média simples dos GMDs individuais.
// =====================================================================
import { diasEntre } from '../ui.js';

export const DIAS_MIN = 7;

/** Agrupa pesagens por animal, em ordem cronológica. */
export function porAnimal(pesagens) {
  const m = new Map();
  for (const p of pesagens) {
    if (!m.has(p.animal_id)) m.set(p.animal_id, []);
    m.get(p.animal_id).push(p);
  }
  for (const l of m.values()) l.sort((a, b) => a.data_pesagem.localeCompare(b.data_pesagem) || String(a.criado_em || '').localeCompare(String(b.criado_em || '')));
  return m;
}

/** GMD de um animal no período. Retorna null quando não há dados suficientes. */
export function gmdAnimal(lista, ini, fim) {
  if (!lista?.length) return null;
  const antes = lista.filter((p) => p.data_pesagem <= ini);
  const dentro = lista.filter((p) => p.data_pesagem >= ini && p.data_pesagem <= fim);
  const inicial = antes.length ? antes[antes.length - 1] : dentro[0];
  const final = dentro.length ? dentro[dentro.length - 1] : null;
  if (!inicial || !final || final === inicial) return null;
  const dias = diasEntre(inicial.data_pesagem, final.data_pesagem);
  if (dias < DIAS_MIN) return null;
  const ganho = Number(final.peso_kg) - Number(inicial.peso_kg);
  return { inicial, final, dias, ganho, gmd: ganho / dias };
}

/** Calcula o GMD de cada animal da lista. */
export function calcularGmd(animais, mapaPesagens, ini, fim) {
  const r = [];
  for (const a of animais) {
    const g = gmdAnimal(mapaPesagens.get(a.id), ini, fim);
    if (g) r.push({ a, ...g });
  }
  return r;
}

/** Resume um grupo de resultados individuais. */
export function resumir(lista) {
  if (!lista.length) return { n: 0, gmd: null, ganho: null, pesoFinal: null, min: null, max: null };
  const soma = (f) => lista.reduce((s, x) => s + f(x), 0);
  const gmds = lista.map((x) => x.gmd);
  return {
    n: lista.length,
    gmd: soma((x) => x.gmd) / lista.length,
    ganho: soma((x) => x.ganho) / lista.length,
    pesoFinal: soma((x) => Number(x.final.peso_kg)) / lista.length,
    min: Math.min(...gmds),
    max: Math.max(...gmds),
  };
}

/** Agrupa resultados por uma chave (lote, categoria...). */
export function agrupar(lista, chave, rotulo) {
  const g = new Map();
  for (const x of lista) {
    const k = chave(x.a) ?? '';
    if (!g.has(k)) g.set(k, { chave: k, rotulo: rotulo(x.a), itens: [] });
    g.get(k).itens.push(x);
  }
  return [...g.values()].map((v) => ({ ...v, ...resumir(v.itens) })).sort((a, b) => (b.gmd ?? -99) - (a.gmd ?? -99));
}

/** Arrobas a partir do peso: vivo usa o rendimento de carcaça; carcaça divide direto. */
export function arrobas(pesoKg, { base = 'vivo', rendimentoPct = 50, pesoArroba = 15 } = {}) {
  if (!pesoKg) return null;
  const carcaca = base === 'vivo' ? pesoKg * (rendimentoPct / 100) : pesoKg;
  return carcaca / pesoArroba;
}
