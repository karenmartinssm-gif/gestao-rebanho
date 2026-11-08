// =====================================================================
// EXPORTAÇÃO EM PDF E EXCEL
// As bibliotecas só são baixadas quando a pessoa pede o arquivo, e o navegador
// confere a "impressão digital" (integrity) de cada uma antes de usar.
// =====================================================================
import { sb } from '../supabase.js';
import { store } from '../store.js';
import { hojeISO, fmtData } from '../ui.js';
import { todos } from './consulta.js';
import { fmtCelula, TABELAS_EXPORTACAO } from './relatorios-def.js';

const LIBS = {
  jspdf: { url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', sri: 'sha512-qZvrmS2ekKPF2mSznTQsxqPgnpkI4DNTlrdUmTzrDgektczlKNRRhy5X5AAOnx5S09ydFYWWNSfcEqDTTHgtNA==', pronto: () => window.jspdf?.jsPDF },
  autotable: { url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js', sri: 'sha512-2/YdOMV+YNpanLCF5MdQwaoFRVbTmrJ4u4EpqS/USXAQNUDgI5uwYi6J98WVtJKcfe1AbgerygzDFToxAlOGEQ==', pronto: () => window.jspdf?.jsPDF?.API?.autoTable },
  xlsx: { url: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', sri: 'sha512-r22gChDnGvBylk90+2e/ycr3RVrDi8DIOkIGNhJlKfuyQM4tIRAI062MaV8sfjQKYVGjOBaZBOA87z+IhZE9DA==', pronto: () => window.XLSX },
};
const carregando = new Map();
function carregar(nome) {
  const lib = LIBS[nome];
  if (lib.pronto()) return Promise.resolve();
  if (!carregando.has(nome)) {
    carregando.set(nome, new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = lib.url; s.integrity = lib.sri; s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer';
      s.onload = () => ok();
      s.onerror = () => { carregando.delete(nome); s.remove(); falha(new Error('Não foi possível baixar o gerador de arquivos. Verifique a internet e tente novamente.')); };
      document.head.appendChild(s);
    }));
  }
  return carregando.get(nome);
}

const nomeArquivo = (titulo, ext) => `${titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}-${hojeISO()}.${ext}`;
// O PDF usa a fonte padrão (Latin-1): troca símbolos que ela não tem
const pdfTexto = (t) => String(t ?? '').replace(/[−–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/ | /g, ' ').replace(/[^\u0000-ÿ—•…]/g, '');

/** rel = { titulo, filtrosTexto, resumo, secoes, notas } */
export async function exportarPDF(rel) {
  await carregar('jspdf');
  await carregar('autotable');
  const { jsPDF } = window.jspdf;
  const largas = rel.secoes.some((s) => s.colunas.length > 7);
  const doc = new jsPDF({ orientation: largas ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const L = doc.internal.pageSize.getWidth();
  const verde = [46, 90, 61];
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...verde);
  doc.text(pdfTexto(rel.titulo), 14, 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
  doc.text(pdfTexto(`${store.prop.nome} · ${rel.filtrosTexto} · gerado em ${fmtData(hojeISO())} por ${store.perfil?.nome || store.usuario?.email || ''}`), 14, 22);
  let y = 28;
  if (rel.resumo?.length) {
    doc.autoTable({ startY: y, body: rel.resumo.map(([a, b]) => [pdfTexto(a), pdfTexto(b)]), theme: 'plain', styles: { fontSize: 9, cellPadding: 1.2 },
      columnStyles: { 0: { textColor: 90, cellWidth: 70 }, 1: { fontStyle: 'bold' } }, margin: { left: 14, right: 14 } });
    y = doc.lastAutoTable.finalY + 6;
  }
  for (const s of rel.secoes) {
    if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = 16; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...verde);
    doc.text(pdfTexto(s.titulo), 14, y);
    const dir = new Set(s.colunas.map((c, i) => (c.tipo !== 'texto' && c.tipo !== 'data' ? i : -1)));
    doc.autoTable({
      startY: y + 2,
      head: [s.colunas.map((c) => pdfTexto(c.t))],
      body: s.linhas.length ? s.linhas.map((l) => l.map((v, i) => pdfTexto(fmtCelula(s.colunas[i].tipo, v, s.colunas[i].casas)))) : [[{ content: 'Nenhum registro.', colSpan: s.colunas.length }]],
      styles: { fontSize: s.colunas.length > 9 ? 7 : 8, cellPadding: 1.5, overflow: 'linebreak' },
      headStyles: { fillColor: verde, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 243] },
      didParseCell: (d) => { if (dir.has(d.column.index)) d.cell.styles.halign = 'right'; },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;
  }
  if (rel.notas?.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90);
    const linhas = doc.splitTextToSize(pdfTexto(rel.notas.map((n) => `• ${n}`).join('\n')), L - 28);
    if (y + linhas.length * 4 > doc.internal.pageSize.getHeight() - 12) { doc.addPage(); y = 16; }
    doc.text(linhas, 14, y);
  }
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140);
    doc.text(`Página ${i} de ${n}`, L - 14, doc.internal.pageSize.getHeight() - 6, { align: 'right' });
  }
  doc.save(nomeArquivo(rel.titulo, 'pdf'));
}

// Valor de célula do Excel: datas viram data de verdade, números ficam números
function celulaXLSX(tipo, v) {
  if (v === null || v === undefined || v === '') return null;
  if (tipo === 'data' && /^\d{4}-\d{2}-\d{2}/.test(v)) { const [a, m, d] = v.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(a, m - 1, d, 12)); }
  if (typeof v === 'number' && !Number.isFinite(v)) return null;
  return v;
}
const FORMATO = { moeda: '"R$" #,##0.00', kg: '#,##0.0', pct: '0.0', data: 'dd/mm/yyyy' };
const nomeAba = (t, usados) => { let n = t.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31); let k = 2; while (usados.has(n)) n = `${t.slice(0, 28)} ${k++}`; usados.add(n); return n; };

function abaDeSecao(XLSX, s) {
  const cab = s.colunas.map((c) => (c.tipo === 'kg' ? `${c.t} (kg)` : c.tipo === 'pct' ? `${c.t} (%)` : c.t));
  const ws = XLSX.utils.aoa_to_sheet([cab, ...s.linhas.map((l) => l.map((v, i) => celulaXLSX(s.colunas[i].tipo, v)))], { cellDates: true });
  s.colunas.forEach((c, i) => {
    const z = FORMATO[c.tipo] || (c.tipo === 'num' && c.casas ? `0.${'0'.repeat(c.casas)}` : null);
    if (!z) return;
    for (let r = 1; r <= s.linhas.length; r++) { const cel = ws[XLSX.utils.encode_cell({ r, c: i })]; if (cel) cel.z = z; }
  });
  ws['!cols'] = cab.map((t, i) => ({ wch: Math.min(45, Math.max(t.length, ...s.linhas.slice(0, 200).map((l) => String(l[i] ?? '').length)) + 2) }));
  return ws;
}

export async function exportarExcel(rel) {
  await carregar('xlsx');
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  const usados = new Set();
  const capa = [[rel.titulo], [store.prop.nome], [rel.filtrosTexto], [`Gerado em ${fmtData(hojeISO())}`], [], ...(rel.resumo || []), [], ...(rel.notas || []).map((n) => [n])];
  const wsCapa = XLSX.utils.aoa_to_sheet(capa);
  wsCapa['!cols'] = [{ wch: 40 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsCapa, nomeAba('Resumo', usados));
  rel.secoes.forEach((s) => XLSX.utils.book_append_sheet(wb, abaDeSecao(XLSX, s), nomeAba(s.titulo, usados)));
  XLSX.writeFile(wb, nomeArquivo(rel.titulo, 'xlsx'), { compression: true });
}

/** Exporta todas as tabelas da propriedade em uma planilha (uma aba por tabela). */
export async function exportarTudo(progresso = () => {}) {
  await carregar('xlsx');
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  const usados = new Set();
  const p = store.prop.id;
  const brincos = new Map();
  let total = 0;
  for (const [i, [nome, tabela, ordem]] of TABELAS_EXPORTACAO.entries()) {
    progresso(`${nome} (${i + 1} de ${TABELAS_EXPORTACAO.length})…`);
    let linhas;
    try { linhas = await todos(() => sb.from(tabela).select('*').eq('propriedade_id', p).order(ordem).order('id')); }
    catch (e) { if (e?.code === '42501' || /permission/i.test(e?.message || '')) continue; throw e; }
    if (tabela === 'vw_animais') linhas.forEach((a) => brincos.set(a.id, a.brinco));
    // Coluna de brinco ao lado dos identificadores de animal, para facilitar a leitura
    const extra = ['animal_id', 'matriz_id', 'bezerro_id', 'mae_id'];
    const dados = linhas.map((l) => {
      const o = {};
      for (const [k, v] of Object.entries(l)) {
        o[k] = v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
        if (extra.includes(k) && v) o[`${k.replace('_id', '')}_brinco`] = brincos.get(v) || '';
      }
      return o;
    });
    total += dados.length;
    const ws = XLSX.utils.json_to_sheet(dados.length ? dados : [{ aviso: 'Sem registros' }]);
    XLSX.utils.book_append_sheet(wb, ws, nomeAba(nome, usados));
  }
  XLSX.writeFile(wb, `dados-completos-${store.prop.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase()}-${hojeISO()}.xlsx`, { compression: true });
  return total;
}
