// =====================================================================
// MOVIMENTAÇÕES — histórico de entradas/saídas/trocas, compras e vendas
// =====================================================================
import { sb } from '../supabase.js';
import { store, pode, param, nomePasto } from '../store.js';
import { esc, icones, fmtData, fmtNum, fmtKg, fmtMoeda, hojeISO, addDias, montarTabela, vazio, erroCarga, baixarCSV, ROTULO_MOV } from '../ui.js';
import { listarAnimais } from '../components/animais-comum.js';
import { todos } from '../components/consulta.js';
import { abrirCompra, abrirVenda, abrirDetalheComercial } from '../components/comercial-forms.js';
import { abrirSaida } from '../components/saida.js';
import { abrirTransferencia } from '../components/transferencia.js';
import { arrobas } from '../components/desempenho.js';

const GRUPO = (t) => (t.startsWith('entrada') || t === 'cadastro' ? 'entrada' : t.startsWith('saida') ? 'saida' : t.startsWith('troca') ? 'troca' : 'outro');
const CLASSE = { entrada: 'sucesso', saida: 'perigo', troca: 'info', outro: 'inativo' };

export async function render(el) {
  const p = store.prop.id;
  const comercial = pode('comercial');
  let animais, movs, compras = [], vendas = [];
  try {
    const q = async (x) => { const { data, error } = await x; if (error) throw error; return data || []; };
    [animais, movs, compras, vendas] = await Promise.all([
      listarAnimais(),
      todos(() => sb.from('movimentacoes').select('*, movimentacao_animais(animal_id, peso_kg)').eq('propriedade_id', p).order('data_movimentacao', { ascending: false }).order('id'), 500),
      comercial ? q(sb.from('compras').select('*').eq('propriedade_id', p).order('data_compra', { ascending: false })) : [],
      comercial ? q(sb.from('vendas').select('*').eq('propriedade_id', p).order('data_venda', { ascending: false })) : [],
    ]);
  } catch (e) { el.innerHTML = erroCarga(e); icones(); return; }

  const hoje = hojeISO();
  const ini12 = addDias(hoje, -365);
  const porId = new Map(animais.map((a) => [a.id, a]));
  const lotes = new Map(store.base.lotes.map((l) => [l.id, l]));
  const pastos = new Map(store.base.pastos.map((x) => [x.id, x]));
  const recarregar = () => render(el).then(icones);
  const cab = (m) => (m.movimentacao_animais || []).length;
  const ult12 = movs.filter((m) => m.data_movimentacao >= ini12);
  const soma = (lista, f) => lista.reduce((s, m) => s + f(m), 0);
  const entradas = soma(ult12.filter((m) => ['entrada_nascimento', 'entrada_compra', 'entrada_outra'].includes(m.tipo)), cab);
  const saidas = soma(ult12.filter((m) => GRUPO(m.tipo) === 'saida'), cab);
  const mortes = soma(ult12.filter((m) => m.tipo === 'saida_morte'), cab);
  const vend12 = vendas.filter((v) => v.data_venda >= ini12);
  const comp12 = compras.filter((c) => c.data_compra >= ini12);

  const ABAS = [['historico', 'Histórico'], ...(comercial ? [['vendas', `Vendas (${vendas.length})`], ['compras', `Compras (${compras.length})`]] : [])];
  el.innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>Movimentações</h1><p>Entradas, saídas e trocas de pasto/lote de todos os animais${comercial ? ', com compras e vendas' : ''}.</p></div>
      <div class="acoes">
        ${comercial ? '<button class="btn btn-primario" data-venda><i data-lucide="hand-coins"></i> Registrar venda</button><button class="btn" data-compra><i data-lucide="shopping-cart"></i> Registrar compra</button>' : ''}
        ${pode('movimentacoes') ? '<button class="btn" data-saida><i data-lucide="log-out"></i> Outra saída</button><button class="btn" data-transf><i data-lucide="move"></i> Transferir</button>' : ''}
      </div>
    </div>
    <div class="grade grade-kpi" style="margin-bottom:18px">
      <div class="card kpi destaque"><span class="rotulo"><i data-lucide="log-in"></i>Entradas (12 meses)</span><span class="valor">${fmtNum(entradas)}</span><span class="detalhe">nascimentos, compras e outras</span></div>
      <div class="card kpi"><span class="rotulo"><i data-lucide="log-out"></i>Saídas (12 meses)</span><span class="valor">${fmtNum(saidas)}</span><span class="detalhe">${fmtNum(mortes)} morte(s)</span></div>
      ${comercial ? `<div class="card kpi"><span class="rotulo"><i data-lucide="hand-coins"></i>Vendido (12 meses)</span><span class="valor" style="font-size:1.3rem">${fmtMoeda(soma(vend12, (v) => Number(v.valor_total)))}</span><span class="detalhe">${fmtNum(soma(vend12, (v) => v.quantidade))} cabeça(s)</span></div>
      <div class="card kpi"><span class="rotulo"><i data-lucide="shopping-cart"></i>Comprado (12 meses)</span><span class="valor" style="font-size:1.3rem">${fmtMoeda(soma(comp12, (c) => Number(c.valor_total) + Number(c.frete) + Number(c.outras_despesas)))}</span><span class="detalhe">${fmtNum(soma(comp12, (c) => c.quantidade))} cabeça(s), com frete</span></div>` : ''}
    </div>
    <div class="abas" style="margin-top:0">${ABAS.map(([k, t]) => `<button class="aba" data-aba="${k}">${t}</button>`).join('')}</div>
    <div id="painel-mov"></div>`;
  el.querySelector('[data-venda]')?.addEventListener('click', () => abrirVenda({}, recarregar));
  el.querySelector('[data-compra]')?.addEventListener('click', () => abrirCompra(recarregar));
  el.querySelector('[data-saida]')?.addEventListener('click', () => abrirSaida(null, { tipo: 'saida_morte', aoSalvar: recarregar }));
  el.querySelector('[data-transf]')?.addEventListener('click', () => abrirTransferencia({}, recarregar));
  const painel = el.querySelector('#painel-mov');
  const mostrar = (k) => {
    el.querySelectorAll('.aba').forEach((x) => x.classList.toggle('ativa', x.dataset.aba === k));
    ({ historico: abaHistorico, vendas: abaVendas, compras: abaCompras })[k]();
    icones();
  };
  el.querySelector('.abas').addEventListener('click', (e) => { const x = e.target.closest('[data-aba]'); if (x) mostrar(x.dataset.aba); });

  function detalhe(m) {
    const partes = [];
    if (m.pasto_destino_id) partes.push(`Pasto ${nomePasto(pastos.get(m.pasto_destino_id))}`);
    if (m.lote_destino_id) partes.push(`Lote ${lotes.get(m.lote_destino_id)?.nome || ''}`);
    if (m.tipo === 'troca_pasto' && !m.pasto_destino_id) partes.push('Retirado do pasto');
    if (m.tipo === 'troca_lote' && !m.lote_destino_id) partes.push('Retirado do lote');
    if (m.motivo) partes.push(m.motivo);
    if (m.causa) partes.push(`Causa: ${m.causa}`);
    return partes.join(' · ');
  }

  function abaHistorico() {
    const brincos = (m) => (m.movimentacao_animais || []).map((x) => porId.get(x.animal_id)?.brinco || '?');
    const cols = [
      { chave: 'data_movimentacao', titulo: 'Data', primaria: true, render: (m) => `${fmtData(m.data_movimentacao)} <span class="badge ${CLASSE[GRUPO(m.tipo)]}">${esc(ROTULO_MOV[m.tipo] || m.tipo)}</span>`, csv: (m) => fmtData(m.data_movimentacao) },
      { chave: 'tipo', titulo: 'Tipo', valor: (m) => ROTULO_MOV[m.tipo], render: (m) => esc(ROTULO_MOV[m.tipo] || m.tipo), csv: (m) => ROTULO_MOV[m.tipo] },
      { chave: 'animais', titulo: 'Animais', valor: (m) => brincos(m).join(' '), render: (m) => { const b = brincos(m); const l = (m.movimentacao_animais || []).slice(0, 6); return `<b>${fmtNum(b.length)}</b> ${l.map((x) => `<a href="#/animais/${x.animal_id}">${esc(porId.get(x.animal_id)?.brinco || '?')}</a>`).join(', ')}${b.length > 6 ? '…' : ''}`; }, csv: (m) => brincos(m).join(', ') },
      { chave: 'detalhe', titulo: 'Destino / motivo', valor: detalhe, render: (m) => esc(detalhe(m) || '—'), csv: detalhe },
      { chave: 'resp', titulo: 'Responsável', render: (m) => esc(m.responsavel_nome || '—'), csv: (m) => m.responsavel_nome || '' },
    ];
    painel.innerHTML = `<div class="filtro-periodo">
        <select id="h-grupo" aria-label="Tipo"><option value="">Todas</option><option value="entrada">Entradas</option><option value="saida">Saídas</option><option value="troca">Trocas de pasto/lote</option>
          <optgroup label="Tipo específico">${Object.entries(ROTULO_MOV).map(([k, t]) => `<option value="t:${k}">${t}</option>`).join('')}</optgroup></select>
        <button class="btn btn-sm" id="h-csv" style="margin-left:auto"><i data-lucide="download"></i> Exportar CSV</button></div>
      <div class="card">${movs.length ? '<div id="t-mov"></div>' : vazio({ icone: 'arrow-left-right', titulo: 'Nenhuma movimentação registrada' })}</div>
      <p class="small muted">Movimentações são registros históricos e não podem ser alteradas. Para desfazer um engano de status, use "Corrigir status" na ficha do animal (somente proprietário).</p>`;
    if (!movs.length) return;
    const filtradas = () => {
      const v = painel.querySelector('#h-grupo').value;
      return movs.filter((m) => !v || (v.startsWith('t:') ? m.tipo === v.slice(2) : GRUPO(m.tipo) === v));
    };
    const t = montarTabela(painel.querySelector('#t-mov'), { colunas: cols, linhas: movs });
    painel.querySelector('#h-grupo').addEventListener('change', () => t.atualizar(filtradas()));
    painel.querySelector('#h-csv').addEventListener('click', () => baixarCSV(`movimentacoes-${hoje}.csv`, cols, filtradas()));
  }

  const rend = { rendimentoPct: Number(param('rendimento_carcaca_pct')), pesoArroba: Number(param('peso_arroba_kg')) };
  function abaVendas() {
    const arr = (v) => arrobas(Number(v.peso_total_kg) || null, { base: v.base_peso, ...rend });
    const liquido = (v) => Number(v.valor_total) - Number(v.frete) - Number(v.despesas_adicionais);
    const cols = [
      { chave: 'data_venda', titulo: 'Data', primaria: true, render: (v) => fmtData(v.data_venda), csv: (v) => fmtData(v.data_venda) },
      { chave: 'comprador', titulo: 'Comprador', render: (v) => `<b>${esc(v.comprador)}</b>`, csv: (v) => v.comprador },
      { chave: 'quantidade', titulo: 'Cabeças', classe: 'dir', csv: (v) => v.quantidade },
      { chave: 'peso', titulo: 'Peso', classe: 'dir', valor: (v) => Number(v.peso_total_kg) || null, render: (v) => (v.peso_total_kg ? `${fmtKg(v.peso_total_kg)} <span class="small muted">${v.base_peso === 'carcaca' ? 'carcaça' : 'vivo'}</span>` : '—'), csv: (v) => v.peso_total_kg ?? '' },
      { chave: 'arrobas', titulo: '@', classe: 'dir', valor: arr, render: (v) => (arr(v) ? fmtNum(arr(v), 1) : '—'), csv: (v) => (arr(v) ? arr(v).toFixed(2) : '') },
      { chave: 'valor_arroba', titulo: 'R$/@', classe: 'dir', valor: (v) => Number(v.valor_arroba) || null, render: (v) => (v.valor_arroba ? fmtMoeda(v.valor_arroba) : '—'), csv: (v) => v.valor_arroba ?? '' },
      { chave: 'valor_total', titulo: 'Valor bruto', classe: 'dir', valor: (v) => Number(v.valor_total), render: (v) => `<b>${fmtMoeda(v.valor_total)}</b>`, csv: (v) => v.valor_total },
      { chave: 'cab', titulo: 'Por cabeça', classe: 'dir', valor: (v) => v.valor_total / v.quantidade, render: (v) => fmtMoeda(v.valor_total / v.quantidade), csv: (v) => (v.valor_total / v.quantidade).toFixed(2) },
      { chave: 'liq', titulo: 'Líquido', classe: 'dir', valor: liquido, render: (v) => fmtMoeda(liquido(v)), csv: (v) => liquido(v).toFixed(2) },
      { chave: 'docs', titulo: 'NF / GTA', render: (v) => esc([v.nota_fiscal && `NF ${v.nota_fiscal}`, v.gta && `GTA ${v.gta}`].filter(Boolean).join(' · ') || '—'), csv: (v) => [v.nota_fiscal, v.gta].filter(Boolean).join(' / ') },
    ];
    painel.innerHTML = `<div class="filtro-periodo"><span class="muted small">Toque em uma venda para ver os animais, anexar NF/GTA e conferir o financeiro.</span><button class="btn btn-sm" id="v-csv" style="margin-left:auto"><i data-lucide="download"></i> Exportar CSV</button></div>
      <div class="card">${vendas.length ? '<div id="t-vendas"></div>' : vazio({ icone: 'hand-coins', titulo: 'Nenhuma venda registrada', texto: 'Ao registrar uma venda, os animais saem do rebanho ativo, o peso de saída fica no histórico e a receita pode ir direto para o financeiro.', acao: '<button class="btn btn-primario" data-nv>Registrar venda</button>' })}</div>`;
    painel.querySelector('[data-nv]')?.addEventListener('click', () => abrirVenda({}, recarregar));
    painel.querySelector('#v-csv').addEventListener('click', () => baixarCSV(`vendas-${hoje}.csv`, cols, vendas));
    if (vendas.length) montarTabela(painel.querySelector('#t-vendas'), { colunas: cols, linhas: vendas, aoClicar: (id) => abrirDetalheComercial('venda', vendas.find((v) => v.id === id), recarregar) });
  }

  function abaCompras() {
    const custo = (c) => Number(c.valor_total) + Number(c.frete) + Number(c.outras_despesas);
    const arr = (c) => arrobas(Number(c.peso_total_kg) || null, { base: 'vivo', ...rend });
    const cols = [
      { chave: 'data_compra', titulo: 'Data', primaria: true, render: (c) => fmtData(c.data_compra), csv: (c) => fmtData(c.data_compra) },
      { chave: 'fornecedor', titulo: 'Vendedor', render: (c) => `<b>${esc(c.fornecedor)}</b>`, csv: (c) => c.fornecedor },
      { chave: 'quantidade', titulo: 'Cabeças', classe: 'dir', csv: (c) => c.quantidade },
      { chave: 'peso', titulo: 'Peso vivo', classe: 'dir', valor: (c) => Number(c.peso_total_kg) || null, render: (c) => (c.peso_total_kg ? fmtKg(c.peso_total_kg) : '—'), csv: (c) => c.peso_total_kg ?? '' },
      { chave: 'valor_arroba', titulo: 'R$/@', classe: 'dir', valor: (c) => Number(c.valor_arroba) || null, render: (c) => (c.valor_arroba ? fmtMoeda(c.valor_arroba) : '—'), csv: (c) => c.valor_arroba ?? '' },
      { chave: 'valor_total', titulo: 'Valor dos animais', classe: 'dir', valor: (c) => Number(c.valor_total), render: (c) => fmtMoeda(c.valor_total), csv: (c) => c.valor_total },
      { chave: 'custo', titulo: 'Custo total', classe: 'dir', valor: custo, render: (c) => `<b>${fmtMoeda(custo(c))}</b>`, csv: (c) => custo(c).toFixed(2) },
      { chave: 'cab', titulo: 'Custo/cabeça', classe: 'dir', valor: (c) => custo(c) / c.quantidade, render: (c) => fmtMoeda(custo(c) / c.quantidade), csv: (c) => (custo(c) / c.quantidade).toFixed(2) },
      { chave: 'arr', titulo: 'Custo/@', classe: 'dir', valor: (c) => (arr(c) ? custo(c) / arr(c) : null), render: (c) => (arr(c) ? fmtMoeda(custo(c) / arr(c)) : '—'), csv: (c) => (arr(c) ? (custo(c) / arr(c)).toFixed(2) : '') },
      { chave: 'docs', titulo: 'NF / GTA', render: (c) => esc([c.nota_fiscal && `NF ${c.nota_fiscal}`, c.gta && `GTA ${c.gta}`].filter(Boolean).join(' · ') || '—'), csv: (c) => [c.nota_fiscal, c.gta].filter(Boolean).join(' / ') },
    ];
    painel.innerHTML = `<div class="filtro-periodo"><span class="muted small">Toque em uma compra para ver os animais e anexar documentos.</span><button class="btn btn-sm" id="c-csv" style="margin-left:auto"><i data-lucide="download"></i> Exportar CSV</button></div>
      <div class="card">${compras.length ? '<div id="t-compras"></div>' : vazio({ icone: 'shopping-cart', titulo: 'Nenhuma compra registrada', texto: 'Ao registrar uma compra, cada animal é cadastrado no rebanho com o custo de aquisição, o peso de chegada e a movimentação de entrada.', acao: '<button class="btn btn-primario" data-nc>Registrar compra</button>' })}</div>`;
    painel.querySelector('[data-nc]')?.addEventListener('click', () => abrirCompra(recarregar));
    painel.querySelector('#c-csv').addEventListener('click', () => baixarCSV(`compras-${hoje}.csv`, cols, compras));
    if (compras.length) montarTabela(painel.querySelector('#t-compras'), { colunas: cols, linhas: compras, aoClicar: (id) => abrirDetalheComercial('compra', compras.find((c) => c.id === id), recarregar) });
  }

  mostrar('historico');
}
