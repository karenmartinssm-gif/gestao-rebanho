// =====================================================================
// FINANCEIRO — lançamento de receitas e despesas
// Inclusões podem ser feitas sem internet (ficam na fila);
// alterações e exclusões exigem conexão.
// =====================================================================
import { sb } from '../supabase.js';
import { store, pode } from '../store.js';
import { esc, abrirModal, toast, traduzirErro, hojeISO, fmtMoeda, fmtData, numOuNulo, textoOuNulo, opcoes, confirmar } from '../ui.js';
import { incluir, exigirConexao } from '../sync.js';
import { FORMAS_PAGAMENTO } from './comercial-forms.js';

export const CAT_RECEITA = { venda_animais: 'Venda de animais', outras: 'Outras receitas' };
export const CAT_DESPESA = {
  compra_animais: 'Compra de animais', suplementacao: 'Suplementação e sal', medicamentos: 'Medicamentos', vacinas: 'Vacinas',
  veterinario: 'Veterinário', funcionarios: 'Funcionários', combustivel: 'Combustível', manutencao: 'Manutenção',
  pastagens: 'Pastagens (adubo, sementes, reforma)', fretes: 'Fretes', outras: 'Outras despesas',
};
export const rotuloSituacao = (tipo, s) => (s === 'realizado' ? (tipo === 'receita' ? 'Recebido' : 'Pago') : (tipo === 'receita' ? 'A receber' : 'A pagar'));

/** l = lançamento existente (com _tipo 'receita' | 'despesa') ou null; padrao = { tipo } */
export async function abrirLancamento(l, aoSalvar, padrao = {}) {
  if (!pode('financeiro')) return toast('Você não tem permissão para o financeiro.', 'erro');
  const novo = !l;
  let tipo = l?._tipo || padrao.tipo || 'despesa';
  const dono = store.papel === 'proprietario';
  const lotes = store.base.lotes.filter((x) => x.ativo || x.id === l?.lote_id);
  const vinculo = l && (l.venda_id || l.compra_id || l.manejo_id || l.fornecimento_id);

  const { el, fechar } = abrirModal({
    titulo: novo ? 'Novo lançamento' : `Editar ${tipo === 'receita' ? 'receita' : 'despesa'}`,
    html: `<form id="f-fin" class="grade" style="gap:14px">
      ${novo ? `<div class="opcoes-radio"><label><input type="radio" name="tipo" value="despesa" ${tipo === 'despesa' ? 'checked' : ''}> Despesa</label><label><input type="radio" name="tipo" value="receita" ${tipo === 'receita' ? 'checked' : ''}> Receita</label></div>` : ''}
      ${vinculo ? '<div class="alerta small"><i data-lucide="link"></i><div>Lançamento gerado por uma compra/venda. Alterar aqui não muda o registro da compra/venda.</div></div>' : ''}
      <div class="campo"><label for="l-desc">Descrição <span class="obrig">*</span></label><input id="l-desc" required value="${esc(l?.descricao || '')}" placeholder="Ex.: Salário do vaqueiro — outubro"></div>
      <div class="grade grade-2" style="gap:14px">
        <div class="campo"><label for="l-cat">Categoria <span class="obrig">*</span></label><select id="l-cat" required></select></div>
        <div class="campo"><label for="l-valor">Valor (R$) <span class="obrig">*</span></label><input id="l-valor" inputmode="decimal" required value="${l ? esc(String(l.valor).replace('.', ',')) : ''}"></div>
        <div class="campo"><label for="l-data">Data <span class="obrig">*</span></label><input id="l-data" type="date" required value="${esc(l?.data_lancamento || hojeISO())}"><span class="ajuda" id="l-data-info"></span></div>
        <div class="campo"><label for="l-sit">Situação</label><select id="l-sit"></select></div>
        <div class="campo"><label for="l-forma">Forma de pagamento</label><select id="l-forma"><option value="">—</option>${FORMAS_PAGAMENTO.map((x) => `<option ${x === l?.forma_pagamento ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        <div class="campo"><label for="l-lote">Lote (opcional)</label><select id="l-lote">${opcoes(lotes, { selecionado: l?.lote_id, vazio: 'Geral da fazenda' })}</select><span class="ajuda">Usado no custo por lote.</span></div>
      </div>
      <div class="campo"><label for="l-obs">Observações</label><input id="l-obs" value="${esc(l?.observacoes || '')}"></div>
    </form>`,
    rodape: `${!novo && dono ? '<button class="btn btn-perigo" data-excluir style="margin-right:auto">Excluir</button>' : ''}<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-fin">Salvar</button>`,
  });
  const f = el.querySelector('form');
  const $ = (s) => f.querySelector(s);
  const preencher = () => {
    const cats = tipo === 'receita' ? CAT_RECEITA : CAT_DESPESA;
    $('#l-cat').innerHTML = Object.entries(cats).map(([k, t]) => `<option value="${k}" ${k === l?.categoria ? 'selected' : ''}>${t}</option>`).join('');
    const pend = tipo === 'receita' ? 'previsto' : 'estimado';
    $('#l-sit').innerHTML = `<option value="realizado">${rotuloSituacao(tipo, 'realizado')}</option><option value="${pend}" ${l && l.situacao !== 'realizado' ? 'selected' : ''}>${rotuloSituacao(tipo, pend)}</option>`;
    infoData();
  };
  const infoData = () => {
    const futuro = $('#l-data').value > hojeISO();
    $('#l-data-info').textContent = futuro ? 'Data futura: o lançamento fica como previsto até ser confirmado.' : '';
    if (futuro) $('#l-sit').value = tipo === 'receita' ? 'previsto' : 'estimado';
  };
  f.querySelectorAll('input[name=tipo]').forEach((r) => r.addEventListener('change', () => { tipo = r.value; preencher(); }));
  $('#l-data').addEventListener('change', infoData);
  preencher();

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const valor = numOuNulo($('#l-valor').value);
    if (!valor || valor <= 0) return toast('Informe um valor maior que zero.', 'erro');
    if ($('#l-sit').value === 'realizado' && $('#l-data').value > hojeISO()) return toast('Um lançamento já pago/recebido não pode ter data futura.', 'erro');
    const dados = {
      descricao: $('#l-desc').value.trim(), categoria: $('#l-cat').value, valor, data_lancamento: $('#l-data').value,
      situacao: $('#l-sit').value, forma_pagamento: $('#l-forma').value || null, lote_id: $('#l-lote').value || null,
      observacoes: textoOuNulo($('#l-obs').value), responsavel_nome: l?.responsavel_nome ?? textoOuNulo(store.perfil?.nome),
    };
    const tabela = tipo === 'receita' ? 'receitas' : 'despesas';
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    try {
      if (novo) {
        const r = await incluir(tabela, { ...dados, propriedade_id: store.prop.id }, `${tipo === 'receita' ? 'Receita' : 'Despesa'}: ${dados.descricao} (${fmtMoeda(valor)})`);
        if (r.sincronizado) toast('Lançamento salvo.');
        else toast('Sem conexão: lançamento guardado neste aparelho e ainda NÃO sincronizado.', 'aviso', 8000);
      } else {
        exigirConexao();
        const { error } = await sb.from(tabela).update(dados).eq('id', l.id);
        if (error) throw error;
        toast('Lançamento atualizado.');
      }
      fechar(); aoSalvar?.();
    } catch (err) { toast(traduzirErro(err), 'erro', 7000); btn.disabled = false; }
  });
  el.querySelector('[data-excluir]')?.addEventListener('click', async () => {
    const ok = await confirmar({ titulo: 'Excluir lançamento', mensagem: `Excluir <b>${esc(l.descricao)}</b> (${fmtMoeda(l.valor)}, ${fmtData(l.data_lancamento)})? A exclusão fica registrada no histórico de alterações.`, botao: 'Excluir', perigo: true });
    if (!ok) return;
    try {
      exigirConexao();
      const { error } = await sb.from(tipo === 'receita' ? 'receitas' : 'despesas').delete().eq('id', l.id);
      if (error) throw error;
      toast('Lançamento excluído.'); fechar(); aoSalvar?.();
    } catch (err) { toast(traduzirErro(err), 'erro', 7000); }
  });
}

/** Confirma um lançamento previsto (pago/recebido hoje ou na data dele, se já passou). */
export async function confirmarLancamento(l, aoSalvar) {
  const hoje = hojeISO();
  const data = l.data_lancamento > hoje ? hoje : l.data_lancamento;
  const ok = await confirmar({ titulo: l._tipo === 'receita' ? 'Confirmar recebimento' : 'Confirmar pagamento', mensagem: `Marcar <b>${esc(l.descricao)}</b> (${fmtMoeda(l.valor)}) como ${l._tipo === 'receita' ? 'recebido' : 'pago'} em ${fmtData(data)}?`, botao: 'Confirmar' });
  if (!ok) return;
  try {
    exigirConexao();
    const { error } = await sb.from(l._tipo === 'receita' ? 'receitas' : 'despesas').update({ situacao: 'realizado', data_lancamento: data }).eq('id', l.id);
    if (error) throw error;
    toast('Lançamento confirmado.'); aoSalvar?.();
  } catch (err) { toast(traduzirErro(err), 'erro', 7000); }
}
