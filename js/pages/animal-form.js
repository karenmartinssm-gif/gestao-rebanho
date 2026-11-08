// =====================================================================
// CADASTRO / EDIÇÃO DE ANIMAL
// =====================================================================
import { sb, BUCKET } from '../supabase.js';
import { store, nomePasto, carregarBase } from '../store.js';
import { esc, icones, toast, traduzirErro, hojeISO, mesesEntre, numOuNulo, textoOuNulo, opcoes, ativarWizard, comprimirImagem, fmtKg, fmtData, erroCarga } from '../ui.js';
import { incluir, exigirConexao } from '../sync.js';
import { listarAnimais } from '../components/animais-comum.js';

export async function render(el, [id]) {
  const editando = Boolean(id);
  let animal = null;
  let todos = [];
  try {
    todos = await listarAnimais();
    if (editando) {
      animal = todos.find((a) => a.id === id);
      if (!animal) throw new Error('Animal não encontrado.');
    }
  } catch (e) {
    if (!editando && !navigator.onLine) todos = [];
    else { el.innerHTML = erroCarga(e); icones(); return; }
  }
  const b = store.base;
  const a = animal || { sexo: '', origem: 'nascido', status: 'ativo' };
  const femeas = todos.filter((x) => x.sexo === 'F' && x.id !== id);
  const reprod = b.reprodutores.filter((r) => r.ativo || r.id === a.pai_id);
  const catsAtivas = b.categorias.filter((c) => c.ativo || c.id === a.categoria_id);

  el.innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>${editando ? `Editar animal ${esc(a.brinco)}` : 'Cadastrar animal'}</h1>
        <p>${editando ? 'As alterações ficam registradas no histórico do animal.' : 'Campos com <span style="color:var(--perigo)">*</span> são obrigatórios.'}</p></div>
      <div class="acoes"><a class="btn" href="${editando ? `#/animais/${id}` : '#/animais'}"><i data-lucide="arrow-left"></i> Voltar</a></div>
    </div>
    ${!navigator.onLine && !editando ? '<div class="alerta aviso" style="margin-bottom:16px"><i data-lucide="cloud-off"></i><div>Você está sem conexão. O cadastro ficará guardado neste aparelho e será enviado quando a internet voltar. A verificação de brinco duplicado só acontece no envio.</div></div>' : ''}
    <div class="card"><div class="card-corpo">
    <form id="f-animal" novalidate>
      <fieldset class="etapa-form"><legend><i data-lucide="tag"></i> Identificação</legend>
        <div class="form-grade">
          <div class="campo"><label for="brinco">Número do brinco <span class="obrig">*</span></label>
            <input id="brinco" name="brinco" required maxlength="30" value="${esc(a.brinco || '')}" autocomplete="off" inputmode="text">
            <span class="msg-erro" id="erro-brinco"></span></div>
          <div class="campo"><label for="nome">Nome ou apelido</label><input id="nome" name="nome" maxlength="60" value="${esc(a.nome || '')}"></div>
          <div class="campo"><label>Sexo <span class="obrig">*</span></label>
            <div class="opcoes-radio">
              <label><input type="radio" name="sexo" value="F" required ${a.sexo === 'F' ? 'checked' : ''}> Fêmea</label>
              <label><input type="radio" name="sexo" value="M" ${a.sexo === 'M' ? 'checked' : ''}> Macho</label></div></div>
          <div class="campo"><label for="raca_id">Raça</label><select id="raca_id" name="raca_id">${opcoes(b.racas.filter((r) => r.ativo || r.id === a.raca_id), { selecionado: a.raca_id ?? b.racas.find((r) => /nelore/i.test(r.nome))?.id, vazio: 'Não informada' })}</select></div>
          <div class="campo"><label for="grau_pureza">Grau de pureza</label><select id="grau_pureza" name="grau_pureza">
            <option value="">Não informado</option>${['PC', 'PO'].map((g) => `<option value="${g}" ${a.grau_pureza === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
          <div class="campo"><label>Registro</label>
            <div class="opcoes-radio">
              <label><input type="radio" name="registrado" value="sim" ${a.registrado ? 'checked' : ''}> Sim</label>
              <label><input type="radio" name="registrado" value="nao" ${a.registrado ? '' : 'checked'}> Não</label></div></div>
          <div class="campo ${a.registrado ? '' : 'oculto'}" id="campo-registro"><label for="numero_registro">Número do registro <span class="obrig">*</span></label>
            <input id="numero_registro" name="numero_registro" maxlength="40" value="${esc(a.numero_registro || '')}" autocomplete="off"></div>
          <div class="campo"><label for="data_nascimento">Data de nascimento</label><input id="data_nascimento" name="data_nascimento" type="date" max="${hojeISO()}" value="${esc(a.data_nascimento || '')}">
            <label class="check small"><input type="checkbox" name="nascimento_estimado" ${a.nascimento_estimado ? 'checked' : ''}> Data aproximada (estimada)</label></div>
          <div class="campo"><label for="categoria_id">Categoria <span class="obrig">*</span></label>
            <select id="categoria_id" name="categoria_id" required>${opcoes(catsAtivas, { selecionado: a.categoria_id })}</select>
            <span class="ajuda" id="sug-cat"></span></div>
          ${!editando ? `<div class="campo largo"><label for="foto">Foto do animal (opcional)</label><input id="foto" name="foto" type="file" accept="image/*" capture="environment">
            <span class="ajuda">A imagem é reduzida automaticamente antes do envio. Requer conexão.</span></div>` : ''}
        </div>
      </fieldset>

      <fieldset class="etapa-form"><legend><i data-lucide="git-fork"></i> Origem e genealogia</legend>
        <div class="form-grade">
          <div class="campo"><label>Origem <span class="obrig">*</span></label>
            <div class="opcoes-radio">
              <label><input type="radio" name="origem" value="nascido" ${a.origem === 'nascido' ? 'checked' : ''}> Nascido na propriedade</label>
              <label><input type="radio" name="origem" value="comprado" ${a.origem === 'comprado' ? 'checked' : ''}> Comprado</label>
              <label><input type="radio" name="origem" value="outro" ${a.origem === 'outro' ? 'checked' : ''}> Outro</label></div></div>
          <div class="campo"><label for="mae">Mãe (brinco)</label>
            <input id="mae" name="mae" list="lista-maes" autocomplete="off" value="${esc(a.mae_brinco || a.mae_externa || '')}">
            <datalist id="lista-maes">${femeas.map((m) => `<option value="${esc(m.brinco)}">${esc(m.nome || m.categoria_nome)}</option>`).join('')}</datalist>
            <span class="ajuda" id="info-mae">Se a mãe não estiver cadastrada, a identificação digitada será guardada como texto.</span></div>
          <div class="campo"><label for="pai_id">Pai (reprodutor)</label>
            <select id="pai_id" name="pai_id">${opcoes(reprod, { rotulo: (r) => `${r.identificacao}${r.tipo === 'semen' ? ' (sêmen)' : ''}`, selecionado: a.pai_id, vazio: 'Não informado / externo' })}</select></div>
          <div class="campo"><label for="pai_externo">Pai — identificação externa</label><input id="pai_externo" name="pai_externo" value="${esc(a.pai_externo || '')}" placeholder="Ex.: touro do vizinho, nome do sêmen">
            <span class="ajuda">Use quando o pai não estiver cadastrado como reprodutor.</span></div>
          <div class="campo grupo-compra"><label for="data_aquisicao">Data de aquisição <span class="obrig">*</span></label><input id="data_aquisicao" name="data_aquisicao" type="date" max="${hojeISO()}" value="${esc(a.data_aquisicao || '')}"></div>
          <div class="campo grupo-compra"><label for="valor_aquisicao">Valor de aquisição (R$)</label><input id="valor_aquisicao" name="valor_aquisicao" inputmode="decimal" value="${a.valor_aquisicao ?? ''}" placeholder="0,00"></div>
        </div>
      </fieldset>

      <fieldset class="etapa-form"><legend><i data-lucide="scale"></i> Características e localização</legend>
        <div class="form-grade">
          <div class="campo"><label for="peso_nascimento">Peso ao nascer (kg)</label><input id="peso_nascimento" name="peso_nascimento" inputmode="decimal" value="${a.peso_nascimento ?? ''}"></div>
          ${editando
            ? `<div class="campo"><label>Peso atual</label><input readonly value="${a.peso_atual ? `${fmtKg(a.peso_atual)} em ${fmtData(a.data_ultima_pesagem)}` : 'Sem pesagem'}">
                <span class="ajuda">Atualizado automaticamente ao registrar uma pesagem.</span></div>`
            : `<div class="campo"><label for="peso_atual">Peso atual (kg)</label><input id="peso_atual" name="peso_atual" inputmode="decimal">
                <span class="ajuda">Será registrado como a primeira pesagem.</span></div>
               <div class="campo"><label for="data_ultima_pesagem">Data da pesagem</label><input id="data_ultima_pesagem" name="data_ultima_pesagem" type="date" max="${hojeISO()}" value="${hojeISO()}"></div>`}
          <div class="campo"><label for="pasto_id">Pasto atual</label><select id="pasto_id" name="pasto_id">${opcoes(b.pastos.filter((p) => p.ativo || p.id === a.pasto_id), { rotulo: nomePasto, selecionado: a.pasto_id, vazio: b.pastos.length ? 'Não definido' : 'Nenhum pasto cadastrado' })}</select></div>
          <div class="campo"><label for="lote_id">Lote atual</label><select id="lote_id" name="lote_id">${opcoes(b.lotes.filter((l) => l.ativo || l.id === a.lote_id), { selecionado: a.lote_id, vazio: b.lotes.length ? 'Não definido' : 'Nenhum lote cadastrado' })}</select></div>
          <div class="campo largo"><label for="observacoes">Observações</label><textarea id="observacoes" name="observacoes" rows="3">${esc(a.observacoes || '')}</textarea></div>
          ${editando ? `<div class="campo largo"><div class="alerta small"><i data-lucide="info"></i><div>Status atual: <b>${esc(a.status_nome)}</b>. Para registrar venda, morte ou outra saída, use o botão “Registrar saída” na ficha do animal.</div></div></div>` : ''}
        </div>
      </fieldset>

      <div class="form-rodape">
        <a class="btn" href="${editando ? `#/animais/${id}` : '#/animais'}">Cancelar</a>
        <button class="btn btn-primario" type="submit"><i data-lucide="check"></i> ${editando ? 'Salvar alterações' : 'Cadastrar animal'}</button>
      </div>
    </form></div></div>`;
  icones();

  const form = el.querySelector('#f-animal');
  if (window.matchMedia('(max-width: 720px)').matches) ativarWizard(form);
  const $ = (n) => form.elements[n];
  const registrado = () => form.querySelector('input[name=registrado]:checked')?.value === 'sim';
  form.querySelectorAll('input[name=registrado]').forEach((r) => r.addEventListener('change', () => {
    document.getElementById('campo-registro').classList.toggle('oculto', !registrado());
    if (registrado()) document.getElementById('numero_registro').focus();
  }));

  // Mostrar campos de compra só quando "Comprado"
  const ajustarOrigem = () => {
    const comprado = form.querySelector('input[name=origem]:checked')?.value === 'comprado';
    form.querySelectorAll('.grupo-compra').forEach((c) => c.classList.toggle('oculto', !comprado));
    $('data_aquisicao').required = comprado;
  };
  form.querySelectorAll('input[name=origem]').forEach((r) => r.addEventListener('change', ajustarOrigem));
  ajustarOrigem();

  // Sugestão de categoria por sexo e idade (apenas sugestão, o usuário decide)
  let categoriaManual = editando;
  $('categoria_id').addEventListener('change', () => { categoriaManual = true; });
  const sugerir = () => {
    const sexo = form.querySelector('input[name=sexo]:checked')?.value;
    const nasc = $('data_nascimento').value;
    const info = el.querySelector('#sug-cat');
    if (!sexo || !nasc) { info.textContent = ''; return; }
    const meses = mesesEntre(nasc, hojeISO());
    const c = catsAtivas.find((x) => (!x.sexo || x.sexo === sexo) && x.idade_min_meses != null
      && meses >= x.idade_min_meses && (x.idade_max_meses == null || meses < x.idade_max_meses));
    if (!c) { info.textContent = ''; return; }
    info.textContent = `Sugestão pela idade (${meses} meses): ${c.nome}`;
    if (!categoriaManual) $('categoria_id').value = c.id;
  };
  form.querySelectorAll('input[name=sexo]').forEach((r) => r.addEventListener('change', sugerir));
  $('data_nascimento').addEventListener('change', sugerir);

  const infoMae = el.querySelector('#info-mae');
  $('mae').addEventListener('input', () => {
    const v = $('mae').value.trim().toUpperCase();
    const m = femeas.find((x) => x.brinco.toUpperCase() === v);
    infoMae.textContent = !v ? 'Se a mãe não estiver cadastrada, a identificação digitada será guardada como texto.'
      : m ? `Mãe cadastrada: ${m.brinco}${m.nome ? ` (${m.nome})` : ''} — ${m.categoria_nome}`
        : 'Mãe não encontrada no cadastro: será guardada como identificação externa.';
  });

  // Validação de brinco duplicado (feedback imediato; o banco garante a regra)
  const erroBrinco = el.querySelector('#erro-brinco');
  const brincoDuplicado = () => {
    const v = $('brinco').value.trim().toUpperCase();
    return todos.find((x) => x.brinco.trim().toUpperCase() === v && x.id !== id);
  };
  $('brinco').addEventListener('input', () => {
    const d = brincoDuplicado();
    erroBrinco.textContent = d ? `Já existe um animal com o brinco ${d.brinco} (${d.status_nome}).` : '';
    $('brinco').closest('.campo').classList.toggle('erro', Boolean(d));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    if (brincoDuplicado()) { $('brinco').focus(); return toast('Este número de brinco já está em uso.', 'erro'); }

    const sexo = form.querySelector('input[name=sexo]:checked')?.value;
    const origem = form.querySelector('input[name=origem]:checked')?.value;
    const maeTxt = $('mae').value.trim();
    const mae = femeas.find((x) => x.brinco.toUpperCase() === maeTxt.toUpperCase());
    const nums = ['peso_nascimento', 'valor_aquisicao', ...(editando ? [] : ['peso_atual'])];
    for (const n of nums) {
      if ($(n).value && numOuNulo($(n).value) === null) { $(n).focus(); return toast('Confira os valores numéricos (use vírgula para decimais).', 'erro'); }
    }
    if (registrado() && !$('numero_registro').value.trim()) { $('numero_registro').focus(); return toast('Informe o número do registro (ou marque "Não" em Registro).', 'erro'); }
    const dados = {
      brinco: $('brinco').value.trim(),
      nome: textoOuNulo($('nome').value),
      sexo,
      raca_id: $('raca_id').value || null,
      grau_pureza: $('grau_pureza').value || null,
      registrado: registrado(),
      numero_registro: registrado() ? textoOuNulo($('numero_registro').value) : null,
      data_nascimento: $('data_nascimento').value || null,
      nascimento_estimado: $('nascimento_estimado').checked,
      categoria_id: $('categoria_id').value,
      origem,
      mae_id: mae?.id || null,
      mae_externa: mae ? null : textoOuNulo(maeTxt),
      pai_id: $('pai_id').value || null,
      pai_externo: textoOuNulo($('pai_externo').value),
      data_aquisicao: origem === 'comprado' ? $('data_aquisicao').value || null : null,
      valor_aquisicao: origem === 'comprado' ? numOuNulo($('valor_aquisicao').value) : null,
      peso_nascimento: numOuNulo($('peso_nascimento').value),
      pasto_id: $('pasto_id').value || null,
      lote_id: $('lote_id').value || null,
      observacoes: textoOuNulo($('observacoes').value),
    };
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;

    try {
      if (editando) {
        exigirConexao();
        const alterado = Object.fromEntries(Object.entries(dados).filter(([k, v]) => (a[k] ?? null) !== v));
        if (!Object.keys(alterado).length) { toast('Nenhuma alteração para salvar.', 'info'); btn.disabled = false; return; }
        if (('pasto_id' in alterado || 'lote_id' in alterado)) toast('A mudança de pasto/lote será registrada como movimentação.', 'info');
        const { error } = await sb.from('animais').update(alterado).eq('id', id);
        if (error) throw error;
        await carregarBase().catch(() => {});
        toast('Alterações salvas e confirmadas pelo servidor.');
        location.hash = `#/animais/${id}`;
        return;
      }

      const novo = {
        ...dados,
        id: crypto.randomUUID(),
        propriedade_id: store.prop.id,
        status: 'ativo',
        peso_atual: numOuNulo($('peso_atual').value),
        data_ultima_pesagem: numOuNulo($('peso_atual').value) ? $('data_ultima_pesagem').value || hojeISO() : null,
      };
      const r = await incluir('animais', novo, `Cadastro do animal ${novo.brinco}`);
      if (!r.sincronizado) {
        toast('Sem conexão: cadastro guardado neste aparelho e ainda NÃO sincronizado.', 'aviso', 8000);
        location.hash = '#/animais';
        return;
      }
      await carregarBase().catch(() => {});
      const foto = $('foto')?.files?.[0];
      if (foto) await enviarFoto(novo, foto);
      toast(`Animal ${novo.brinco} cadastrado com sucesso.`);
      location.hash = `#/animais/${novo.id}`;
    } catch (err) {
      toast(traduzirErro(err), 'erro', 7000);
      btn.disabled = false;
    }
  });
}

export async function enviarFoto(animal, arquivo, { definirComoPrincipal = true, tipo = 'foto' } = {}) {
  exigirConexao();
  const f = tipo === 'foto' ? await comprimirImagem(arquivo) : arquivo;
  const ext = (f.name.split('.').pop() || 'bin').toLowerCase();
  const caminho = `${store.prop.id}/animais/${animal.id}/${crypto.randomUUID()}.${ext}`;
  const up = await sb.storage.from(BUCKET).upload(caminho, f, { contentType: f.type, upsert: false });
  if (up.error) { toast(`Registro salvo, mas o arquivo não foi enviado: ${traduzirErro(up.error)}`, 'aviso', 8000); return null; }
  const { error } = await sb.from('documentos').insert({
    propriedade_id: store.prop.id, animal_id: animal.id, nome: arquivo.name, tipo,
    storage_path: caminho, mime_type: f.type, tamanho_bytes: f.size,
  });
  if (error) { toast(traduzirErro(error), 'erro'); return null; }
  if (definirComoPrincipal && tipo === 'foto') {
    const r = await sb.from('animais').update({ foto_path: caminho }).eq('id', animal.id);
    if (r.error) toast(traduzirErro(r.error), 'erro');
  }
  return caminho;
}
