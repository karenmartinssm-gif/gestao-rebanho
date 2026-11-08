// =====================================================================
// Formulários de sanidade e estoque. O sistema NÃO sugere produtos,
// doses nem protocolos: tudo é informado pelo responsável técnico.
// =====================================================================
import { sb } from '../supabase.js';
import { store, pode, carregarBase } from '../store.js';
import { esc, abrirModal, toast, traduzirErro, hojeISO, addDias, numOuNulo, textoOuNulo, opcoes, icones, fmtNum } from '../ui.js';
import { chamar, incluir, exigirConexao } from '../sync.js';
import { listarAnimais } from './animais-comum.js';

export const CLASSES = {
  vacina: 'Vacina', vermifugacao: 'Vermifugação', medicamento: 'Medicamento', carrapato: 'Controle de carrapatos', mosca: 'Controle de moscas',
  exame: 'Exame', tratamento: 'Tratamento', doenca: 'Doença', ocorrencia: 'Ocorrência veterinária', outro: 'Outro',
};
const CLASSES_TRATAMENTO = ['tratamento', 'doenca', 'medicamento', 'ocorrencia'];
export const VIAS = ['Subcutânea', 'Intramuscular', 'Intravenosa', 'Oral', 'Pour-on (dorsal)', 'Banho / aspersão', 'Intramamária', 'Tópica', 'Outra'];

/**
 * Registro de manejo sanitário individual ou coletivo.
 * @param pre { classe?, animais?: ids, lote_id?, tipo_manejo_id?, produto_id?, dosagem?, via?, manejo_anterior_id? }
 */
export async function abrirManejo(pre = {}, aoSalvar) {
  if (!pode('sanidade')) return toast('Você não tem permissão para registrar manejos sanitários.', 'erro');
  let animais, produtos = [], protocolos = [];
  try {
    animais = await listarAnimais({ somenteAtivos: true });
    const [p1, p2] = await Promise.all([
      sb.from('produtos_sanitarios').select('*').eq('propriedade_id', store.prop.id).eq('ativo', true).order('nome'),
      sb.from('protocolos_sanitarios').select('*').eq('propriedade_id', store.prop.id).eq('ativo', true).order('nome'),
    ]);
    produtos = p1.data || []; protocolos = p2.data || [];
  } catch (e) { return toast(traduzirErro(e), 'erro'); }
  const tipos = store.base.tiposManejo.filter((t) => t.ativo);
  if (!tipos.length) return toast('Cadastre os tipos de manejo em Configurações.', 'aviso');
  const tipoInicial = pre.tipo_manejo_id || tipos.find((t) => t.classe === pre.classe)?.id || tipos[0].id;
  const marcados = new Set(pre.animais || []);
  const lotes = store.base.lotes.filter((l) => l.ativo);

  const { el, fechar } = abrirModal({
    titulo: pre.manejo_anterior_id ? 'Registrar aplicação pendente' : 'Registrar manejo sanitário',
    largo: true,
    html: `<form id="f-man" class="grade" style="gap:14px">
      <div class="grade grade-2" style="gap:14px">
        <div class="campo"><label for="s-tipo">Tipo de procedimento <span class="obrig">*</span></label><select id="s-tipo" required>${opcoes(tipos, { selecionado: tipoInicial, vazio: null })}</select></div>
        <div class="campo"><label for="s-prot">Protocolo da propriedade</label><select id="s-prot">${opcoes(protocolos, { vazio: protocolos.length ? 'Nenhum' : 'Nenhum protocolo cadastrado' })}</select>
          <span class="ajuda">Preenche produto, dose, via e próxima aplicação conforme o protocolo cadastrado.</span></div>
      </div>
      <div class="campo"><label>Aplicado em <span class="obrig">*</span></label><div class="opcoes-radio">
        <label><input type="radio" name="alvo" value="lote" ${pre.lote_id || (!pre.animais && lotes.length) ? 'checked' : ''} ${lotes.length ? '' : 'disabled'}> Um lote inteiro</label>
        <label><input type="radio" name="alvo" value="animais" ${pre.animais || !lotes.length ? 'checked' : ''}> Animais escolhidos</label></div></div>
      <div class="campo" id="s-lote-c"><label for="s-lote">Lote</label><select id="s-lote">${opcoes(lotes, { selecionado: pre.lote_id, vazio: null })}</select><span class="ajuda" id="s-lote-info"></span></div>
      <div class="campo" id="s-anim-c">
        <div class="busca-wrap" style="margin-bottom:8px"><i data-lucide="search"></i><input type="search" id="s-busca" placeholder="Filtrar por brinco ou lote"></div>
        <div class="lista-selecao" id="s-lista"></div><span class="ajuda" id="s-cont"></span></div>
      <div class="grade grade-3" style="gap:14px">
        <div class="campo"><label for="s-data">Data da aplicação <span class="obrig">*</span></label><input id="s-data" type="date" required max="${hojeISO()}" value="${hojeISO()}"></div>
        <div class="campo"><label for="s-prod">Produto utilizado</label><select id="s-prod"></select><span class="ajuda" id="s-prod-info"></span></div>
        <div class="campo"><label for="s-dose">Dosagem</label><input id="s-dose" placeholder="Ex.: 5 mL/animal" value="${esc(pre.dosagem || '')}"></div>
        <div class="campo"><label for="s-via">Via de administração</label><input id="s-via" list="s-vias" value="${esc(pre.via || '')}"><datalist id="s-vias">${VIAS.map((v) => `<option value="${v}">`).join('')}</datalist></div>
        <div class="campo"><label for="s-qtd">Quantidade total usada</label><input id="s-qtd" inputmode="decimal" placeholder="Para baixar do estoque"><span class="ajuda" id="s-qtd-un"></span></div>
        <div class="campo"><label for="s-custo">Custo total (R$)</label><input id="s-custo" inputmode="decimal" placeholder="0,00"></div>
        <div class="campo"><label for="s-prox">Próxima aplicação / retorno</label><input id="s-prox" type="date"><span class="ajuda">Gera alerta no painel.</span></div>
        <div class="campo"><label for="s-car">Fim da carência</label><input id="s-car" type="date"><span class="ajuda" id="s-car-info">Calculado pela carência do produto, se cadastrada.</span></div>
        <div class="campo"><label for="s-resp">Responsável / veterinário</label><input id="s-resp" value="${esc(store.perfil?.nome || '')}"></div>
      </div>
      <div class="grade grade-2" style="gap:14px" id="s-trat">
        <div class="campo"><label for="s-sit">Situação</label><select id="s-sit"><option value="realizado">Aplicação realizada</option><option value="em_andamento">Tratamento em andamento</option><option value="concluido">Tratamento concluído</option></select></div>
        <div class="campo"><label for="s-diag">Diagnóstico / doença</label><input id="s-diag"></div>
      </div>
      <div class="campo"><label for="s-obs">Observações</label><textarea id="s-obs" rows="2"></textarea></div>
    </form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-man">Salvar registro</button>',
  });
  const f = el.querySelector('form');
  const $ = (s) => f.querySelector(s);
  const tipoAtual = () => tipos.find((t) => t.id === $('#s-tipo').value);
  const prodAtual = () => produtos.find((p) => p.id === $('#s-prod').value);

  const preencherProdutos = (sel) => {
    const c = tipoAtual()?.classe;
    const lista = produtos.filter((p) => !c || p.classe === c || p.classe === 'outro');
    const outros = produtos.filter((p) => !lista.includes(p));
    $('#s-prod').innerHTML = `<option value="">${produtos.length ? 'Nenhum / não informado' : 'Nenhum produto cadastrado'}</option>${opcoes(lista, { vazio: null, selecionado: sel })}${outros.length ? `<optgroup label="Outros produtos">${opcoes(outros, { vazio: null, selecionado: sel })}</optgroup>` : ''}`;
  };
  const ajustarProduto = () => {
    const p = prodAtual();
    $('#s-prod-info').textContent = p ? [p.fabricante, p.carencia_dias ? `carência ${p.carencia_dias} dias` : null].filter(Boolean).join(' · ') : '';
    $('#s-qtd-un').textContent = p ? `Unidade: ${p.unidade}` : '';
    if (p?.carencia_dias && $('#s-data').value) $('#s-car').value = addDias($('#s-data').value, p.carencia_dias);
  };
  const ajustarTipo = () => {
    const c = tipoAtual()?.classe;
    const trat = CLASSES_TRATAMENTO.includes(c);
    $('#s-trat').classList.toggle('oculto', !trat);
    if (trat && $('#s-sit').value === 'realizado' && c === 'tratamento') $('#s-sit').value = 'em_andamento';
    if (!trat) $('#s-sit').value = 'realizado';
    preencherProdutos($('#s-prod').value || pre.produto_id);
    ajustarProduto();
  };
  $('#s-tipo').addEventListener('change', ajustarTipo);
  $('#s-prod').addEventListener('change', ajustarProduto);
  $('#s-data').addEventListener('change', () => { ajustarProduto(); aplicarProtocolo(false); });
  const aplicarProtocolo = (completo = true) => {
    const p = protocolos.find((x) => x.id === $('#s-prot').value);
    if (!p) return;
    if (completo) {
      if (p.tipo_manejo_id) { $('#s-tipo').value = p.tipo_manejo_id; ajustarTipo(); }
      if (p.produto_id) { $('#s-prod').value = p.produto_id; ajustarProduto(); }
      if (p.dosagem) $('#s-dose').value = p.dosagem;
      if (p.via_administracao) $('#s-via').value = p.via_administracao;
    }
    if (p.intervalo_dias && $('#s-data').value) $('#s-prox').value = addDias($('#s-data').value, p.intervalo_dias);
  };
  $('#s-prot').addEventListener('change', () => aplicarProtocolo(true));

  // Alvo: lote inteiro ou animais escolhidos
  const doLote = () => animais.filter((a) => a.lote_id === $('#s-lote').value);
  const desenharLista = () => {
    const t = $('#s-busca').value.trim().toLowerCase();
    const v = animais.filter((a) => !t || `${a.brinco} ${a.lote_nome || ''}`.toLowerCase().includes(t));
    $('#s-lista').innerHTML = v.map((a) => `<label class="check"><input type="checkbox" value="${a.id}" ${marcados.has(a.id) ? 'checked' : ''}> <b>${esc(a.brinco)}</b>
      <span class="small muted">${esc([a.categoria_nome, a.lote_nome && `lote ${a.lote_nome}`].filter(Boolean).join(' · '))}</span></label>`).join('');
    $('#s-cont').textContent = `${marcados.size} animal(is) selecionado(s)`;
  };
  $('#s-lista').addEventListener('change', (e) => { if (e.target.checked) marcados.add(e.target.value); else marcados.delete(e.target.value); $('#s-cont').textContent = `${marcados.size} animal(is) selecionado(s)`; });
  $('#s-busca').addEventListener('input', desenharLista);
  const ajustarAlvo = () => {
    const lote = f.querySelector('input[name=alvo]:checked')?.value === 'lote';
    $('#s-lote-c').classList.toggle('oculto', !lote);
    $('#s-anim-c').classList.toggle('oculto', lote);
    $('#s-lote-info').textContent = lote ? `${doLote().length} animal(is) ativo(s) no lote receberão o registro individual.` : '';
  };
  f.querySelectorAll('input[name=alvo]').forEach((r) => r.addEventListener('change', ajustarAlvo));
  $('#s-lote').addEventListener('change', ajustarAlvo);
  desenharLista(); ajustarAlvo(); ajustarTipo(); icones();

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const porLote = f.querySelector('input[name=alvo]:checked')?.value === 'lote';
    const ids = porLote ? doLote().map((a) => a.id) : [...marcados];
    if (!ids.length) return toast(porLote ? 'O lote escolhido não tem animais ativos.' : 'Selecione ao menos um animal.', 'erro');
    for (const s of ['#s-qtd', '#s-custo']) if ($(s).value && (numOuNulo($(s).value) === null || numOuNulo($(s).value) < 0)) return toast('Confira a quantidade e o custo (use vírgula para decimais).', 'erro');
    if ($('#s-prox').value && $('#s-prox').value < $('#s-data').value) return toast('A próxima aplicação não pode ser antes da data da aplicação.', 'erro');
    const t = tipoAtual();
    const dados = {
      tipo_manejo_id: t.id, produto_id: $('#s-prod').value || null, protocolo_id: $('#s-prot').value || null, lote_id: porLote ? $('#s-lote').value : null,
      data_aplicacao: $('#s-data').value, dosagem: textoOuNulo($('#s-dose').value), via_administracao: textoOuNulo($('#s-via').value),
      quantidade_total: numOuNulo($('#s-qtd').value), custo: numOuNulo($('#s-custo').value), proxima_aplicacao: $('#s-prox').value || null,
      carencia_ate: $('#s-car').value || null, responsavel_nome: textoOuNulo($('#s-resp').value),
      situacao: CLASSES_TRATAMENTO.includes(t.classe) ? $('#s-sit').value : 'realizado',
      data_fim: $('#s-sit').value === 'concluido' ? $('#s-data').value : null, diagnostico: textoOuNulo($('#s-diag').value),
      observacoes: textoOuNulo($('#s-obs').value), manejo_anterior_id: pre.manejo_anterior_id || null, baixar_estoque: true,
    };
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const r = await chamar('registrar_manejo', { p_dados: dados, p_animais: ids }, `${t.nome} — ${ids.length} animal(is)`);
      if (r.sincronizado) toast(`${t.nome} registrado para ${ids.length} animal(is).`);
      else toast('Sem conexão: registro guardado neste aparelho e ainda NÃO sincronizado.', 'aviso', 8000);
      fechar(); aoSalvar?.();
    } catch (err) { toast(traduzirErro(err), 'erro', 8000); btn.disabled = false; }
  });
}

/** Marca um tratamento como concluído. */
export async function concluirTratamento(manejo, aoSalvar) {
  const { el, fechar } = abrirModal({
    titulo: 'Concluir tratamento',
    html: `<form id="f-conc" class="grade" style="gap:12px"><div class="campo"><label for="c-fim">Data de término</label><input id="c-fim" type="date" required max="${hojeISO()}" min="${manejo.data_aplicacao}" value="${hojeISO()}"></div>
      <div class="campo"><label for="c-obs">Observações (resultado)</label><textarea id="c-obs" rows="2">${esc(manejo.observacoes || '')}</textarea></div></form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-conc">Concluir</button>',
  });
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      exigirConexao();
      const { error } = await sb.from('manejos_sanitarios').update({ situacao: 'concluido', data_fim: el.querySelector('#c-fim').value, observacoes: textoOuNulo(el.querySelector('#c-obs').value) }).eq('id', manejo.id);
      if (error) throw error;
      toast('Tratamento concluído.'); fechar(); aoSalvar?.();
    } catch (err) { toast(traduzirErro(err), 'erro'); }
  });
}

// ---------------------------------------------------------------------
// Produtos sanitários
// ---------------------------------------------------------------------
export function abrirProdutoSanitario(p, aoSalvar) {
  const r = p || { classe: 'vacina', unidade: 'mL', ativo: true, estoque_minimo: 0 };
  const unidades = store.base.unidades.filter((u) => u.ativo).map((u) => u.sigla);
  const { el, fechar } = abrirModal({
    titulo: p ? `Produto: ${p.nome}` : 'Cadastrar produto sanitário',
    html: `<form id="f-ps" class="grade" style="gap:12px"><div class="grade grade-2" style="gap:12px">
      <div class="campo"><label for="ps-nome">Nome comercial <span class="obrig">*</span></label><input id="ps-nome" required value="${esc(r.nome || '')}"></div>
      <div class="campo"><label for="ps-fab">Fabricante</label><input id="ps-fab" value="${esc(r.fabricante || '')}"></div>
      <div class="campo"><label for="ps-classe">Uso</label><select id="ps-classe">${Object.entries(CLASSES).map(([k, t]) => `<option value="${k}" ${r.classe === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="campo"><label for="ps-pa">Princípio ativo</label><input id="ps-pa" value="${esc(r.principio_ativo || '')}"></div>
      <div class="campo"><label for="ps-un">Unidade de estoque</label><input id="ps-un" list="ps-uns" required value="${esc(r.unidade || '')}"><datalist id="ps-uns">${unidades.map((u) => `<option value="${esc(u)}">`).join('')}</datalist></div>
      <div class="campo"><label for="ps-car">Carência (dias)</label><input id="ps-car" inputmode="numeric" value="${r.carencia_dias ?? ''}"><span class="ajuda">Conforme a bula do produto.</span></div>
      <div class="campo"><label for="ps-min">Estoque mínimo</label><input id="ps-min" inputmode="decimal" value="${r.estoque_minimo ?? 0}"></div>
      </div><div class="campo"><label for="ps-obs">Observações</label><textarea id="ps-obs" rows="2">${esc(r.observacoes || '')}</textarea></div>
      ${p ? `<label class="check"><input type="checkbox" id="ps-ativo" ${r.ativo ? 'checked' : ''}> Ativo</label>` : ''}</form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-ps">Salvar</button>',
  });
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = (s) => el.querySelector(s).value;
    if ((q('#ps-car') && !/^\d+$/.test(q('#ps-car'))) || numOuNulo(q('#ps-min')) === null && q('#ps-min')) return toast('Confira a carência e o estoque mínimo.', 'erro');
    const dados = { nome: q('#ps-nome').trim(), fabricante: textoOuNulo(q('#ps-fab')), classe: q('#ps-classe'), principio_ativo: textoOuNulo(q('#ps-pa')),
      unidade: q('#ps-un').trim(), carencia_dias: q('#ps-car') ? parseInt(q('#ps-car'), 10) : null, estoque_minimo: numOuNulo(q('#ps-min')) ?? 0,
      observacoes: textoOuNulo(q('#ps-obs')), ...(p ? { ativo: el.querySelector('#ps-ativo').checked } : {}) };
    await salvarSimples('produtos_sanitarios', p, dados, fechar, aoSalvar);
  });
}

export async function abrirProtocolo(p, aoSalvar) {
  const r = p || { ativo: true };
  const { data: produtos } = await sb.from('produtos_sanitarios').select('id, nome').eq('propriedade_id', store.prop.id).eq('ativo', true).order('nome');
  const { el, fechar } = abrirModal({
    titulo: p ? `Protocolo: ${p.nome}` : 'Cadastrar protocolo sanitário',
    html: `<form id="f-pr" class="grade" style="gap:12px">
      <div class="alerta small"><i data-lucide="info"></i><div>Cadastre aqui os protocolos definidos pelo veterinário ou responsável técnico da propriedade. O sistema não sugere produtos nem doses.</div></div>
      <div class="grade grade-2" style="gap:12px">
      <div class="campo"><label for="pr-nome">Nome do protocolo <span class="obrig">*</span></label><input id="pr-nome" required value="${esc(r.nome || '')}" placeholder="Ex.: Vacinação aftosa — maio"></div>
      <div class="campo"><label for="pr-tipo">Tipo de manejo</label><select id="pr-tipo">${opcoes(store.base.tiposManejo.filter((t) => t.ativo), { selecionado: r.tipo_manejo_id, vazio: 'Não definido' })}</select></div>
      <div class="campo"><label for="pr-prod">Produto</label><select id="pr-prod">${opcoes(produtos || [], { selecionado: r.produto_id, vazio: 'Não definido' })}</select></div>
      <div class="campo"><label for="pr-dose">Dosagem</label><input id="pr-dose" value="${esc(r.dosagem || '')}"></div>
      <div class="campo"><label for="pr-via">Via</label><input id="pr-via" list="pr-vias" value="${esc(r.via_administracao || '')}"><datalist id="pr-vias">${VIAS.map((v) => `<option value="${v}">`).join('')}</datalist></div>
      <div class="campo"><label for="pr-int">Repetir a cada (dias)</label><input id="pr-int" inputmode="numeric" value="${r.intervalo_dias ?? ''}"><span class="ajuda">Usado para sugerir a data da próxima aplicação.</span></div>
      <div class="campo"><label for="pr-pub">Público-alvo</label><input id="pr-pub" value="${esc(r.publico_alvo || '')}" placeholder="Ex.: fêmeas de 3 a 8 meses"></div>
      </div><div class="campo"><label for="pr-desc">Descrição / orientações</label><textarea id="pr-desc" rows="3">${esc(r.descricao || '')}</textarea></div>
      ${p ? `<label class="check"><input type="checkbox" id="pr-ativo" ${r.ativo ? 'checked' : ''}> Ativo</label>` : ''}</form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-pr">Salvar</button>',
  });
  icones();
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = (s) => el.querySelector(s).value;
    if (q('#pr-int') && !/^\d+$/.test(q('#pr-int'))) return toast('Informe o intervalo em dias (número inteiro).', 'erro');
    const dados = { nome: q('#pr-nome').trim(), tipo_manejo_id: q('#pr-tipo') || null, produto_id: q('#pr-prod') || null, dosagem: textoOuNulo(q('#pr-dose')),
      via_administracao: textoOuNulo(q('#pr-via')), intervalo_dias: q('#pr-int') ? parseInt(q('#pr-int'), 10) : null, publico_alvo: textoOuNulo(q('#pr-pub')),
      descricao: textoOuNulo(q('#pr-desc')), ...(p ? { ativo: el.querySelector('#pr-ativo').checked } : {}) };
    await salvarSimples('protocolos_sanitarios', p, dados, fechar, aoSalvar);
  });
}

// ---------------------------------------------------------------------
// Estoque: entrada (compra) ou ajuste — vale para produtos sanitários e suplementos
// ---------------------------------------------------------------------
export function abrirMovEstoque({ produto, tipoProduto, modo = 'entrada' }, aoSalvar) {
  const campo = tipoProduto === 'suplemento' ? 'produto_suplementacao_id' : 'produto_sanitario_id';
  const { el, fechar } = abrirModal({
    titulo: `${modo === 'entrada' ? 'Entrada de estoque' : 'Ajuste de estoque'} — ${produto.nome}`,
    html: `<form id="f-est" class="grade" style="gap:12px">
      <p class="muted" style="margin:0">Saldo atual: <b>${fmtNum(produto.saldo, 2)} ${esc(produto.unidade)}</b></p>
      <div class="grade grade-2" style="gap:12px">
      <div class="campo"><label for="e-data">Data <span class="obrig">*</span></label><input id="e-data" type="date" required max="${hojeISO()}" value="${hojeISO()}"></div>
      ${modo === 'entrada'
        ? `<div class="campo"><label for="e-qtd">Quantidade (${esc(produto.unidade)}) <span class="obrig">*</span></label><input id="e-qtd" inputmode="decimal" required></div>
           <div class="campo"><label for="e-val">Preço por ${esc(produto.unidade)} (R$)</label><input id="e-val" inputmode="decimal"></div>
           <div class="campo"><label for="e-forn">Fornecedor</label><input id="e-forn" value="${esc(produto.fornecedor || '')}"></div>
           <div class="campo"><label for="e-validade">Validade</label><input id="e-validade" type="date"></div>
           <div class="campo"><label for="e-lote">Lote de fabricação</label><input id="e-lote"></div>`
        : `<div class="campo"><label for="e-qtd">Saldo contado (${esc(produto.unidade)}) <span class="obrig">*</span></label><input id="e-qtd" inputmode="decimal" required>
             <span class="ajuda">Informe quanto existe de fato. O sistema registra a diferença como ajuste.</span></div>`}
      </div>
      <div class="campo"><label for="e-obs">Observações${modo === 'ajuste' ? ' / motivo <span class="obrig">*</span>' : ''}</label><input id="e-obs" ${modo === 'ajuste' ? 'required' : ''}></div>
    </form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-est">Salvar</button>',
  });
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = (s) => el.querySelector(s)?.value ?? '';
    const qtd = numOuNulo(q('#e-qtd'));
    if (qtd === null || qtd < 0 || (modo === 'entrada' && qtd === 0)) return toast('Informe uma quantidade válida.', 'erro');
    let linha;
    if (modo === 'entrada') {
      if (q('#e-val') && numOuNulo(q('#e-val')) === null) return toast('Preço inválido.', 'erro');
      linha = { tipo: 'entrada', quantidade: qtd, valor_unitario: numOuNulo(q('#e-val')), fornecedor: textoOuNulo(q('#e-forn')), validade: q('#e-validade') || null, lote_fabricacao: textoOuNulo(q('#e-lote')) };
    } else {
      const dif = Math.round((qtd - Number(produto.saldo)) * 1000) / 1000;
      if (!dif) return toast('O saldo contado é igual ao saldo do sistema; nada a ajustar.', 'info');
      linha = { tipo: 'ajuste', quantidade: dif };
    }
    try {
      const r = await incluir('estoques', { ...linha, propriedade_id: store.prop.id, [campo]: produto.id, data_movimento: q('#e-data'), observacoes: textoOuNulo(q('#e-obs')) },
        `${modo === 'entrada' ? 'Entrada' : 'Ajuste'} de estoque — ${produto.nome}`);
      if (r.sincronizado) toast('Estoque atualizado.'); else toast('Sem conexão: movimento guardado neste aparelho e ainda NÃO sincronizado.', 'aviso', 8000);
      fechar(); aoSalvar?.();
    } catch (err) { toast(traduzirErro(err), 'erro'); }
  });
}

export async function salvarSimples(tabela, registro, dados, fechar, depois) {
  try {
    exigirConexao();
    const q = registro ? sb.from(tabela).update(dados).eq('id', registro.id) : sb.from(tabela).insert({ ...dados, propriedade_id: store.prop.id });
    const { error } = await q;
    if (error) throw error;
    await carregarBase();
    toast('Salvo.'); fechar(); depois?.();
  } catch (err) { toast(traduzirErro(err), 'erro', 7000); }
}
