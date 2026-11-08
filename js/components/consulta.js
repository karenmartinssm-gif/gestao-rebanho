// Busca completa em partes: o servidor devolve no máximo 1.000 linhas por pedido,
// então listas grandes (animais, pesagens...) são baixadas em blocos até o fim.
// `fabrica` cria a consulta do zero a cada bloco (ex.: () => sb.from('x').select('*').eq(...).order('id')).
export async function todos(fabrica, bloco = 1000) {
  const saida = [];
  for (let de = 0; ; de += bloco) {
    const { data, error } = await fabrica().range(de, de + bloco - 1);
    if (error) throw error;
    saida.push(...(data || []));
    if (!data || data.length < bloco) return saida;
  }
}
