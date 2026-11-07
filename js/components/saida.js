// Registro de saída de animal: morte, perda, transferência, doação, outra.
// Exige conexão, pois altera o status do animal (operação confirmada pelo servidor).
// Vendas são registradas no módulo Comercial (etapa 4), com dados financeiros.
import { sb } from '../supabase.js';
import { store, pode } from '../store.js';
import { esc, abrirModal, toast, traduzirErro, hojeISO, confirmar, textoOuNulo, ROTULO_MOV } from '../ui.js';
import { exigirConexao } from '../sync.js';
import { listarAnimais, campoAnimal } from './animais-comum.js';

const TIPOS = ['saida_morte', 'saida_perda', 'saida_transferencia', 'saida_doacao', 'saida_outra'];

export async function abrirSaida(animalFixo = null, { tipo = 'saida_morte', aoSalvar } = {}) {
  if (!pode('movimentacoes')) return toast('Você não tem permissão para registrar movimentações.', 'erro');
  try { exigirConexao(); } catch (e) { return toast(e.message, 'aviso', 7000); }

  let animais = [];
  if (!animalFixo) {
    try { animais = await listarAnimais({ somenteAtivos: true }); } catch (e) { return toast(traduzirErro(e), 'erro'); }
    if (!animais.length) return toast('Não há animais ativos cadastrados.', 'aviso');
  }
  const statusOutros = store.base.status.filter((s) => !s.conta_no_rebanho && !s.sistema);
  let escolhido = animalFixo;

  const { el, fechar } = abrirModal({
    titulo: 'Registrar saída do rebanho',
    html: `<form id="f-saida" class="grade" style="gap:14px">
      ${animalFixo ? `<div class="alerta"><i data-lucide="tag"></i><div>Animal <b>${esc(animalFixo.brinco)}</b>${animalFixo.nome ? ` — ${esc(animalFixo.nome)}` : ''}</div></div>` : '<div id="slot-animal"></div>'}
      <div class="campo"><label for="stipo">Tipo de saída <span class="obrig">*</span></label>
        <select id="stipo" required>${TIPOS.map((t) => `<option value="${t}" ${t === tipo ? 'selected' : ''}>${ROTULO_MOV[t]}</option>`).join('')}</select>
        <span class="ajuda">Vendas são registradas em Movimentações › Vendas (etapa 4), junto com os valores.</span></div>
      <div class="campo oculto" id="c-status"><label for="sstatus">Novo status <span class="obrig">*</span></label>
        <select id="sstatus">${statusOutros.length ? statusOutros.map((s) => `<option value="${esc(s.codigo)}">${esc(s.nome)}</option>`).join('') : '<option value="">Cadastre status adicionais em Configurações</option>'}</select></div>
      <div class="campo"><label for="sdata">Data <span class="obrig">*</span></label><input id="sdata" type="date" required max="${hojeISO()}" value="${hojeISO()}"></div>
      <div class="campo" id="c-causa"><label for="scausa">Causa</label><input id="scausa" placeholder="Ex.: picada de cobra, complicação no parto…"></div>
      <div class="campo"><label for="smotivo">Motivo / destino</label><input id="smotivo"></div>
      <div class="campo"><label for="sresp">Responsável</label><input id="sresp" value="${esc(store.perfil?.nome || '')}"></div>
      <div class="campo"><label for="sobs">Observações</label><textarea id="sobs" rows="2"></textarea></div>
      <div class="alerta aviso small"><i data-lucide="info"></i><div>A ficha e todo o histórico do animal serão preservados. Ele deixará de contar no rebanho ativo.</div></div>
    </form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-perigo" type="submit" form="f-saida">Registrar saída</button>',
  });

  if (!animalFixo) {
    const slot = el.querySelector('#slot-animal');
    campoAnimal(slot, animais);
    slot.addEventListener('animal', (e) => { escolhido = e.detail; });
  }
  const selTipo = el.querySelector('#stipo');
  const ajustar = () => {
    el.querySelector('#c-status').classList.toggle('oculto', selTipo.value !== 'saida_outra');
    el.querySelector('#c-causa').classList.toggle('oculto', !['saida_morte', 'saida_perda'].includes(selTipo.value));
  };
  selTipo.addEventListener('change', ajustar);
  ajustar();

  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!escolhido) return toast('Selecione o animal.', 'erro');
    const t = selTipo.value;
    const status = t === 'saida_outra' ? el.querySelector('#sstatus').value : null;
    if (t === 'saida_outra' && !status) return toast('Cadastre e selecione um status de saída.', 'erro');
    const ok = await confirmar({
      titulo: 'Confirmar saída',
      mensagem: `Registrar <b>${esc(ROTULO_MOV[t])}</b> do animal <b>${esc(escolhido.brinco)}</b>? O status do animal será alterado.`,
      botao: 'Sim, registrar', perigo: true,
    });
    if (!ok) return;
    const btn = el.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      exigirConexao();
      const { error } = await sb.rpc('registrar_saida', {
        p_id: crypto.randomUUID(),
        p_animais: [escolhido.id],
        p_tipo: t,
        p_data: el.querySelector('#sdata').value,
        p_status: status,
        p_motivo: textoOuNulo(el.querySelector('#smotivo').value),
        p_causa: textoOuNulo(el.querySelector('#scausa').value),
        p_responsavel: textoOuNulo(el.querySelector('#sresp').value),
        p_observacoes: textoOuNulo(el.querySelector('#sobs').value),
      });
      if (error) throw error;
      toast(`${ROTULO_MOV[t]} registrada. Status do animal ${escolhido.brinco} atualizado.`);
      fechar();
      aoSalvar?.();
    } catch (err) {
      toast(traduzirErro(err), 'erro', 7000);
      btn.disabled = false;
    }
  });
}

export async function abrirCorrecaoStatus(animal, aoSalvar) {
  const { el, fechar } = abrirModal({
    titulo: 'Corrigir status do animal',
    html: `<form id="f-corr" class="grade" style="gap:14px">
      <div class="alerta aviso"><i data-lucide="alert-triangle"></i><div>Use apenas para corrigir um lançamento incorreto (ex.: morte registrada no animal errado). A correção fica registrada no histórico.</div></div>
      <div class="campo"><label for="cst">Status correto <span class="obrig">*</span></label>
        <select id="cst" required>${store.base.status.filter((s) => s.codigo !== animal.status).map((s) => `<option value="${esc(s.codigo)}">${esc(s.nome)}</option>`).join('')}</select></div>
      <div class="campo"><label for="cmot">Motivo da correção <span class="obrig">*</span></label><textarea id="cmot" required rows="3"></textarea></div>
    </form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-corr">Corrigir</button>',
  });
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      exigirConexao();
      const { error } = await sb.rpc('corrigir_status', {
        p_id: crypto.randomUUID(), p_animal: animal.id, p_status: el.querySelector('#cst').value, p_motivo: el.querySelector('#cmot').value,
      });
      if (error) throw error;
      toast('Status corrigido.');
      fechar();
      aoSalvar?.();
    } catch (err) { toast(traduzirErro(err), 'erro', 7000); }
  });
}
