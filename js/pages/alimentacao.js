// =====================================================================
// ALIMENTAÇÃO E SUPLEMENTAÇÃO — produtos, estoque, fornecimentos e consumo
// =====================================================================
import { sb } from '../supabase.js';
import { store, pode, nomePasto } from '../store.js';
import { esc, icones, fmtData, fmtNum, fmtMoeda, hojeISO, montarTabela, vazio, erroCarga, baixarCSV, ultimosMeses, rotuloMes } from '../ui.js';
import { grafico, CORES, semDados } from '../components/graficos.js';
import { abrirMovEstoque } from '../components/sanidade-forms.js';
import * as F from '../components/alimentacao-forms.js';

const porDia = (porCab, mes, un) => {
  const d = porCab / new Date(Number(mes.slice(0, 4)), Number(mes.slice(5)), 0).getDate();
  return un.toLowerCase() === 'kg' ? `${fmtNum(d * 1000, 0)} g/cab/dia` : `${fmtNum(d, 3)} ${esc(un)}/cab/dia`;
};
const ABAS = [['estoque', 'Produtos e estoque'], ['fornecimentos', 'Fornecimentos'], ['consumo', 'Consumo e custos']];

export async function render(el) {
  const p = store.prop.id;
  let produtos, fornec;
  try {
    const q = async (x) => { const { data, error } = await x; if (error) throw error; return data || []; };
    [produtos, fornec] = await Promise.all([
      q(sb.from('vw_estoque_suplementos').select('*').eq('propriedade_id', p).order('nome')),
      q(sb.from('fornecimentos').select('*').eq('propriedade_id', p).order('data_fornecimento', { ascending: false }).range(0, 9999)),
    ]);
  } catch (e) { el.innerHTML = erroCarga(e); icones(); return; }

  const editar = pode('suplementacao');
  const prods = new Map(produtos.map((x) => [x.id, x]));
  const lotes = new Map(store.base.lotes.map((l) => [l.id, l]));
  const pastos = new Map(store.base.pastos.map((x) => [x.id, x]));
  const destino = (f) => (f.lote_id ? `Lote ${lotes.get(f.lote_id)?.nome || ''}` : f.pasto_id ? `Pasto ${nomePasto(pastos.get(f.pasto_id))}` : 'Animais escolhidos');
  const hoje = hojeISO();
  const mesAtual = hoje.slice(0, 7);
  const recarregar = () => render(el).then(icones);
  const baixos = produtos.filter((x) => x.ativo && Number(x.estoque_minimo) > 0 && Number(x.saldo) <= Number(x.estoque_minimo));
  const doMes = fornec.filter((f) => f.data_fornecimento.startsWith(mesAtual));

  el.innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>Alimentação e suplementação</h1><p>As quantidades são as registradas pela equipe; o sistema não presume consumo nem dose ideal.</p></div>
      ${editar ? '<div class="acoes"><button class="btn btn-primario" data-forn><i data-lucide="wheat"></i> Registrar fornecimento</button><button class="btn" data-np><i data-lucide="plus"></i> Produto</button></div>' : ''}
    </div>
    ${baixos.length ? `<div class="alerta perigo" style="margin-bottom:16px"><i data-lucide="package-open"></i><div><b>Estoque baixo:</b> ${baixos.map((x) => `${esc(x.nome)} (${fmtNum(x.saldo, 1)} ${esc(x.unidade)})`).join(', ')}</div></div>` : ''}
    <div class="grade grade-kpi" style="margin-bottom:18px">
      <div class="card kpi destaque"><span class="rotulo"><i data-lucide="package"></i>Produtos ativos</span><span class="valor">${fmtNum(produtos.filter((x) => x.ativo).length)}</span></div>
      <div class="card kpi"><span class="rotulo"><i data-lucide="package-open"></i>Com estoque baixo</span><span class="valor">${fmtNum(baixos.length)}</span></div>
      <div class="card kpi"><span class="rotulo"><i data-lucide="wheat"></i>Fornecimentos no mês</span><span class="valor">${fmtNum(doMes.length)}</span></div>
      <div class="card kpi"><span class="rotulo"><i data-lucide="wallet"></i>Custo no mês</span><span class="valor" style="font-size:1.3rem">${fmtMoeda(doMes.reduce((s, f) => s + Number(f.custo || 0), 0))}</span><span class="detalhe">fornecimentos com custo</span></div>
    </div>
    <div class="abas" style="margin-top:0">${ABAS.map(([k, t]) => `<button class="aba" data-aba="${k}">${t}</button>`).join('')}</div>
    <div id="painel-ali"></div>`;
  el.querySelector('[data-forn]')?.addEventListener('click', () => F.abrirFornecimento({}, recarregar));
  el.querySelector('[data-np]')?.addEventListener('click', () => F.abrirProdutoSupl(null, recarregar));
  const painel = el.querySelector('#painel-ali');
  const mostrar = (k) => {
    el.querySelectorAll('.aba').forEach((x) => x.classList.toggle('ativa', x.dataset.aba === k));
    ({ estoque: abaEstoque, fornecimentos: abaFornec, consumo: abaConsumo })[k]();
    icones();
  };
  el.querySelector('.abas').addEventListener('click', (e) => { const x = e.target.closest('[data-aba]'); if (x) mostrar(x.dataset.aba); });

  function abaEstoque() {
    painel.innerHTML = `<div class="card">${produtos.length ? '<div id="t-est"></div>' : vazio({ icone: 'package', titulo: 'Nenhum produto cadastrado', texto: 'Cadastre sal mineral, proteinados, energéticos e rações com unidade, estoque mínimo e preço.', acao: editar ? '<button class="btn btn-primario" data-n>Cadastrar produto</button>' : '' })}</div>
      <p class="small muted">Saldo = entradas − fornecimentos registrados ± ajustes de contagem.</p>`;
    painel.querySelector('[data-n]')?.addEventListener('click', () => F.abrirProdutoSupl(null, recarregar));
    if (!produtos.length) return;
    montarTabela(painel.querySelector('#t-est'), {
      colunas: [
        { chave: 'nome', titulo: 'Produto', primaria: true, render: (x) => `<b>${esc(x.nome)}</b>${!x.ativo ? ' <span class="badge inativo">inativo</span>' : ''}<div class="small muted">${esc([F.TIPOS_SUPL[x.tipo], x.fabricante].filter(Boolean).join(' · '))}</div>` },
        { chave: 'saldo', titulo: 'Estoque', classe: 'dir', valor: (x) => Number(x.saldo), render: (x) => `<b>${fmtNum(x.saldo, 2)}</b> ${esc(x.unidade)}${Number(x.estoque_minimo) > 0 && Number(x.saldo) <= Number(x.estoque_minimo) ? ' <span class="badge perigo">baixo</span>' : ''}` },
        { chave: 'estoque_minimo', titulo: 'Mínimo', classe: 'dir', render: (x) => (Number(x.estoque_minimo) ? `${fmtNum(x.estoque_minimo, 2)} ${esc(x.unidade)}` : '—') },
        { chave: 'preco_compra', titulo: 'Preço', classe: 'dir', valor: (x) => (x.preco_compra ? Number(x.preco_compra) : null), render: (x) => (x.preco_compra ? `${fmtMoeda(x.preco_compra)}/${esc(x.unidade)}` : '—') },
        { chave: 'valor', titulo: 'Valor em estoque', classe: 'dir', valor: (x) => (x.preco_compra ? x.saldo * x.preco_compra : null), render: (x) => (x.preco_compra && Number(x.saldo) > 0 ? fmtMoeda(x.saldo * x.preco_compra) : '—') },
        { chave: 'validade', titulo: 'Validade', render: (x) => (x.validade ? `${fmtData(x.validade)}${x.validade < hoje ? ' <span class="badge perigo">vencido</span>' : ''}` : '—') },
        { chave: 'fornecedor', titulo: 'Fornecedor', render: (x) => esc(x.fornecedor || '—') },
        ...(editar ? [{ chave: 'acoes', titulo: '', render: (x) => `<span class="acoes"><button class="btn btn-sm" data-ent="${x.id}">Entrada</button><button class="btn btn-sm" data-aj="${x.id}">Ajuste</button></span>` }] : []),
      ],
      linhas: produtos,
      aoClicar: editar ? (id) => F.abrirProdutoSupl(produtos.find((x) => x.id === id), recarregar) : null,
    });
    painel.querySelector('#t-est').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ent],[data-aj]'); if (!b) return;
      abrirMovEstoque({ produto: prods.get(b.dataset.ent || b.dataset.aj), tipoProduto: 'suplemento', modo: b.dataset.ent ? 'entrada' : 'ajuste' }, recarregar);
    });
  }

  function abaFornec() {
    const cols = [
      { chave: 'data_fornecimento', titulo: 'Data', primaria: true, render: (f) => fmtData(f.data_fornecimento), csv: (f) => fmtData(f.data_fornecimento) },
      { chave: 'produto', titulo: 'Produto', valor: (f) => prods.get(f.produto_id)?.nome, render: (f) => esc(prods.get(f.produto_id)?.nome || '—'), csv: (f) => prods.get(f.produto_id)?.nome },
      { chave: 'quantidade', titulo: 'Quantidade', classe: 'dir', valor: (f) => Number(f.quantidade), render: (f) => `${fmtNum(f.quantidade, 2)} ${esc(prods.get(f.produto_id)?.unidade || '')}`, csv: (f) => f.quantidade },
      { chave: 'destino', titulo: 'Para', valor: destino, render: (f) => esc(destino(f)), csv: destino },
      { chave: 'num_cabecas', titulo: 'Cabeças', classe: 'dir', render: (f) => fmtNum(f.num_cabecas), csv: (f) => f.num_cabecas },
      { chave: 'porcab', titulo: 'Por cabeça', classe: 'dir', valor: (f) => (f.num_cabecas ? f.quantidade / f.num_cabecas : null), render: (f) => (f.num_cabecas ? `${fmtNum(f.quantidade / f.num_cabecas, 3)} ${esc(prods.get(f.produto_id)?.unidade || '')}` : '—'), csv: (f) => (f.num_cabecas ? (f.quantidade / f.num_cabecas).toFixed(3) : '') },
      { chave: 'custo', titulo: 'Custo', classe: 'dir', valor: (f) => (f.custo ? Number(f.custo) : null), render: (f) => (f.custo ? fmtMoeda(f.custo) : '—'), csv: (f) => f.custo ?? '' },
      { chave: 'resp', titulo: 'Responsável', render: (f) => esc(f.responsavel_nome || '—'), csv: (f) => f.responsavel_nome || '' },
    ];
    painel.innerHTML = `<div class="acoes" style="margin-bottom:10px"><button class="btn btn-sm" id="f-csv"><i data-lucide="download"></i> Exportar CSV</button></div>
      <div class="card">${fornec.length ? '<div id="t-forn"></div>' : vazio({ icone: 'wheat', titulo: 'Nenhum fornecimento registrado', texto: 'Registre cada abastecimento de cocho ou trato informando produto, quantidade e lote/pasto atendido.' })}</div>`;
    if (fornec.length) montarTabela(painel.querySelector('#t-forn'), { colunas: cols, linhas: fornec });
    painel.querySelector('#f-csv').addEventListener('click', () => baixarCSV(`fornecimentos-${hoje}.csv`, cols, fornec));
  }

  function abaConsumo() {
    const meses = ultimosMeses(12);
    const ativosP = produtos.filter((x) => fornec.some((f) => f.produto_id === x.id));
    // Consumo por cabeça no mês = soma de (quantidade ÷ cabeças) de cada fornecimento do mês
    const porMes = (filtro, fn) => meses.map((m) => fornec.filter((f) => f.data_fornecimento.startsWith(m) && filtro(f)).reduce((s, f) => s + fn(f), 0));
    const linhasMes = meses.slice().reverse().map((m) => {
      const lista = fornec.filter((f) => f.data_fornecimento.startsWith(m));
      return { mes: m, n: lista.length, custo: lista.reduce((s, f) => s + Number(f.custo || 0), 0),
        porProduto: ativosP.map((x) => { const l = lista.filter((f) => f.produto_id === x.id); return { x, qtd: l.reduce((s, f) => s + Number(f.quantidade), 0), cab: l.reduce((s, f) => s + (f.num_cabecas ? f.quantidade / f.num_cabecas : 0), 0) }; }) };
    }).filter((l) => l.n);
    const porLote = {};
    fornec.filter((f) => f.data_fornecimento >= `${meses[0]}-01`).forEach((f) => {
      const k = `${destino(f)}|${f.produto_id}`;
      porLote[k] ||= { destino: destino(f), x: prods.get(f.produto_id), qtd: 0, custo: 0, n: 0 };
      porLote[k].qtd += Number(f.quantidade); porLote[k].custo += Number(f.custo || 0); porLote[k].n++;
    });
    painel.innerHTML = `
      <div class="grade grade-2">
        <div class="card"><div class="card-titulo"><h3>Consumo mensal por produto</h3></div><div class="grafico" id="w-cons"><canvas id="g-cons"></canvas></div></div>
        <div class="card"><div class="card-titulo"><h3>Custo mensal</h3></div><div class="grafico" id="w-custo"><canvas id="g-custo"></canvas></div></div>
      </div>
      <section class="secao"><h2>Resumo por mês</h2><div class="card">${linhasMes.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Mês</th><th>Produto</th><th class="dir">Consumo total</th><th class="dir">Consumo por cabeça (estimado)</th><th class="dir">Custo do mês</th></tr></thead><tbody>
        ${linhasMes.map((l) => l.porProduto.filter((pp) => pp.qtd).map((pp, i) => `<tr><td>${i === 0 ? `<b>${rotuloMes(l.mes)}</b>` : ''}</td><td>${esc(pp.x.nome)}</td>
          <td class="dir">${fmtNum(pp.qtd, 2)} ${esc(pp.x.unidade)}</td><td class="dir">${pp.cab ? `${fmtNum(pp.cab, 3)} ${esc(pp.x.unidade)}/cab · ${porDia(pp.cab, l.mes, pp.x.unidade)}` : '—'}</td>
          <td class="dir">${i === 0 ? fmtMoeda(l.custo) : ''}</td></tr>`).join('')).join('')}</tbody></table></div>` : vazio({ icone: 'wheat', titulo: 'Sem fornecimentos nos últimos 12 meses' })}</div>
        <p class="small muted">Consumo por cabeça (estimado) = soma, em cada fornecimento do mês, da quantidade ÷ número de cabeças atendidas. É uma estimativa baseada nos registros, não uma medição individual. O valor por dia divide pelo número de dias do mês.</p></section>
      <section class="secao"><h2>Consumo por lote / pasto (últimos 12 meses)</h2><div class="card">${Object.keys(porLote).length ? '<div id="t-lote"></div>' : vazio({ icone: 'layers', titulo: 'Sem dados' })}</div></section>`;
    if (Object.keys(porLote).length) {
      montarTabela(painel.querySelector('#t-lote'), {
        colunas: [
          { chave: 'destino', titulo: 'Lote / pasto', primaria: true },
          { chave: 'produto', titulo: 'Produto', valor: (l) => l.x?.nome, render: (l) => esc(l.x?.nome || '—') },
          { chave: 'n', titulo: 'Fornecimentos', classe: 'dir' },
          { chave: 'qtd', titulo: 'Total', classe: 'dir', render: (l) => `${fmtNum(l.qtd, 2)} ${esc(l.x?.unidade || '')}` },
          { chave: 'custo', titulo: 'Custo', classe: 'dir', render: (l) => (l.custo ? fmtMoeda(l.custo) : '—') },
        ],
        linhas: Object.values(porLote), idLinha: (l) => `${l.destino}${l.x?.id}`, busca: false,
      });
    }
    if (ativosP.length) {
      grafico(painel.querySelector('#g-cons'), { type: 'bar', data: { labels: meses.map(rotuloMes), datasets: ativosP.map((x, i) => ({ label: `${x.nome} (${x.unidade})`, data: porMes((f) => f.produto_id === x.id, (f) => Number(f.quantidade)), backgroundColor: CORES[i % CORES.length], borderRadius: 3 })) },
        options: { plugins: { legend: { display: true, position: 'bottom' } }, scales: { x: { stacked: false, grid: { display: false } }, y: { beginAtZero: true } } } });
      grafico(painel.querySelector('#g-custo'), { type: 'bar', data: { labels: meses.map(rotuloMes), datasets: [{ label: 'Custo (R$)', data: porMes(() => true, (f) => Number(f.custo || 0)), backgroundColor: CORES[2], borderRadius: 4 }] },
        options: { scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: (v) => fmtMoeda(v) } } } } });
    } else {
      painel.querySelector('#w-cons').innerHTML = semDados('Nenhum fornecimento registrado.');
      painel.querySelector('#w-custo').innerHTML = semDados('Nenhum fornecimento registrado.');
    }
  }

  mostrar('estoque');
}
