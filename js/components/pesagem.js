// Registro rápido de pesagem individual (funciona sem internet: fica na fila)
import { store, pode } from '../store.js';
import { esc, abrirModal, toast, traduzirErro, hojeISO, fmtKg, fmtData, fmtNum, diasEntre, numOuNulo, textoOuNulo } from '../ui.js';
import { incluir } from '../sync.js';
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
