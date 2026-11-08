// Excluir animal cadastrado por engano (proprietário ou gerente com permissão de excluir).
// O servidor (excluir_animal) apaga o animal e o que pertence só a ele, ou explica por que não pode.
import { sb, BUCKET } from '../supabase.js';
import { podeExcluir } from '../store.js';
import { esc, abrirModal, toast, traduzirErro } from '../ui.js';
import { exigirConexao } from '../sync.js';

export function excluirAnimal(a, aoExcluir) {
  if (!podeExcluir('rebanho_editar')) return toast('Você não tem permissão para excluir animais.', 'erro');
  const { el, fechar } = abrirModal({
    titulo: `Excluir o animal ${a.brinco}`,
    html: `<form id="f-exa" class="grade" style="gap:12px">
      <div class="alerta perigo"><i data-lucide="alert-triangle"></i><div>Use só para animais <b>cadastrados por engano</b> ou de teste. A ficha e todo o histórico deste animal (pesagens, manejos, reprodução, documentos) serão <b>apagados definitivamente</b>.</div></div>
      <p class="small" style="margin:0">Se o animal morreu, foi vendido ou saiu da fazenda, não exclua: use <b>Registrar saída</b> na ficha, que guarda o histórico.</p>
      <div class="campo"><label for="exa-brinco">Para confirmar, digite o brinco <b>${esc(a.brinco)}</b></label><input id="exa-brinco" autocomplete="off" required></div>
    </form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-perigo" type="submit" form="f-exa">Excluir definitivamente</button>',
  });
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (el.querySelector('#exa-brinco').value.trim().toUpperCase() !== a.brinco.trim().toUpperCase()) return toast('O brinco digitado não confere.', 'erro');
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    try {
      exigirConexao();
      const { data, error } = await sb.rpc('excluir_animal', { p_id: a.id });
      if (error) throw error;
      const arquivos = data?.arquivos || [];
      if (arquivos.length) await sb.storage.from(BUCKET).remove(arquivos).catch(() => {});
      toast(data?.mensagem || `Animal ${a.brinco} excluído.`);
      fechar(); aoExcluir?.();
    } catch (err) { toast(traduzirErro(err), 'erro', 10000); btn.disabled = false; }
  });
}
