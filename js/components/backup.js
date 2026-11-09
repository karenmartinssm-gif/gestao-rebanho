// =====================================================================
// CÓPIA DE SEGURANÇA (somente proprietário)
// Baixar: um arquivo .json com todos os registros da propriedade.
// Restaurar: devolve ao sistema apenas o que estiver FALTANDO (mesmo id);
// nada que já existe é alterado ou apagado.
// =====================================================================
import { sb } from '../supabase.js';
import { store } from '../store.js';
import { hojeISO, fmtNum, fmtDataHora } from '../ui.js';
import { todos } from './consulta.js';
import { exigirConexao } from '../sync.js';

export const FORMATO = 'rebanho-pucci-backup';
// Ordem de restauração: cadastros primeiro, depois o que depende deles
export const TABELAS = [
  'racas', 'categorias_animais', 'status_animais', 'tipos_manejo', 'tipos_capim', 'unidades_medida',
  'pastagens', 'lotes', 'reprodutores', 'animais', 'matrizes', 'temporadas', 'temporada_animais', 'coberturas', 'diagnosticos_gestacao',
  'nascimentos', 'desmames', 'pesagens', 'compras', 'vendas', 'movimentacoes', 'movimentacao_animais',
  'produtos_sanitarios', 'protocolos_sanitarios', 'manejos_sanitarios', 'manejo_animais',
  'produtos_suplementacao', 'fornecimentos', 'fornecimento_animais', 'estoques', 'receitas', 'despesas', 'documentos',
];
const chaveUltimo = () => `rebanho.backup.ultimo.${store.prop?.id}`;
export const ultimoBackup = () => { try { return localStorage.getItem(chaveUltimo()); } catch { return null; } };

export async function baixarBackup(progresso = () => {}) {
  exigirConexao();
  const p = store.prop.id;
  const tabelas = {};
  let total = 0;
  for (const [i, t] of TABELAS.entries()) {
    progresso(`Lendo ${t.replace(/_/g, ' ')} (${i + 1} de ${TABELAS.length})…`);
    tabelas[t] = await todos(() => sb.from(t).select('*').eq('propriedade_id', p).order('id'));
    total += tabelas[t].length;
  }
  const { data: prop } = await sb.from('propriedades').select('*').eq('id', p).single();
  const { data: membros } = await sb.from('propriedade_membros').select('*').eq('propriedade_id', p);
  const conteudo = {
    formato: FORMATO, versao: 1, gerado_em: new Date().toISOString(), gerado_por: store.perfil?.nome || store.usuario?.email,
    propriedade: prop, membros: membros || [], totais: Object.fromEntries(Object.entries(tabelas).map(([k, v]) => [k, v.length])), tabelas,
  };
  const blob = new Blob([JSON.stringify(conteudo)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `copia-seguranca-${(store.prop.nome || 'rebanho').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase()}-${hojeISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  try { localStorage.setItem(chaveUltimo(), new Date().toISOString()); } catch { /* ignora */ }
  return { total, tamanho: blob.size };
}

/** Lê e confere o arquivo. Retorna o conteúdo ou lança erro com explicação. */
export async function lerArquivo(arquivo) {
  if (arquivo.size > 200 * 1024 * 1024) throw new Error('Arquivo grande demais (mais de 200 MB).');
  let dados;
  try { dados = JSON.parse(await arquivo.text()); } catch { throw new Error('Este arquivo não é uma cópia de segurança válida (não foi possível ler).'); }
  if (dados?.formato !== FORMATO || !dados.tabelas) throw new Error('Este arquivo não é uma cópia de segurança do Rebanho Pucci.');
  if (dados.propriedade?.id !== store.prop.id) throw new Error(`Esta cópia é da propriedade "${dados.propriedade?.nome || '?'}", não da propriedade aberta agora ("${store.prop.nome}").`);
  return dados;
}

export function resumoArquivo(dados) {
  const total = Object.values(dados.tabelas).reduce((s, l) => s + (Array.isArray(l) ? l.length : 0), 0);
  return `Cópia de ${fmtDataHora(dados.gerado_em)}${dados.gerado_por ? ` (por ${dados.gerado_por})` : ''} · ${fmtNum(total)} registros · ${fmtNum(dados.tabelas.animais?.length || 0)} animais`;
}

export async function restaurar(dados, progresso = () => {}) {
  exigirConexao();
  const p = store.prop.id;
  const resultado = {};
  for (const [i, t] of TABELAS.entries()) {
    const linhas = Array.isArray(dados.tabelas[t]) ? dados.tabelas[t].filter((l) => l?.propriedade_id === p) : [];
    resultado[t] = 0;
    for (let k = 0; k < linhas.length; k += 500) {
      progresso(`Restaurando ${t.replace(/_/g, ' ')} (${i + 1} de ${TABELAS.length})…`);
      const { data, error } = await sb.rpc('restaurar_tabela', { p_prop: p, p_tabela: t, p_linhas: linhas.slice(k, k + 500) });
      if (error) throw error;
      resultado[t] += Number(data) || 0;
    }
  }
  return resultado;
}
