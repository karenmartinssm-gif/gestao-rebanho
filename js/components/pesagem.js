// Registro rápido de pesagem individual (funciona sem internet: fica na fila)
import { sb } from '../supabase.js';
import { store, pode, nomePasto } from '../store.js';
import { esc, abrirModal, toast, traduzirErro, hojeISO, fmtKg, fmtData, fmtNum, diasEntre, numOuNulo, textoOuNulo, icones, confirmar } from '../ui.js';
import { incluir, chamar, exigirConexao } from '../sync.js';
import { listarAnimais, campoAnimal } from './animais-comum.js';

export async function abrirPesagem(animalFixo = null, aoSalvar) {
  if (!pode('pesagens')) return toast('Você não tem permissão para registrar pesagens.', 'erro');
  let animais = [];
  if (!animalFixo) {
    try { animais = await listarAnimais({ somenteAtivos: true }); }
    catch (e) { return toast(traduzirErro(e), 'erro'); }
    if (!animais.length) return toast('Não há animais ativos cadastrados.', 'aviso');
  }
  let escolhido = animalFixo;

  const { el, fechar } = abrirModal({
    titulo: 'Registrar pesagem',
    html: `<form id="f-pesagem" class="grade" style="gap:14px">
      ${animalFixo ? `<div class="alerta"><i data-lucide="tag"></i><div>Animal <b>${esc(animalFixo.brinco)}</b>${animalFixo.nome ? ` — ${esc(animalFixo.nome)}` : ''}</div></div>` : '<div id="slot-animal"></div>'}
      <div class="grade grade-2" style="gap:14px">
        <div class="campo"><label for="pdata">Data <span class="obrig">*</span></label><input id="pdata" type="date" required max="${hojeISO()}" value="${hojeISO()}"></div>
        <div class="campo"><label for="ppeso">Peso (kg) <span class="obrig">*</span></label><input id="ppeso" inputmode="decimal" required pattern="[0-9]+([,.][0-9]{1,2})?" placeholder="Ex.: 312,5"></div>
      </div>
      <div class="campo"><label for="presp">Responsável pela pesagem</label><input id="presp" value="${esc(store.perfil?.nome || '')}"></div>
      <div class="campo"><label for="pobs">Observações</label><textarea id="pobs" rows="2"></textarea></div>
      <div id="p-previa" class="small muted"></div>
    </form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-pesagem">Salvar pesagem</button>',
  });

  const previa = el.querySelector('#p-previa');
  const atualizarPrevia = () => {
    const peso = numOuNulo(el.querySelector('#ppeso').value);
    const data = el.querySelector('#pdata').value;
    if (!escolhido?.peso_atual || !escolhido.data_ultima_pesagem) { previa.textContent = escolhido ? 'Primeira pesagem registrada deste animal.' : ''; return; }
    let txt = `Última pesagem: ${fmtKg(escolhido.peso_atual)} em ${fmtData(escolhido.data_ultima_pesagem)}.`;
    const dias = data ? diasEntre(escolhido.data_ultima_pesagem, data) : 0;
    if (peso && dias > 0) txt += ` Ganho: ${fmtNum(peso - escolhido.peso_atual, 1)} kg em ${dias} dias · GMD ${fmtNum((peso - escolhido.peso_atual) / dias, 3)} kg/dia.`;
    previa.textContent = txt;
  };
  if (!animalFixo) {
    const slot = el.querySelector('#slot-animal');
    const achar = campoAnimal(slot, animais);
    slot.addEventListener('animal', (e) => { escolhido = e.detail; atualizarPrevia(); });
    escolhido = null;
    void achar;
  }
  el.querySelector('#ppeso').addEventListener('input', atualizarPrevia);
  el.querySelector('#pdata').addEventListener('input', atualizarPrevia);
  atualizarPrevia();

  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!escolhido) return toast('Selecione o animal.', 'erro');
    const peso = numOuNulo(el.querySelector('#ppeso').value);
    if (!peso || peso <= 0) return toast('Informe um peso válido.', 'erro');
    const btn = el.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const r = await incluir('pesagens', {
        propriedade_id: store.prop.id,
        animal_id: escolhido.id,
        data_pesagem: el.querySelector('#pdata').value,
        peso_kg: peso,
        tipo: 'rotina',
        responsavel_nome: textoOuNulo(el.querySelector('#presp').value),
        observacoes: textoOuNulo(el.querySelector('#pobs').value),
      }, `Pesagem do animal ${escolhido.brinco}: ${fmtKg(peso)}`);
      if (r.sincronizado) toast('Pesagem salva e confirmada pelo servidor.');
      else toast('Sem conexão: pesagem guardada neste aparelho e ainda NÃO sincronizada.', 'aviso', 7000);
      fechar();
      aoSalvar?.(r);
    } catch (err) {
      toast(traduzirErro(err), 'erro');
      btn.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------
// Pesagem coletiva: escolhe o grupo (lote, pasto, categoria ou todos),
// digita o peso de cada animal e salva tudo de uma vez.
// Sem internet, fica guardada no aparelho e é enviada depois (sem duplicar).
// ---------------------------------------------------------------------
export async function abrirPesagemColetiva(pre = {}, aoSalvar) {
  if (!pode('pesagens')) return toast('Você não tem permissão para registrar pesagens.', 'erro');
  let animais;
  try { animais = await listarAnimais({ somenteAtivos: true }); } catch (e) { return toast(traduzirErro(e), 'erro'); }
  if (!animais.length) return toast('Não há animais ativos cadastrados.', 'aviso');
  const lotes = store.base.lotes.filter((l) => l.ativo);
  const pastos = store.base.pastos.filter((p) => p.ativo);
  const cats = store.base.categorias.filter((c) => animais.some((a) => a.categoria_id === c.id));
  const pesos = new Map();     // animal_id -> texto digitado
  const extras = new Set();    // animais incluídos à mão
  const grupoId = crypto.randomUUID();

  const { el, fechar } = abrirModal({
    titulo: 'Pesagem coletiva',
    largo: true,
    html: `<form id="f-pc" class="grade" style="gap:14px">
      <div class="grade grade-3" style="gap:14px">
        <div class="campo"><label for="pc-data">Data da pesagem <span class="obrig">*</span></label><input id="pc-data" type="date" required max="${hojeISO()}" value="${hojeISO()}"></div>
        <div class="campo"><label for="pc-grupo">Animais de</label><select id="pc-grupo">
          ${lotes.length ? `<optgroup label="Lote">${lotes.map((l) => `<option value="lote:${l.id}" ${pre.lote_id === l.id ? 'selected' : ''}>Lote ${esc(l.nome)}</option>`).join('')}</optgroup>` : ''}
          ${pastos.length ? `<optgroup label="Pasto">${pastos.map((x) => `<option value="pasto:${x.id}" ${pre.pasto_id === x.id ? 'selected' : ''}>Pasto ${esc(nomePasto(x))}</option>`).join('')}</optgroup>` : ''}
          ${cats.length ? `<optgroup label="Categoria">${cats.map((c) => `<option value="cat:${c.id}">${esc(c.nome)}</option>`).join('')}</optgroup>` : ''}
          <option value="todos" ${!lotes.length && !pastos.length ? 'selected' : ''}>Todos os animais ativos</option>
          <option value="nenhum">Só os que eu incluir pelo brinco</option></select></div>
        <div class="campo"><label for="pc-resp">Responsável</label><input id="pc-resp" value="${esc(store.perfil?.nome || '')}"></div>
      </div>
      <div class="campo"><label for="pc-add">Incluir outro animal pelo brinco</label>
        <div style="display:flex;gap:8px"><input id="pc-add" list="pc-add-lista" autocomplete="off" placeholder="Digite o brinco e toque em Incluir"><button type="button" class="btn" id="pc-add-btn">Incluir</button></div>
        <datalist id="pc-add-lista">${animais.map((a) => `<option value="${esc(a.brinco)}">${esc(a.categoria_nome || '')}</option>`).join('')}</datalist></div>
      <div class="tabela-wrap"><table class="tabela responsiva tabela-pesagem"><thead><tr><th>Brinco</th><th>Última pesagem</th><th class="dir">Peso hoje (kg)</th><th class="dir">Ganho / GMD</th></tr></thead><tbody id="pc-linhas"></tbody></table></div>
      <div class="alerta small" id="pc-resumo"><i data-lucide="scale"></i><div></div></div>
      <div class="campo"><label for="pc-obs">Observações</label><input id="pc-obs" placeholder="Ex.: balança do curral, jejum de 12 h"></div>
      <p class="small muted" style="margin:0">Dica: depois de digitar um peso, aperte Enter para ir ao próximo animal. Animais sem peso são ignorados.</p>
    </form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-pc">Salvar pesagens</button>',
  });
  const f = el.querySelector('form');
  const $ = (s) => f.querySelector(s);
  const porId = new Map(animais.map((a) => [a.id, a]));

  const doGrupo = () => {
    const [tipo, id] = $('#pc-grupo').value.split(':');
    const base = tipo === 'lote' ? animais.filter((a) => a.lote_id === id)
      : tipo === 'pasto' ? animais.filter((a) => a.pasto_id === id)
      : tipo === 'cat' ? animais.filter((a) => a.categoria_id === id)
      : tipo === 'todos' ? animais : [];
    const ids = new Set(base.map((a) => a.id));
    return [...base, ...[...extras].filter((x) => !ids.has(x)).map((x) => porId.get(x))];
  };
  // Aviso quando o peso foge muito do anterior (provável erro de digitação)
  const suspeito = (a, peso) => a.peso_atual && (peso < a.peso_atual * 0.7 || peso > a.peso_atual * 1.5);
  const info = (a, txt) => {
    const peso = numOuNulo(txt);
    if (!peso) return '';
    if (peso <= 0 || peso >= 2000) return '<span class="badge perigo">peso inválido</span>';
    if (!a.peso_atual || !a.data_ultima_pesagem) return '<span class="small muted">primeira pesagem</span>';
    const dias = diasEntre(a.data_ultima_pesagem, $('#pc-data').value);
    const ganho = peso - a.peso_atual;
    return `${ganho >= 0 ? '+' : ''}${fmtNum(ganho, 1)} kg${dias > 0 ? ` · <b>${fmtNum(ganho / dias, 3)}</b> kg/dia` : ''}${suspeito(a, peso) ? ' <span class="badge aviso">confira</span>' : ''}`;
  };
  const resumo = () => {
    const lista = doGrupo().filter((a) => numOuNulo(pesos.get(a.id)));
    const vals = lista.map((a) => numOuNulo(pesos.get(a.id)));
    const gmds = lista.filter((a) => a.peso_atual && a.data_ultima_pesagem && diasEntre(a.data_ultima_pesagem, $('#pc-data').value) >= 7)
      .map((a) => (numOuNulo(pesos.get(a.id)) - a.peso_atual) / diasEntre(a.data_ultima_pesagem, $('#pc-data').value));
    $('#pc-resumo div').innerHTML = `<b>${lista.length}</b> de ${doGrupo().length} animal(is) com peso` +
      (vals.length ? ` · peso médio <b>${fmtKg(vals.reduce((s, v) => s + v, 0) / vals.length)}</b>` : '') +
      (gmds.length ? ` · GMD médio desde a última pesagem <b>${fmtNum(gmds.reduce((s, v) => s + v, 0) / gmds.length, 3)} kg/dia</b>` : '');
  };
  const desenhar = () => {
    const lista = doGrupo();
    $('#pc-linhas').innerHTML = lista.length ? lista.map((a) => `<tr data-id="${a.id}">
      <td data-rotulo="Brinco" class="primaria"><b>${esc(a.brinco)}</b> <span class="small muted">${esc(a.categoria_nome || '')}${a.lote_nome ? ` · ${esc(a.lote_nome)}` : ''}</span></td>
      <td data-rotulo="Última pesagem">${a.peso_atual ? `${fmtKg(a.peso_atual)} <span class="small muted">${fmtData(a.data_ultima_pesagem)}</span>` : '<span class="muted">—</span>'}</td>
      <td data-rotulo="Peso hoje (kg)" class="dir"><input class="pc-peso" inputmode="decimal" enterkeyhint="next" aria-label="Peso do animal ${esc(a.brinco)}" value="${esc(pesos.get(a.id) || '')}" style="max-width:120px;text-align:right"></td>
      <td data-rotulo="Ganho / GMD" class="dir pc-info">${info(a, pesos.get(a.id))}</td></tr>`).join('')
      : '<tr><td colspan="4" style="display:table-cell"><span class="muted">Nenhum animal neste grupo. Escolha outro grupo ou inclua pelo brinco.</span></td></tr>';
    resumo();
  };
  $('#pc-linhas').addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    pesos.set(tr.dataset.id, e.target.value);
    tr.querySelector('.pc-info').innerHTML = info(porId.get(tr.dataset.id), e.target.value);
    resumo();
  });
  $('#pc-linhas').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.classList.contains('pc-peso')) return;
    e.preventDefault();
    const todosInputs = [...f.querySelectorAll('.pc-peso')];
    todosInputs[todosInputs.indexOf(e.target) + 1]?.focus();
  });
  const incluirBrinco = () => {
    const t = $('#pc-add').value.trim().toUpperCase();
    const a = animais.find((x) => x.brinco.trim().toUpperCase() === t);
    if (!a) return toast('Brinco não encontrado entre os animais ativos.', 'erro');
    extras.add(a.id); $('#pc-add').value = ''; desenhar();
    f.querySelector(`tr[data-id="${a.id}"] .pc-peso`)?.focus();
  };
  $('#pc-add-btn').addEventListener('click', incluirBrinco);
  $('#pc-add').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); incluirBrinco(); } });
  $('#pc-grupo').addEventListener('change', desenhar);
  $('#pc-data').addEventListener('change', desenhar);
  desenhar(); icones();

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const lista = doGrupo().filter((a) => (pesos.get(a.id) || '').trim());
    if (!lista.length) return toast('Digite o peso de ao menos um animal.', 'erro');
    const ruins = lista.filter((a) => { const v = numOuNulo(pesos.get(a.id)); return !v || v <= 0 || v >= 2000; });
    if (ruins.length) return toast(`Peso inválido para: ${ruins.map((a) => a.brinco).join(', ')}.`, 'erro', 7000);
    const conferir = lista.filter((a) => suspeito(a, numOuNulo(pesos.get(a.id))));
    if (conferir.length) {
      const ok = await confirmar({ titulo: 'Confira os pesos', mensagem: `Estes animais tiveram uma diferença muito grande em relação à última pesagem: <b>${conferir.map((a) => esc(`${a.brinco} (${fmtKg(numOuNulo(pesos.get(a.id)))}; antes ${fmtKg(a.peso_atual)})`)).join(', ')}</b>. Salvar mesmo assim?`, botao: 'Sim, estão corretos' });
      if (!ok) return;
    }
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const r = await chamar('registrar_pesagens', {
        p_id: grupoId,
        p_dados: { data_pesagem: $('#pc-data').value, responsavel_nome: textoOuNulo($('#pc-resp').value), observacoes: textoOuNulo($('#pc-obs').value) },
        p_pesos: lista.map((a) => ({ animal_id: a.id, peso_kg: numOuNulo(pesos.get(a.id)) })),
      }, `Pesagem coletiva de ${lista.length} animal(is) em ${fmtData($('#pc-data').value)}`);
      if (r.sincronizado) toast(`${lista.length} pesagem(ns) salva(s) e confirmada(s) pelo servidor.`);
      else toast('Sem conexão: pesagens guardadas neste aparelho e ainda NÃO sincronizadas.', 'aviso', 8000);
      fechar(); aoSalvar?.();
    } catch (err) { toast(traduzirErro(err), 'erro', 8000); btn.disabled = false; }
  });
}

/** Corrigir ou excluir uma pesagem já registrada (exige internet). */
export function abrirEdicaoPesagem(p, animal, aoSalvar) {
  const dono = store.papel === 'proprietario';
  const { el, fechar } = abrirModal({
    titulo: `Pesagem do animal ${animal?.brinco || ''}`,
    html: `<form id="f-ep" class="grade" style="gap:14px">
      <div class="grade grade-2" style="gap:14px">
        <div class="campo"><label for="ep-data">Data <span class="obrig">*</span></label><input id="ep-data" type="date" required max="${hojeISO()}" value="${esc(p.data_pesagem)}"></div>
        <div class="campo"><label for="ep-peso">Peso (kg) <span class="obrig">*</span></label><input id="ep-peso" inputmode="decimal" required value="${esc(String(p.peso_kg).replace('.', ','))}"></div>
      </div>
      <div class="campo"><label for="ep-obs">Observações</label><input id="ep-obs" value="${esc(p.observacoes || '')}"></div>
      <p class="small muted" style="margin:0">A correção fica registrada no histórico de alterações.</p>
    </form>`,
    rodape: `${dono ? '<button class="btn btn-perigo" data-excluir style="margin-right:auto">Excluir</button>' : ''}<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-ep">Salvar correção</button>`,
  });
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const peso = numOuNulo(el.querySelector('#ep-peso').value);
    if (!peso || peso <= 0 || peso >= 2000) return toast('Informe um peso válido.', 'erro');
    try {
      exigirConexao();
      const { error } = await sb.from('pesagens').update({ data_pesagem: el.querySelector('#ep-data').value, peso_kg: peso, observacoes: textoOuNulo(el.querySelector('#ep-obs').value) }).eq('id', p.id);
      if (error) throw error;
      toast('Pesagem corrigida.'); fechar(); aoSalvar?.();
    } catch (err) { toast(traduzirErro(err), 'erro', 7000); }
  });
  el.querySelector('[data-excluir]')?.addEventListener('click', async () => {
    const ok = await confirmar({ titulo: 'Excluir pesagem', mensagem: `Excluir a pesagem de <b>${fmtKg(p.peso_kg)}</b> em ${fmtData(p.data_pesagem)}? O peso atual do animal será recalculado.`, botao: 'Excluir', perigo: true });
    if (!ok) return;
    try {
      exigirConexao();
      const { error } = await sb.from('pesagens').delete().eq('id', p.id);
      if (error) throw error;
      toast('Pesagem excluída.'); fechar(); aoSalvar?.();
    } catch (err) { toast(traduzirErro(err), 'erro', 7000); }
  });
}
