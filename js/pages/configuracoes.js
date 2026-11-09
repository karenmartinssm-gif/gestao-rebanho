// =====================================================================
// CONFIGURAÇÕES — propriedade, parâmetros e cadastros auxiliares
// =====================================================================
import { sb } from '../supabase.js';
import { store, carregarBase, recarregarPropriedade, PARAMETROS_PADRAO, ehProprietario } from '../store.js';
import { esc, icones, toast, traduzirErro, abrirModal, montarTabela, confirmar, numOuNulo, textoOuNulo } from '../ui.js';
import { exigirConexao } from '../sync.js';

const GRUPOS = { bezerro: 'Bezerro(a)', novilha: 'Novilha', matriz: 'Vaca', garrote: 'Garrote', touro: 'Touro (reprodutor)', boi: 'Boi', outro: 'Outro' };
const CLASSES = { vacina: 'Vacina', vermifugacao: 'Vermifugação', medicamento: 'Medicamento', carrapato: 'Controle de carrapatos', mosca: 'Controle de moscas', exame: 'Exame', tratamento: 'Tratamento', doenca: 'Doença', ocorrencia: 'Ocorrência veterinária', outro: 'Outro' };

const PARAMS = [
  ['periodo_gestacao_dias', 'Período gestacional (dias)', 'Usado para calcular a previsão de parto a partir da cobertura. Confirme o valor com seu veterinário.'],
  ['dias_diagnostico_gestacao', 'Dias após a cobertura para o diagnóstico', 'A partir de quantos dias a cobertura aparece como "diagnóstico pendente".'],
  ['dias_conferir_te', 'Dias após a TE para conferir', 'A partir de quantos dias a transferência de embrião (TETF) aparece em Pendências como "conferir TE".'],
  ['dias_alerta_parto', 'Alerta de parto (dias de antecedência)', ''],
  ['idade_desmame_dias', 'Idade prevista de desmame (dias)', 'Usada só para o alerta de desmame previsto.'],
  ['dias_alerta_desmame', 'Alerta de desmame (dias de antecedência)', ''],
  ['dias_alerta_manejo', 'Alerta de manejos (dias de antecedência)', 'Vacinas, vermifugações e retornos.'],
  ['peso_ua_kg', 'Peso de 1 UA (kg de peso vivo)', 'Coeficiente da Unidade Animal para lotação em UA/ha.'],
  ['peso_arroba_kg', 'Peso de 1 arroba (kg)', ''],
  ['rendimento_carcaca_pct', 'Rendimento de carcaça padrão (%)', 'Usado apenas em estimativas, sempre identificadas como estimativa.'],
];

// Definição dos cadastros simples
const CADASTROS = {
  racas: { titulo: 'Raças', tabela: 'racas', base: 'racas', campos: [{ k: 'nome', r: 'Nome', obrig: true }] },
  categorias: {
    titulo: 'Categorias de animais', tabela: 'categorias_animais', base: 'categorias', ordem: true,
    ajuda: 'O "grupo" define como a categoria entra nos indicadores (ex.: Vaca, Bezerro). As faixas de idade servem apenas para sugerir a categoria no cadastro.',
    campos: [
      { k: 'nome', r: 'Nome', obrig: true },
      { k: 'grupo', r: 'Grupo para indicadores', tipo: 'select', opcoes: GRUPOS, obrig: true },
      { k: 'sexo', r: 'Sexo', tipo: 'select', opcoes: { '': 'Ambos', M: 'Macho', F: 'Fêmea' } },
      { k: 'idade_min_meses', r: 'Idade mínima (meses)', tipo: 'int' },
      { k: 'idade_max_meses', r: 'Idade máxima (meses, exclusiva)', tipo: 'int' },
      { k: 'ordem', r: 'Ordem de exibição', tipo: 'int' },
    ],
  },
  status: {
    titulo: 'Status dos animais', tabela: 'status_animais', base: 'status', semAtivo: true,
    ajuda: 'Os status padrão (Ativo, Vendido, Morto, Transferido, Doado, Perdido) não podem ser alterados. Você pode criar outros status de saída, como "Emprestado".',
    campos: [
      { k: 'nome', r: 'Nome', obrig: true },
      { k: 'codigo', r: 'Código (sem espaços)', obrig: true, soNovo: true, padrao: '^[a-z0-9_]+$' },
      { k: 'conta_no_rebanho', r: 'Conta como animal ativo no rebanho', tipo: 'bool' },
      { k: 'ordem', r: 'Ordem', tipo: 'int' },
    ],
  },
  manejos: { titulo: 'Tipos de manejo', tabela: 'tipos_manejo', base: 'tiposManejo', campos: [{ k: 'nome', r: 'Nome', obrig: true }, { k: 'classe', r: 'Classe', tipo: 'select', opcoes: CLASSES, obrig: true }] },
  capins: { titulo: 'Tipos de pastagem (capim)', tabela: 'tipos_capim', base: 'tiposCapim', campos: [{ k: 'nome', r: 'Nome', obrig: true }] },
  unidades: { titulo: 'Unidades de medida', tabela: 'unidades_medida', base: 'unidades', campos: [{ k: 'sigla', r: 'Sigla', obrig: true }, { k: 'nome', r: 'Nome', obrig: true }] },
};

export async function render(el) {
  const abas = [['propriedade', 'Propriedade'], ['parametros', 'Parâmetros de cálculo'], ...Object.entries(CADASTROS).map(([k, c]) => [k, c.titulo]), ['equipe', 'Equipe e permissões'], ['backup', 'Backup']];
  el.innerHTML = `
    <div class="cabecalho-pagina"><div><h1>Configurações</h1><p>Adapte o sistema à realidade da propriedade.</p></div></div>
    <div class="card"><div class="card-corpo">
      <div class="abas" style="margin-top:0">${abas.map(([k, t], i) => `<button class="aba ${i === 0 ? 'ativa' : ''}" data-aba="${k}">${esc(t)}</button>`).join('')}</div>
      <div id="painel-cfg"></div>
    </div></div>`;
  const painel = el.querySelector('#painel-cfg');
  const mostrar = (k) => {
    el.querySelectorAll('.aba').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === k));
    if (k === 'propriedade') abaPropriedade(painel);
    else if (k === 'parametros') abaParametros(painel);
    else if (k === 'equipe') { painel.innerHTML = `<div class="alerta"><i data-lucide="users"></i><div>Funcionários, convites e níveis de acesso ficam na seção <b>Equipe e permissões</b> do menu lateral.<br><br><a class="btn btn-primario" href="#/equipe">Abrir Equipe e permissões</a></div></div>`; icones(); }
    else if (k === 'backup') { painel.innerHTML = `<div class="alerta"><i data-lucide="info"></i><div>Exportação completa dos dados (backup em JSON/Excel) será liberada nas etapas 5 e 6. Enquanto isso, a lista do rebanho pode ser exportada em CSV, e o Supabase mantém backups automáticos diários do banco (conforme o plano contratado).</div></div>`; icones(); }
    else abaCadastro(painel, CADASTROS[k]);
  };
  el.querySelector('.abas').addEventListener('click', (e) => { const b = e.target.closest('[data-aba]'); if (b) mostrar(b.dataset.aba); });
  mostrar('propriedade');
}

function abaPropriedade(painel) {
  const p = store.prop;
  const campo = (k, r, extra = '') => `<div class="campo"><label for="p-${k}">${r}</label><input id="p-${k}" name="${k}" value="${esc(p[k] ?? '')}" ${extra}></div>`;
  painel.innerHTML = `<form id="f-prop">
    <div class="form-grade">
      ${campo('nome', 'Nome da propriedade <span class="obrig">*</span>', 'required')}
      ${campo('proprietario_nome', 'Nome do proprietário')}
      ${campo('documento', 'CPF/CNPJ')}
      ${campo('inscricao_estadual', 'Inscrição estadual')}
      ${campo('car', 'CAR')}
      ${campo('municipio', 'Município')}
      ${campo('uf', 'UF', 'maxlength="2" style="text-transform:uppercase"')}
      ${campo('area_total_ha', 'Área total (ha)', 'inputmode="decimal"')}
      ${campo('telefone', 'Telefone')}
      <div class="campo largo"><label for="p-endereco">Endereço / localização</label><input id="p-endereco" name="endereco" value="${esc(p.endereco ?? '')}"></div>
      <div class="campo largo"><label for="p-obs">Observações</label><textarea id="p-obs" name="observacoes">${esc(p.observacoes ?? '')}</textarea></div>
    </div>
    <div class="form-rodape"><button class="btn btn-primario" type="submit" ${ehProprietario() ? '' : 'disabled'}>Salvar dados</button></div>
  </form>`;
  painel.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const dados = {};
    for (const [k, v] of Object.entries(d)) dados[k] = k === 'area_total_ha' ? numOuNulo(v) : textoOuNulo(v);
    if (dados.uf) dados.uf = dados.uf.toUpperCase();
    await salvarPropriedade(dados);
  });
}

async function salvarPropriedade(dados) {
  try {
    exigirConexao();
    const { error } = await sb.from('propriedades').update(dados).eq('id', store.prop.id);
    if (error) throw error;
    await recarregarPropriedade();
    toast('Dados salvos.');
    const nome = document.querySelector('.marca-prop'); if (nome) nome.textContent = store.prop.nome;
  } catch (err) { toast(traduzirErro(err), 'erro'); }
}

function abaParametros(painel) {
  const atual = { ...PARAMETROS_PADRAO, ...(store.prop.parametros || {}) };
  painel.innerHTML = `<form id="f-param">
    <p class="muted">Estes valores são usados nos cálculos e alertas. O sistema não define protocolos sanitários, doses ou consumo ideal — esses dados são cadastrados pelo responsável técnico.</p>
    <div class="form-grade">${PARAMS.map(([k, r, ajuda]) => `<div class="campo"><label for="pr-${k}">${esc(r)}</label>
      <input id="pr-${k}" name="${k}" inputmode="decimal" required value="${esc(atual[k])}">${ajuda ? `<span class="ajuda">${esc(ajuda)}</span>` : ''}</div>`).join('')}</div>
    <div class="form-rodape"><button class="btn btn-primario" type="submit" ${ehProprietario() ? '' : 'disabled'}>Salvar parâmetros</button></div>
  </form>`;
  painel.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const novo = { ...(store.prop.parametros || {}) };
    for (const [k] of PARAMS) {
      const v = numOuNulo(e.target.elements[k].value);
      if (v === null || v <= 0) return toast('Todos os parâmetros devem ser números maiores que zero.', 'erro');
      novo[k] = v;
    }
    await salvarPropriedade({ parametros: novo });
  });
}

function abaCadastro(painel, cfg) {
  const linhas = store.base[cfg.base];
  painel.innerHTML = `
    ${cfg.ajuda ? `<p class="muted">${esc(cfg.ajuda)}</p>` : ''}
    <div class="acoes" style="margin-bottom:12px"><button class="btn btn-primario" data-novo><i data-lucide="plus"></i> Adicionar</button></div>
    <div class="card"><div id="t-cad"></div></div>`;
  const fmt = (c, l) => {
    const v = l[c.k];
    if (c.tipo === 'bool') return v ? 'Sim' : 'Não';
    if (c.tipo === 'select') return esc(c.opcoes[v ?? ''] ?? v ?? '—');
    return esc(v ?? '—');
  };
  montarTabela(painel.querySelector('#t-cad'), {
    colunas: [
      ...cfg.campos.filter((c) => !c.soNovo || cfg.base === 'status').map((c, i) => ({ chave: c.k, titulo: c.r, primaria: i === 0, render: (l) => fmt(c, l) })),
      ...(cfg.semAtivo ? [{ chave: 'sistema', titulo: 'Tipo', render: (l) => (l.sistema ? '<span class="badge inativo">padrão</span>' : '<span class="badge">personalizado</span>') }]
        : [{ chave: 'ativo', titulo: 'Situação', render: (l) => (l.ativo ? '<span class="badge ativo">Ativo</span>' : '<span class="badge inativo">Inativo</span>') }]),
    ],
    linhas,
    aoClicar: (id) => { const l = linhas.find((x) => x.id === id); if (l.sistema) return toast('Status padrão não pode ser alterado.', 'info'); abrirForm(cfg, l, () => abaCadastro(painel, cfg)); },
  });
  painel.querySelector('[data-novo]').addEventListener('click', () => abrirForm(cfg, null, () => abaCadastro(painel, cfg)));
  icones();
}

function abrirForm(cfg, registro, depois) {
  const r = registro || {};
  const input = (c) => {
    const v = r[c.k] ?? '';
    const id = `cf-${c.k}`;
    if (c.tipo === 'bool') return `<label class="check"><input type="checkbox" id="${id}" name="${c.k}" ${v ? 'checked' : ''}> ${esc(c.r)}</label>`;
    if (c.tipo === 'select') return `<div class="campo"><label for="${id}">${esc(c.r)}${c.obrig ? ' <span class="obrig">*</span>' : ''}</label><select id="${id}" name="${c.k}" ${c.obrig ? 'required' : ''}>
      ${Object.entries(c.opcoes).map(([k, t]) => `<option value="${esc(k)}" ${String(v) === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
    return `<div class="campo"><label for="${id}">${esc(c.r)}${c.obrig ? ' <span class="obrig">*</span>' : ''}</label>
      <input id="${id}" name="${c.k}" value="${esc(v)}" ${c.obrig ? 'required' : ''} ${c.tipo === 'int' ? 'inputmode="numeric" pattern="[0-9]*"' : ''}
      ${c.padrao ? `pattern="${c.padrao}"` : ''} ${c.soNovo && registro ? 'readonly' : ''}></div>`;
  };
  const { el, fechar } = abrirModal({
    titulo: `${registro ? 'Editar' : 'Adicionar'} — ${cfg.titulo}`,
    html: `<form id="f-cad" class="grade" style="gap:12px">${cfg.campos.map(input).join('')}
      ${!cfg.semAtivo && registro ? `<label class="check"><input type="checkbox" name="ativo" ${r.ativo ? 'checked' : ''}> Ativo (aparece nos formulários)</label>` : ''}</form>`,
    rodape: `${registro && ehProprietario() ? '<button class="btn btn-texto" data-excluir style="margin-right:auto;color:var(--perigo)"><i data-lucide="trash-2"></i> Excluir</button>' : ''}
      <button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-cad">Salvar</button>`,
  });
  const form = el.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dados = {};
    for (const c of cfg.campos) {
      if (c.soNovo && registro) continue;
      const f = form.elements[c.k];
      if (c.tipo === 'bool') dados[c.k] = f.checked;
      else if (c.tipo === 'int') dados[c.k] = f.value === '' ? (c.k === 'ordem' ? 0 : null) : parseInt(f.value, 10);
      else dados[c.k] = f.value === '' ? null : f.value.trim();
    }
    if (!cfg.semAtivo && registro) dados.ativo = form.elements.ativo.checked;
    try {
      exigirConexao();
      const q = registro ? sb.from(cfg.tabela).update(dados).eq('id', registro.id) : sb.from(cfg.tabela).insert({ ...dados, propriedade_id: store.prop.id });
      const { error } = await q;
      if (error) throw error;
      await carregarBase();
      toast('Salvo.');
      fechar();
      depois();
    } catch (err) { toast(traduzirErro(err), 'erro'); }
  });
  el.querySelector('[data-excluir]')?.addEventListener('click', async () => {
    if (!(await confirmar({ titulo: 'Excluir', mensagem: 'Excluir este item? Se ele já estiver em uso, a exclusão será recusada — nesse caso, desmarque "Ativo".', botao: 'Excluir', perigo: true }))) return;
    try {
      exigirConexao();
      const { error } = await sb.from(cfg.tabela).delete().eq('id', registro.id);
      if (error) throw error;
      await carregarBase();
      toast('Excluído.');
      fechar();
      depois();
    } catch (err) { toast(traduzirErro(err), 'erro', 7000); }
  });
}
