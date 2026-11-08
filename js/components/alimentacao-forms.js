// =====================================================================
// Alimentação: produtos de suplementação e registro de fornecimento.
// O sistema não presume consumo nem dose: as quantidades são informadas.
// =====================================================================
import { sb } from '../supabase.js';
import { store, pode, nomePasto } from '../store.js';
import { esc, abrirModal, toast, traduzirErro, hojeISO, numOuNulo, textoOuNulo, opcoes, fmtNum, fmtMoeda, icones } from '../ui.js';
import { chamar } from '../sync.js';
import { listarAnimais } from './animais-comum.js';
import { salvarSimples } from './sanidade-forms.js';

export const TIPOS_SUPL = { sal_mineral: 'Sal mineral', proteico: 'Suplemento proteico', energetico: 'Suplemento energético', racao: 'Ração', outro: 'Outro' };

export function abrirProdutoSupl(p, aoSalvar) {
  const r = p || { tipo: 'sal_mineral', unidade: 'kg', ativo: true, estoque_minimo: 0 };
  const unidades = store.base.unidades.filter((u) => u.ativo).map((u) => u.sigla);
  const { el, fechar } = abrirModal({
    titulo: p ? `Produto: ${p.nome}` : 'Cadastrar produto de suplementação',
    html: `<form id="f-sp" class="grade" style="gap:12px"><div class="grade grade-2" style="gap:12px">
      <div class="campo"><label for="sp-nome">Nome do produto <span class="obrig">*</span></label><input id="sp-nome" required value="${esc(r.nome || '')}"></div>
      <div class="campo"><label for="sp-fab">Fabricante</label><input id="sp-fab" value="${esc(r.fabricante || '')}"></div>
      <div class="campo"><label for="sp-tipo">Tipo</label><select id="sp-tipo">${Object.entries(TIPOS_SUPL).map(([k, t]) => `<option value="${k}" ${r.tipo === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="campo"><label for="sp-un">Unidade de medida</label><input id="sp-un" list="sp-uns" required value="${esc(r.unidade || '')}"><datalist id="sp-uns">${unidades.map((u) => `<option value="${esc(u)}">`).join('')}</datalist></div>
      <div class="campo"><label for="sp-min">Estoque mínimo</label><input id="sp-min" inputmode="decimal" value="${r.estoque_minimo ?? 0}"><span class="ajuda">Abaixo disso, aparece alerta no painel.</span></div>
      <div class="campo"><label for="sp-preco">Preço de compra por unidade (R$)</label><input id="sp-preco" inputmode="decimal" value="${r.preco_compra ?? ''}"><span class="ajuda">Atualizado a cada entrada de estoque com preço.</span></div>
      <div class="campo"><label for="sp-forn">Fornecedor</label><input id="sp-forn" value="${esc(r.fornecedor || '')}"></div>
      <div class="campo"><label for="sp-val">Validade</label><input id="sp-val" type="date" value="${esc(r.validade || '')}"></div>
      </div><div class="campo"><label for="sp-obs">Observações</label><textarea id="sp-obs" rows="2">${esc(r.observacoes || '')}</textarea></div>
      ${p ? `<label class="check"><input type="checkbox" id="sp-ativo" ${r.ativo ? 'checked' : ''}> Ativo</label>` : ''}</form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-sp">Salvar</button>',
  });
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = (s) => el.querySelector(s).value;
    if ((q('#sp-min') && numOuNulo(q('#sp-min')) === null) || (q('#sp-preco') && numOuNulo(q('#sp-preco')) === null)) return toast('Confira o estoque mínimo e o preço (use vírgula para decimais).', 'erro');
    const dados = { nome: q('#sp-nome').trim(), fabricante: textoOuNulo(q('#sp-fab')), tipo: q('#sp-tipo'), unidade: q('#sp-un').trim(),
      estoque_minimo: numOuNulo(q('#sp-min')) ?? 0, preco_compra: numOuNulo(q('#sp-preco')), fornecedor: textoOuNulo(q('#sp-forn')),
      validade: q('#sp-val') || null, observacoes: textoOuNulo(q('#sp-obs')), ...(p ? { ativo: el.querySelector('#sp-ativo').checked } : {}) };
    await salvarSimples('produtos_suplementacao', p, dados, fechar, aoSalvar);
  });
}

/** Registro de fornecimento para um lote, um pasto ou animais escolhidos. */
export async function abrirFornecimento(pre = {}, aoSalvar) {
  if (!pode('suplementacao')) return toast('Você não tem permissão para registrar suplementação.', 'erro');
  let animais, produtos;
  try {
    animais = await listarAnimais({ somenteAtivos: true });
    const r = await sb.from('vw_estoque_suplementos').select('*').eq('propriedade_id', store.prop.id).eq('ativo', true).order('nome');
    if (r.error) throw r.error;
    produtos = r.data || [];
  } catch (e) { return toast(traduzirErro(e), 'erro'); }
  if (!produtos.length) return toast('Cadastre primeiro um produto em Alimentação › Produtos e estoque.', 'aviso', 7000);
  const lotes = store.base.lotes.filter((l) => l.ativo);
  const pastos = store.base.pastos.filter((p) => p.ativo);
  const marcados = new Set();

  const { el, fechar } = abrirModal({
    titulo: 'Registrar fornecimento de suplemento',
    largo: true,
    html: `<form id="f-forn" class="grade" style="gap:14px">
      <div class="grade grade-2" style="gap:14px">
        <div class="campo"><label for="f-prod">Produto <span class="obrig">*</span></label><select id="f-prod" required>${opcoes(produtos, { rotulo: (x) => `${x.nome} (${TIPOS_SUPL[x.tipo]})`, selecionado: pre.produto_id, vazio: null })}</select><span class="ajuda" id="f-saldo"></span></div>
        <div class="campo"><label for="f-data">Data <span class="obrig">*</span></label><input id="f-data" type="date" required max="${hojeISO()}" value="${hojeISO()}"></div>
      </div>
      <div class="campo"><label>Fornecido para <span class="obrig">*</span></label><div class="opcoes-radio">
        <label><input type="radio" name="alvo" value="lote" ${lotes.length ? 'checked' : 'disabled'}> Lote</label>
        <label><input type="radio" name="alvo" value="pasto" ${!lotes.length && pastos.length ? 'checked' : ''} ${pastos.length ? '' : 'disabled'}> Pasto (cocho)</label>
        <label><input type="radio" name="alvo" value="animais" ${!lotes.length && !pastos.length ? 'checked' : ''}> Animais escolhidos</label></div></div>
      <div class="campo" id="f-lote-c"><label for="f-lote">Lote</label><select id="f-lote">${opcoes(lotes, { selecionado: pre.lote_id, vazio: null })}</select></div>
      <div class="campo oculto" id="f-pasto-c"><label for="f-pasto">Pasto</label><select id="f-pasto">${opcoes(pastos, { rotulo: nomePasto, selecionado: pre.pasto_id, vazio: null })}</select></div>
      <div class="campo oculto" id="f-anim-c"><div class="busca-wrap" style="margin-bottom:8px"><i data-lucide="search"></i><input type="search" id="f-busca" placeholder="Filtrar por brinco"></div><div class="lista-selecao" id="f-lista"></div></div>
      <p class="small muted" id="f-cab" style="margin:0"></p>
      <div class="grade grade-3" style="gap:14px">
        <div class="campo"><label for="f-qtd">Quantidade fornecida <span class="obrig">*</span></label><input id="f-qtd" inputmode="decimal" required><span class="ajuda" id="f-un"></span></div>
        <div class="campo"><label for="f-custo">Custo (R$)</label><input id="f-custo" inputmode="decimal"><span class="ajuda" id="f-custo-info"></span></div>
        <div class="campo"><label for="f-resp">Responsável</label><input id="f-resp" value="${esc(store.perfil?.nome || '')}"></div>
      </div>
      <div class="campo"><label for="f-obs">Observações</label><input id="f-obs"></div>
    </form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-forn">Salvar fornecimento</button>',
  });
  const f = el.querySelector('form');
  const $ = (s) => f.querySelector(s);
  const prod = () => produtos.find((x) => x.id === $('#f-prod').value);
  const alvo = () => f.querySelector('input[name=alvo]:checked')?.value;
  const atendidos = () => {
    if (alvo() === 'lote') return animais.filter((a) => a.lote_id === $('#f-lote').value);
    if (alvo() === 'pasto') return animais.filter((a) => a.pasto_id === $('#f-pasto').value);
    return animais.filter((a) => marcados.has(a.id));
  };
  const atualizar = () => {
    const p = prod();
    $('#f-saldo').textContent = p ? `Estoque: ${fmtNum(p.saldo, 2)} ${p.unidade}` : '';
    $('#f-un').textContent = p ? `em ${p.unidade}` : '';
    const qtd = numOuNulo($('#f-qtd').value);
    $('#f-custo-info').textContent = p?.preco_compra && qtd ? `Se vazio: ${fmtMoeda(qtd * p.preco_compra)} (quantidade × preço cadastrado)` : '';
    ['lote', 'pasto', 'anim'].forEach((k) => $(`#f-${k}-c`).classList.toggle('oculto', (alvo() === 'animais' ? 'anim' : alvo()) !== k));
    const n = atendidos().length;
    $('#f-cab').textContent = `${n} cabeça(s) atendida(s)${qtd && n ? ` · ${fmtNum(qtd / n, 3)} ${p?.unidade || ''} por cabeça neste fornecimento` : ''}`;
  };
  const desenharLista = () => {
    const t = $('#f-busca').value.trim().toUpperCase();
    $('#f-lista').innerHTML = animais.filter((a) => !t || a.brinco.toUpperCase().includes(t)).map((a) => `<label class="check"><input type="checkbox" value="${a.id}" ${marcados.has(a.id) ? 'checked' : ''}> <b>${esc(a.brinco)}</b> <span class="small muted">${esc(a.categoria_nome)}</span></label>`).join('');
  };
  $('#f-lista').addEventListener('change', (e) => { if (e.target.checked) marcados.add(e.target.value); else marcados.delete(e.target.value); atualizar(); });
  $('#f-busca').addEventListener('input', desenharLista);
  f.querySelectorAll('input[name=alvo]').forEach((r) => r.addEventListener('change', atualizar));
  ['#f-lote', '#f-pasto', '#f-prod'].forEach((s) => $(s).addEventListener('change', atualizar));
  $('#f-qtd').addEventListener('input', atualizar);
  desenharLista(); atualizar(); icones();

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = prod();
    const qtd = numOuNulo($('#f-qtd').value);
    if (!qtd || qtd <= 0) return toast('Informe a quantidade fornecida.', 'erro');
    if ($('#f-custo').value && numOuNulo($('#f-custo').value) === null) return toast('Custo inválido.', 'erro');
    const at = atendidos();
    if (alvo() === 'animais' && !at.length) return toast('Selecione ao menos um animal.', 'erro');
    if (qtd > Number(p.saldo) && !confirm(`O estoque registrado de ${p.nome} é ${fmtNum(p.saldo, 2)} ${p.unidade}, menor que a quantidade informada. Registrar mesmo assim? (Lembre de lançar a entrada de estoque.)`)) return;
    const dados = { produto_id: p.id, data_fornecimento: $('#f-data').value, quantidade: qtd, custo: numOuNulo($('#f-custo').value),
      lote_id: alvo() === 'lote' ? $('#f-lote').value : null, pasto_id: alvo() === 'pasto' ? $('#f-pasto').value : null,
      responsavel_nome: textoOuNulo($('#f-resp').value), observacoes: textoOuNulo($('#f-obs').value), baixar_estoque: true };
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const r = await chamar('registrar_fornecimento', { p_dados: dados, p_animais: at.map((a) => a.id) }, `Fornecimento de ${fmtNum(qtd, 2)} ${p.unidade} de ${p.nome}`);
      if (r.sincronizado) toast('Fornecimento registrado e estoque atualizado.');
      else toast('Sem conexão: fornecimento guardado neste aparelho e ainda NÃO sincronizado.', 'aviso', 8000);
      fechar(); aoSalvar?.();
    } catch (err) { toast(traduzirErro(err), 'erro', 8000); btn.disabled = false; }
  });
}
