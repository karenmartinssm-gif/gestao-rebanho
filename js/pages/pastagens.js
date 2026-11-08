// =====================================================================
// PASTAGENS E LOTES — cadastro, ocupação, lotação e transferências
// =====================================================================
import { sb } from '../supabase.js';
import { store, pode, param, carregarBase, nomePasto } from '../store.js';
import {
  esc, icones, toast, traduzirErro, abrirModal, confirmar, fmtData, fmtNum, fmtKg, montarTabela, vazio, erroCarga, numOuNulo, textoOuNulo, opcoes, ROTULO_MOV, baixarCSV, hojeISO,
} from '../ui.js';
import { exigirConexao } from '../sync.js';
import { listarAnimais } from '../components/animais-comum.js';
import { abrirTransferencia } from '../components/transferencia.js';

const SITUACOES = { em_uso: 'Em uso', disponivel: 'Disponível', descanso: 'Em descanso', reforma: 'Em reforma', inativa: 'Inativa' };
const ABAS = [['pastos', 'Pastos'], ['lotes', 'Lotes'], ['historico', 'Histórico de ocupação']];

export async function render(el) {
  let animais, movs;
  try {
    await carregarBase();
    [animais, movs] = await Promise.all([
      listarAnimais({ somenteAtivos: true }),
      sb.from('movimentacoes').select('*, movimentacao_animais(animal_id, pasto_origem_id, lote_origem_id)')
        .eq('propriedade_id', store.prop.id).in('tipo', ['troca_pasto', 'troca_lote']).order('data_movimentacao', { ascending: false }).limit(300),
    ]);
    if (movs.error) throw movs.error;
    movs = movs.data || [];
  } catch (e) { el.innerHTML = erroCarga(e); icones(); return; }

  const b = store.base;
  const editar = pode('pastagens');
  const mover = pode('movimentacoes');
  const pesoUA = param('peso_ua_kg');
  const recarregar = () => render(el).then(icones);

  const ocupacao = (filtro) => {
    const lista = animais.filter(filtro);
    const pesados = lista.filter((a) => a.peso_atual);
    const pesoTotal = pesados.reduce((s, a) => s + Number(a.peso_atual), 0);
    return { cab: lista.length, pesados: pesados.length, pesoTotal, pesoMedio: pesados.length ? pesoTotal / pesados.length : null, ua: pesoTotal / pesoUA };
  };
  const pastos = b.pastos.map((p) => {
    const o = ocupacao((a) => a.pasto_id === p.id);
    const capim = b.tiposCapim.find((c) => c.id === p.tipo_capim_id)?.nome;
    return { ...p, o, capim, cabHa: p.area_ha && o.cab ? o.cab / p.area_ha : null, uaHa: p.area_ha && o.pesados ? o.ua / p.area_ha : null,
      lotes: b.lotes.filter((l) => animais.some((a) => a.lote_id === l.id && a.pasto_id === p.id)).map((l) => l.nome) };
  });
  const lotes = b.lotes.map((l) => {
    const o = ocupacao((a) => a.lote_id === l.id);
    const cats = {};
    animais.filter((a) => a.lote_id === l.id).forEach((a) => { cats[a.categoria_nome] = (cats[a.categoria_nome] || 0) + 1; });
    return { ...l, o, cats, pasto: b.pastos.find((p) => p.id === l.pasto_id) };
  });
  const semPasto = animais.filter((a) => !a.pasto_id).length;
  const semLote = animais.filter((a) => !a.lote_id).length;

  el.innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>Pastagens e lotes</h1><p>Ocupação atual calculada a partir da localização de cada animal ativo.</p></div>
      <div class="acoes">
        ${mover ? '<button class="btn btn-primario" data-transf><i data-lucide="move"></i> Transferir animais</button>' : ''}
        ${editar ? '<button class="btn" data-novo-pasto><i data-lucide="plus"></i> Pasto</button><button class="btn" data-novo-lote><i data-lucide="plus"></i> Lote</button>' : ''}
      </div>
    </div>
    <div class="grade grade-kpi" style="margin-bottom:18px">
      <div class="card kpi destaque"><span class="rotulo"><i data-lucide="map"></i>Pastos ativos</span><span class="valor">${fmtNum(b.pastos.filter((p) => p.ativo).length)}</span>
        <span class="detalhe">${fmtNum(b.pastos.filter((p) => p.ativo).reduce((s, p) => s + Number(p.area_ha || 0), 0), 1)} ha cadastrados</span></div>
      <div class="card kpi"><span class="rotulo"><i data-lucide="layers"></i>Lotes ativos</span><span class="valor">${fmtNum(b.lotes.filter((l) => l.ativo).length)}</span></div>
      <div class="card kpi"><span class="rotulo"><i data-lucide="map-pin-off"></i>Animais sem pasto</span><span class="valor">${fmtNum(semPasto)}</span></div>
      <div class="card kpi"><span class="rotulo"><i data-lucide="layers"></i>Animais sem lote</span><span class="valor">${fmtNum(semLote)}</span></div>
    </div>
    <div class="abas" style="margin-top:0">${ABAS.map(([k, t]) => `<button class="aba" data-aba="${k}">${t}</button>`).join('')}</div>
    <div id="painel-past"></div>`;
  const painel = el.querySelector('#painel-past');
  el.querySelector('[data-transf]')?.addEventListener('click', () => abrirTransferencia({}, recarregar));
  el.querySelector('[data-novo-pasto]')?.addEventListener('click', () => formPasto(null, recarregar));
  el.querySelector('[data-novo-lote]')?.addEventListener('click', () => formLote(null, recarregar));

  const mostrar = (k) => {
    el.querySelectorAll('.aba').forEach((x) => x.classList.toggle('ativa', x.dataset.aba === k));
    ({ pastos: abaPastos, lotes: abaLotes, historico: abaHistorico })[k]();
    icones();
  };
  el.querySelector('.abas').addEventListener('click', (e) => { const x = e.target.closest('[data-aba]'); if (x) mostrar(x.dataset.aba); });

  function abaPastos() {
    painel.innerHTML = `<div class="card">${pastos.length ? '<div id="t-pastos"></div>' : vazio({ icone: 'map', titulo: 'Nenhum pasto cadastrado', texto: 'Cadastre os pastos e piquetes para acompanhar a ocupação e a lotação.', acao: editar ? '<button class="btn btn-primario" data-n>Cadastrar pasto</button>' : '' })}</div>
      <p class="small muted">Lotação = cabeças ÷ área (cab/ha). UA/ha = (soma do peso atual ÷ ${fmtNum(pesoUA)} kg) ÷ área — usa apenas animais com pesagem registrada; os demais aparecem como “sem peso”. Ajuste o peso de 1 UA em Configurações › Parâmetros.</p>`;
    painel.querySelector('[data-n]')?.addEventListener('click', () => formPasto(null, recarregar));
    if (!pastos.length) return;
    const cols = [
      { chave: 'codigo', titulo: 'Pasto', primaria: true, valor: (p) => nomePasto(p), render: (p) => `<b>${esc(nomePasto(p))}</b>${!p.ativo ? ' <span class="badge inativo">inativo</span>' : ''}${p.capim ? `<div class="small muted">${esc(p.capim)}</div>` : ''}`, csv: (p) => nomePasto(p) },
      { chave: 'situacao', titulo: 'Situação', valor: (p) => SITUACOES[p.situacao], render: (p) => `<span class="badge ${p.situacao === 'em_uso' ? 'ativo' : p.situacao === 'disponivel' ? 'info' : 'inativo'}">${SITUACOES[p.situacao]}</span>`, csv: (p) => SITUACOES[p.situacao] },
      { chave: 'area_ha', titulo: 'Área', classe: 'dir', valor: (p) => (p.area_ha ? Number(p.area_ha) : null), render: (p) => (p.area_ha ? `${fmtNum(p.area_ha, 2)} ha` : '—') },
      { chave: 'cab', titulo: 'Cabeças', classe: 'dir', valor: (p) => p.o.cab, render: (p) => fmtNum(p.o.cab), csv: (p) => p.o.cab },
      { chave: 'cabHa', titulo: 'Cab/ha', classe: 'dir', valor: (p) => p.cabHa, render: (p) => (p.cabHa == null ? '—' : fmtNum(p.cabHa, 2)), csv: (p) => p.cabHa?.toFixed(2) ?? '' },
      { chave: 'ua', titulo: 'UA', classe: 'dir', valor: (p) => p.o.ua, render: (p) => (p.o.pesados ? `${fmtNum(p.o.ua, 1)}${p.o.pesados < p.o.cab ? `<div class="small muted">${p.o.cab - p.o.pesados} sem peso</div>` : ''}` : '—'), csv: (p) => (p.o.pesados ? p.o.ua.toFixed(1) : '') },
      { chave: 'uaHa', titulo: 'UA/ha', classe: 'dir', valor: (p) => p.uaHa, render: (p) => (p.uaHa == null ? '—' : fmtNum(p.uaHa, 2)), csv: (p) => p.uaHa?.toFixed(2) ?? '' },
      { chave: 'cap', titulo: 'Capacidade (UA)', classe: 'dir', valor: (p) => (p.capacidade_ua ? Number(p.capacidade_ua) : null),
        render: (p) => (p.capacidade_ua ? `${fmtNum(p.capacidade_ua, 1)}${p.o.pesados && p.o.ua > p.capacidade_ua ? ' <span class="badge perigo">acima</span>' : ''}` : '—'), csv: (p) => p.capacidade_ua ?? '' },
      { chave: 'lotes', titulo: 'Lotes no pasto', valor: (p) => p.lotes.join(', '), render: (p) => esc(p.lotes.join(', ') || '—'), csv: (p) => p.lotes.join(', ') },
    ];
    montarTabela(painel.querySelector('#t-pastos'), { colunas: cols, linhas: pastos, aoClicar: (id) => detalhePasto(pastos.find((p) => p.id === id)) });
  }

  function abaLotes() {
    painel.innerHTML = `<div class="card">${lotes.length ? '<div id="t-lotes"></div>' : vazio({ icone: 'layers', titulo: 'Nenhum lote cadastrado', texto: 'Crie lotes para agrupar animais (ex.: vacas paridas, novilhas, garrotes) e registrar manejos e suplementação de uma vez.', acao: editar ? '<button class="btn btn-primario" data-n>Criar lote</button>' : '' })}</div>`;
    painel.querySelector('[data-n]')?.addEventListener('click', () => formLote(null, recarregar));
    if (!lotes.length) return;
    montarTabela(painel.querySelector('#t-lotes'), {
      colunas: [
        { chave: 'nome', titulo: 'Lote', primaria: true, render: (l) => `<b>${esc(l.nome)}</b>${!l.ativo ? ' <span class="badge inativo">inativo</span>' : ''}${l.descricao ? `<div class="small muted">${esc(l.descricao)}</div>` : ''}` },
        { chave: 'pasto', titulo: 'Pasto padrão', valor: (l) => nomePasto(l.pasto), render: (l) => esc(l.pasto ? nomePasto(l.pasto) : '—') },
        { chave: 'cab', titulo: 'Animais', classe: 'dir', valor: (l) => l.o.cab, render: (l) => fmtNum(l.o.cab) },
        { chave: 'peso', titulo: 'Peso médio', classe: 'dir', valor: (l) => l.o.pesoMedio, render: (l) => (l.o.pesoMedio ? `${fmtKg(l.o.pesoMedio)}${l.o.pesados < l.o.cab ? `<div class="small muted">${l.o.pesados} de ${l.o.cab} pesados</div>` : ''}` : '—') },
        { chave: 'cats', titulo: 'Composição', valor: (l) => Object.keys(l.cats).join(), render: (l) => esc(Object.entries(l.cats).map(([c, n]) => `${n} ${c}`).join(' · ') || '—') },
      ],
      linhas: lotes,
      aoClicar: (id) => detalheLote(lotes.find((l) => l.id === id)),
    });
  }

  function abaHistorico() {
    const nomeP = (id) => nomePasto(b.pastos.find((p) => p.id === id)) || null;
    const nomeL = (id) => b.lotes.find((l) => l.id === id)?.nome || null;
    const linhas = movs.map((m) => {
      const or = m.movimentacao_animais || [];
      const origP = [...new Set(or.map((x) => nomeP(x.pasto_origem_id) || 'sem pasto'))];
      const origL = [...new Set(or.map((x) => nomeL(x.lote_origem_id) || 'sem lote'))];
      return { ...m, n: or.length, origem: m.tipo === 'troca_pasto' ? origP.join(', ') : origL.join(', '),
        destino: [m.tipo === 'troca_pasto' ? (nomeP(m.pasto_destino_id) || 'sem pasto') : null, m.lote_destino_id ? `lote ${nomeL(m.lote_destino_id)}` : (m.tipo === 'troca_lote' ? 'sem lote' : null)].filter(Boolean).join(' · ') };
    });
    painel.innerHTML = `<div class="acoes" style="margin-bottom:10px"><button class="btn btn-sm" id="h-csv"><i data-lucide="download"></i> Exportar CSV</button></div>
      <div class="card">${linhas.length ? '<div id="t-hist"></div>' : vazio({ icone: 'history', titulo: 'Nenhuma transferência registrada', texto: 'As trocas de pasto e de lote aparecem aqui com data, origem, destino, animais, motivo e responsável.' })}</div>`;
    const cols = [
      { chave: 'data_movimentacao', titulo: 'Data', primaria: true, render: (m) => fmtData(m.data_movimentacao), csv: (m) => fmtData(m.data_movimentacao) },
      { chave: 'tipo', titulo: 'Tipo', valor: (m) => ROTULO_MOV[m.tipo], render: (m) => esc(ROTULO_MOV[m.tipo]), csv: (m) => ROTULO_MOV[m.tipo] },
      { chave: 'origem', titulo: 'Origem' }, { chave: 'destino', titulo: 'Destino' },
      { chave: 'n', titulo: 'Animais', classe: 'dir', render: (m) => fmtNum(m.n) },
      { chave: 'motivo', titulo: 'Motivo', render: (m) => esc(m.motivo || '—') },
      { chave: 'responsavel_nome', titulo: 'Responsável', render: (m) => esc(m.responsavel_nome || '—') },
    ];
    if (linhas.length) montarTabela(painel.querySelector('#t-hist'), { colunas: cols, linhas });
    painel.querySelector('#h-csv').addEventListener('click', () => baixarCSV(`ocupacao-pastos-${hojeISO()}.csv`, cols, linhas));
  }

  function listaAnimaisHtml(lista) {
    return lista.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Brinco</th><th>Categoria</th><th>Peso</th><th>Lote / pasto</th></tr></thead><tbody>
      ${lista.map((a) => `<tr><td><a href="#/animais/${a.id}">${esc(a.brinco)}</a></td><td>${esc(a.categoria_nome)}</td><td>${a.peso_atual ? fmtKg(a.peso_atual) : '—'}</td><td class="small">${esc([a.lote_nome, a.pasto_codigo].filter(Boolean).join(' · ') || '—')}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Nenhum animal.</p>';
  }

  function detalhePasto(p) {
    const lista = animais.filter((a) => a.pasto_id === p.id);
    const { el: m, fechar } = abrirModal({
      titulo: `Pasto ${nomePasto(p)}`, largo: true,
      html: `<div class="dados-lista" style="margin-bottom:14px">
          <div class="dado"><div class="r">Área</div><div class="v">${p.area_ha ? `${fmtNum(p.area_ha, 2)} ha` : '—'}</div></div>
          <div class="dado"><div class="r">Capim</div><div class="v">${esc(p.capim || '—')}</div></div>
          <div class="dado"><div class="r">Situação</div><div class="v">${SITUACOES[p.situacao]}</div></div>
          <div class="dado"><div class="r">Cabeças</div><div class="v">${fmtNum(p.o.cab)}${p.cabHa ? ` · ${fmtNum(p.cabHa, 2)} cab/ha` : ''}</div></div>
          <div class="dado"><div class="r">Unidades animais</div><div class="v">${p.o.pesados ? `${fmtNum(p.o.ua, 1)} UA${p.uaHa ? ` · ${fmtNum(p.uaHa, 2)} UA/ha` : ''}` : '—'}</div></div>
          <div class="dado"><div class="r">Capacidade estimada</div><div class="v">${p.capacidade_ua ? `${fmtNum(p.capacidade_ua, 1)} UA` : '—'}</div></div>
        </div>${p.observacoes ? `<p class="small">${esc(p.observacoes)}</p>` : ''}<h3 style="margin-bottom:8px">Animais no pasto</h3>${listaAnimaisHtml(lista)}`,
      rodape: `${editar ? '<button class="btn" data-ed><i data-lucide="pencil"></i> Editar pasto</button>' : ''}${mover && lista.length ? '<button class="btn btn-primario" data-tr><i data-lucide="move"></i> Transferir animais deste pasto</button>' : ''}<button class="btn" data-fechar>Fechar</button>`,
    });
    m.querySelector('[data-ed]')?.addEventListener('click', () => { fechar(); formPasto(p, recarregar); });
    m.querySelector('[data-tr]')?.addEventListener('click', () => { fechar(); abrirTransferencia({ origemPasto: p.id, animais: lista.map((a) => a.id) }, recarregar); });
  }

  function detalheLote(l) {
    const lista = animais.filter((a) => a.lote_id === l.id);
    const { el: m, fechar } = abrirModal({
      titulo: `Lote ${l.nome}`, largo: true,
      html: `<p class="muted" style="margin-top:0">${fmtNum(l.o.cab)} animal(is)${l.pasto ? ` · pasto padrão ${esc(nomePasto(l.pasto))}` : ''}${l.o.pesoMedio ? ` · peso médio ${fmtKg(l.o.pesoMedio)}` : ''}</p>${listaAnimaisHtml(lista)}`,
      rodape: `${editar ? '<button class="btn" data-ed><i data-lucide="pencil"></i> Editar lote</button>' : ''}
        ${mover ? '<button class="btn" data-add><i data-lucide="user-plus"></i> Adicionar animais</button>' : ''}
        ${mover && lista.length ? '<button class="btn btn-primario" data-tr><i data-lucide="move"></i> Mover / retirar animais</button>' : ''}<button class="btn" data-fechar>Fechar</button>`,
    });
    m.querySelector('[data-ed]')?.addEventListener('click', () => { fechar(); formLote(l, recarregar); });
    m.querySelector('[data-add]')?.addEventListener('click', () => { fechar(); abrirTransferencia({ destinoLote: l.id, destinoPasto: undefined }, recarregar); });
    m.querySelector('[data-tr]')?.addEventListener('click', () => { fechar(); abrirTransferencia({ origemLote: l.id, animais: lista.map((a) => a.id) }, recarregar); });
  }

  mostrar('pastos');
}

// ---------------- Formulários de cadastro ----------------
function formPasto(p, depois) {
  const r = p || { situacao: 'disponivel', ativo: true };
  const b = store.base;
  const { el, fechar } = abrirModal({
    titulo: p ? `Editar pasto ${p.codigo}` : 'Cadastrar pasto ou piquete',
    html: `<form id="f-pasto" class="grade" style="gap:12px">
      <div class="grade grade-2" style="gap:12px">
        <div class="campo"><label for="p-cod">Código <span class="obrig">*</span></label><input id="p-cod" required maxlength="20" value="${esc(r.codigo || '')}" placeholder="Ex.: P01"></div>
        <div class="campo"><label for="p-nome">Nome</label><input id="p-nome" value="${esc(r.nome || '')}" placeholder="Ex.: Pasto da Sede"></div>
        <div class="campo"><label for="p-area">Área (ha)</label><input id="p-area" inputmode="decimal" value="${r.area_ha ?? ''}"></div>
        <div class="campo"><label for="p-cap">Capacidade estimada (UA)</label><input id="p-cap" inputmode="decimal" value="${r.capacidade_ua ?? ''}"><span class="ajuda">Informada pelo responsável técnico.</span></div>
        <div class="campo"><label for="p-capim">Tipo de capim</label><select id="p-capim">${opcoes(b.tiposCapim.filter((c) => c.ativo || c.id === r.tipo_capim_id), { selecionado: r.tipo_capim_id, vazio: b.tiposCapim.length ? 'Não informado' : 'Cadastre em Configurações › Tipos de pastagem' })}</select></div>
        <div class="campo"><label for="p-sit">Situação</label><select id="p-sit">${Object.entries(SITUACOES).map(([k, t]) => `<option value="${k}" ${r.situacao === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      </div>
      <div class="campo"><label for="p-obs">Observações</label><textarea id="p-obs" rows="2">${esc(r.observacoes || '')}</textarea></div>
      ${p ? `<label class="check"><input type="checkbox" id="p-ativo" ${r.ativo ? 'checked' : ''}> Ativo (aparece nos formulários)</label>` : ''}
    </form>`,
    rodape: `${p && store.papel === 'proprietario' ? '<button class="btn btn-texto" data-excluir style="margin-right:auto;color:var(--perigo)"><i data-lucide="trash-2"></i> Excluir</button>' : ''}<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-pasto">Salvar</button>`,
  });
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nums = ['#p-area', '#p-cap'].map((s) => el.querySelector(s).value);
    if (nums.some((v) => v && (numOuNulo(v) === null || numOuNulo(v) < 0))) return toast('Confira a área e a capacidade (use vírgula para decimais).', 'erro');
    const dados = {
      codigo: el.querySelector('#p-cod').value.trim(), nome: textoOuNulo(el.querySelector('#p-nome').value),
      area_ha: numOuNulo(nums[0]) || null, capacidade_ua: numOuNulo(nums[1]), tipo_capim_id: el.querySelector('#p-capim').value || null,
      situacao: el.querySelector('#p-sit').value, observacoes: textoOuNulo(el.querySelector('#p-obs').value),
      ...(p ? { ativo: el.querySelector('#p-ativo').checked } : {}),
    };
    await salvar('pastagens', p, dados, fechar, depois, 'Já existe um pasto com este código.');
  });
  el.querySelector('[data-excluir]')?.addEventListener('click', () => excluir('pastagens', p, `o pasto ${p.codigo}`, fechar, depois));
}

function formLote(l, depois) {
  const r = l || { ativo: true };
  const { el, fechar } = abrirModal({
    titulo: l ? `Editar lote ${l.nome}` : 'Criar lote',
    html: `<form id="f-lote" class="grade" style="gap:12px">
      <div class="campo"><label for="l-nome">Nome do lote <span class="obrig">*</span></label><input id="l-nome" required maxlength="40" value="${esc(r.nome || '')}" placeholder="Ex.: Vacas paridas"></div>
      <div class="campo"><label for="l-desc">Descrição</label><input id="l-desc" value="${esc(r.descricao || '')}"></div>
      <div class="campo"><label for="l-pasto">Pasto padrão</label><select id="l-pasto">${opcoes(store.base.pastos.filter((p) => p.ativo || p.id === r.pasto_id), { rotulo: nomePasto, selecionado: r.pasto_id, vazio: 'Nenhum' })}</select>
        <span class="ajuda">Serve como referência. Para mudar os animais de pasto, use “Transferir animais”.</span></div>
      ${l ? `<label class="check"><input type="checkbox" id="l-ativo" ${r.ativo ? 'checked' : ''}> Ativo</label>` : ''}
    </form>`,
    rodape: `${l && store.papel === 'proprietario' ? '<button class="btn btn-texto" data-excluir style="margin-right:auto;color:var(--perigo)"><i data-lucide="trash-2"></i> Excluir</button>' : ''}<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-lote">Salvar</button>`,
  });
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dados = { nome: el.querySelector('#l-nome').value.trim(), descricao: textoOuNulo(el.querySelector('#l-desc').value),
      pasto_id: el.querySelector('#l-pasto').value || null, ...(l ? { ativo: el.querySelector('#l-ativo').checked } : {}) };
    await salvar('lotes', l, dados, fechar, depois, 'Já existe um lote com este nome.');
  });
  el.querySelector('[data-excluir]')?.addEventListener('click', () => excluir('lotes', l, `o lote ${l.nome}`, fechar, depois));
}

async function salvar(tabela, registro, dados, fechar, depois, msgDup) {
  try {
    exigirConexao();
    const q = registro ? sb.from(tabela).update(dados).eq('id', registro.id) : sb.from(tabela).insert({ ...dados, propriedade_id: store.prop.id });
    const { error } = await q;
    if (error) throw error;
    await carregarBase();
    toast('Salvo.');
    fechar(); depois();
  } catch (err) { toast(err.code === '23505' ? msgDup : traduzirErro(err), 'erro', 7000); }
}

async function excluir(tabela, registro, nome, fechar, depois) {
  if (!(await confirmar({ titulo: 'Excluir', mensagem: `Excluir ${esc(nome)}? Se houver animais ou histórico ligados a ele, a exclusão será recusada — nesse caso, desmarque “Ativo”.`, botao: 'Excluir', perigo: true }))) return;
  try {
    exigirConexao();
    const { error } = await sb.from(tabela).delete().eq('id', registro.id);
    if (error) throw error;
    await carregarBase();
    toast('Excluído.'); fechar(); depois();
  } catch (err) { toast(traduzirErro(err), 'erro', 8000); }
}
