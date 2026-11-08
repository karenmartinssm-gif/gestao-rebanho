// =====================================================================
// COMPRAS E VENDAS de animais (exigem internet: alteram o rebanho e valores)
// =====================================================================
import { sb, BUCKET } from '../supabase.js';
import { store, pode, param, nomePasto } from '../store.js';
import {
  esc, abrirModal, toast, traduzirErro, hojeISO, fmtKg, fmtData, fmtNum, fmtMoeda, numOuNulo, textoOuNulo,
  opcoes, icones, confirmar, ativarWizard, comprimirImagem,
} from '../ui.js';
import { exigirConexao } from '../sync.js';
import { listarAnimais } from './animais-comum.js';
import { arrobas } from './desempenho.js';

export const FORMAS_PAGAMENTO = ['Pix', 'Transferência', 'Boleto', 'Dinheiro', 'Cheque', 'Cartão', 'A prazo', 'Outra'];
const opFormas = (sel) => `<option value="">—</option>${FORMAS_PAGAMENTO.map((f) => `<option ${f === sel ? 'selected' : ''}>${f}</option>`).join('')}`;
const rend = () => ({ rendimentoPct: Number(param('rendimento_carcaca_pct')), pesoArroba: Number(param('peso_arroba_kg')) });
const ehCelular = () => window.matchMedia('(max-width: 720px)').matches;

/** Próximo brinco de uma sequência: "C-098" → "C-099"; "A" → null. */
function sequencia(inicial, n) {
  const m = String(inicial).trim().match(/^(.*?)(\d+)$/);
  if (!m) return null;
  const [, pre, num] = m;
  return Array.from({ length: n }, (_, i) => `${pre}${String(Number(num) + i).padStart(num.length, '0')}`);
}

// ---------------------------------------------------------------------
// COMPRA
// ---------------------------------------------------------------------
export function abrirCompra(aoSalvar) {
  if (!pode('comercial')) return toast('Você não tem permissão para registrar compras.', 'erro');
  try { exigirConexao(); } catch (e) { return toast(e.message, 'aviso', 7000); }
  const cats = store.base.categorias.filter((c) => c.ativo !== false);
  if (!cats.length) return toast('Cadastre as categorias de animais em Configurações antes de registrar uma compra.', 'aviso', 7000);
  const racas = store.base.racas.filter((r) => r.ativo !== false);
  const linhas = [];
  const fin = pode('financeiro');

  const { el, fechar } = abrirModal({
    titulo: 'Registrar compra de animais',
    largo: true,
    html: `<form id="f-compra" class="grade" style="gap:6px">
      <fieldset class="etapa-form"><legend><i data-lucide="file-text"></i> Dados da compra</legend><div class="form-grade">
        <div class="campo"><label for="c-data">Data da compra <span class="obrig">*</span></label><input id="c-data" type="date" required max="${hojeISO()}" value="${hojeISO()}"></div>
        <div class="campo"><label for="c-forn">Vendedor / fornecedor <span class="obrig">*</span></label><input id="c-forn" required></div>
        <div class="campo"><label for="c-nf">Nota fiscal</label><input id="c-nf"></div>
        <div class="campo"><label for="c-gta">GTA</label><input id="c-gta"></div>
        <div class="campo"><label for="c-pasto">Vão para o pasto</label><select id="c-pasto">${opcoes(store.base.pastos.filter((x) => x.ativo), { rotulo: nomePasto, vazio: 'Sem pasto definido' })}</select></div>
        <div class="campo"><label for="c-lote">Lote</label><select id="c-lote">${opcoes(store.base.lotes.filter((x) => x.ativo), { vazio: 'Sem lote' })}</select></div>
        <div class="campo"><label for="c-resp">Responsável</label><input id="c-resp" value="${esc(store.perfil?.nome || '')}"></div>
        <div class="campo"><label for="c-obs">Observações</label><input id="c-obs"></div>
      </div></fieldset>
      <fieldset class="etapa-form"><legend><i data-lucide="tag"></i> Animais comprados</legend>
        <div class="card card-corpo" style="background:var(--fundo);margin-bottom:12px"><p class="small" style="margin:0 0 10px"><b>Gerar a lista de uma vez</b> (depois dá para ajustar animal por animal):</p>
          <div class="form-grade">
            <div class="campo"><label for="g-qtd">Quantidade</label><input id="g-qtd" inputmode="numeric" placeholder="Ex.: 20"></div>
            <div class="campo"><label for="g-brinco">Primeiro brinco</label><input id="g-brinco" placeholder="Ex.: C-001"><span class="ajuda">Os próximos seguem a numeração.</span></div>
            <div class="campo"><label for="g-sexo">Sexo</label><select id="g-sexo"><option value="M">Macho</option><option value="F">Fêmea</option></select></div>
            <div class="campo"><label for="g-cat">Categoria</label><select id="g-cat">${opcoes(cats, { vazio: null })}</select></div>
            <div class="campo"><label for="g-raca">Raça</label><select id="g-raca">${opcoes(racas, { vazio: '—', selecionado: racas[0]?.id })}</select></div>
            <div class="campo"><label for="g-nasc">Nascimento (aproximado)</label><input id="g-nasc" type="date" max="${hojeISO()}"></div>
          </div>
          <button type="button" class="btn" id="g-gerar"><i data-lucide="list-plus"></i> Gerar lista</button></div>
        <div class="tabela-wrap"><table class="tabela responsiva tabela-pesagem"><thead><tr><th>Brinco *</th><th>Sexo</th><th>Categoria</th><th class="dir">Peso na chegada (kg)</th><th>Nascimento</th><th></th></tr></thead><tbody id="c-linhas"></tbody></table></div>
        <button type="button" class="btn btn-sm" id="c-add" style="margin-top:8px"><i data-lucide="plus"></i> Adicionar animal</button>
        <p class="small muted" id="c-cont" style="margin:8px 0 0"></p>
      </fieldset>
      <fieldset class="etapa-form"><legend><i data-lucide="wallet"></i> Valores</legend><div class="form-grade">
        <div class="campo"><label for="c-peso">Peso total (kg)</label><input id="c-peso" inputmode="decimal"><span class="ajuda" id="c-peso-info"></span></div>
        <div class="campo"><label for="c-arroba">Valor por @ (R$)</label><input id="c-arroba" inputmode="decimal"><span class="ajuda" id="c-arroba-info"></span></div>
        <div class="campo"><label for="c-valor">Valor dos animais (R$) <span class="obrig">*</span></label><input id="c-valor" inputmode="decimal" required><span class="ajuda" id="c-valor-info"></span></div>
        <div class="campo"><label for="c-frete">Frete (R$)</label><input id="c-frete" inputmode="decimal"></div>
        <div class="campo"><label for="c-outras">Outras despesas (R$)</label><input id="c-outras" inputmode="decimal" placeholder="Comissão, taxas, GTA…"></div>
      </div>
      <div class="alerta" id="c-resumo"><i data-lucide="calculator"></i><div></div></div>
      ${fin ? `<div class="campo" style="margin-top:12px"><label class="check"><input type="checkbox" id="c-fin" checked> Lançar como despesa no financeiro</label></div>
        <div class="form-grade" id="c-fin-c"><div class="campo"><label for="c-sit">Situação</label><select id="c-sit"><option value="realizado">Pago</option><option value="estimado">A pagar</option></select></div>
        <div class="campo"><label for="c-forma">Forma de pagamento</label><select id="c-forma">${opFormas()}</select></div></div>` : ''}
      </fieldset>
      <div class="form-rodape"></div>
    </form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-compra">Registrar compra</button>',
  });
  const f = el.querySelector('form');
  const $ = (s) => f.querySelector(s);
  const novaLinha = (o = {}) => ({ brinco: '', sexo: $('#g-sexo').value, categoria_id: $('#g-cat').value, raca_id: $('#g-raca').value || null, data_nascimento: $('#g-nasc').value || '', peso: '', ...o });
  const optsCat = (sel) => cats.map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');

  const totais = () => {
    const pesos = linhas.map((l) => numOuNulo(l.peso)).filter((v) => v);
    return { n: linhas.length, comPeso: pesos.length, soma: pesos.reduce((s, v) => s + v, 0) };
  };
  const resumo = () => {
    const t = totais();
    $('#c-cont').textContent = `${t.n} animal(is) na lista${t.comPeso ? ` · ${t.comPeso} com peso (soma ${fmtKg(t.soma)})` : ''}`;
    $('#c-peso').placeholder = t.comPeso === t.n && t.n ? fmtNum(t.soma, 1) : '';
    $('#c-peso-info').textContent = t.comPeso === t.n && t.n ? 'Se vazio, usa a soma dos pesos da lista.' : '';
    const peso = numOuNulo($('#c-peso').value) || (t.comPeso === t.n ? t.soma : null);
    const arr = arrobas(peso, { base: 'vivo', ...rend() });
    const vArr = numOuNulo($('#c-arroba').value);
    $('#c-arroba-info').textContent = arr ? `${fmtNum(arr, 2)} @ (peso vivo × ${fmtNum(rend().rendimentoPct)}% ÷ ${fmtNum(rend().pesoArroba)} kg)` : 'Informe o peso para calcular as arrobas.';
    $('#c-valor-info').innerHTML = arr && vArr ? `Pela @: <a href="#" id="c-usar">${fmtMoeda(arr * vArr)}</a> (toque para usar)` : '';
    const valor = numOuNulo($('#c-valor').value) || 0;
    const custo = valor + (numOuNulo($('#c-frete').value) || 0) + (numOuNulo($('#c-outras').value) || 0);
    $('#c-resumo div').innerHTML = `Custo total: <b>${fmtMoeda(custo)}</b>${t.n ? ` · por cabeça <b>${fmtMoeda(custo / t.n)}</b>` : ''}${peso ? ` · por kg ${fmtMoeda(custo / peso)}` : ''}${arr ? ` · por @ ${fmtMoeda(custo / arr)}` : ''}
      <div class="small muted">O custo de cada animal (valor + frete + outras) é dividido ${t.comPeso === t.n && t.n ? 'proporcionalmente ao peso' : 'igualmente entre os animais'} e fica gravado na ficha.</div>`;
  };
  const desenhar = () => {
    $('#c-linhas').innerHTML = linhas.length ? linhas.map((l, i) => `<tr data-i="${i}">
      <td data-rotulo="Brinco" class="primaria"><input data-k="brinco" value="${esc(l.brinco)}" required aria-label="Brinco" style="min-width:90px"></td>
      <td data-rotulo="Sexo"><select data-k="sexo"><option value="M" ${l.sexo === 'M' ? 'selected' : ''}>M</option><option value="F" ${l.sexo === 'F' ? 'selected' : ''}>F</option></select></td>
      <td data-rotulo="Categoria"><select data-k="categoria_id">${optsCat(l.categoria_id)}</select></td>
      <td data-rotulo="Peso (kg)" class="dir"><input data-k="peso" inputmode="decimal" value="${esc(l.peso)}" style="max-width:110px;text-align:right" aria-label="Peso"></td>
      <td data-rotulo="Nascimento"><input data-k="data_nascimento" type="date" max="${hojeISO()}" value="${esc(l.data_nascimento)}"></td>
      <td><button type="button" class="btn btn-sm btn-texto" data-rem="${i}" title="Remover"><i data-lucide="trash-2"></i></button></td></tr>`).join('')
      : '<tr><td colspan="6" style="display:table-cell"><span class="muted">Nenhum animal ainda. Gere a lista acima ou adicione um por um.</span></td></tr>';
    icones(); resumo();
  };
  $('#c-linhas').addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-i]'); const k = e.target.dataset.k; if (!tr || !k) return;
    linhas[Number(tr.dataset.i)][k] = e.target.value; resumo();
  });
  $('#c-linhas').addEventListener('click', (e) => { const b = e.target.closest('[data-rem]'); if (b) { linhas.splice(Number(b.dataset.rem), 1); desenhar(); } });
  $('#c-add').addEventListener('click', () => {
    const ult = linhas[linhas.length - 1];
    const prox = ult ? sequencia(ult.brinco, 2)?.[1] || '' : '';
    linhas.push(novaLinha(ult ? { sexo: ult.sexo, categoria_id: ult.categoria_id, raca_id: ult.raca_id, data_nascimento: ult.data_nascimento, brinco: prox } : {}));
    desenhar(); f.querySelector(`tr[data-i="${linhas.length - 1}"] input`)?.focus();
  });
  $('#g-gerar').addEventListener('click', () => {
    const n = Number($('#g-qtd').value);
    if (!Number.isInteger(n) || n < 1 || n > 500) return toast('Informe uma quantidade entre 1 e 500.', 'erro');
    const brincos = $('#g-brinco').value.trim() ? sequencia($('#g-brinco').value, n) : Array(n).fill('');
    if (!brincos) return toast('O primeiro brinco precisa terminar em número (ex.: C-001) para gerar a sequência.', 'erro', 7000);
    if (linhas.length) linhas.length = 0;
    brincos.forEach((b) => linhas.push(novaLinha({ brinco: b })));
    desenhar();
  });
  // Categoria do gerador acompanha o sexo
  const filtrarCats = () => {
    const sx = $('#g-sexo').value;
    const ok = cats.filter((c) => !c.sexo || c.sexo === sx);
    $('#g-cat').innerHTML = opcoes(ok.length ? ok : cats, { vazio: null });
  };
  $('#g-sexo').addEventListener('change', filtrarCats); filtrarCats();
  ['#c-peso', '#c-arroba', '#c-valor', '#c-frete', '#c-outras'].forEach((s) => $(s).addEventListener('input', resumo));
  f.addEventListener('click', (e) => {
    if (e.target.id !== 'c-usar') return;
    e.preventDefault();
    const t = totais();
    const peso = numOuNulo($('#c-peso').value) || t.soma;
    $('#c-valor').value = (arrobas(peso, { base: 'vivo', ...rend() }) * numOuNulo($('#c-arroba').value)).toFixed(2).replace('.', ',');
    resumo();
  });
  $('#c-fin')?.addEventListener('change', () => $('#c-fin-c').classList.toggle('oculto', !$('#c-fin').checked));
  desenhar();
  if (ehCelular()) ativarWizard(f);

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!linhas.length) return toast('Inclua os animais comprados.', 'erro');
    const vazios = linhas.filter((l) => !l.brinco.trim());
    if (vazios.length) return toast('Todos os animais precisam de número de brinco.', 'erro');
    const ruim = linhas.find((l) => l.peso && (!numOuNulo(l.peso) || numOuNulo(l.peso) <= 0 || numOuNulo(l.peso) >= 2000));
    if (ruim) return toast(`Peso inválido no brinco ${ruim.brinco}.`, 'erro');
    for (const s of ['#c-valor', '#c-frete', '#c-outras', '#c-peso', '#c-arroba']) {
      if ($(s).value && (numOuNulo($(s).value) === null || numOuNulo($(s).value) < 0)) return toast('Há um valor inválido. Use números, por exemplo 1500,00.', 'erro');
    }
    const t = totais();
    const valor = numOuNulo($('#c-valor').value);
    if (valor === null) return toast('Informe o valor dos animais.', 'erro');
    const ok = await confirmar({ titulo: 'Confirmar compra', mensagem: `Registrar a compra de <b>${t.n} animal(is)</b> de <b>${esc($('#c-forn').value)}</b> por <b>${fmtMoeda(valor)}</b>? Os animais serão cadastrados como ativos no rebanho.`, botao: 'Sim, registrar' });
    if (!ok) return;
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    try {
      exigirConexao();
      const { error } = await sb.rpc('registrar_compra', {
        p_id: crypto.randomUUID(),
        p_dados: {
          propriedade_id: store.prop.id, data_compra: $('#c-data').value, fornecedor: textoOuNulo($('#c-forn').value),
          nota_fiscal: textoOuNulo($('#c-nf').value), gta: textoOuNulo($('#c-gta').value),
          pasto_id: $('#c-pasto').value || null, lote_id: $('#c-lote').value || null,
          peso_total_kg: numOuNulo($('#c-peso').value), valor_arroba: numOuNulo($('#c-arroba').value), valor_total: valor,
          frete: numOuNulo($('#c-frete').value) || 0, outras_despesas: numOuNulo($('#c-outras').value) || 0,
          responsavel_nome: textoOuNulo($('#c-resp').value), observacoes: textoOuNulo($('#c-obs').value),
          lancar_financeiro: !!$('#c-fin')?.checked, situacao_financeiro: $('#c-sit')?.value || 'realizado', forma_pagamento: $('#c-forma')?.value || null,
        },
        p_animais: linhas.map((l) => ({ brinco: l.brinco.trim(), sexo: l.sexo, categoria_id: l.categoria_id, raca_id: l.raca_id || null,
          data_nascimento: l.data_nascimento || null, nascimento_estimado: !!l.data_nascimento, peso_kg: numOuNulo(l.peso) })),
      });
      if (error) throw error;
      toast(`Compra registrada: ${t.n} animal(is) cadastrado(s) no rebanho.`);
      fechar(); aoSalvar?.();
    } catch (err) { toast(traduzirErro(err), 'erro', 9000); btn.disabled = false; }
  });
}

// ---------------------------------------------------------------------
// VENDA
// ---------------------------------------------------------------------
export async function abrirVenda(pre = {}, aoSalvar) {
  if (!pode('comercial')) return toast('Você não tem permissão para registrar vendas.', 'erro');
  try { exigirConexao(); } catch (e) { return toast(e.message, 'aviso', 7000); }
  let animais;
  try { animais = await listarAnimais({ somenteAtivos: true }); } catch (e) { return toast(traduzirErro(e), 'erro'); }
  if (!animais.length) return toast('Não há animais ativos para vender.', 'aviso');
  const lotes = store.base.lotes.filter((l) => l.ativo);
  const pastos = store.base.pastos.filter((p) => p.ativo);
  const cats = store.base.categorias.filter((c) => animais.some((a) => a.categoria_id === c.id));
  const marcados = new Map((pre.animais || []).map((id) => [id, '']));   // animal_id -> peso digitado
  const fin = pode('financeiro');
  const porId = new Map(animais.map((a) => [a.id, a]));

  const { el, fechar } = abrirModal({
    titulo: 'Registrar venda de animais',
    largo: true,
    html: `<form id="f-venda" class="grade" style="gap:6px">
      <fieldset class="etapa-form"><legend><i data-lucide="tag"></i> Animais vendidos</legend>
        <div class="filtro-periodo" style="margin-bottom:8px">
          <select id="v-filtro" aria-label="Mostrar animais de"><option value="todos">Todos os ativos</option>
            ${lotes.length ? `<optgroup label="Lote">${lotes.map((l) => `<option value="lote:${l.id}">Lote ${esc(l.nome)}</option>`).join('')}</optgroup>` : ''}
            ${pastos.length ? `<optgroup label="Pasto">${pastos.map((x) => `<option value="pasto:${x.id}">Pasto ${esc(nomePasto(x))}</option>`).join('')}</optgroup>` : ''}
            ${cats.length ? `<optgroup label="Categoria">${cats.map((c) => `<option value="cat:${c.id}">${esc(c.nome)}</option>`).join('')}</optgroup>` : ''}</select>
          <div class="busca-wrap" style="flex:1;min-width:160px"><i data-lucide="search"></i><input type="search" id="v-busca" placeholder="Brinco"></div>
          <button type="button" class="btn btn-sm" id="v-todos">Marcar todos da lista</button>
        </div>
        <div class="tabela-wrap rolagem-lista"><table class="tabela responsiva tabela-pesagem"><thead><tr><th>Animal</th><th>Último peso</th><th class="dir">Peso de saída (kg)</th></tr></thead><tbody id="v-linhas"></tbody></table></div>
        <p class="small muted" id="v-cont" style="margin:8px 0 0"></p>
      </fieldset>
      <fieldset class="etapa-form"><legend><i data-lucide="file-text"></i> Dados da venda</legend><div class="form-grade">
        <div class="campo"><label for="v-data">Data da venda <span class="obrig">*</span></label><input id="v-data" type="date" required max="${hojeISO()}" value="${hojeISO()}"></div>
        <div class="campo"><label for="v-comp">Comprador <span class="obrig">*</span></label><input id="v-comp" required placeholder="Frigorífico, fazenda, leilão…"></div>
        <div class="campo"><label for="v-nf">Nota fiscal</label><input id="v-nf"></div>
        <div class="campo"><label for="v-gta">GTA</label><input id="v-gta"></div>
        <div class="campo"><label for="v-resp">Responsável</label><input id="v-resp" value="${esc(store.perfil?.nome || '')}"></div>
        <div class="campo"><label for="v-obs">Observações</label><input id="v-obs"></div>
      </div></fieldset>
      <fieldset class="etapa-form"><legend><i data-lucide="wallet"></i> Valores</legend>
        <div class="campo"><label>Preço calculado sobre</label><div class="opcoes-radio">
          <label><input type="radio" name="v-base" value="vivo" checked> Peso vivo</label>
          <label><input type="radio" name="v-base" value="carcaca"> Peso de carcaça (frigorífico)</label></div></div>
        <div class="form-grade">
          <div class="campo"><label for="v-peso" id="v-peso-rot">Peso vivo total (kg)</label><input id="v-peso" inputmode="decimal"><span class="ajuda" id="v-peso-info"></span></div>
          <div class="campo"><label for="v-arroba">Valor por @ (R$)</label><input id="v-arroba" inputmode="decimal"><span class="ajuda" id="v-arroba-info"></span></div>
          <div class="campo"><label for="v-valor">Valor total da venda (R$) <span class="obrig">*</span></label><input id="v-valor" inputmode="decimal" required><span class="ajuda" id="v-valor-info"></span></div>
          <div class="campo"><label for="v-frete">Frete pago (R$)</label><input id="v-frete" inputmode="decimal"></div>
          <div class="campo"><label for="v-desp">Outras despesas (R$)</label><input id="v-desp" inputmode="decimal" placeholder="Comissão, Funrural, taxas…"></div>
        </div>
        <div class="alerta" id="v-resumo"><i data-lucide="calculator"></i><div></div></div>
        ${fin ? `<div class="campo" style="margin-top:12px"><label class="check"><input type="checkbox" id="v-fin" checked> Lançar no financeiro (receita da venda e despesas)</label></div>
          <div class="form-grade" id="v-fin-c"><div class="campo"><label for="v-sit">Situação do recebimento</label><select id="v-sit"><option value="realizado">Recebido</option><option value="previsto">A receber</option></select></div>
          <div class="campo"><label for="v-forma">Forma de pagamento</label><select id="v-forma">${opFormas()}</select></div></div>` : ''}
      </fieldset>
      <div class="form-rodape"></div>
    </form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-perigo" type="submit" form="f-venda">Registrar venda</button>',
  });
  const f = el.querySelector('form');
  const $ = (s) => f.querySelector(s);
  const base = () => f.querySelector('input[name=v-base]:checked').value;
  const visiveis = () => {
    const [tipo, id] = $('#v-filtro').value.split(':');
    const t = $('#v-busca').value.trim().toUpperCase();
    return animais.filter((a) => (tipo === 'lote' ? a.lote_id === id : tipo === 'pasto' ? a.pasto_id === id : tipo === 'cat' ? a.categoria_id === id : true)
      && (!t || a.brinco.toUpperCase().includes(t)));
  };
  const totais = () => {
    const ids = [...marcados.keys()];
    const pesos = ids.map((id) => numOuNulo(marcados.get(id))).filter((v) => v);
    return { n: ids.length, comPeso: pesos.length, soma: pesos.reduce((s, v) => s + v, 0) };
  };
  const resumo = () => {
    const t = totais();
    $('#v-cont').textContent = `${t.n} animal(is) selecionado(s)${t.comPeso ? ` · ${t.comPeso} com peso de saída (soma ${fmtKg(t.soma)}, média ${fmtKg(t.soma / t.comPeso)})` : ''}`;
    const b = base();
    $('#v-peso-rot').textContent = b === 'vivo' ? 'Peso vivo total (kg)' : 'Peso total de carcaça (kg)';
    const somaOk = t.n && t.comPeso === t.n;
    $('#v-peso').placeholder = b === 'vivo' && somaOk ? fmtNum(t.soma, 1) : '';
    $('#v-peso-info').textContent = b === 'vivo' ? (somaOk ? 'Se vazio, usa a soma dos pesos de saída.' : '')
      : (somaOk ? `Estimativa pelo rendimento de ${fmtNum(rend().rendimentoPct)}%: ${fmtKg(t.soma * rend().rendimentoPct / 100)}. Use o romaneio do frigorífico.` : 'Informe o peso do romaneio do frigorífico.');
    const peso = numOuNulo($('#v-peso').value) || (b === 'vivo' && somaOk ? t.soma : null);
    const arr = arrobas(peso, { base: b, ...rend() });
    const vArr = numOuNulo($('#v-arroba').value);
    $('#v-arroba-info').textContent = arr ? `${fmtNum(arr, 2)} @ ${b === 'vivo' ? `(peso vivo × ${fmtNum(rend().rendimentoPct)}% ÷ ${fmtNum(rend().pesoArroba)} kg)` : `(carcaça ÷ ${fmtNum(rend().pesoArroba)} kg)`}` : '';
    $('#v-valor-info').innerHTML = arr && vArr ? `Pela @: <a href="#" id="v-usar">${fmtMoeda(arr * vArr)}</a> (toque para usar)` : '';
    const valor = numOuNulo($('#v-valor').value) || 0;
    const desp = (numOuNulo($('#v-frete').value) || 0) + (numOuNulo($('#v-desp').value) || 0);
    $('#v-resumo div').innerHTML = `Valor bruto <b>${fmtMoeda(valor)}</b> · despesas ${fmtMoeda(desp)} · líquido <b>${fmtMoeda(valor - desp)}</b>${t.n ? ` · por cabeça ${fmtMoeda(valor / t.n)}` : ''}${arr ? ` · por @ ${fmtMoeda(valor / arr)}` : ''}`;
  };
  const desenhar = () => {
    const lista = visiveis();
    $('#v-linhas').innerHTML = lista.length ? lista.map((a) => `<tr data-id="${a.id}">
      <td data-rotulo="Brinco" class="primaria"><label class="check"><input type="checkbox" class="v-sel" ${marcados.has(a.id) ? 'checked' : ''} style="width:22px;height:22px"> <b>${esc(a.brinco)}</b> <span class="small muted">${esc(a.categoria_nome || '')}${a.lote_nome ? ` · ${esc(a.lote_nome)}` : ''}</span></label></td>
      <td data-rotulo="Último peso">${a.peso_atual ? `${fmtKg(a.peso_atual)} <span class="small muted">${fmtData(a.data_ultima_pesagem)}</span>` : '—'}</td>
      <td data-rotulo="Peso de saída" class="dir"><input class="v-peso" inputmode="decimal" value="${esc(marcados.get(a.id) || '')}" ${marcados.has(a.id) ? '' : 'disabled'} style="max-width:110px;text-align:right" aria-label="Peso de saída ${esc(a.brinco)}"></td></tr>`).join('')
      : '<tr><td colspan="3" style="display:table-cell"><span class="muted">Nenhum animal neste filtro.</span></td></tr>';
    resumo();
  };
  $('#v-linhas').addEventListener('change', (e) => {
    if (!e.target.classList.contains('v-sel')) return;
    const tr = e.target.closest('tr'); const inp = tr.querySelector('.v-peso');
    if (e.target.checked) { marcados.set(tr.dataset.id, inp.value); inp.disabled = false; inp.focus(); } else { marcados.delete(tr.dataset.id); inp.disabled = true; }
    resumo();
  });
  $('#v-linhas').addEventListener('input', (e) => {
    if (!e.target.classList.contains('v-peso')) return;
    marcados.set(e.target.closest('tr').dataset.id, e.target.value); resumo();
  });
  $('#v-linhas').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.classList.contains('v-peso')) return;
    e.preventDefault();
    const ins = [...f.querySelectorAll('.v-peso:not([disabled])')];
    ins[ins.indexOf(e.target) + 1]?.focus();
  });
  $('#v-todos').addEventListener('click', () => { visiveis().forEach((a) => { if (!marcados.has(a.id)) marcados.set(a.id, ''); }); desenhar(); });
  $('#v-filtro').addEventListener('change', desenhar);
  $('#v-busca').addEventListener('input', desenhar);
  f.querySelectorAll('input[name=v-base]').forEach((r) => r.addEventListener('change', resumo));
  ['#v-peso', '#v-arroba', '#v-valor', '#v-frete', '#v-desp'].forEach((s) => $(s).addEventListener('input', resumo));
  f.addEventListener('click', (e) => {
    if (e.target.id !== 'v-usar') return;
    e.preventDefault();
    const t = totais();
    const peso = numOuNulo($('#v-peso').value) || t.soma;
    $('#v-valor').value = (arrobas(peso, { base: base(), ...rend() }) * numOuNulo($('#v-arroba').value)).toFixed(2).replace('.', ',');
    resumo();
  });
  $('#v-fin')?.addEventListener('change', () => $('#v-fin-c').classList.toggle('oculto', !$('#v-fin').checked));
  desenhar(); icones();
  if (ehCelular()) ativarWizard(f);

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = totais();
    if (!t.n) return toast('Selecione os animais vendidos.', 'erro');
    const ruim = [...marcados.entries()].find(([, v]) => v && (!numOuNulo(v) || numOuNulo(v) <= 0 || numOuNulo(v) >= 2000));
    if (ruim) return toast(`Peso de saída inválido no brinco ${porId.get(ruim[0])?.brinco}.`, 'erro');
    for (const s of ['#v-valor', '#v-frete', '#v-desp', '#v-peso', '#v-arroba']) {
      if ($(s).value && (numOuNulo($(s).value) === null || numOuNulo($(s).value) < 0)) return toast('Há um valor inválido. Use números, por exemplo 1500,00.', 'erro');
    }
    const valor = numOuNulo($('#v-valor').value);
    if (valor === null) return toast('Informe o valor total da venda.', 'erro');
    const brincos = [...marcados.keys()].map((id) => porId.get(id)?.brinco);
    const ok = await confirmar({ titulo: 'Confirmar venda', mensagem: `Registrar a venda de <b>${t.n} animal(is)</b> (${esc(brincos.slice(0, 15).join(', '))}${brincos.length > 15 ? '…' : ''}) para <b>${esc($('#v-comp').value)}</b> por <b>${fmtMoeda(valor)}</b>? Eles sairão do rebanho ativo (o histórico é preservado).`, botao: 'Sim, registrar venda', perigo: true });
    if (!ok) return;
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    try {
      exigirConexao();
      const { error } = await sb.rpc('registrar_venda', {
        p_id: crypto.randomUUID(),
        p_dados: {
          data_venda: $('#v-data').value, comprador: textoOuNulo($('#v-comp').value), base_peso: base(),
          peso_total_kg: numOuNulo($('#v-peso').value), valor_arroba: numOuNulo($('#v-arroba').value), valor_total: valor,
          frete: numOuNulo($('#v-frete').value) || 0, despesas_adicionais: numOuNulo($('#v-desp').value) || 0,
          nota_fiscal: textoOuNulo($('#v-nf').value), gta: textoOuNulo($('#v-gta').value),
          responsavel_nome: textoOuNulo($('#v-resp').value), observacoes: textoOuNulo($('#v-obs').value),
          lancar_financeiro: !!$('#v-fin')?.checked, situacao_financeiro: $('#v-sit')?.value || 'realizado', forma_pagamento: $('#v-forma')?.value || null,
        },
        p_animais: [...marcados.entries()].map(([id, v]) => ({ animal_id: id, peso_kg: numOuNulo(v) })),
      });
      if (error) throw error;
      toast(`Venda registrada: ${t.n} animal(is) saíram do rebanho ativo.`);
      fechar(); aoSalvar?.();
    } catch (err) { toast(traduzirErro(err), 'erro', 9000); btn.disabled = false; }
  });
}

// ---------------------------------------------------------------------
// DETALHE de uma compra ou venda: animais, valores, financeiro e documentos
// ---------------------------------------------------------------------
export async function abrirDetalheComercial(tipo, r, aoSalvar) {
  const ehCompra = tipo === 'compra';
  const campo = ehCompra ? 'compra_id' : 'venda_id';
  const entidade = ehCompra ? 'compras' : 'vendas';
  let movs, docs, receitas = [], despesas = [], animais;
  try {
    const q = async (x) => { const { data, error } = await x; if (error) throw error; return data || []; };
    [movs, docs, animais] = await Promise.all([
      q(sb.from('movimentacoes').select('id, movimentacao_animais(animal_id, peso_kg)').eq(campo, r.id)),
      q(sb.from('documentos').select('*').eq('entidade', entidade).eq('entidade_id', r.id).order('criado_em')),
      listarAnimais(),
    ]);
    if (pode('financeiro')) {
      [receitas, despesas] = await Promise.all([
        ehCompra ? [] : q(sb.from('receitas').select('*').eq('venda_id', r.id)),
        q(sb.from('despesas').select('*').eq(campo, r.id)),
      ]);
    }
  } catch (e) { return toast(traduzirErro(e), 'erro'); }
  const porId = new Map(animais.map((a) => [a.id, a]));
  const itens = movs.flatMap((m) => m.movimentacao_animais || []);
  const urls = new Map();
  if (docs.length) {
    const s = await sb.storage.from(BUCKET).createSignedUrls(docs.map((d) => d.storage_path), 3600);
    (s.data || []).forEach((x) => x.signedUrl && urls.set(x.path, x.signedUrl));
  }
  const peso = Number(r.peso_total_kg) || null;
  const arr = arrobas(peso, { base: ehCompra ? 'vivo' : r.base_peso, ...rend() });
  const extras = Number(ehCompra ? r.outras_despesas : r.despesas_adicionais) || 0;
  const total = ehCompra ? Number(r.valor_total) + Number(r.frete) + extras : Number(r.valor_total) - Number(r.frete) - extras;
  const editar = pode('comercial');
  const lanc = [...receitas.map((x) => ({ ...x, _t: 'Receita' })), ...despesas.map((x) => ({ ...x, _t: 'Despesa' }))];

  const { el, fechar } = abrirModal({
    titulo: `${ehCompra ? 'Compra' : 'Venda'} de ${fmtData(ehCompra ? r.data_compra : r.data_venda)}`,
    largo: true,
    html: `<div class="grade" style="gap:16px">
      <dl class="lista-dados">
        <dt>${ehCompra ? 'Vendedor' : 'Comprador'}</dt><dd><b>${esc(ehCompra ? r.fornecedor : r.comprador)}</b></dd>
        <dt>Animais</dt><dd>${fmtNum(r.quantidade)}</dd>
        <dt>Peso total</dt><dd>${peso ? `${fmtKg(peso)}${!ehCompra ? ` (${r.base_peso === 'carcaca' ? 'carcaça' : 'vivo'})` : ''} · ${fmtNum(arr, 2)} @` : '—'}</dd>
        <dt>Valor por @</dt><dd>${r.valor_arroba ? fmtMoeda(r.valor_arroba) : '—'}</dd>
        <dt>Valor dos animais</dt><dd><b>${fmtMoeda(r.valor_total)}</b> · por cabeça ${fmtMoeda(r.valor_total / r.quantidade)}</dd>
        <dt>Frete</dt><dd>${fmtMoeda(r.frete)}</dd>
        <dt>Outras despesas</dt><dd>${fmtMoeda(extras)}</dd>
        <dt>${ehCompra ? 'Custo total' : 'Valor líquido'}</dt><dd><b>${fmtMoeda(total)}</b>${arr ? ` · ${fmtMoeda(total / arr)}/@` : ''}</dd>
        <dt>Responsável</dt><dd>${esc(r.responsavel_nome || '—')}</dd>
      </dl>
      <form id="f-det" class="form-grade">
        <div class="campo"><label for="d-nf">Nota fiscal</label><input id="d-nf" value="${esc(r.nota_fiscal || '')}" ${editar ? '' : 'disabled'}></div>
        <div class="campo"><label for="d-gta">GTA</label><input id="d-gta" value="${esc(r.gta || '')}" ${editar ? '' : 'disabled'}></div>
        <div class="campo" style="grid-column:1/-1"><label for="d-obs">Observações</label><input id="d-obs" value="${esc(r.observacoes || '')}" ${editar ? '' : 'disabled'}></div>
      </form>
      <section><h3>Animais (${fmtNum(itens.length)})</h3><div class="chips">${itens.map((i) => { const a = porId.get(i.animal_id); return `<a class="chip" href="#/animais/${i.animal_id}" data-fechar>${esc(a?.brinco || '?')}${i.peso_kg ? ` · ${fmtNum(i.peso_kg, 0)} kg` : ''}</a>`; }).join('') || '<span class="muted">—</span>'}</div></section>
      ${pode('financeiro') ? `<section><h3>No financeiro</h3>${lanc.length ? `<ul class="lista-simples">${lanc.map((x) => `<li>${x._t}: ${esc(x.descricao)} — <b>${fmtMoeda(x.valor)}</b> <span class="badge ${x.situacao === 'realizado' ? 'sucesso' : 'aviso'}">${x.situacao === 'realizado' ? (x._t === 'Receita' ? 'recebido' : 'pago') : (x._t === 'Receita' ? 'a receber' : 'a pagar')}</span></li>`).join('')}</ul>` : '<p class="muted small">Nada lançado no financeiro para este registro. Lance em Financeiro, se precisar.</p>'}</section>` : ''}
      <section><h3>Documentos (NF, GTA, romaneio)</h3>
        <div class="chips">${docs.map((d) => `<span class="chip"><a href="${esc(urls.get(d.storage_path) || '#')}" target="_blank" rel="noopener"><i data-lucide="${d.tipo === 'foto' ? 'image' : 'file-text'}"></i> ${esc(d.nome)}</a>${store.papel === 'proprietario' ? ` <button class="btn-texto" data-rem-doc="${d.id}" title="Excluir"><i data-lucide="x"></i></button>` : ''}</span>`).join('') || '<span class="muted small">Nenhum documento anexado.</span>'}</div>
        ${editar ? `<label class="btn btn-sm" style="margin-top:8px"><i data-lucide="paperclip"></i> Anexar arquivo<input type="file" id="d-arq" accept="image/*,application/pdf" hidden></label>` : ''}
      </section>
    </div>`,
    rodape: `<button class="btn" data-fechar>Fechar</button>${editar ? '<button class="btn btn-primario" type="submit" form="f-det">Salvar NF / GTA / observações</button>' : ''}`,
  });
  el.querySelector('#f-det').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      exigirConexao();
      const { error } = await sb.from(entidade).update({ nota_fiscal: textoOuNulo(el.querySelector('#d-nf').value), gta: textoOuNulo(el.querySelector('#d-gta').value), observacoes: textoOuNulo(el.querySelector('#d-obs').value) }).eq('id', r.id);
      if (error) throw error;
      toast('Dados salvos.'); fechar(); aoSalvar?.();
    } catch (err) { toast(traduzirErro(err), 'erro', 7000); }
  });
  el.querySelector('#d-arq')?.addEventListener('change', async (e) => {
    const arq = e.target.files[0]; if (!arq) return;
    if (arq.size > 10 * 1024 * 1024) return toast('Arquivo maior que 10 MB.', 'erro');
    try {
      exigirConexao();
      const ehImg = arq.type.startsWith('image/');
      const fx = ehImg ? await comprimirImagem(arq) : arq;
      const ext = (fx.name.split('.').pop() || 'bin').toLowerCase();
      const caminho = `${store.prop.id}/comercial/${r.id}/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from(BUCKET).upload(caminho, fx, { contentType: fx.type, upsert: false });
      if (up.error) throw up.error;
      const { error } = await sb.from('documentos').insert({ propriedade_id: store.prop.id, entidade, entidade_id: r.id, nome: arq.name, tipo: ehImg ? 'foto' : 'documento', storage_path: caminho, mime_type: fx.type, tamanho_bytes: fx.size });
      if (error) { await sb.storage.from(BUCKET).remove([caminho]); throw error; }
      toast('Documento anexado.'); fechar(); abrirDetalheComercial(tipo, r, aoSalvar);
    } catch (err) { toast(traduzirErro(err), 'erro', 7000); }
  });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rem-doc]'); if (!b) return;
    const d = docs.find((x) => x.id === b.dataset.remDoc);
    if (!(await confirmar({ titulo: 'Excluir documento', mensagem: `Excluir <b>${esc(d.nome)}</b>? Esta ação não pode ser desfeita.`, botao: 'Excluir', perigo: true }))) return;
    try {
      exigirConexao();
      const r1 = await sb.from('documentos').delete().eq('id', d.id); if (r1.error) throw r1.error;
      await sb.storage.from(BUCKET).remove([d.storage_path]);
      toast('Documento excluído.'); fechar(); abrirDetalheComercial(tipo, r, aoSalvar);
    } catch (err) { toast(traduzirErro(err), 'erro'); }
  });
  icones();
}
