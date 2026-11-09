// =====================================================================
// RELATÓRIOS — definições. Cada relatório devolve:
// { resumo: [[rótulo, texto]], secoes: [{ titulo, colunas: [{ t, tipo, casas }], linhas: [[valores]] }], notas: [] }
// Os valores ficam "crus" (número, data ISO, texto) para o Excel; a tela e o PDF formatam.
// =====================================================================
import { sb } from '../supabase.js';
import { store, param, nomePasto } from '../store.js';
import { hojeISO, diasEntre, fmtNum, fmtKg, fmtMoeda, fmtPct, fmtData, ROTULO_MOV, ROTULO_SITUACAO_REPRO } from '../ui.js';
import { listarAnimais } from './animais-comum.js';
import { todos } from './consulta.js';
import { calcularIndicadores, desempenhoMatriz, situacaoExibida } from './reproducao-indicadores.js';
import { porAnimal, calcularGmd, resumir, agrupar, arrobas, DIAS_MIN } from './desempenho.js';
import { CAT_RECEITA, CAT_DESPESA } from './financeiro-forms.js';
import { ROTULO_RESULTADO } from './reproducao-forms.js';

// ---------- carga de dados (uma vez por visita à tela) ----------
const cache = new Map();
export const limparCache = () => cache.clear();
const p = () => store.prop.id;
const tab = (t, ordem, sel = '*', bloco = 1000) => () => todos(() => sb.from(t).select(sel).eq('propriedade_id', p()).order(ordem).order('id'), bloco);
const FONTES = {
  animais: () => listarAnimais(),
  pesagens: tab('pesagens', 'data_pesagem', 'id, animal_id, data_pesagem, peso_kg, tipo, criado_em'),
  matrizes: tab('matrizes', 'criado_em'),
  coberturas: tab('coberturas', 'data_cobertura'),
  nascimentos: tab('nascimentos', 'data_nascimento'),
  desmames: tab('desmames', 'data_desmame'),
  manejos: tab('manejos_sanitarios', 'data_aplicacao', '*, manejo_animais(animal_id)', 500),
  prodSanit: tab('produtos_sanitarios', 'nome'),
  prodSupl: async () => { const { data, error } = await sb.from('vw_estoque_suplementos').select('*').eq('propriedade_id', p()).order('nome'); if (error) throw error; return data || []; },
  fornecimentos: tab('fornecimentos', 'data_fornecimento'),
  movimentacoes: tab('movimentacoes', 'data_movimentacao', '*, movimentacao_animais(animal_id, peso_kg)', 500),
  compras: tab('compras', 'data_compra'),
  vendas: tab('vendas', 'data_venda'),
  receitas: tab('receitas', 'data_lancamento'),
  despesas: tab('despesas', 'data_lancamento'),
};
async function obter(...nomes) {
  return Promise.all(nomes.map((n) => { if (!cache.has(n)) cache.set(n, FONTES[n]().catch((e) => { cache.delete(n); throw e; })); return cache.get(n); }));
}

// ---------- utilidades ----------
const no = (d, f) => d && d >= f.ini && d <= f.fim;
const nomeCat = (id) => store.base.categorias.find((c) => c.id === id)?.nome || '';
const nomeLote = (id) => store.base.lotes.find((l) => l.id === id)?.nome || '';
const nomePastoId = (id) => nomePasto(store.base.pastos.find((x) => x.id === id));
const sexo = (s) => (s === 'M' ? 'Macho' : s === 'F' ? 'Fêmea' : '');
const media = (l) => (l.length ? l.reduce((s, x) => s + x, 0) / l.length : null);
const filtraAnimal = (a, f) => (!f.lote || a.lote_id === f.lote) && (!f.categoria || a.categoria_id === f.categoria);
const C = (t, tipo = 'texto', casas) => ({ t, tipo, casas });

export function fmtCelula(tipo, v, casas) {
  if (v === null || v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v))) return '—';
  switch (tipo) {
    case 'data': return fmtData(v);
    case 'kg': return fmtKg(v);
    case 'moeda': return fmtMoeda(v);
    case 'pct': return fmtPct(v, casas ?? 1);
    case 'num': return fmtNum(v, casas ?? 0);
    default: return String(v);
  }
}

// ---------- definições ----------
export const RELATORIOS = [
  // ===== REBANHO =====
  { id: 'inventario', grupo: 'Rebanho', titulo: 'Inventário do rebanho', icone: 'tag', filtros: ['lote', 'categoria'], descricao: 'Animais ativos por categoria, lote e a lista completa com peso atual.',
    async gerar(f) {
      const [animais] = await obter('animais');
      const lista = animais.filter((a) => a.conta_no_rebanho && filtraAnimal(a, f));
      const pesos = lista.filter((a) => a.peso_atual).map((a) => Number(a.peso_atual));
      const porCat = store.base.categorias.map((c) => { const l = lista.filter((a) => a.categoria_id === c.id); const ps = l.filter((a) => a.peso_atual).map((a) => Number(a.peso_atual));
        return [c.nome, l.filter((a) => a.sexo === 'M').length, l.filter((a) => a.sexo === 'F').length, l.length, media(ps)]; }).filter((r) => r[3]).sort((x, y) => y[3] - x[3]);
      const lotes = [...new Set(lista.map((a) => a.lote_id || ''))].map((id) => { const l = lista.filter((a) => (a.lote_id || '') === id); return [id ? nomeLote(id) : 'Sem lote', l.length, media(l.filter((a) => a.peso_atual).map((a) => Number(a.peso_atual)))]; }).sort((x, y) => y[1] - x[1]);
      return {
        resumo: [['Animais ativos', fmtNum(lista.length)], ['Machos', fmtNum(lista.filter((a) => a.sexo === 'M').length)], ['Fêmeas', fmtNum(lista.filter((a) => a.sexo === 'F').length)],
          ['Peso médio', pesos.length ? `${fmtKg(media(pesos))} (${pesos.length} com peso)` : '—'], ['Peso vivo total registrado', pesos.length ? fmtKg(pesos.reduce((s, x) => s + x, 0)) : '—']],
        secoes: [
          { titulo: 'Por categoria', colunas: [C('Categoria'), C('Machos', 'num'), C('Fêmeas', 'num'), C('Total', 'num'), C('Peso médio', 'kg')], linhas: porCat },
          { titulo: 'Por lote', colunas: [C('Lote'), C('Cabeças', 'num'), C('Peso médio', 'kg')], linhas: lotes },
          { titulo: 'Animais', colunas: [C('Brinco'), C('Nome'), C('Sexo'), C('Categoria'), C('Raça'), C('Nascimento', 'data'), C('Idade (meses)', 'num'), C('Lote'), C('Pasto'), C('Peso atual', 'kg'), C('Última pesagem', 'data')],
            linhas: lista.map((a) => [a.brinco, a.nome, sexo(a.sexo), a.categoria_nome, a.raca_nome, a.data_nascimento, a.idade_meses, nomeLote(a.lote_id), nomePastoId(a.pasto_id), a.peso_atual ? Number(a.peso_atual) : null, a.data_ultima_pesagem]) },
        ],
        notas: ['Peso atual = última pesagem registrada de cada animal.'],
      };
    } },

  { id: 'matrizes', grupo: 'Rebanho', titulo: 'Vacas e novilhas', icone: 'heart', filtros: ['lote'], descricao: 'Situação reprodutiva, partos, intervalo entre partos e desempenho das crias.',
    async gerar(f) {
      const [animais, matrizes, coberturas, nascimentos, desmames] = await obter('animais', 'matrizes', 'coberturas', 'nascimentos', 'desmames');
      const porId = new Map(animais.map((a) => [a.id, a]));
      const dados = { nascimentos, desmames, animais };
      const lista = matrizes.map((m) => ({ m, a: porId.get(m.animal_id) })).filter((x) => x.a?.conta_no_rebanho && filtraAnimal(x.a, f));
      const linhas = lista.map(({ m, a }) => {
        const cob = coberturas.filter((c) => c.matriz_id === a.id && ['prenhe', 'aguardando_diagnostico'].includes(c.situacao)).sort((x, y) => y.data_cobertura.localeCompare(x.data_cobertura))[0];
        const sit = situacaoExibida(m.situacao_reprodutiva, cob, { diasDiag: param('dias_diagnostico_gestacao'), diasAlertaParto: param('dias_alerta_parto') });
        const d = desempenhoMatriz(a.id, dados);
        return [a.brinco, a.categoria_nome, a.idade_meses, ROTULO_SITUACAO_REPRO[sit] || sit, cob?.situacao === 'prenhe' ? cob.data_prevista_parto : null, d.partos, d.vivos, d.abortos, d.ultimoParto, d.iep, d.pesoDesmameMedio, m.apta_reproducao ? 'Sim' : 'Descarte'];
      });
      const cont = (s) => linhas.filter((l) => l[3] === s).length;
      return {
        resumo: [['Vacas e novilhas ativas', fmtNum(lista.length)], ...Object.values(ROTULO_SITUACAO_REPRO).map((s) => [s, fmtNum(cont(s))]).filter((r) => r[1] !== '0')],
        secoes: [{ titulo: 'Vacas e novilhas', colunas: [C('Brinco'), C('Categoria'), C('Idade (meses)', 'num'), C('Situação'), C('Previsão de parto', 'data'), C('Partos', 'num'), C('Bezerros vivos', 'num'), C('Abortos', 'num'), C('Último parto', 'data'), C('IEP médio (dias)', 'num'), C('Peso médio desmame crias', 'kg'), C('Apta')], linhas }],
        notas: ['IEP = média dos dias entre partos consecutivos da vaca (abortos não contam como parto).'],
      };
    } },

  { id: 'touros', grupo: 'Rebanho', titulo: 'Touros e sêmen', icone: 'shield', filtros: ['periodo'], descricao: 'Coberturas, prenhezes e bezerros de cada touro ou sêmen no período.',
    async gerar(f) {
      const [coberturas, nascimentos] = await obter('coberturas', 'nascimentos');
      const linhas = store.base.reprodutores.map((r) => {
        const cobs = coberturas.filter((c) => c.reprodutor_id === r.id && no(c.data_cobertura, f) && c.situacao !== 'cancelada');
        const diag = cobs.filter((c) => ['prenhe', 'vazia', 'parida', 'aborto'].includes(c.situacao));
        const pren = diag.filter((c) => c.situacao !== 'vazia');
        const bez = nascimentos.filter((n) => n.reprodutor_id === r.id && no(n.data_nascimento, f) && n.resultado === 'vivo');
        return [r.identificacao, r.tipo === 'semen' ? 'Sêmen (IA)' : 'Touro', r.ativo ? 'Sim' : 'Não', cobs.length, diag.length, pren.length, diag.length ? (pren.length / diag.length) * 100 : null, bez.length];
      }).filter((l) => l[2] === 'Sim' || l[3] || l[7]).sort((x, y) => y[3] - x[3] || y[7] - x[7]);
      return { resumo: [['Reprodutores listados', fmtNum(linhas.length)]],
        secoes: [{ titulo: 'Reprodutores', colunas: [C('Identificação'), C('Tipo'), C('Ativo'), C('Coberturas', 'num'), C('Diagnosticadas', 'num'), C('Prenhezes', 'num'), C('Taxa de prenhez', 'pct'), C('Bezerros vivos nascidos', 'num')], linhas }],
        notas: ['Taxa de prenhez = coberturas com resultado prenhe (inclui paridas e abortos) ÷ coberturas já diagnosticadas no período.'] };
    } },

  { id: 'bezerros', grupo: 'Rebanho', titulo: 'Bezerros', icone: 'baby', filtros: ['periodo'], descricao: 'Bezerros nascidos no período, com pais, pesos ao nascer, ao desmame e atual.',
    async gerar(f) {
      const [animais, nascimentos, desmames] = await obter('animais', 'nascimentos', 'desmames');
      const porId = new Map(animais.map((a) => [a.id, a]));
      const desm = new Map(desmames.map((d) => [d.bezerro_id, d]));
      const reprod = new Map(store.base.reprodutores.map((r) => [r.id, r]));
      const lista = nascimentos.filter((n) => n.resultado === 'vivo' && no(n.data_nascimento, f) && porId.get(n.bezerro_id));
      const linhas = lista.map((n) => { const b = porId.get(n.bezerro_id); const d = desm.get(b.id);
        return [n.data_nascimento, b.brinco, sexo(b.sexo), porId.get(n.matriz_id)?.brinco, reprod.get(n.reprodutor_id)?.identificacao || b.pai_externo, n.peso_nascimento ? Number(n.peso_nascimento) : null, d?.data_desmame, d?.idade_dias, d?.peso_desmame ? Number(d.peso_desmame) : null, b.status_nome, b.peso_atual ? Number(b.peso_atual) : null]; });
      const pn = lista.filter((n) => n.peso_nascimento).map((n) => Number(n.peso_nascimento));
      const pd = lista.map((n) => desm.get(n.bezerro_id)).filter((d) => d?.peso_desmame).map((d) => Number(d.peso_desmame));
      return {
        resumo: [['Nascidos vivos', fmtNum(lista.length)], ['Machos / fêmeas', `${linhas.filter((l) => l[2] === 'Macho').length} / ${linhas.filter((l) => l[2] === 'Fêmea').length}`],
          ['Peso médio ao nascer', fmtKg(media(pn))], ['Desmamados', fmtNum(lista.filter((n) => desm.has(n.bezerro_id)).length)], ['Peso médio ao desmame', fmtKg(media(pd))],
          ['Mortos', fmtNum(lista.filter((n) => porId.get(n.bezerro_id)?.status === 'morto').length)]],
        secoes: [{ titulo: 'Bezerros nascidos no período', colunas: [C('Nascimento', 'data'), C('Brinco'), C('Sexo'), C('Mãe'), C('Pai'), C('Peso ao nascer', 'kg'), C('Desmame', 'data'), C('Idade desmame (dias)', 'num'), C('Peso desmame', 'kg'), C('Situação'), C('Peso atual', 'kg')], linhas }],
        notas: [],
      };
    } },

  // ===== REPRODUÇÃO =====
  { id: 'nascimentos', grupo: 'Reprodução', titulo: 'Nascimentos', icone: 'sunrise', filtros: ['periodo'], descricao: 'Partos do período: vivos, natimortos e abortos.',
    async gerar(f) {
      const [animais, nascimentos] = await obter('animais', 'nascimentos');
      const porId = new Map(animais.map((a) => [a.id, a]));
      const reprod = new Map(store.base.reprodutores.map((r) => [r.id, r]));
      const lista = nascimentos.filter((n) => no(n.data_nascimento, f));
      const cont = (r) => lista.filter((n) => n.resultado === r).length;
      const pesos = lista.filter((n) => n.peso_nascimento).map((n) => Number(n.peso_nascimento));
      return {
        resumo: [['Registros', fmtNum(lista.length)], ['Vivos', fmtNum(cont('vivo'))], ['Natimortos', fmtNum(cont('natimorto'))], ['Abortos', fmtNum(cont('aborto'))],
          ['Machos / fêmeas (vivos)', `${lista.filter((n) => n.resultado === 'vivo' && n.sexo === 'M').length} / ${lista.filter((n) => n.resultado === 'vivo' && n.sexo === 'F').length}`], ['Peso médio ao nascer', fmtKg(media(pesos))]],
        secoes: [{ titulo: 'Nascimentos', colunas: [C('Data', 'data'), C('Vaca'), C('Resultado'), C('Sexo'), C('Bezerro'), C('Peso', 'kg'), C('Tipo de parto'), C('Pai')],
          linhas: lista.map((n) => [n.data_nascimento, porId.get(n.matriz_id)?.brinco, ROTULO_RESULTADO[n.resultado], sexo(n.sexo), porId.get(n.bezerro_id)?.brinco, n.peso_nascimento ? Number(n.peso_nascimento) : null, n.tipo_parto, reprod.get(n.reprodutor_id)?.identificacao]) }],
        notas: [],
      };
    } },

  { id: 'indicadores', grupo: 'Reprodução', titulo: 'Indicadores reprodutivos', icone: 'activity', filtros: ['periodo'], descricao: 'Prenhez, natalidade, desmame, mortalidade de bezerros e intervalo entre partos.',
    async gerar(f) {
      const [animais, coberturas, nascimentos, desmames] = await obter('animais', 'coberturas', 'nascimentos', 'desmames');
      const r = calcularIndicadores({ animais, coberturas, nascimentos, desmames }, f.ini, f.fim, param('periodo_gestacao_dias'), param('idade_desmame_dias'));
      const linhas = [
        ['Taxa de prenhez', r.prenhez.valor, `${r.prenhez.num} prenhes ÷ ${r.prenhez.den} fêmeas diagnosticadas (cobertas no período)`],
        ['Taxa de natalidade', r.natalidade.valor, `${r.natalidade.num} nascidos vivos ÷ ${r.natalidade.den} fêmeas cobertas de ${fmtData(r.natalidade.iniExp)} a ${fmtData(r.natalidade.fimExp)}`],
        ['Taxa de desmame', r.desmame.valor, `${r.desmame.num} desmamados ÷ ${r.desmame.den} bezerros que já atingiram a idade de desmame`],
        ['Mortalidade de bezerros', r.mortalidade.valor, `${r.mortalidade.num} mortos antes do desmame ÷ ${r.mortalidade.den} nascidos vivos · natimortos: ${r.mortalidade.natimortos} · abortos: ${r.mortalidade.abortos}`],
      ];
      return {
        resumo: [['Intervalo entre partos (média)', r.iep.valor ? `${fmtNum(r.iep.valor)} dias (${r.iep.n} intervalo(s))` : '—'], ['Peso médio ao desmame', r.pesoDesmame.valor ? `${fmtKg(r.pesoDesmame.valor)} (${r.pesoDesmame.n})` : '—'], ['Idade média ao desmame', r.pesoDesmame.idade ? `${fmtNum(r.pesoDesmame.idade)} dias` : '—']],
        secoes: [{ titulo: 'Indicadores', colunas: [C('Indicador'), C('Valor', 'pct'), C('Cálculo')], linhas }],
        notas: ['Só entram eventos registrados no sistema. Quando o denominador é zero, o valor aparece como "—".'],
      };
    } },

  { id: 'desmames', grupo: 'Reprodução', titulo: 'Desmames', icone: 'milk-off', filtros: ['periodo'], descricao: 'Desmames do período com idade e peso.',
    async gerar(f) {
      const [animais, desmames] = await obter('animais', 'desmames');
      const porId = new Map(animais.map((a) => [a.id, a]));
      const lista = desmames.filter((d) => no(d.data_desmame, f));
      const pesoSexo = (s) => media(lista.filter((d) => porId.get(d.bezerro_id)?.sexo === s && d.peso_desmame).map((d) => Number(d.peso_desmame)));
      return {
        resumo: [['Desmames', fmtNum(lista.length)], ['Peso médio — machos', fmtKg(pesoSexo('M'))], ['Peso médio — fêmeas', fmtKg(pesoSexo('F'))], ['Idade média', lista.some((d) => d.idade_dias) ? `${fmtNum(media(lista.filter((d) => d.idade_dias).map((d) => d.idade_dias)))} dias` : '—']],
        secoes: [{ titulo: 'Desmames', colunas: [C('Data', 'data'), C('Bezerro'), C('Sexo'), C('Mãe'), C('Idade (dias)', 'num'), C('Peso', 'kg')],
          linhas: lista.map((d) => [d.data_desmame, porId.get(d.bezerro_id)?.brinco, sexo(porId.get(d.bezerro_id)?.sexo), porId.get(d.mae_id)?.brinco, d.idade_dias, d.peso_desmame ? Number(d.peso_desmame) : null]) }],
        notas: [],
      };
    } },

  { id: 'mortalidade', grupo: 'Reprodução', titulo: 'Mortalidade e perdas', icone: 'circle-x', filtros: ['periodo'], descricao: 'Mortes e perdas do período por categoria e causa.',
    async gerar(f) {
      const [animais, movs] = await obter('animais', 'movimentacoes');
      const porId = new Map(animais.map((a) => [a.id, a]));
      const linhas = movs.filter((m) => ['saida_morte', 'saida_perda'].includes(m.tipo) && no(m.data_movimentacao, f)).flatMap((m) => (m.movimentacao_animais || []).map((x) => {
        const a = porId.get(x.animal_id);
        return [m.data_movimentacao, a?.brinco, ROTULO_MOV[m.tipo], a?.categoria_nome, sexo(a?.sexo), a?.data_nascimento ? Math.floor(diasEntre(a.data_nascimento, m.data_movimentacao) / 30.44) : null, m.causa || m.motivo || 'Não informada'];
      }));
      const agrup = (i) => [...new Set(linhas.map((l) => l[i] || '—'))].map((k) => [k, linhas.filter((l) => (l[i] || '—') === k).length]).sort((a, b) => b[1] - a[1]);
      const ativosHoje = animais.filter((a) => a.conta_no_rebanho).length;
      return {
        resumo: [['Mortes', fmtNum(linhas.filter((l) => l[2] === ROTULO_MOV.saida_morte).length)], ['Perdas / desaparecimentos', fmtNum(linhas.filter((l) => l[2] === ROTULO_MOV.saida_perda).length)], ['Rebanho ativo hoje', fmtNum(ativosHoje)]],
        secoes: [
          { titulo: 'Por categoria', colunas: [C('Categoria'), C('Animais', 'num')], linhas: agrup(3) },
          { titulo: 'Por causa', colunas: [C('Causa'), C('Animais', 'num')], linhas: agrup(6) },
          { titulo: 'Animais', colunas: [C('Data', 'data'), C('Brinco'), C('Tipo'), C('Categoria'), C('Sexo'), C('Idade (meses)', 'num'), C('Causa')], linhas },
        ],
        notas: [],
      };
    } },

  // ===== MANEJO =====
  { id: 'sanidade', grupo: 'Manejo', titulo: 'Sanidade', icone: 'syringe', filtros: ['periodo', 'lote'], descricao: 'Vacinações, vermifugações, tratamentos e demais manejos do período.',
    async gerar(f) {
      const [animais, manejos, produtos] = await obter('animais', 'manejos', 'prodSanit');
      const porId = new Map(animais.map((a) => [a.id, a]));
      const tipos = new Map(store.base.tiposManejo.map((t) => [t.id, t]));
      const prods = new Map(produtos.map((x) => [x.id, x]));
      const lista = manejos.filter((m) => no(m.data_aplicacao, f) && m.situacao !== 'cancelado' && (!f.lote || m.lote_id === f.lote));
      const alvo = (m) => { const ids = (m.manejo_animais || []).map((x) => x.animal_id); return m.lote_id ? `Lote ${nomeLote(m.lote_id)} (${ids.length})` : ids.length === 1 ? `Animal ${porId.get(ids[0])?.brinco || ''}` : `${ids.length} animais`; };
      const porTipo = [...new Set(lista.map((m) => m.tipo_manejo_id))].map((t) => { const l = lista.filter((m) => m.tipo_manejo_id === t);
        return [tipos.get(t)?.nome, l.length, l.reduce((s, m) => s + (m.manejo_animais || []).length, 0), l.reduce((s, m) => s + Number(m.custo || 0), 0)]; }).sort((x, y) => y[2] - x[2] || y[1] - x[1]);
      return {
        resumo: [['Manejos', fmtNum(lista.length)], ['Aplicações em animais', fmtNum(lista.reduce((s, m) => s + (m.manejo_animais || []).length, 0))], ['Custo registrado', fmtMoeda(lista.reduce((s, m) => s + Number(m.custo || 0), 0))]],
        secoes: [
          { titulo: 'Por tipo de manejo', colunas: [C('Tipo'), C('Manejos', 'num'), C('Aplicações', 'num'), C('Custo', 'moeda')], linhas: porTipo },
          { titulo: 'Manejos', colunas: [C('Data', 'data'), C('Tipo'), C('Produto'), C('Dose'), C('Aplicado em'), C('Carência até', 'data'), C('Próxima', 'data'), C('Custo', 'moeda'), C('Responsável')],
            linhas: lista.map((m) => [m.data_aplicacao, tipos.get(m.tipo_manejo_id)?.nome, prods.get(m.produto_id)?.nome, m.dosagem, alvo(m), m.carencia_ate, m.proxima_aplicacao, m.custo ? Number(m.custo) : null, m.responsavel_nome]) },
        ],
        notas: [],
      };
    } },

  { id: 'pesagens', grupo: 'Manejo', titulo: 'Pesagens e desempenho (GMD)', icone: 'scale', filtros: ['periodo', 'lote', 'categoria'], descricao: 'Ganho médio diário por categoria, lote e animal.',
    async gerar(f) {
      const [animais, pesagens] = await obter('animais', 'pesagens');
      const ativos = animais.filter((a) => a.conta_no_rebanho && filtraAnimal(a, f));
      const res = calcularGmd(ativos, porAnimal(pesagens), f.ini, f.fim);
      const g = resumir(res);
      const linhaG = (x) => [x.rotulo, x.n, x.gmd, x.min, x.max, x.ganho, x.pesoFinal];
      const colG = (t) => [C(t), C('Animais', 'num'), C('GMD médio (kg/dia)', 'num', 3), C('Menor', 'num', 3), C('Maior', 'num', 3), C('Ganho médio (kg)', 'num', 1), C('Peso final médio', 'kg')];
      return {
        resumo: [['Animais com GMD calculado', fmtNum(g.n)], ['GMD médio', g.gmd == null ? '—' : `${fmtNum(g.gmd, 3)} kg/dia`], ['Ganho médio por animal', g.ganho == null ? '—' : `${fmtNum(g.ganho, 1)} kg`],
          ['Pesagens no período', fmtNum(pesagens.filter((x) => no(x.data_pesagem, f)).length)]],
        secoes: [
          { titulo: 'Por categoria', colunas: colG('Categoria'), linhas: agrupar(res, (a) => a.categoria_id, (a) => a.categoria_nome || 'Sem categoria').map(linhaG) },
          { titulo: 'Por lote', colunas: colG('Lote'), linhas: agrupar(res, (a) => a.lote_id, (a) => (a.lote_id ? nomeLote(a.lote_id) : 'Sem lote')).map(linhaG) },
          { titulo: 'Por animal', colunas: [C('Brinco'), C('Categoria'), C('Lote'), C('Peso inicial', 'kg'), C('Data inicial', 'data'), C('Peso final', 'kg'), C('Data final', 'data'), C('Dias', 'num'), C('Ganho (kg)', 'num', 1), C('GMD (kg/dia)', 'num', 3)],
            linhas: res.sort((a, b) => b.gmd - a.gmd).map((x) => [x.a.brinco, x.a.categoria_nome, nomeLote(x.a.lote_id), Number(x.inicial.peso_kg), x.inicial.data_pesagem, Number(x.final.peso_kg), x.final.data_pesagem, x.dias, x.ganho, x.gmd]) },
        ],
        notas: [`GMD = (peso final − peso inicial) ÷ dias. Inicial: última pesagem até o início do período (ou a primeira dentro dele); final: última dentro do período; mínimo de ${DIAS_MIN} dias. Só animais ativos; lote e categoria atuais.`],
      };
    } },

  { id: 'pastagens', grupo: 'Manejo', titulo: 'Pastagens e lotação', icone: 'map', filtros: [], descricao: 'Animais, UA e lotação (UA/ha) de cada pasto hoje.',
    async gerar() {
      const [animais] = await obter('animais');
      const ativos = animais.filter((a) => a.conta_no_rebanho);
      const pua = Number(param('peso_ua_kg'));
      const capins = new Map(store.base.tiposCapim.map((c) => [c.id, c.nome]));
      const linhas = store.base.pastos.filter((x) => x.ativo).map((x) => {
        const l = ativos.filter((a) => a.pasto_id === x.id);
        const pesados = l.filter((a) => a.peso_atual);
        const peso = pesados.reduce((s, a) => s + Number(a.peso_atual), 0);
        const ua = pesados.length ? peso / pua : null;
        return [x.codigo, x.nome, x.area_ha ? Number(x.area_ha) : null, capins.get(x.tipo_capim_id), x.situacao, l.length, pesados.length, ua, ua && x.area_ha ? ua / x.area_ha : null, x.area_ha ? l.length / x.area_ha : null, x.capacidade_ua ? Number(x.capacidade_ua) : null];
      });
      const area = linhas.reduce((s, l) => s + (l[2] || 0), 0);
      return {
        resumo: [['Pastos ativos', fmtNum(linhas.length)], ['Área total', `${fmtNum(area, 1)} ha`], ['Animais em pastos', fmtNum(linhas.reduce((s, l) => s + l[5], 0))], ['Animais sem pasto definido', fmtNum(ativos.filter((a) => !a.pasto_id).length)]],
        secoes: [{ titulo: 'Pastos', colunas: [C('Código'), C('Nome'), C('Área (ha)', 'num', 1), C('Capim'), C('Situação'), C('Animais', 'num'), C('Com peso', 'num'), C('UA', 'num', 1), C('UA/ha', 'num', 2), C('Cabeças/ha', 'num', 2), C('Capacidade (UA)', 'num', 1)], linhas }],
        notas: [`UA = peso vivo total ÷ ${fmtNum(pua)} kg, só com animais que têm peso registrado. UA/ha = UA ÷ área.`],
      };
    } },

  { id: 'suplementos', grupo: 'Manejo', titulo: 'Suplementação e estoque', icone: 'wheat', filtros: ['periodo', 'lote'], descricao: 'Consumo e custo por produto, consumo estimado por cabeça e estoque atual.',
    async gerar(f) {
      const [produtos, fornec] = await obter('prodSupl', 'fornecimentos');
      const lista = fornec.filter((x) => no(x.data_fornecimento, f) && (!f.lote || x.lote_id === f.lote));
      const prods = new Map(produtos.map((x) => [x.id, x]));
      const porProd = produtos.map((x) => { const l = lista.filter((y) => y.produto_id === x.id);
        return [x.nome, x.unidade, l.length, l.reduce((s, y) => s + Number(y.quantidade), 0), l.reduce((s, y) => s + (y.num_cabecas ? y.quantidade / y.num_cabecas : 0), 0), l.reduce((s, y) => s + Number(y.custo || 0), 0), Number(x.saldo), Number(x.estoque_minimo) || null]; })
        .filter((l) => l[2] || l[6]).sort((x, y) => y[5] - x[5] || y[2] - x[2] || y[6] - x[6]);
      return {
        resumo: [['Fornecimentos', fmtNum(lista.length)], ['Custo registrado', fmtMoeda(lista.reduce((s, y) => s + Number(y.custo || 0), 0))]],
        secoes: [
          { titulo: 'Por produto', colunas: [C('Produto'), C('Unidade'), C('Fornecimentos', 'num'), C('Quantidade', 'num', 2), C('Consumo por cabeça (estimado)', 'num', 3), C('Custo', 'moeda'), C('Estoque atual', 'num', 2), C('Estoque mínimo', 'num', 2)], linhas: porProd },
          { titulo: 'Fornecimentos', colunas: [C('Data', 'data'), C('Produto'), C('Quantidade', 'num', 2), C('Lote / pasto'), C('Cabeças', 'num'), C('Custo', 'moeda'), C('Responsável')],
            linhas: lista.map((y) => [y.data_fornecimento, prods.get(y.produto_id)?.nome, Number(y.quantidade), y.lote_id ? `Lote ${nomeLote(y.lote_id)}` : y.pasto_id ? `Pasto ${nomePastoId(y.pasto_id)}` : 'Animais escolhidos', y.num_cabecas, y.custo ? Number(y.custo) : null, y.responsavel_nome]) },
        ],
        notas: ['Consumo por cabeça (estimado) = soma, em cada fornecimento, da quantidade ÷ cabeças atendidas.'],
      };
    } },

  { id: 'movimentacoes', grupo: 'Manejo', titulo: 'Movimentações', icone: 'arrow-left-right', filtros: ['periodo'], descricao: 'Entradas, saídas e trocas de pasto/lote do período.',
    async gerar(f) {
      const [animais, movs] = await obter('animais', 'movimentacoes');
      const porId = new Map(animais.map((a) => [a.id, a]));
      const lista = movs.filter((m) => no(m.data_movimentacao, f));
      const tipos = [...new Set(lista.map((m) => m.tipo))];
      return {
        resumo: [['Movimentações', fmtNum(lista.length)], ['Cabeças movimentadas', fmtNum(lista.reduce((s, m) => s + (m.movimentacao_animais || []).length, 0))]],
        secoes: [
          { titulo: 'Por tipo', colunas: [C('Tipo'), C('Registros', 'num'), C('Cabeças', 'num')], linhas: tipos.map((t) => { const l = lista.filter((m) => m.tipo === t); return [ROTULO_MOV[t] || t, l.length, l.reduce((s, m) => s + (m.movimentacao_animais || []).length, 0)]; }).sort((x, y) => y[2] - x[2] || y[1] - x[1]) },
          { titulo: 'Movimentações', colunas: [C('Data', 'data'), C('Tipo'), C('Cabeças', 'num'), C('Animais'), C('Destino / motivo'), C('Responsável')],
            linhas: lista.map((m) => [m.data_movimentacao, ROTULO_MOV[m.tipo] || m.tipo, (m.movimentacao_animais || []).length, (m.movimentacao_animais || []).map((x) => porId.get(x.animal_id)?.brinco).join(', '),
              [m.pasto_destino_id && `Pasto ${nomePastoId(m.pasto_destino_id)}`, m.lote_destino_id && `Lote ${nomeLote(m.lote_destino_id)}`, m.motivo, m.causa].filter(Boolean).join(' · '), m.responsavel_nome]) },
        ],
        notas: [],
      };
    } },

  // ===== GESTÃO =====
  { id: 'comercial', grupo: 'Gestão', titulo: 'Compras e vendas', icone: 'hand-coins', perm: 'comercial', filtros: ['periodo'], descricao: 'Compras e vendas do período com arrobas, valores e custos.',
    async gerar(f) {
      const [compras, vendas] = await obter('compras', 'vendas');
      const rend = { rendimentoPct: Number(param('rendimento_carcaca_pct')), pesoArroba: Number(param('peso_arroba_kg')) };
      const c = compras.filter((x) => no(x.data_compra, f));
      const v = vendas.filter((x) => no(x.data_venda, f));
      const custo = (x) => Number(x.valor_total) + Number(x.frete) + Number(x.outras_despesas);
      const liq = (x) => Number(x.valor_total) - Number(x.frete) - Number(x.despesas_adicionais);
      const soma = (l, fn) => l.reduce((s, x) => s + fn(x), 0);
      return {
        resumo: [['Vendas', `${fmtNum(v.length)} · ${fmtNum(soma(v, (x) => x.quantidade))} cabeça(s)`], ['Valor bruto vendido', fmtMoeda(soma(v, (x) => Number(x.valor_total)))], ['Valor líquido vendido', fmtMoeda(soma(v, liq))],
          ['Compras', `${fmtNum(c.length)} · ${fmtNum(soma(c, (x) => x.quantidade))} cabeça(s)`], ['Custo total das compras', fmtMoeda(soma(c, custo))]],
        secoes: [
          { titulo: 'Vendas', colunas: [C('Data', 'data'), C('Comprador'), C('Cabeças', 'num'), C('Peso (kg)', 'num', 1), C('Base'), C('Arrobas', 'num', 2), C('R$/@', 'moeda'), C('Valor bruto', 'moeda'), C('Frete + despesas', 'moeda'), C('Líquido', 'moeda'), C('NF'), C('GTA')],
            linhas: v.map((x) => [x.data_venda, x.comprador, x.quantidade, x.peso_total_kg ? Number(x.peso_total_kg) : null, x.base_peso === 'carcaca' ? 'Carcaça' : 'Vivo', arrobas(Number(x.peso_total_kg) || null, { base: x.base_peso, ...rend }), x.valor_arroba ? Number(x.valor_arroba) : null, Number(x.valor_total), Number(x.frete) + Number(x.despesas_adicionais), liq(x), x.nota_fiscal, x.gta]) },
          { titulo: 'Compras', colunas: [C('Data', 'data'), C('Vendedor'), C('Cabeças', 'num'), C('Peso vivo (kg)', 'num', 1), C('Arrobas', 'num', 2), C('R$/@', 'moeda'), C('Valor dos animais', 'moeda'), C('Frete + outras', 'moeda'), C('Custo total', 'moeda'), C('Custo/cabeça', 'moeda'), C('NF'), C('GTA')],
            linhas: c.map((x) => [x.data_compra, x.fornecedor, x.quantidade, x.peso_total_kg ? Number(x.peso_total_kg) : null, arrobas(Number(x.peso_total_kg) || null, { base: 'vivo', ...rend }), x.valor_arroba ? Number(x.valor_arroba) : null, Number(x.valor_total), Number(x.frete) + Number(x.outras_despesas), custo(x), custo(x) / x.quantidade, x.nota_fiscal, x.gta]) },
        ],
        notas: [`Arrobas: peso vivo × ${fmtNum(rend.rendimentoPct)}% ÷ ${fmtNum(rend.pesoArroba)} kg; vendas por carcaça: peso de carcaça ÷ ${fmtNum(rend.pesoArroba)} kg.`],
      };
    } },

  { id: 'financeiro', grupo: 'Gestão', titulo: 'Financeiro', icone: 'wallet', perm: 'financeiro', filtros: ['periodo', 'lote'], descricao: 'Receitas e despesas por categoria, pago × previsto e lançamentos.',
    async gerar(f) {
      const [receitas, despesas] = await obter('receitas', 'despesas');
      const todosL = [...receitas.map((x) => ({ ...x, _t: 'Receita' })), ...despesas.map((x) => ({ ...x, _t: 'Despesa' }))]
        .filter((x) => no(x.data_lancamento, f) && (!f.lote || x.lote_id === f.lote)).sort((a, b) => a.data_lancamento.localeCompare(b.data_lancamento));
      const soma = (l) => l.reduce((s, x) => s + Number(x.valor), 0);
      const real = (t) => todosL.filter((x) => x._t === t && x.situacao === 'realizado');
      const pend = (t) => todosL.filter((x) => x._t === t && x.situacao !== 'realizado');
      const porCat = (t, cats) => Object.entries(cats).map(([k, nome]) => { const l = todosL.filter((x) => x._t === t && x.categoria === k);
        return [nome, soma(l.filter((x) => x.situacao === 'realizado')), soma(l.filter((x) => x.situacao !== 'realizado'))]; }).filter((l) => l[1] || l[2]).sort((x, y) => (y[1] + y[2]) - (x[1] + x[2]));
      const rotCat = (x) => (x._t === 'Receita' ? CAT_RECEITA : CAT_DESPESA)[x.categoria] || x.categoria;
      return {
        resumo: [['Receitas recebidas', fmtMoeda(soma(real('Receita')))], ['Despesas pagas', fmtMoeda(soma(real('Despesa')))], ['Resultado (recebido − pago)', fmtMoeda(soma(real('Receita')) - soma(real('Despesa')))],
          ['A receber no período', fmtMoeda(soma(pend('Receita')))], ['A pagar no período', fmtMoeda(soma(pend('Despesa')))]],
        secoes: [
          { titulo: 'Despesas por categoria', colunas: [C('Categoria'), C('Pago', 'moeda'), C('A pagar', 'moeda')], linhas: porCat('Despesa', CAT_DESPESA) },
          { titulo: 'Receitas por categoria', colunas: [C('Categoria'), C('Recebido', 'moeda'), C('A receber', 'moeda')], linhas: porCat('Receita', CAT_RECEITA) },
          { titulo: 'Lançamentos', colunas: [C('Data', 'data'), C('Tipo'), C('Descrição'), C('Categoria'), C('Lote'), C('Valor', 'moeda'), C('Situação'), C('Pagamento')],
            linhas: todosL.map((x) => [x.data_lancamento, x._t, x.descricao, rotCat(x), nomeLote(x.lote_id), Number(x.valor), x.situacao === 'realizado' ? (x._t === 'Receita' ? 'Recebido' : 'Pago') : (x._t === 'Receita' ? 'A receber' : 'A pagar'), x.forma_pagamento]) },
        ],
        notas: [],
      };
    } },
];

/** Tabelas para "Exportar todos os dados" (proprietário). */
export const TABELAS_EXPORTACAO = [
  ['Animais', 'vw_animais', 'brinco'], ['Pesagens', 'pesagens', 'data_pesagem'], ['Movimentações', 'movimentacoes', 'data_movimentacao'],
  ['Movimentação - animais', 'movimentacao_animais', 'criado_em'], ['Vacas e novilhas', 'matrizes', 'criado_em'], ['Reprodutores', 'reprodutores', 'identificacao'],
  ['Coberturas', 'coberturas', 'data_cobertura'], ['Diagnósticos', 'diagnosticos_gestacao', 'data_diagnostico'], ['Nascimentos', 'nascimentos', 'data_nascimento'],
  ['Desmames', 'desmames', 'data_desmame'], ['Manejos sanitários', 'manejos_sanitarios', 'data_aplicacao'], ['Manejo - animais', 'manejo_animais', 'criado_em'],
  ['Produtos sanitários', 'produtos_sanitarios', 'nome'], ['Protocolos', 'protocolos_sanitarios', 'nome'], ['Suplementos', 'produtos_suplementacao', 'nome'],
  ['Fornecimentos', 'fornecimentos', 'data_fornecimento'], ['Fornecimento - animais', 'fornecimento_animais', 'criado_em'], ['Estoque', 'estoques', 'data_movimento'],
  ['Pastagens', 'pastagens', 'codigo'], ['Lotes', 'lotes', 'nome'], ['Compras', 'compras', 'data_compra'], ['Vendas', 'vendas', 'data_venda'],
  ['Receitas', 'receitas', 'data_lancamento'], ['Despesas', 'despesas', 'data_lancamento'], ['Categorias', 'categorias_animais', 'ordem'], ['Raças', 'racas', 'nome'],
  ['Status', 'status_animais', 'ordem'], ['Tipos de manejo', 'tipos_manejo', 'nome'], ['Tipos de capim', 'tipos_capim', 'nome'], ['Documentos', 'documentos', 'criado_em'],
];
