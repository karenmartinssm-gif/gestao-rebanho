// =====================================================================
// Indicadores reprodutivos — fórmulas documentadas, só eventos elegíveis
// =====================================================================
import { addDias, diasEntre, hojeISO } from '../ui.js';

const no = (d, ini, fim) => d && d >= ini && d <= fim;
const pct = (n, d) => (d ? (n / d) * 100 : null);

/**
 * @param dados { animais, coberturas, nascimentos, desmames }
 * @param ini/fim datas ISO do período; gest = período gestacional (dias); idadeDesmame (dias)
 */
export function calcularIndicadores({ animais, coberturas, nascimentos, desmames }, ini, fim, gest, idadeDesmame) {
  const hoje = hojeISO();
  const porId = new Map(animais.map((a) => [a.id, a]));
  const desm = new Map(desmames.map((d) => [d.bezerro_id, d]));
  const validas = coberturas.filter((c) => c.situacao !== 'cancelada');

  // 1) TAXA DE PRENHEZ
  const cobPeriodo = validas.filter((c) => no(c.data_cobertura, ini, fim));
  const expostas = new Set(cobPeriodo.map((c) => c.matriz_id));
  const diagnosticadas = new Set(cobPeriodo.filter((c) => ['prenhe', 'vazia', 'parida', 'aborto'].includes(c.situacao)).map((c) => c.matriz_id));
  const prenhes = new Set(cobPeriodo.filter((c) => ['prenhe', 'parida', 'aborto'].includes(c.situacao)).map((c) => c.matriz_id));
  const prenhez = { valor: pct(prenhes.size, diagnosticadas.size), num: prenhes.size, den: diagnosticadas.size, extra: expostas.size - diagnosticadas.size,
    // quem entra na conta (para a lista ao clicar no quadro)
    itens: [...expostas].map((id) => ({ id, info: prenhes.has(id) ? 'Prenhe' : diagnosticadas.has(id) ? 'Vazia' : 'Sem diagnóstico ainda', grupo: prenhes.has(id) ? 0 : diagnosticadas.has(id) ? 1 : 2 })) };

  // 2) TAXA DE NATALIDADE (nascidos no período ÷ fêmeas expostas ~1 gestação antes)
  const iniExp = addDias(ini, -gest), fimExp = addDias(fim, -gest);
  const expostasAntes = new Set(validas.filter((c) => no(c.data_cobertura, iniExp, fimExp)).map((c) => c.matriz_id));
  const nascPeriodo = nascimentos.filter((n) => no(n.data_nascimento, ini, fim));
  const vivos = nascPeriodo.filter((n) => n.resultado === 'vivo');
  const maesVivos = new Set(vivos.map((n) => n.matriz_id));
  const natalidade = { valor: pct(vivos.length, expostasAntes.size), num: vivos.length, den: expostasAntes.size, iniExp, fimExp,
    itens: [...vivos.map((n) => ({ id: n.bezerro_id, info: `Nasceu vivo em ${n.data_nascimento.split('-').reverse().join('/')}`, mae: n.matriz_id, grupo: 0 })),
      ...[...expostasAntes].filter((id) => !maesVivos.has(id)).map((id) => ({ id, info: 'Vaca exposta sem bezerro vivo no período', grupo: 1 }))] };

  // 3) TAXA DE DESMAME (coorte nascida no período, só bezerros que já atingiram a idade de desmame)
  const elegiveis = vivos.filter((n) => n.bezerro_id && addDias(n.data_nascimento, idadeDesmame) <= hoje);
  const desmamados = elegiveis.filter((n) => desm.has(n.bezerro_id));
  const desmame = { valor: pct(desmamados.length, elegiveis.length), num: desmamados.length, den: elegiveis.length, aguardando: vivos.length - elegiveis.length,
    itens: elegiveis.map((n) => ({ id: n.bezerro_id, mae: n.matriz_id, info: desm.has(n.bezerro_id) ? 'Desmamado' : 'Ainda não desmamado', grupo: desm.has(n.bezerro_id) ? 0 : 1 })) };

  // 4) MORTALIDADE DE BEZERROS (nascidos vivos no período que morreram antes do desmame)
  const mortos = vivos.filter((n) => {
    const b = porId.get(n.bezerro_id);
    if (!b || b.status !== 'morto') return false;
    const d = desm.get(b.id);
    return !d || (b.data_saida && b.data_saida <= d.data_desmame);
  });
  const mortalidade = {
    valor: pct(mortos.length, vivos.length), num: mortos.length, den: vivos.length,
    natimortos: nascPeriodo.filter((n) => n.resultado === 'natimorto').length,
    abortos: nascPeriodo.filter((n) => n.resultado === 'aborto').length,
    itens: [...mortos.map((n) => ({ id: n.bezerro_id, mae: n.matriz_id, info: 'Morreu antes do desmame', grupo: 0 })),
      ...nascPeriodo.filter((n) => n.resultado !== 'vivo').map((n) => ({ id: n.matriz_id, info: `${n.resultado === 'aborto' ? 'Aborto' : 'Natimorto'} (vaca)`, grupo: 1 }))],
  };

  // 5) INTERVALO ENTRE PARTOS (pares de partos consecutivos da mesma matriz; 2º parto no período)
  const partosPorMatriz = agruparPartos(nascimentos);
  const intervalos = [];
  const itensIep = [];
  partosPorMatriz.forEach((lista, mid) => {
    for (let i = 1; i < lista.length; i++) if (no(lista[i], ini, fim)) { const d = diasEntre(lista[i - 1], lista[i]); intervalos.push(d); itensIep.push({ id: mid, info: `${d} dias entre partos`, ordem: -d }); }
  });
  const iep = { valor: intervalos.length ? intervalos.reduce((s, x) => s + x, 0) / intervalos.length : null, n: intervalos.length, matrizes: new Set(), itens: itensIep };

  // 6) PESO E IDADE AO DESMAME (desmames no período, com peso registrado)
  const desmPeriodo = desmames.filter((d) => no(d.data_desmame, ini, fim));
  const comPeso = desmPeriodo.filter((d) => d.peso_desmame);
  const pesoDesmame = { valor: comPeso.length ? comPeso.reduce((s, d) => s + Number(d.peso_desmame), 0) / comPeso.length : null, n: comPeso.length,
    itens: comPeso.map((d) => ({ id: d.bezerro_id, info: `${Number(d.peso_desmame).toLocaleString('pt-BR')} kg ao desmame`, ordem: -Number(d.peso_desmame) })),
    idade: desmPeriodo.filter((d) => d.idade_dias).length ? desmPeriodo.filter((d) => d.idade_dias).reduce((s, d) => s + d.idade_dias, 0) / desmPeriodo.filter((d) => d.idade_dias).length : null };

  return { prenhez, natalidade, desmame, mortalidade, iep, pesoDesmame };
}

/** Datas de parto (vivo ou natimorto) por matriz, em ordem. Abortos não contam como parto. */
export function agruparPartos(nascimentos) {
  const m = new Map();
  nascimentos.filter((n) => n.resultado !== 'aborto').forEach((n) => {
    if (!m.has(n.matriz_id)) m.set(n.matriz_id, []);
    m.get(n.matriz_id).push(n.data_nascimento);
  });
  m.forEach((l) => l.sort());
  return m;
}

/** Desempenho individual de cada matriz (todo o histórico). */
export function desempenhoMatriz(id, { nascimentos, desmames, animais }) {
  const nasc = nascimentos.filter((n) => n.matriz_id === id);
  const partos = nasc.filter((n) => n.resultado !== 'aborto').map((n) => n.data_nascimento).sort();
  const intervalos = partos.slice(1).map((d, i) => diasEntre(partos[i], d));
  const filhos = new Set(nasc.filter((n) => n.bezerro_id).map((n) => n.bezerro_id));
  const pesos = desmames.filter((d) => filhos.has(d.bezerro_id) && d.peso_desmame).map((d) => Number(d.peso_desmame));
  const mae = animais.find((a) => a.id === id);
  return {
    partos: partos.length,
    vivos: nasc.filter((n) => n.resultado === 'vivo').length,
    natimortos: nasc.filter((n) => n.resultado === 'natimorto').length,
    abortos: nasc.filter((n) => n.resultado === 'aborto').length,
    ultimoParto: partos.at(-1) || null,
    iep: intervalos.length ? intervalos.reduce((s, x) => s + x, 0) / intervalos.length : null,
    pesoDesmameMedio: pesos.length ? pesos.reduce((s, x) => s + x, 0) / pesos.length : null,
    idadePrimeiroParto: partos[0] && mae?.data_nascimento ? diasEntre(mae.data_nascimento, partos[0]) / 30.44 : null,
  };
}

/** Situação exibida: refina a situação gravada com prazos (aguardando diagnóstico / próxima do parto). */
export function situacaoExibida(situacao, cobAberta, { diasDiag, diasAlertaParto }) {
  const hoje = hojeISO();
  if (situacao === 'coberta' && cobAberta && cobAberta.data_cobertura <= addDias(hoje, -diasDiag)) return 'aguardando_diagnostico';
  if (situacao === 'prenhe' && cobAberta?.data_prevista_parto && cobAberta.data_prevista_parto <= addDias(hoje, diasAlertaParto)) return 'proxima_parto';
  return situacao;
}
