// =====================================================================
// Formulários de reprodução: cobertura, diagnóstico, parto, desmame,
// sêmen e situação da matriz. Coberturas, diagnósticos, partos e
// desmames funcionam sem internet (ficam na fila do aparelho).
// =====================================================================
import { sb } from '../supabase.js';
import { store, pode, param, carregarBase, podeExcluir } from '../store.js';
import {
  esc, abrirModal, toast, traduzirErro, hojeISO, addDias, fmtData, fmtKg, idadeTexto, diasEntre,
  numOuNulo, textoOuNulo, opcoes, ativarWizard, icones, ROTULO_SITUACAO_REPRO, confirmar,
} from '../ui.js';
import { incluir, chamar, exigirConexao } from '../sync.js';
import { listarAnimais, campoAnimal } from './animais-comum.js';

/** Situação da cobertura em texto (TETF sem diagnóstico = aguardando confirmação). */
export const rotuloSitCob = (c) => (c.tipo === 'tetf' && c.situacao === 'aguardando_diagnostico' ? 'Aguardando confirmação TETF' : ROTULO_SIT_COB[c.situacao]);
export const ROTULO_TIPO_COB = { monta_natural: 'Monta natural', inseminacao: 'Inseminação artificial (IA)', iatf: 'IATF', tetf: 'TETF (transferência de embrião)' };
const ROTULO_DATA_COB = { monta_natural: 'Data da cobertura', inseminacao: 'Data da inseminação', iatf: 'Data da IATF', tetf: 'Data da TETF' };
// TETF: o embrião transferido já tem cerca de 7 dias (mesma regra do servidor)
const diasGestacao = (tipo, gest) => gest - (tipo === 'tetf' ? 7 : 0);
export const ROTULO_SIT_COB = {
  aguardando_diagnostico: 'Aguardando diagnóstico', prenhe: 'Prenhe', vazia: 'Vazia', parida: 'Parida', aborto: 'Aborto', cancelada: 'Cancelada',
};
export const ROTULO_RESULTADO = { vivo: 'Bezerro vivo', natimorto: 'Natimorto', aborto: 'Aborto' };

const ehFemeaReprodutiva = (a) => a.sexo === 'F' && a.conta_no_rebanho && ['novilha', 'matriz'].includes(a.categoria_grupo);
const nomeReprodutor = (r) => `${r.identificacao}${r.tipo === 'semen' ? ' (sêmen)' : ''}`;

function avisoResultado(r, oQue) {
  if (r.sincronizado) toast(`${oQue} salvo e confirmado pelo servidor.`);
  else toast(`Sem conexão: ${oQue.toLowerCase()} guardado neste aparelho e ainda NÃO sincronizado.`, 'aviso', 8000);
}

async function carregarAnimais() {
  try { return await listarAnimais(); } catch (e) { toast(traduzirErro(e), 'erro'); return null; }
}

function semPermissao() {
  if (pode('reproducao')) return false;
  toast('Você não tem permissão para registrar eventos de reprodução.', 'erro');
  return true;
}

// Lista de seleção múltipla com busca (registro em lote)
function listaMultipla(container, animais, { detalhe = () => '' } = {}) {
  container.innerHTML = `
    <div class="busca-wrap" style="margin-bottom:8px"><i data-lucide="search"></i><input type="search" placeholder="Filtrar por brinco ou lote" data-filtro></div>
    <div class="acoes small" style="margin-bottom:6px"><button type="button" class="btn btn-sm" data-todos>Marcar visíveis</button>
      <button type="button" class="btn btn-sm" data-nenhum>Desmarcar todos</button><span class="muted" data-cont style="align-self:center">0 selecionadas</span></div>
    <div class="lista-selecao">${animais.map((a) => `<label class="check" data-busca="${esc(`${a.brinco} ${a.nome || ''} ${a.lote_nome || ''}`.toLowerCase())}">
      <input type="checkbox" value="${a.id}"> <b>${esc(a.brinco)}</b> <span class="small muted">${esc(detalhe(a))}</span></label>`).join('')
      || '<p class="muted small">Nenhum animal disponível.</p>'}</div>`;
  const caixas = [...container.querySelectorAll('input[type=checkbox]')];
  const cont = container.querySelector('[data-cont]');
  const atualizar = () => { const n = caixas.filter((c) => c.checked).length; cont.textContent = `${n} selecionada${n === 1 ? '' : 's'}`; };
  container.querySelector('[data-filtro]').addEventListener('input', (e) => {
    const t = e.target.value.toLowerCase().trim();
    container.querySelectorAll('label[data-busca]').forEach((l) => { l.style.display = !t || l.dataset.busca.includes(t) ? '' : 'none'; });
  });
  container.querySelector('[data-todos]').addEventListener('click', () => { caixas.forEach((c) => { if (c.closest('label').style.display !== 'none') c.checked = true; }); atualizar(); });
  container.querySelector('[data-nenhum]').addEventListener('click', () => { caixas.forEach((c) => { c.checked = false; }); atualizar(); });
  caixas.forEach((c) => c.addEventListener('change', atualizar));
  icones();
  return () => caixas.filter((c) => c.checked).map((c) => c.value);
}

// ---------------------------------------------------------------------
// COBERTURA (individual ou em lote)
// ---------------------------------------------------------------------
export async function abrirCobertura(matrizFixa = null, aoSalvar, existente = null) {
  if (semPermissao()) return;
  if (existente) { try { exigirConexao(); } catch (e) { return toast(e.message, 'aviso', 7000); } }
  const todosAnimais = await carregarAnimais();
  if (!todosAnimais) return;
  const animais = matrizFixa ? [matrizFixa] : todosAnimais;
  const femeas = animais.filter(ehFemeaReprodutiva);
  if (!matrizFixa && !femeas.length) return toast('Não há novilhas ou vacas ativas cadastradas.', 'aviso');
  const reprod = store.base.reprodutores.filter((r) => r.ativo || r.id === existente?.reprodutor_id);
  const gest = param('periodo_gestacao_dias');
  const ed = existente || {};
  // Doadoras possíveis (TETF): fêmeas cadastradas, menos a própria receptora
  const doadoras = todosAnimais.filter((x) => x.sexo === 'F' && x.id !== matrizFixa?.id);
  const doadoraAtual = ed.doadora_id ? (todosAnimais.find((x) => x.id === ed.doadora_id)?.brinco || '') : (ed.doadora_externa || '');

  const { el, fechar } = abrirModal({
    titulo: existente ? 'Editar cobertura' : 'Registrar cobertura / inseminação',
    largo: true,
    html: `<form id="f-cob" class="grade" style="gap:14px">
      ${matrizFixa ? `<div class="alerta"><i data-lucide="heart"></i><div>Vaca <b>${esc(matrizFixa.brinco)}</b>${matrizFixa.nome ? ` — ${esc(matrizFixa.nome)}` : ''}</div></div>`
        : `<div class="campo"><label>Vacas cobertas <span class="obrig">*</span></label><div id="sel-matrizes"></div>
            <span class="ajuda">Marque uma ou várias (ex.: lote de IATF no mesmo dia).</span></div>`}
      <div class="campo"><label>Tipo <span class="obrig">*</span></label><div class="opcoes-radio">
        ${Object.entries(ROTULO_TIPO_COB).map(([k, r], i) => `<label><input type="radio" name="tipo" value="${k}" ${(existente ? ed.tipo === k : i === 0) ? 'checked' : ''} required> ${esc(r)}</label>`).join('')}</div></div>
      <div class="grade grade-2" style="gap:14px">
        <div class="campo"><label for="c-rep">Touro (doador do sêmen)</label><select id="c-rep">${opcoes(reprod, { rotulo: nomeReprodutor, vazio: 'Não informado', selecionado: ed.reprodutor_id })}<option value="__novo">+ Cadastrar outro touro / sêmen</option></select>
          <span class="ajuda">Touros do rebanho e sêmens já cadastrados aparecem aqui.</span></div>
        <div class="campo"><label for="c-data" id="c-data-rot">Data da cobertura <span class="obrig">*</span></label><input id="c-data" type="date" required max="${hojeISO()}" value="${ed.data_cobertura || hojeISO()}">
          <span class="ajuda" id="c-fim-ajuda">Monta natural: data em que a vaca entrou com o touro.</span></div>
        <div class="campo oculto" id="c-novo-campo" style="grid-column:1/-1"><div class="grade grade-2" style="gap:14px">
          <div class="campo"><label for="c-novo-nome">Nome do touro (doador do sêmen) <span class="obrig">*</span></label><input id="c-novo-nome" placeholder="Ex.: Nelore CFM Ímpeto"></div>
          <div class="campo"><label for="c-novo-raca">Raça do touro</label><select id="c-novo-raca">${opcoes(store.base.racas.filter((x) => x.ativo), { vazio: 'Não informada' })}</select></div></div>
          <span class="ajuda">O touro fica cadastrado como sêmen e passa a aparecer na lista nas próximas vezes.</span></div>
        <div class="campo" id="c-fim-campo"><label for="c-fim">Fim da monta (opcional)</label><input id="c-fim" type="date" max="${hojeISO()}" value="${ed.data_fim || ''}"></div>
        <div class="campo oculto" id="c-acas-campo"><label for="c-acas">Acasalamento / lacre</label><input id="c-acas" placeholder="Ex.: embrião TE-07 · lacre do sêmen 12345" value="${esc(ed.acasalamento || '')}">
          <span class="ajuda">Registro do embrião e do sêmen usados.</span></div>
        <div class="campo oculto" id="c-doad-campo"><label for="c-doad">Vaca doadora (do óvulo)</label>
          <input id="c-doad" list="c-doad-lista" autocomplete="off" placeholder="Brinco da doadora ou nome/registro de fora" value="${esc(doadoraAtual)}">
          <datalist id="c-doad-lista">${doadoras.map((x) => `<option value="${esc(x.brinco)}">${esc([x.nome, x.categoria_nome].filter(Boolean).join(' · '))}</option>`).join('')}</datalist>
          <span class="ajuda" id="c-doad-ajuda">Se for do rebanho, escolha pelo brinco. Se for de fora, escreva o nome ou o registro.</span></div>
        <div class="campo"><label for="c-prev">Previsão de parto</label><input id="c-prev" type="date" ${ed.previsao_manual ? '' : 'readonly'} value="${ed.data_prevista_parto || ''}">
          <label class="check small"><input type="checkbox" id="c-manual" ${ed.previsao_manual ? 'checked' : ''}> Corrigir a previsão manualmente</label>
          <span class="ajuda" id="c-prev-ajuda">Calculada: data da cobertura + ${gest} dias (ajuste em Configurações › Parâmetros).</span></div>
        <div class="campo"><label for="c-resp">Responsável</label><input id="c-resp" value="${esc(existente ? (ed.responsavel_nome || '') : (store.perfil?.nome || ''))}"></div>
      </div>
      <div class="campo"><label for="c-obs">Observações</label><textarea id="c-obs" rows="2">${esc(ed.observacoes || '')}</textarea></div>
      ${existente ? '' : '<p class="small muted" style="margin:0">Se a vaca já tinha uma cobertura sem diagnóstico, ela passa a ser considerada vazia (repetição de cio).</p>'}
    </form>`,
    rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-cob">${existente ? 'Salvar alterações' : 'Salvar cobertura'}</button>`,
  });
  const f = el.querySelector('form');
  const selecionadas = matrizFixa ? () => [matrizFixa.id]
    : listaMultipla(el.querySelector('#sel-matrizes'), femeas, { detalhe: (a) => [a.categoria_nome, a.lote_nome && `lote ${a.lote_nome}`].filter(Boolean).join(' · ') });
  const data = f.querySelector('#c-data'), prev = f.querySelector('#c-prev'), manual = f.querySelector('#c-manual');
  const tipoAtual = () => f.querySelector('input[name=tipo]:checked').value;
  const recalc = () => { if (!manual.checked && data.value) prev.value = addDias(data.value, diasGestacao(tipoAtual(), gest)); };
  data.addEventListener('input', recalc);
  manual.addEventListener('change', () => { prev.readOnly = !manual.checked; recalc(); });
  const ajustarTipo = () => {
    const t = tipoAtual(); const mn = t === 'monta_natural';
    f.querySelector('#c-fim-campo').classList.toggle('oculto', !mn); f.querySelector('#c-fim-ajuda').classList.toggle('oculto', !mn);
    f.querySelector('#c-acas-campo').classList.toggle('oculto', mn);
    f.querySelector('#c-doad-campo').classList.toggle('oculto', t !== 'tetf');
    f.querySelector('#c-data-rot').innerHTML = `${ROTULO_DATA_COB[t]} <span class="obrig">*</span>`;
    f.querySelector('#c-prev-ajuda').textContent = t === 'tetf'
      ? `Calculada: data da TETF + ${gest - 7} dias (${gest} de gestação menos 7 dias de idade do embrião).`
      : `Calculada: data + ${gest} dias (ajuste em Configurações › Parâmetros).`;
    recalc();
  };
  f.querySelector('#c-rep').addEventListener('change', (e) => f.querySelector('#c-novo-campo').classList.toggle('oculto', e.target.value !== '__novo'));
  f.querySelectorAll('input[name=tipo]').forEach((r) => r.addEventListener('change', ajustarTipo));
  ajustarTipo(); if (!existente) recalc();
  // Doadora: brinco do rebanho vira vínculo; texto livre fica como doadora de fora
  const doadoraDados = () => {
    const v = f.querySelector('#c-doad').value.trim();
    if (!v) return { doadora_id: null, doadora_externa: null };
    const x = doadoras.find((d) => d.brinco.trim().toUpperCase() === v.toUpperCase());
    return x ? { doadora_id: x.id, doadora_externa: null } : { doadora_id: null, doadora_externa: v };
  };
  f.querySelector('#c-doad').addEventListener('input', () => {
    const d = doadoraDados();
    f.querySelector('#c-doad-ajuda').textContent = d.doadora_id ? `Doadora do rebanho: brinco ${doadoras.find((x) => x.id === d.doadora_id).brinco}.`
      : d.doadora_externa ? 'Doadora de fora do rebanho (fica guardado o que foi escrito).' : 'Se for do rebanho, escolha pelo brinco. Se for de fora, escreva o nome ou o registro.';
  });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ids = selecionadas();
    if (!ids.length) return toast('Selecione ao menos uma vaca.', 'erro');
    const tipo = tipoAtual();
    let reprodutorId = f.querySelector('#c-rep').value || null;
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    if (reprodutorId === '__novo') {
      const nome = f.querySelector('#c-novo-nome').value.trim();
      if (!nome) { btn.disabled = false; return toast('Informe o nome do touro (doador do sêmen).', 'erro'); }
      const existente = store.base.reprodutores.find((r) => r.identificacao.trim().toUpperCase() === nome.toUpperCase());
      if (existente) reprodutorId = existente.id;
      else {
        try {
          const novo = { propriedade_id: store.prop.id, tipo: 'semen', identificacao: nome, raca_id: f.querySelector('#c-novo-raca').value || null };
          const r = await incluir('reprodutores', novo, `Cadastro do sêmen ${nome}`);
          reprodutorId = r.id;
          store.base.reprodutores.push({ ...novo, id: r.id, ativo: true, animal_id: null });
        } catch (err) { btn.disabled = false; return toast(traduzirErro(err), 'erro', 8000); }
      }
    }
    if (existente) {
      try {
        const alt = {
          reprodutor_id: reprodutorId, tipo,
          acasalamento: tipo === 'monta_natural' ? null : textoOuNulo(f.querySelector('#c-acas').value),
          data_cobertura: data.value, data_fim: tipo === 'monta_natural' ? f.querySelector('#c-fim').value || null : null,
          previsao_manual: manual.checked, data_prevista_parto: manual.checked ? prev.value || null : null,
          responsavel_nome: textoOuNulo(f.querySelector('#c-resp').value), observacoes: textoOuNulo(f.querySelector('#c-obs').value),
        };
        if (tipo === 'tetf') Object.assign(alt, doadoraDados());
        else if (ed.doadora_id || ed.doadora_externa) Object.assign(alt, { doadora_id: null, doadora_externa: null });
        const { error } = await sb.from('coberturas').update(alt).eq('id', existente.id);
        if (error) throw error;
        toast('Cobertura alterada e confirmada pelo servidor.');
        fechar(); aoSalvar?.();
      } catch (err) { toast(traduzirErro(err), 'erro', 8000); }
      btn.disabled = false;
      return;
    }
    let ok = 0, fila = 0; const erros = [];
    for (const id of ids) {
      const brinco = animais.find((a) => a.id === id)?.brinco;
      try {
        const r = await incluir('coberturas', {
          propriedade_id: store.prop.id, matriz_id: id, reprodutor_id: reprodutorId, tipo,
          acasalamento: tipo === 'monta_natural' ? null : textoOuNulo(f.querySelector('#c-acas').value),
          data_cobertura: data.value, data_fim: tipo === 'monta_natural' ? f.querySelector('#c-fim').value || null : null,
          previsao_manual: manual.checked, data_prevista_parto: manual.checked ? prev.value || null : null,
          responsavel_nome: textoOuNulo(f.querySelector('#c-resp').value), observacoes: textoOuNulo(f.querySelector('#c-obs').value),
          ...(tipo === 'tetf' ? doadoraDados() : {}),
        }, `Cobertura da vaca ${brinco}`);
        if (r.sincronizado) ok++; else fila++;
      } catch (err) { erros.push(`${brinco}: ${traduzirErro(err)}`); }
    }
    btn.disabled = false;
    if (erros.length) toast(`Não salvas — ${erros.join(' | ')}`, 'erro', 10000);
    if (ok) toast(`${ok} cobertura${ok > 1 ? 's' : ''} salva${ok > 1 ? 's' : ''} e confirmada${ok > 1 ? 's' : ''} pelo servidor.`);
    if (fila) toast(`Sem conexão: ${fila} cobertura(s) guardada(s) neste aparelho, ainda NÃO sincronizada(s).`, 'aviso', 8000);
    if (ok || fila) { fechar(); aoSalvar?.(); }
  });
}

// ---------------------------------------------------------------------
// DIAGNÓSTICO DE GESTAÇÃO (individual ou em lote)
// ---------------------------------------------------------------------
export async function abrirDiagnostico(matrizFixa = null, aoSalvar) {
  if (semPermissao()) return;
  const animais = await carregarAnimais();
  if (!animais) return;
  let cobs = [];
  const { data, error } = await sb.from('coberturas').select('id, matriz_id, data_cobertura, tipo, data_prevista_parto, situacao')
    .eq('propriedade_id', store.prop.id).in('situacao', ['aguardando_diagnostico', 'prenhe']).order('data_cobertura');
  if (!error) cobs = data || [];
  const porId = new Map(animais.map((a) => [a.id, a]));
  const ultima = new Map();
  cobs.forEach((c) => ultima.set(c.matriz_id, c));
  let linhas = matrizFixa ? [matrizFixa.id]
    : [...ultima.values()].filter((c) => c.situacao === 'aguardando_diagnostico' && porId.get(c.matriz_id)?.conta_no_rebanho).map((c) => c.matriz_id);

  const { el, fechar } = abrirModal({
    titulo: 'Confirmar prenhez',
    largo: true,
    html: `<form id="f-diag" class="grade" style="gap:14px">
      <div class="grade grade-3" style="gap:14px">
        <div class="campo"><label for="d-data">Data do diagnóstico <span class="obrig">*</span></label><input id="d-data" type="date" required max="${hojeISO()}" value="${hojeISO()}"></div>
        <div class="campo"><label for="d-met">Método</label><select id="d-met"><option>Ultrassom</option><option>Palpação retal</option><option>Exame de sangue</option><option>Outro</option></select></div>
        <div class="campo"><label for="d-resp">Responsável / veterinário</label><input id="d-resp" value="${esc(store.perfil?.nome || '')}"></div>
      </div>
      <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Vaca</th><th>Cobertura</th><th>Resultado</th><th>Idade gestacional (dias)</th></tr></thead>
        <tbody id="d-linhas"></tbody></table></div>
      ${matrizFixa ? '' : '<div id="d-add"></div>'}
      <p class="small muted" style="margin:0">Deixe o resultado em branco para as vacas que não foram examinadas. Sem cobertura registrada, informe a idade gestacional estimada para calcular a previsão de parto.</p>
    </form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-diag">Salvar</button>',
  });
  const corpo = el.querySelector('#d-linhas');
  const desenhar = () => {
    corpo.innerHTML = linhas.length ? linhas.map((id) => {
      const a = porId.get(id) || matrizFixa; const c = ultima.get(id);
      return `<tr data-id="${id}"><td><b>${esc(a.brinco)}</b><div class="small muted">${esc(a.categoria_nome || '')}</div></td>
        <td class="small">${c ? `${fmtData(c.data_cobertura)}<br>${diasEntre(c.data_cobertura, hojeISO())} dias` : '<span class="muted">sem cobertura</span>'}</td>
        <td><select data-res><option value="">—</option><option value="prenhe">Prenhe</option><option value="vazia">Vazia</option><option value="inconclusivo">Inconclusivo</option></select></td>
        <td><input data-idade inputmode="numeric" style="max-width:110px" placeholder="${c ? 'opcional' : 'se prenhe'}"></td></tr>`;
    }).join('') : '<tr><td colspan="4" class="muted">Nenhuma vaca aguardando diagnóstico. Adicione abaixo pelo brinco.</td></tr>';
  };
  desenhar();
  if (!matrizFixa) {
    const slot = el.querySelector('#d-add');
    campoAnimal(slot, animais, { id: 'd-nova', rotulo: 'Adicionar outra vaca', obrigatorio: false, filtro: (a) => a.sexo === 'F' && a.conta_no_rebanho });
    slot.addEventListener('animal', (e) => {
      if (e.detail && !linhas.includes(e.detail.id)) { linhas = [...linhas, e.detail.id]; desenhar(); slot.querySelector('input').value = ''; }
    });
  }
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const itens = [...corpo.querySelectorAll('tr[data-id]')].map((tr) => ({ id: tr.dataset.id, res: tr.querySelector('[data-res]').value, idade: numOuNulo(tr.querySelector('[data-idade]').value) }))
      .filter((x) => x.res);
    if (!itens.length) return toast('Informe o resultado de ao menos uma vaca.', 'erro');
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    let ok = 0, fila = 0; const erros = [];
    for (const it of itens) {
      const a = porId.get(it.id) || matrizFixa; const c = ultima.get(it.id);
      try {
        const r = await incluir('diagnosticos_gestacao', {
          propriedade_id: store.prop.id, matriz_id: it.id, cobertura_id: c?.situacao === 'aguardando_diagnostico' ? c.id : null,
          data_diagnostico: el.querySelector('#d-data').value, resultado: it.res, metodo: el.querySelector('#d-met').value,
          idade_gestacional_dias: it.idade, responsavel_nome: textoOuNulo(el.querySelector('#d-resp').value),
        }, `Diagnóstico da vaca ${a.brinco}: ${it.res}`);
        if (r.sincronizado) ok++; else fila++;
      } catch (err) { erros.push(`${a.brinco}: ${traduzirErro(err)}`); }
    }
    btn.disabled = false;
    if (erros.length) toast(`Não salvos — ${erros.join(' | ')}`, 'erro', 10000);
    if (ok) toast(`${ok} diagnóstico(s) salvo(s) e confirmado(s) pelo servidor.`);
    if (fila) toast(`Sem conexão: ${fila} diagnóstico(s) guardado(s) neste aparelho, ainda NÃO sincronizado(s).`, 'aviso', 8000);
    if (ok || fila) { fechar(); aoSalvar?.(); }
  });
}

// ---------------------------------------------------------------------
// NASCIMENTO / PARTO
// ---------------------------------------------------------------------
export async function abrirNascimento(matrizFixa = null, aoSalvar) {
  if (semPermissao()) return;
  const animais = await carregarAnimais();
  if (!animais) return;
  const reprod = store.base.reprodutores.filter((r) => r.ativo);
  let mae = matrizFixa;
  let cobAtual = null;

  const { el, fechar } = abrirModal({
    titulo: 'Registrar nascimento',
    largo: true,
    html: `<form id="f-nasc" novalidate>
      <fieldset class="etapa-form"><legend><i data-lucide="heart"></i> Parto</legend><div class="form-grade">
        ${matrizFixa ? `<div class="campo largo"><div class="alerta"><i data-lucide="heart"></i><div>Mãe: <b>${esc(matrizFixa.brinco)}</b>${matrizFixa.nome ? ` — ${esc(matrizFixa.nome)}` : ''}</div></div></div>` : '<div class="campo largo" id="n-mae"></div>'}
        <div class="campo"><label for="n-data">Data do nascimento <span class="obrig">*</span></label><input id="n-data" type="date" required max="${hojeISO()}" value="${hojeISO()}"></div>
        <div class="campo largo"><label>Resultado <span class="obrig">*</span></label><div class="opcoes-radio">
          ${Object.entries(ROTULO_RESULTADO).map(([k, r], i) => `<label><input type="radio" name="resultado" value="${k}" ${i === 0 ? 'checked' : ''}> ${r}</label>`).join('')}</div></div>
        <div class="campo"><label for="n-tipo">Tipo de parto</label><select id="n-tipo"><option value="">Não informado</option><option value="normal">Normal</option><option value="assistido">Assistido</option><option value="cesariana">Cesariana</option></select></div>
        <div class="campo largo"><label for="n-ocor">Ocorrências no parto</label><input id="n-ocor" placeholder="Ex.: bezerro mal posicionado, retenção de placenta…"></div>
        <div class="campo largo"><div id="n-cob" class="small muted"></div></div>
      </div></fieldset>
      <fieldset class="etapa-form" id="n-bezerro"><legend><i data-lucide="baby"></i> Bezerro</legend><div class="form-grade">
        <div class="campo"><label>Sexo <span class="obrig">*</span></label><div class="opcoes-radio">
          <label><input type="radio" name="sexo" value="F"> Fêmea</label><label><input type="radio" name="sexo" value="M"> Macho</label></div></div>
        <div class="campo"><label for="n-brinco">Brinco do bezerro <span class="obrig">*</span></label><input id="n-brinco" maxlength="30" autocomplete="off"><span class="msg-erro" id="n-erro-brinco"></span></div>
        <div class="campo"><label for="n-nome">Nome (opcional)</label><input id="n-nome" maxlength="60"></div>
        <div class="campo"><label for="n-peso">Peso ao nascer (kg)</label><input id="n-peso" inputmode="decimal" placeholder="Ex.: 32"></div>
        <div class="campo"><label for="n-pai">Pai (touro / sêmen)</label><select id="n-pai">${opcoes(reprod, { rotulo: nomeReprodutor, vazio: 'Não informado / externo' })}</select></div>
        <div class="campo"><label for="n-paiext">Pai — identificação externa</label><input id="n-paiext" placeholder="Se o pai não está cadastrado"></div>
      </div></fieldset>
      <fieldset class="etapa-form"><legend><i data-lucide="clipboard-list"></i> Registro</legend><div class="form-grade">
        <div class="campo"><label for="n-resp">Responsável</label><input id="n-resp" value="${esc(store.perfil?.nome || '')}"></div>
        <div class="campo largo"><label for="n-obs">Observações</label><textarea id="n-obs" rows="2"></textarea></div>
        <div class="campo largo"><p class="small muted" style="margin:0">Ao salvar um bezerro vivo, o sistema cria a ficha dele (vinculada à mãe e ao pai), registra a entrada no rebanho e o peso ao nascer, e atualiza o histórico da mãe. Novilha que pariu passa a ser matriz.</p></div>
      </div></fieldset>
      <div class="form-rodape"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit">Salvar nascimento</button></div>
    </form>`,
  });
  const f = el.querySelector('form');
  if (window.matchMedia('(max-width: 720px)').matches) ativarWizard(f);
  const infoCob = f.querySelector('#n-cob');
  const mostrarCob = async () => {
    cobAtual = null; infoCob.textContent = '';
    if (!mae) return;
    const { data } = await sb.from('coberturas').select('*').eq('matriz_id', mae.id).in('situacao', ['prenhe', 'aguardando_diagnostico']).order('data_cobertura', { ascending: false }).limit(1);
    cobAtual = data?.[0] || null;
    if (cobAtual) {
      const r = store.base.reprodutores.find((x) => x.id === cobAtual.reprodutor_id);
      infoCob.textContent = `Cobertura vinculada: ${fmtData(cobAtual.data_cobertura)}${r ? ` com ${nomeReprodutor(r)}` : ''} · previsão de parto ${fmtData(cobAtual.data_prevista_parto)}.`;
      if (r && !f.querySelector('#n-pai').value) f.querySelector('#n-pai').value = r.id;
    } else infoCob.textContent = 'Nenhuma cobertura em aberto registrada para esta vaca (o parto será registrado assim mesmo).';
  };
  if (!matrizFixa) {
    const slot = f.querySelector('#n-mae');
    campoAnimal(slot, animais, { id: 'n-sel-mae', rotulo: 'Mãe (brinco)', filtro: (a) => a.sexo === 'F' && a.conta_no_rebanho });
    slot.addEventListener('animal', (e) => { mae = e.detail; mostrarCob(); });
  } else mostrarCob();

  const ajustar = () => {
    const vivo = f.querySelector('input[name=resultado]:checked').value === 'vivo';
    f.querySelector('#n-bezerro').classList.toggle('oculto', !vivo);
    f.querySelector('#n-brinco').required = vivo;
    f.querySelectorAll('input[name=sexo]').forEach((r) => { r.required = vivo; });
  };
  f.querySelectorAll('input[name=resultado]').forEach((r) => r.addEventListener('change', ajustar));
  ajustar();
  const brincoDup = () => { const v = f.querySelector('#n-brinco').value.trim().toUpperCase(); return v && animais.find((a) => a.brinco.trim().toUpperCase() === v); };
  f.querySelector('#n-brinco').addEventListener('input', () => {
    const d = brincoDup();
    f.querySelector('#n-erro-brinco').textContent = d ? `Já existe o animal ${d.brinco} (${d.status_nome}).` : '';
  });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!mae) return toast('Selecione a mãe.', 'erro');
    if (!f.checkValidity()) { f.reportValidity(); return; }
    const resultado = f.querySelector('input[name=resultado]:checked').value;
    const vivo = resultado === 'vivo';
    if (vivo && brincoDup()) return toast('Este número de brinco já está em uso.', 'erro');
    const peso = numOuNulo(f.querySelector('#n-peso').value);
    if (f.querySelector('#n-peso').value && (!peso || peso <= 0)) return toast('Peso ao nascer inválido.', 'erro');
    const bezerroId = crypto.randomUUID();
    const dados = {
      matriz_id: mae.id, data_nascimento: f.querySelector('#n-data').value, resultado,
      sexo: vivo ? f.querySelector('input[name=sexo]:checked')?.value : null,
      brinco: vivo ? f.querySelector('#n-brinco').value.trim() : null, nome: vivo ? textoOuNulo(f.querySelector('#n-nome').value) : null,
      peso_nascimento: vivo ? peso : null, reprodutor_id: f.querySelector('#n-pai').value || null,
      pai_externo: textoOuNulo(f.querySelector('#n-paiext').value), tipo_parto: f.querySelector('#n-tipo').value || null,
      ocorrencias: textoOuNulo(f.querySelector('#n-ocor').value), observacoes: textoOuNulo(f.querySelector('#n-obs').value),
      responsavel_nome: textoOuNulo(f.querySelector('#n-resp').value), bezerro_id: vivo ? bezerroId : null,
    };
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const r = await chamar('registrar_nascimento', { p_dados: dados },
        vivo ? `Nascimento do bezerro ${dados.brinco} (mãe ${mae.brinco})` : `${ROTULO_RESULTADO[resultado]} — vaca ${mae.brinco}`);
      avisoResultado(r, vivo ? 'Nascimento' : 'Registro');
      fechar();
      if (vivo && r.sincronizado) toast(`Ficha do bezerro ${dados.brinco} criada.`, 'info');
      aoSalvar?.(vivo && r.sincronizado ? bezerroId : null);
    } catch (err) { toast(traduzirErro(err), 'erro', 8000); btn.disabled = false; }
  });
}

// ---------------------------------------------------------------------
// DESMAME (em lote, com peso individual)
// ---------------------------------------------------------------------
export async function abrirDesmame(bezerroFixo = null, aoSalvar) {
  if (semPermissao()) return;
  const animais = await carregarAnimais();
  if (!animais) return;
  let desmamados = new Set();
  const r0 = await sb.from('desmames').select('bezerro_id').eq('propriedade_id', store.prop.id);
  if (!r0.error) desmamados = new Set(r0.data.map((d) => d.bezerro_id));
  const idade = param('idade_desmame_dias');
  const candidatos = bezerroFixo ? [bezerroFixo]
    : animais.filter((a) => a.conta_no_rebanho && a.categoria_grupo === 'bezerro' && !desmamados.has(a.id))
      .sort((x, y) => (x.data_nascimento || '9').localeCompare(y.data_nascimento || '9'));
  if (!candidatos.length) return toast('Não há bezerros ativos sem desmame registrado.', 'info');

  const { el, fechar } = abrirModal({
    titulo: 'Registrar desmame',
    largo: true,
    html: `<form id="f-desm" class="grade" style="gap:14px">
      <div class="grade grade-2" style="gap:14px">
        <div class="campo"><label for="m-data">Data do desmame <span class="obrig">*</span></label><input id="m-data" type="date" required max="${hojeISO()}" value="${hojeISO()}"></div>
        <div class="campo"><label for="m-resp">Responsável</label><input id="m-resp" value="${esc(store.perfil?.nome || '')}"></div>
      </div>
      <div class="tabela-wrap"><table class="tabela"><thead><tr><th></th><th>Bezerro</th><th>Mãe</th><th>Idade</th><th>Peso ao desmame (kg)</th></tr></thead><tbody>
        ${candidatos.map((a) => {
          const ok = a.data_nascimento && diasEntre(a.data_nascimento, hojeISO()) >= idade - 30;
          return `<tr data-id="${a.id}"><td><input type="checkbox" data-sel ${bezerroFixo || ok ? 'checked' : ''} aria-label="Selecionar ${esc(a.brinco)}"></td>
          <td><b>${esc(a.brinco)}</b> <span class="small muted">${a.sexo === 'F' ? 'F' : 'M'}</span></td><td>${esc(a.mae_brinco || a.mae_externa || '—')}</td>
          <td class="small">${idadeTexto(a.data_nascimento)}</td><td><input data-peso inputmode="decimal" style="max-width:110px" placeholder="opcional"></td></tr>`;
        }).join('')}
      </tbody></table></div>
      <div class="campo"><label for="m-obs">Observações (para todos)</label><input id="m-obs"></div>
      <p class="small muted" style="margin:0">Vêm marcados os bezerros com idade próxima da idade de desmame configurada (${idade} dias). O peso informado também entra no histórico de pesagens.</p>
    </form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-desm">Salvar desmame</button>',
  });
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const linhas = [...el.querySelectorAll('tr[data-id]')].filter((tr) => tr.querySelector('[data-sel]').checked);
    if (!linhas.length) return toast('Selecione ao menos um bezerro.', 'erro');
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    let ok = 0, fila = 0; const erros = [];
    for (const tr of linhas) {
      const a = candidatos.find((x) => x.id === tr.dataset.id);
      const campoPeso = tr.querySelector('[data-peso]').value;
      const peso = numOuNulo(campoPeso);
      if (campoPeso && (!peso || peso <= 0)) { erros.push(`${a.brinco}: peso inválido`); continue; }
      try {
        const r = await chamar('registrar_desmame', {
          p_bezerro: a.id, p_data: el.querySelector('#m-data').value, p_peso: peso,
          p_responsavel: textoOuNulo(el.querySelector('#m-resp').value), p_observacoes: textoOuNulo(el.querySelector('#m-obs').value),
        }, `Desmame do bezerro ${a.brinco}${peso ? ` (${fmtKg(peso)})` : ''}`);
        if (r.sincronizado) ok++; else fila++;
      } catch (err) { erros.push(`${a.brinco}: ${traduzirErro(err)}`); }
    }
    btn.disabled = false;
    if (erros.length) toast(`Não salvos — ${erros.join(' | ')}`, 'erro', 10000);
    if (ok) toast(`${ok} desmame(s) salvo(s) e confirmado(s) pelo servidor.`);
    if (fila) toast(`Sem conexão: ${fila} desmame(s) guardado(s) neste aparelho, ainda NÃO sincronizado(s).`, 'aviso', 8000);
    if (ok || fila) { fechar(); aoSalvar?.(); }
  });
}

// ---------------------------------------------------------------------
// SÊMEN / REPRODUTOR EXTERNO
// ---------------------------------------------------------------------
/** Exclui uma cobertura lançada por engano (servidor desfaz os efeitos na matriz). */
export async function excluirCobertura(c, brinco, aoSalvar) {
  if (!podeExcluir('reproducao')) return toast('Você não tem permissão para excluir coberturas.', 'erro');
  const ok = await confirmar({ titulo: 'Excluir cobertura', perigo: true, botao: 'Excluir',
    mensagem: `Excluir a cobertura de <b>${fmtData(c.data_cobertura)}</b> da vaca <b>${esc(brinco || '')}</b>?<br><br>Se houver diagnóstico de gestação ligado a ela, ele também será excluído. A situação da matriz é recalculada pelos registros que ficarem. Esta ação não pode ser desfeita.` });
  if (!ok) return;
  try {
    exigirConexao();
    const { data, error } = await sb.rpc('excluir_cobertura', { p_id: c.id });
    if (error) throw error;
    toast(data || 'Cobertura excluída.');
    aoSalvar?.();
  } catch (err) { toast(traduzirErro(err), 'erro', 9000); }
}

export function abrirSemen(registro = null, aoSalvar) {
  if (semPermissao()) return;
  const r = registro || {};
  const { el, fechar } = abrirModal({
    titulo: registro ? `Reprodutor ${registro.identificacao}` : 'Cadastrar sêmen (touro de central)',
    html: `<form id="f-sem" class="grade" style="gap:12px">
      <div class="campo"><label for="s-id">Nome / identificação do touro <span class="obrig">*</span></label><input id="s-id" required value="${esc(r.identificacao || '')}"></div>
      <div class="campo"><label for="s-raca">Raça</label><select id="s-raca">${opcoes(store.base.racas.filter((x) => x.ativo || x.id === r.raca_id), { selecionado: r.raca_id, vazio: 'Não informada' })}</select></div>
      <div class="campo"><label for="s-reg">Registro (RGD / RGN)</label><input id="s-reg" value="${esc(r.registro || '')}"></div>
      <div class="campo"><label for="s-central">Central de sêmen</label><input id="s-central" value="${esc(r.central_semen || '')}"></div>
      <div class="campo"><label for="s-obs">Observações</label><textarea id="s-obs" rows="2">${esc(r.observacoes || '')}</textarea></div>
      ${registro ? `<label class="check"><input type="checkbox" id="s-ativo" ${r.ativo ? 'checked' : ''}> Ativo (aparece nos formulários)</label>` : ''}
    </form>`,
    rodape: `${registro && podeExcluir('reproducao') ? '<button class="btn btn-perigo" data-excluir style="margin-right:auto">Excluir</button>' : ''}<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-sem">Salvar</button>`,
  });
  el.querySelector('[data-excluir]')?.addEventListener('click', async () => {
    const ok = await confirmar({ titulo: 'Excluir reprodutor', mensagem: `Excluir <b>${esc(registro.identificacao)}</b>? Esta ação não pode ser desfeita.`, botao: 'Excluir', perigo: true });
    if (!ok) return;
    try {
      exigirConexao();
      const { error } = await sb.from('reprodutores').delete().eq('id', registro.id);
      if (error) throw error;
      await carregarBase();
      toast('Reprodutor excluído.');
      fechar(); aoSalvar?.();
    } catch (err) {
      if (err?.code === '23503') toast('Este reprodutor já foi usado em coberturas, nascimentos ou como pai de algum animal, por isso não pode ser excluído. Para tirá-lo das listas, desmarque "Ativo" e salve.', 'aviso', 10000);
      else toast(traduzirErro(err), 'erro', 7000);
    }
  });
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dados = {
      identificacao: el.querySelector('#s-id').value.trim(), raca_id: el.querySelector('#s-raca').value || null,
      registro: textoOuNulo(el.querySelector('#s-reg').value), central_semen: textoOuNulo(el.querySelector('#s-central').value),
      observacoes: textoOuNulo(el.querySelector('#s-obs').value),
    };
    try {
      exigirConexao();
      const q = registro
        ? sb.from('reprodutores').update({ ...dados, ativo: el.querySelector('#s-ativo').checked }).eq('id', registro.id)
        : sb.from('reprodutores').insert({ ...dados, propriedade_id: store.prop.id, tipo: 'semen' });
      const { error } = await q;
      if (error) throw error;
      await carregarBase();
      toast('Reprodutor salvo.');
      fechar(); aoSalvar?.();
    } catch (err) { toast(traduzirErro(err), 'erro'); }
  });
}

// ---------------------------------------------------------------------
// SITUAÇÃO REPRODUTIVA (ajuste manual)
// ---------------------------------------------------------------------
export function abrirSituacao(matriz, animal, aoSalvar) {
  if (semPermissao()) return;
  const manuais = ['vazia', 'em_reproducao', 'coberta', 'prenhe', 'pos_parto'];
  const { el, fechar } = abrirModal({
    titulo: `Situação reprodutiva — ${animal.brinco}`,
    html: `<form id="f-sit" class="grade" style="gap:12px">
      <div class="campo"><label for="t-sit">Situação</label><select id="t-sit">${manuais.map((k) => `<option value="${k}" ${matriz.situacao_reprodutiva === k ? 'selected' : ''}>${ROTULO_SITUACAO_REPRO[k]}</option>`).join('')}</select>
        <span class="ajuda">A situação é atualizada automaticamente por coberturas, diagnósticos e partos. Use este ajuste só para corrigir ou indicar "Em reprodução" (com o touro).</span></div>
      <label class="check"><input type="checkbox" id="t-apta" ${matriz.apta_reproducao ? 'checked' : ''}> Apta para reprodução (desmarque para descarte reprodutivo)</label>
      <div class="campo"><label for="t-obs">Observações</label><textarea id="t-obs" rows="3">${esc(matriz.observacoes || '')}</textarea></div>
    </form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-sit">Salvar</button>',
  });
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      exigirConexao();
      const { error } = await sb.from('matrizes').update({
        situacao_reprodutiva: el.querySelector('#t-sit').value, data_situacao: hojeISO(),
        apta_reproducao: el.querySelector('#t-apta').checked, observacoes: textoOuNulo(el.querySelector('#t-obs').value),
      }).eq('id', matriz.id);
      if (error) throw error;
      toast('Situação atualizada.');
      fechar(); aoSalvar?.();
    } catch (err) { toast(traduzirErro(err), 'erro'); }
  });
}
