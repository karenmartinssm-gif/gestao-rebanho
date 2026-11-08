// Transferência de animais entre pastos e/ou lotes (funciona sem internet: fica na fila)
import { store, pode, nomePasto } from '../store.js';
import { esc, abrirModal, toast, traduzirErro, hojeISO, textoOuNulo, opcoes, icones } from '../ui.js';
import { chamar } from '../sync.js';
import { listarAnimais } from './animais-comum.js';

/**
 * @param pre { animais?: ids pré-selecionados, origemLote?: id, origemPasto?: id, destinoPasto?: id, destinoLote?: id }
 */
export async function abrirTransferencia(pre = {}, aoSalvar) {
  if (!pode('movimentacoes')) return toast('Você não tem permissão para transferir animais.', 'erro');
  let animais;
  try { animais = await listarAnimais({ somenteAtivos: true }); } catch (e) { return toast(traduzirErro(e), 'erro'); }
  if (!animais.length) return toast('Não há animais ativos cadastrados.', 'aviso');
  const b = store.base;
  const pastos = b.pastos.filter((p) => p.ativo);
  const lotes = b.lotes.filter((l) => l.ativo);
  const marcados = new Set(pre.animais || []);

  const { el, fechar } = abrirModal({
    titulo: 'Transferir animais',
    largo: true,
    html: `<form id="f-transf" class="grade" style="gap:14px">
      <div class="grade grade-2" style="gap:14px">
        <div class="campo"><label for="t-or-lote">Mostrar animais do lote</label><select id="t-or-lote">${opcoes(lotes, { vazio: 'Todos os lotes', selecionado: pre.origemLote })}<option value="__sem">Sem lote</option></select></div>
        <div class="campo"><label for="t-or-pasto">… e do pasto</label><select id="t-or-pasto">${opcoes(pastos, { rotulo: nomePasto, vazio: 'Todos os pastos', selecionado: pre.origemPasto })}<option value="__sem">Sem pasto</option></select></div>
      </div>
      <div class="campo"><label>Animais <span class="obrig">*</span></label>
        <div class="busca-wrap" style="margin-bottom:8px"><i data-lucide="search"></i><input type="search" id="t-busca" placeholder="Filtrar por brinco"></div>
        <div class="acoes small" style="margin-bottom:6px"><button type="button" class="btn btn-sm" id="t-todos">Marcar visíveis</button>
          <button type="button" class="btn btn-sm" id="t-nenhum">Desmarcar todos</button><span class="muted" id="t-cont" style="align-self:center"></span></div>
        <div class="lista-selecao" id="t-lista"></div></div>
      <fieldset style="border:1px solid var(--borda);border-radius:8px;padding:12px"><legend class="small" style="padding:0 6px;font-weight:600">Destino</legend>
        <div class="grade grade-2" style="gap:14px">
          <div class="campo"><label class="check"><input type="checkbox" id="t-mp" ${pre.destinoPasto !== undefined || !pre.destinoLote ? 'checked' : ''}> Mudar de pasto</label>
            <select id="t-pasto">${opcoes(pastos, { rotulo: nomePasto, vazio: 'Sem pasto (retirar do pasto)', selecionado: pre.destinoPasto })}</select></div>
          <div class="campo"><label class="check"><input type="checkbox" id="t-ml" ${pre.destinoLote ? 'checked' : ''}> Mudar de lote</label>
            <select id="t-lote">${opcoes(lotes, { vazio: 'Sem lote (retirar do lote)', selecionado: pre.destinoLote })}</select></div>
        </div>
        <label class="check small oculto" id="t-lp-wrap" style="margin-top:8px"><input type="checkbox" id="t-lp" checked> <span id="t-lp-txt"></span></label>
      </fieldset>
      <div class="grade grade-3" style="gap:14px">
        <div class="campo"><label for="t-data">Data <span class="obrig">*</span></label><input id="t-data" type="date" required max="${hojeISO()}" value="${hojeISO()}"></div>
        <div class="campo"><label for="t-mot">Motivo</label><input id="t-mot" placeholder="Ex.: rodízio, descanso do pasto"></div>
        <div class="campo"><label for="t-resp">Responsável</label><input id="t-resp" value="${esc(store.perfil?.nome || '')}"></div>
      </div>
    </form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-transf"><i data-lucide="move"></i> Transferir</button>',
  });
  const f = el.querySelector('form');
  const lista = f.querySelector('#t-lista');
  const nomeLocal = (a) => [a.pasto_codigo && `pasto ${a.pasto_codigo}`, a.lote_nome && `lote ${a.lote_nome}`].filter(Boolean).join(' · ') || 'sem pasto/lote';
  const visiveis = () => {
    const lo = f.querySelector('#t-or-lote').value, pa = f.querySelector('#t-or-pasto').value, t = f.querySelector('#t-busca').value.trim().toUpperCase();
    return animais.filter((a) => (!lo || (lo === '__sem' ? !a.lote_id : a.lote_id === lo)) && (!pa || (pa === '__sem' ? !a.pasto_id : a.pasto_id === pa))
      && (!t || a.brinco.toUpperCase().includes(t)));
  };
  const contar = () => { f.querySelector('#t-cont').textContent = `${marcados.size} selecionado${marcados.size === 1 ? '' : 's'}`; };
  const desenhar = () => {
    const v = visiveis();
    lista.innerHTML = v.map((a) => `<label class="check"><input type="checkbox" value="${a.id}" ${marcados.has(a.id) ? 'checked' : ''}>
      <b>${esc(a.brinco)}</b> <span class="small muted">${esc(a.categoria_nome)} · ${esc(nomeLocal(a))}</span></label>`).join('') || '<p class="muted small">Nenhum animal neste filtro.</p>';
    contar();
  };
  lista.addEventListener('change', (e) => { if (e.target.checked) marcados.add(e.target.value); else marcados.delete(e.target.value); contar(); ajustarLote(); });
  ['#t-or-lote', '#t-or-pasto'].forEach((s) => f.querySelector(s).addEventListener('change', () => { desenhar(); ajustarLote(); }));
  f.querySelector('#t-busca').addEventListener('input', desenhar);
  f.querySelector('#t-todos').addEventListener('click', () => { visiveis().forEach((a) => marcados.add(a.id)); desenhar(); ajustarLote(); });
  f.querySelector('#t-nenhum').addEventListener('click', () => { marcados.clear(); desenhar(); ajustarLote(); });

  // Se o lote inteiro está indo para outro pasto, oferece atualizar o pasto padrão do lote
  const loteInteiro = () => {
    const lo = f.querySelector('#t-or-lote').value;
    if (!lo || lo === '__sem') return null;
    const doLote = animais.filter((a) => a.lote_id === lo);
    return doLote.length && doLote.every((a) => marcados.has(a.id)) ? lotes.find((l) => l.id === lo) : null;
  };
  const ajustarLote = () => {
    const l = loteInteiro(); const mp = f.querySelector('#t-mp').checked;
    f.querySelector('#t-lp-wrap').classList.toggle('oculto', !(l && mp));
    if (l) f.querySelector('#t-lp-txt').textContent = `Atualizar também o pasto padrão do lote "${l.nome}"`;
  };
  const ajustarDestino = () => {
    f.querySelector('#t-pasto').disabled = !f.querySelector('#t-mp').checked;
    f.querySelector('#t-lote').disabled = !f.querySelector('#t-ml').checked;
    ajustarLote();
  };
  f.querySelector('#t-mp').addEventListener('change', ajustarDestino);
  f.querySelector('#t-ml').addEventListener('change', ajustarDestino);
  desenhar(); ajustarDestino(); icones();

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ids = [...marcados];
    if (!ids.length) return toast('Selecione ao menos um animal.', 'erro');
    const mp = f.querySelector('#t-mp').checked, ml = f.querySelector('#t-ml').checked;
    if (!mp && !ml) return toast('Marque "Mudar de pasto" e/ou "Mudar de lote".', 'erro');
    const pasto = f.querySelector('#t-pasto').value || null, lote = f.querySelector('#t-lote').value || null;
    const l = loteInteiro();
    const destino = [mp && `pasto ${pasto ? nomePasto(b.pastos.find((x) => x.id === pasto)) : '(nenhum)'}`, ml && `lote ${lote ? b.lotes.find((x) => x.id === lote).nome : '(nenhum)'}`].filter(Boolean).join(' e ');
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const r = await chamar('transferir_animais', {
        p_animais: ids, p_data: f.querySelector('#t-data').value, p_mudar_pasto: mp, p_pasto: mp ? pasto : null, p_mudar_lote: ml, p_lote: ml ? lote : null,
        p_motivo: textoOuNulo(f.querySelector('#t-mot').value), p_responsavel: textoOuNulo(f.querySelector('#t-resp').value),
        p_lote_pasto: l && mp && f.querySelector('#t-lp').checked ? l.id : null,
      }, `Transferência de ${ids.length} animal(is) para ${destino}`);
      if (r.sincronizado) toast(`${ids.length} animal(is) transferido(s) para ${destino}.`);
      else toast('Sem conexão: transferência guardada neste aparelho e ainda NÃO sincronizada.', 'aviso', 8000);
      fechar(); aoSalvar?.();
    } catch (err) { toast(traduzirErro(err), 'erro', 8000); btn.disabled = false; }
  });
}
