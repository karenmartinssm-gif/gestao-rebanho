// =====================================================================
// RELATÓRIOS — escolha, filtros, prévia na tela e exportação PDF/Excel
// =====================================================================
import { store, pode, ehProprietario } from '../store.js';
import { esc, icones, toast, traduzirErro, hojeISO, addDias, fmtData, opcoes, carregando, confirmar } from '../ui.js';
import { RELATORIOS, fmtCelula, limparCache } from '../components/relatorios-def.js';

const LIMITE_TELA = 200;
const lembrar = { per: '12m', ini: '', fim: '', lote: '', categoria: '' };

export async function render(el, [id]) {
  limparCache();
  const disponiveis = RELATORIOS.filter((r) => !r.perm || pode(r.perm));
  const rel = id && disponiveis.find((r) => r.id === id);
  if (id && !rel) { location.hash = '#/relatorios'; return; }
  if (!rel) return lista(el, disponiveis);
  return detalhe(el, rel);
}

function lista(el, disponiveis) {
  const grupos = [...new Set(disponiveis.map((r) => r.grupo))];
  el.innerHTML = `
    <div class="cabecalho-pagina"><div><h1>Relatórios</h1><p>Escolha um relatório, ajuste os filtros, confira na tela e baixe em PDF ou Excel.</p></div></div>
    ${grupos.map((g) => `<section class="secao" style="margin-top:0"><h2>${esc(g)}</h2><div class="grade grade-3">
      ${disponiveis.filter((r) => r.grupo === g).map((r) => `<a class="card card-link" href="#/relatorios/${r.id}"><div class="card-titulo"><h3><i data-lucide="${r.icone}"></i>${esc(r.titulo)}</h3><i data-lucide="chevron-right"></i></div><p class="small muted card-corpo" style="margin:0;padding-top:10px">${esc(r.descricao)}</p></a>`).join('')}
    </div></section>`).join('')}
    ${ehProprietario() ? `<section class="secao"><h2>Exportar todos os dados</h2><div class="card card-corpo">
      <p style="margin-top:0">Baixa uma planilha Excel com <b>todas as informações da propriedade</b>: uma aba para cada cadastro (animais, pesagens, manejos, financeiro…). Serve como cópia de segurança para guardar no computador ou em um pen drive.</p>
      <button class="btn btn-primario" id="exp-tudo"><i data-lucide="download"></i> Baixar todos os dados (Excel)</button> <span class="small muted" id="exp-status"></span>
      <p class="small muted" style="margin-bottom:0">Somente o proprietário vê esta opção. A planilha contém dados financeiros: guarde em local seguro.</p></div></section>` : ''}`;
  el.querySelector('#exp-tudo')?.addEventListener('click', async (e) => {
    const ok = await confirmar({ titulo: 'Baixar todos os dados', mensagem: 'O arquivo terá todos os registros da propriedade, inclusive os valores financeiros. Continuar?', botao: 'Baixar' });
    if (!ok) return;
    const b = e.currentTarget; const st = el.querySelector('#exp-status');
    b.disabled = true;
    try {
      const { exportarTudo } = await import('../components/exportar.js');
      const n = await exportarTudo((t) => { st.textContent = `Lendo ${t}`; });
      st.textContent = '';
      toast(`Planilha gerada com ${n} registros.`);
    } catch (err) { st.textContent = ''; toast(traduzirErro(err), 'erro', 8000); }
    b.disabled = false;
  });
  icones();
}

async function detalhe(el, rel) {
  const hoje = hojeISO();
  const anos = Array.from({ length: 6 }, (_, i) => String(Number(hoje.slice(0, 4)) - i));
  const tem = (x) => rel.filtros.includes(x);
  el.innerHTML = `
    <div class="cabecalho-pagina"><div><a href="#/relatorios" class="small"><i data-lucide="arrow-left" style="width:14px;height:14px;vertical-align:-2px"></i> Relatórios</a>
      <h1 style="margin-top:4px">${esc(rel.titulo)}</h1><p>${esc(rel.descricao)}</p></div>
      <div class="acoes"><button class="btn btn-primario" data-pdf disabled><i data-lucide="file-text"></i> Baixar PDF</button><button class="btn" data-xlsx disabled><i data-lucide="sheet"></i> Baixar Excel</button></div></div>
    ${rel.filtros.length ? `<div class="card card-corpo" style="margin-bottom:16px"><div class="filtro-periodo" style="margin:0">
      ${tem('periodo') ? `<label class="small" for="r-per">Período</label><select id="r-per"><option value="mes">Este mês</option><option value="3m">Últimos 3 meses</option><option value="12m">Últimos 12 meses</option>${anos.map((y) => `<option value="${y}">Ano de ${y}</option>`).join('')}<option value="x">Personalizado</option></select>
        <span id="r-datas" class="oculto" style="display:inline-flex;gap:6px;align-items:center"><input type="date" id="r-ini"> a <input type="date" id="r-fim"></span>` : ''}
      ${tem('lote') ? `<label class="small" for="r-lote">Lote</label><select id="r-lote">${opcoes(store.base.lotes, { vazio: 'Todos' })}</select>` : ''}
      ${tem('categoria') ? `<label class="small" for="r-cat">Categoria</label><select id="r-cat">${opcoes(store.base.categorias, { vazio: 'Todas' })}</select>` : ''}
    </div></div>` : ''}
    <div id="r-corpo"></div>`;
  const $ = (s) => el.querySelector(s);
  if (tem('periodo')) {
    $('#r-per').value = lembrar.per;
    $('#r-ini').value = lembrar.ini || addDias(hoje, -365);
    $('#r-fim').value = lembrar.fim || hoje;
  }
  if (tem('lote')) $('#r-lote').value = store.base.lotes.some((l) => l.id === lembrar.lote) ? lembrar.lote : '';
  if (tem('categoria')) $('#r-cat').value = store.base.categorias.some((c) => c.id === lembrar.categoria) ? lembrar.categoria : '';

  let atual = null;
  const filtros = () => {
    const f = { ini: '0000-01-01', fim: '9999-12-31', lote: tem('lote') ? $('#r-lote').value : '', categoria: tem('categoria') ? $('#r-cat').value : '' };
    const partes = [];
    if (tem('periodo')) {
      const v = $('#r-per').value;
      $('#r-datas').classList.toggle('oculto', v !== 'x');
      [f.ini, f.fim] = v === 'mes' ? [`${hoje.slice(0, 7)}-01`, hoje] : v === '3m' ? [addDias(hoje, -91), hoje] : v === '12m' ? [addDias(hoje, -365), hoje]
        : v === 'x' ? [$('#r-ini').value, $('#r-fim').value || hoje] : [`${v}-01-01`, `${v}-12-31`];
      partes.push(`Período: ${fmtData(f.ini)} a ${fmtData(f.fim)}`);
      Object.assign(lembrar, { per: v, ini: $('#r-ini').value, fim: $('#r-fim').value });
    } else partes.push(`Posição em ${fmtData(hoje)}`);
    if (f.lote) partes.push(`Lote: ${store.base.lotes.find((l) => l.id === f.lote)?.nome}`);
    if (f.categoria) partes.push(`Categoria: ${store.base.categorias.find((c) => c.id === f.categoria)?.nome}`);
    if (tem('lote')) lembrar.lote = f.lote;
    if (tem('categoria')) lembrar.categoria = f.categoria;
    return { f, texto: partes.join(' · ') };
  };

  const gerar = async () => {
    const corpo = $('#r-corpo');
    const { f, texto } = filtros();
    el.querySelectorAll('[data-pdf],[data-xlsx]').forEach((b) => { b.disabled = true; });
    if (!f.ini || f.ini > f.fim) { corpo.innerHTML = '<div class="alerta aviso">Escolha a data inicial e final do período.</div>'; atual = null; return; }
    corpo.innerHTML = carregando('Montando o relatório…');
    try {
      const r = await rel.gerar(f);
      atual = { ...r, titulo: rel.titulo, filtrosTexto: texto };
      corpo.innerHTML = `
        <p class="small muted" style="margin-top:0">${esc(texto)}</p>
        ${r.resumo?.length ? `<div class="card card-corpo" style="margin-bottom:16px"><dl class="lista-dados">${r.resumo.map(([a, b]) => `<dt>${esc(a)}</dt><dd><b>${esc(b)}</b></dd>`).join('')}</dl></div>` : ''}
        ${r.secoes.map((s) => `<section class="secao" style="margin-top:0;margin-bottom:18px"><h2>${esc(s.titulo)} <span class="small muted" style="font-weight:400">(${s.linhas.length})</span></h2><div class="card">
          ${s.linhas.length ? `<div class="tabela-wrap"><table class="tabela responsiva"><thead><tr>${s.colunas.map((c) => `<th class="${c.tipo !== 'texto' && c.tipo !== 'data' ? 'dir' : ''}">${esc(c.t)}</th>`).join('')}</tr></thead><tbody>
            ${s.linhas.slice(0, LIMITE_TELA).map((l) => `<tr>${l.map((v, i) => `<td class="${i === 0 ? 'primaria' : ''} ${s.colunas[i].tipo !== 'texto' && s.colunas[i].tipo !== 'data' ? 'dir' : ''}" data-rotulo="${esc(s.colunas[i].t)}">${esc(fmtCelula(s.colunas[i].tipo, v, s.colunas[i].casas))}</td>`).join('')}</tr>`).join('')}
          </tbody></table></div>${s.linhas.length > LIMITE_TELA ? `<p class="small muted">Mostrando ${LIMITE_TELA} de ${s.linhas.length} linhas. O PDF e o Excel trazem todas.</p>` : ''}`
          : '<p class="muted card-corpo" style="margin:0">Nenhum registro para os filtros escolhidos.</p>'}</div></section>`).join('')}
        ${r.notas?.length ? `<div class="small muted">${r.notas.map((n) => `<p style="margin:4px 0">${esc(n)}</p>`).join('')}</div>` : ''}`;
      el.querySelectorAll('[data-pdf],[data-xlsx]').forEach((b) => { b.disabled = false; });
    } catch (e) {
      atual = null;
      corpo.innerHTML = `<div class="alerta perigo"><i data-lucide="alert-triangle"></i><div>${esc(traduzirErro(e))}</div></div>`;
    }
    icones();
  };
  const baixar = async (tipo, b) => {
    if (!atual) return;
    b.disabled = true;
    const txt = b.innerHTML; b.innerHTML = 'Gerando…';
    try {
      const m = await import('../components/exportar.js');
      await (tipo === 'pdf' ? m.exportarPDF(atual) : m.exportarExcel(atual));
      toast(`${tipo === 'pdf' ? 'PDF' : 'Planilha'} gerado(a). Veja na pasta de downloads.`);
    } catch (e) { toast(traduzirErro(e), 'erro', 8000); }
    b.innerHTML = txt; b.disabled = false; icones();
  };
  el.querySelector('[data-pdf]').addEventListener('click', (e) => baixar('pdf', e.currentTarget));
  el.querySelector('[data-xlsx]').addEventListener('click', (e) => baixar('xlsx', e.currentTarget));
  el.querySelectorAll('#r-per, #r-ini, #r-fim, #r-lote, #r-cat').forEach((x) => x.addEventListener('change', gerar));
  await gerar();
}
