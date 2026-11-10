// =====================================================================
// TEMPORADAS DE IATF E TETF
// Uma temporada junta as vacas que começam o protocolo no mesmo dia (D0).
// As etapas (D0, D7, D9...) têm data calculada a partir do D0, aparecem
// em Pendências / Painel / avisos e são marcadas como feitas aqui.
// A inseminação/transferência registra as coberturas de todas as vacas
// de uma vez, e a confirmação de prenhez já abre com as vacas da temporada.
// =====================================================================
import { sb } from '../supabase.js';
import { store, pode, podeExcluir } from '../store.js';
import {
  esc, abrirModal, toast, traduzirErro, hojeISO, addDias, diasEntre, fmtData, fmtNum, fmtPct, textoOuNulo, icones, vazio, confirmar, MESES,
} from '../ui.js';
import { exigirConexao } from '../sync.js';
import * as F from './reproducao-forms.js';

export const ROTULO_TIPO_TEMP = { iatf: 'IATF', tetf: 'TETF' };

// Protocolos usados na fazenda (os dias podem ser mudados em cada temporada)
export const ETAPAS_PADRAO = {
  iatf: [
    { chave: 'implante', nome: 'Colocação do implante de progesterona', dia: 0 },
    { chave: 'retirada', nome: 'Retirada do implante + aplicação hormonal', dia: 7 },
    { chave: 'cobertura', nome: 'Inseminação artificial', dia: 9 },
    { chave: 'diagnostico', nome: 'Confirmar prenhez', dia: 39 },
  ],
  tetf: [
    { chave: 'implante', nome: 'Colocação do implante de progesterona', dia: 0 },
    { chave: 'retirada', nome: 'Retirada do implante + aplicação hormonal', dia: 7 },
    { chave: 'embrioes', nome: 'Inseminação', dia: 9 },
    { chave: 'cobertura', nome: 'Transferência do embrião', dia: 16 },
    { chave: 'diagnostico', nome: 'Confirmar prenhez', dia: 46 },
  ],
};

/** Nome da etapa: sempre o do protocolo atual (assim temporadas já criadas acompanham mudanças de nome). */
export const nomeEtapa = (t, e) => ETAPAS_PADRAO[t.tipo]?.find((x) => x.chave === e.chave)?.nome || e.nome;
const dataEtapa = (t, e) => addDias(t.data_inicio, Number(e.dia) || 0);
/** "D9", e para o diagnóstico "D9+30" (dias contados a partir da inseminação/transferência). */
export function rotuloDia(t, e) {
  const cob = (t.etapas || []).find((x) => x.chave === 'cobertura');
  if (e.chave === 'diagnostico' && cob && Number(e.dia) > Number(cob.dia)) return `D${cob.dia}+${Number(e.dia) - Number(cob.dia)}`;
  return `D${e.dia}`;
}
const ativasDa = (t) => (t.temporada_animais || []).filter((x) => !x.saiu_etapa);

/** Consulta das temporadas abertas (para Pendências, Painel e avisos). */
export function consultaTemporadasAbertas(p) {
  return sb.from('temporadas').select('id, nome, tipo, data_inicio, etapas, encerrada, temporada_animais(animal_id, saiu_etapa)')
    .eq('propriedade_id', p).eq('encerrada', false);
}

/** Etapas ainda não feitas com data até "limite": [{ t, e, data, n }] (n = vacas na temporada). */
export function etapasPendentes(temporadas, limite) {
  const lista = [];
  (temporadas || []).filter((t) => !t.encerrada).forEach((t) => {
    (t.etapas || []).forEach((e) => {
      const data = dataEtapa(t, e);
      if (!e.feito_em && data <= limite) lista.push({ t, e, data, n: ativasDa(t).length });
    });
  });
  return lista.sort((a, b) => a.data.localeCompare(b.data));
}

const nomeSugerido = (tipo, d0) => (d0 ? `${ROTULO_TIPO_TEMP[tipo]} ${MESES[Number(d0.slice(5, 7)) - 1]}/${d0.slice(0, 4)}` : ROTULO_TIPO_TEMP[tipo]);

async function gravarEtapas(t, etapas) {
  const { error } = await sb.from('temporadas').update({ etapas }).eq('id', t.id);
  if (error) throw error;
}

// ---------------------------------------------------------------------
// ABA "TEMPORADAS" (página Reprodução e cria)
// ctx: { porId, coberturas, sitPorId, recarregar, abrirLista, temporadas, erroTabela, destaque }
// ---------------------------------------------------------------------
export function abaTemporadas(painel, ctx) {
  const { porId, coberturas, recarregar, abrirLista, temporadas } = ctx;
  const editar = pode('reproducao');
  const excluir = podeExcluir('reproducao');
  const hoje = hojeISO();

  if (ctx.erroTabela) {
    painel.innerHTML = `<div class="alerta aviso"><i data-lucide="database"></i><div>As temporadas ainda não estão ativadas no banco de dados. Falta rodar o SQL <b>021_temporadas.sql</b> no Supabase.</div></div>`;
    return;
  }

  const cobsDa = (t) => coberturas.filter((c) => c.temporada_id === t.id && c.situacao !== 'cancelada');
  const resumo = (t) => {
    const cobs = cobsDa(t);
    const ultima = new Map();
    [...cobs].sort((a, b) => a.data_cobertura.localeCompare(b.data_cobertura)).forEach((c) => ultima.set(c.matriz_id, c));
    const ls = [...ultima.values()];
    const prenhes = ls.filter((c) => ['prenhe', 'parida', 'aborto'].includes(c.situacao));
    const vazias = ls.filter((c) => c.situacao === 'vazia');
    const aguard = ls.filter((c) => c.situacao === 'aguardando_diagnostico');
    const com = prenhes.length + vazias.length;
    return { ls, prenhes, vazias, aguard, taxa: com ? (prenhes.length / com) * 100 : null };
  };

  const statusEtapa = (t, e) => {
    if (e.feito_em) return `<span class="badge ativo"><i data-lucide="check"></i> feito ${fmtData(e.feito_em)}</span>`;
    const d = dataEtapa(t, e); const n = diasEntre(hoje, d);
    if (t.encerrada) return '<span class="badge inativo">não feito</span>';
    if (n < 0) return `<span class="badge perigo">atrasado ${-n}d</span>`;
    if (n === 0) return '<span class="badge aviso">hoje</span>';
    return `<span class="badge">em ${n} dia${n > 1 ? 's' : ''}</span>`;
  };
  const botaoEtapa = (t, e) => {
    if (!editar || t.encerrada) return '';
    if (e.feito_em) return `<button class="btn btn-sm btn-texto" data-desfazer="${t.id}|${e.chave}" title="Desmarcar">desfazer</button>`;
    if (e.chave === 'cobertura') return `<button class="btn btn-sm btn-primario" data-cobrir="${t.id}"><i data-lucide="heart"></i> ${t.tipo === 'tetf' ? 'Registrar transferência' : 'Registrar inseminação'}</button>`;
    if (e.chave === 'diagnostico') return `<button class="btn btn-sm btn-primario" data-diag-temp="${t.id}"><i data-lucide="scan-search"></i> Diagnóstico</button>`;
    return `<button class="btn btn-sm" data-feito="${t.id}|${e.chave}"><i data-lucide="check"></i> Marcar como feito</button>`;
  };

  const cartao = (t) => {
    const r = resumo(t);
    const dentro = ativasDa(t).length;
    const sairam = (t.temporada_animais || []).length - dentro;
    const kpi = (lista, rotulo, valor, detalhe = '') => `<button type="button" class="card kpi clicavel" data-lista-temp="${t.id}|${lista}">
      <span class="rotulo">${rotulo}</span><span class="valor">${valor}</span>${detalhe ? `<span class="detalhe">${detalhe}</span>` : ''}</button>`;
    return `<div class="card temporada ${ctx.destaque === t.id ? 'destaque' : ''}" id="temp-${t.id}" style="margin-bottom:16px">
      <div class="card-titulo"><h3><i data-lucide="calendar-range"></i>${esc(t.nome)} <span class="badge info">${ROTULO_TIPO_TEMP[t.tipo]}</span>${t.encerrada ? ' <span class="badge inativo">encerrada</span>' : ''}</h3>
        <span class="acoes">${editar ? `<button class="btn btn-sm" data-vacas="${t.id}"><i data-lucide="users"></i> Vacas</button>
          <button class="btn btn-sm btn-texto" data-editar-temp="${t.id}" title="Editar temporada" aria-label="Editar temporada"><i data-lucide="pencil"></i></button>` : ''}
          ${excluir ? `<button class="btn btn-sm btn-texto" data-excluir-temp="${t.id}" title="Excluir temporada" aria-label="Excluir temporada"><i data-lucide="trash-2"></i></button>` : ''}</span></div>
      <div class="card-corpo">
        <p class="small muted" style="margin:0 0 10px">Início (D0): <b>${fmtData(t.data_inicio)}</b> · ${pl(dentro, 'vaca', 'vacas')} no protocolo${sairam ? ` · ${pl(sairam, 'saiu', 'saíram')}` : ''}${t.observacoes ? ` · ${esc(t.observacoes)}` : ''}</p>
        <ul class="etapas-temp">${(t.etapas || []).map((e) => `<li class="${e.feito_em ? 'feito' : ''}">
          <span class="etapa-dia">${rotuloDia(t, e)}</span>
          <span class="etapa-nome"><b>${esc(nomeEtapa(t, e))}</b><span class="small muted">${fmtData(dataEtapa(t, e))}</span></span>
          <span class="etapa-status">${statusEtapa(t, e)}</span>
          <span class="etapa-acao">${botaoEtapa(t, e)}</span></li>`).join('')}</ul>
        <div class="grade grade-kpi" style="margin-top:14px">
          ${kpi('dentro', 'Vacas no protocolo', fmtNum(dentro), sairam ? `${fmtNum(sairam)} saíram` : '')}
          ${kpi('cobertas', t.tipo === 'tetf' ? 'Receberam embrião' : 'Inseminadas', fmtNum(r.ls.length))}
          ${kpi('prenhes', 'Prenhes', fmtNum(r.prenhes.length))}
          ${kpi('vazias', 'Vazias', fmtNum(r.vazias.length))}
          ${kpi('aguardando', 'Aguardando confirmação', fmtNum(r.aguard.length))}
          <div class="card kpi"><span class="rotulo">Taxa de prenhez</span><span class="valor">${fmtPct(r.taxa)}</span><span class="detalhe">prenhes ÷ confirmadas</span></div>
        </div>
        ${editar ? `<div class="acoes" style="margin-top:12px;justify-content:flex-end"><button class="btn btn-sm btn-texto" data-encerrar="${t.id}">${t.encerrada ? '<i data-lucide="rotate-ccw"></i> Reabrir temporada' : '<i data-lucide="flag"></i> Encerrar temporada'}</button></div>` : ''}
      </div></div>`;
  };

  const ordenadas = [...temporadas].sort((a, b) => Number(a.encerrada) - Number(b.encerrada) || b.data_inicio.localeCompare(a.data_inicio));
  painel.innerHTML = `<div data-temp-raiz>${editar ? '<div class="acoes" style="margin-bottom:12px"><button class="btn btn-primario" data-nova-temp><i data-lucide="plus"></i> Nova temporada</button></div>' : ''}
    ${ordenadas.length ? ordenadas.map(cartao).join('')
      : `<div class="card">${vazio({ icone: 'calendar-range', titulo: 'Nenhuma temporada ainda', texto: 'Crie uma temporada de IATF ou TETF: escolha as vacas e a data do D0, e o sistema monta o calendário das etapas.' })}</div>`}
    <p class="small muted">As etapas aparecem em Pendências, no Painel e nos avisos quando chegam perto do dia. Encerrar a temporada tira os avisos das etapas que não foram feitas.</p></div>`;

  const porTemp = (id) => temporadas.find((t) => t.id === id);
  painel.querySelector('[data-nova-temp]')?.addEventListener('click', () => abrirTemporada(null, ctx));
  painel.querySelector('[data-temp-raiz]').addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.listaTemp) {
      const [id, lista] = d.listaTemp.split('|'); const t = porTemp(id); const r = resumo(t);
      const cobItem = (c) => ({ id: c.matriz_id, info: `${t.tipo === 'tetf' ? 'Transferência' : 'Inseminação'} ${fmtData(c.data_cobertura)}` });
      const listas = {
        dentro: ['Vacas no protocolo', (t.temporada_animais || []).map((x) => ({ id: x.animal_id, info: x.saiu_etapa ? `Saiu: ${x.motivo_saida || 'sem motivo informado'}` : '', grupo: x.saiu_etapa ? 1 : 0 }))],
        cobertas: [t.tipo === 'tetf' ? 'Receberam embrião' : 'Inseminadas', r.ls.map(cobItem)],
        prenhes: ['Prenhes', r.prenhes.map(cobItem)], vazias: ['Vazias', r.vazias.map(cobItem)], aguardando: ['Aguardando confirmação', r.aguard.map(cobItem)],
      };
      const [tit, itens] = listas[lista];
      abrirLista(`${t.nome} — ${tit}`, itens);
    } else if (d.vacas) abrirVacas(porTemp(d.vacas), ctx);
    else if (d.editarTemp) abrirTemporada(porTemp(d.editarTemp), ctx);
    else if (d.excluirTemp) excluirTemporada(porTemp(d.excluirTemp), ctx);
    else if (d.feito) { const [id, ch] = d.feito.split('|'); marcarFeito(porTemp(id), ch, ctx); }
    else if (d.desfazer) {
      const [id, ch] = d.desfazer.split('|'); const t = porTemp(id);
      try { exigirConexao(); } catch (e) { return toast(e.message, 'aviso', 7000); }
      try { await gravarEtapas(t, t.etapas.map((e) => (e.chave === ch ? { ...e, feito_em: null } : e))); toast('Etapa desmarcada.'); recarregar(); } catch (e) { toast(traduzirErro(e), 'erro', 8000); }
    } else if (d.cobrir) {
      const t = porTemp(d.cobrir); const e = t.etapas.find((x) => x.chave === 'cobertura');
      const ids = ativasDa(t).map((x) => x.animal_id).filter((id) => porId.get(id)?.conta_no_rebanho);
      if (!ids.length) return toast('Não há vacas ativas nesta temporada.', 'aviso');
      F.abrirCobertura(null, async (info) => {
        try { await gravarEtapas(t, t.etapas.map((x) => (x.chave === 'cobertura' ? { ...x, feito_em: info?.data || hojeISO() } : x))); } catch (err) { toast(traduzirErro(err), 'erro', 8000); }
        recarregar();
      }, null, { id: t.id, nome: t.nome, tipo: t.tipo, ids, data: dataEtapa(t, e) });
    } else if (d.diagTemp) {
      const t = porTemp(d.diagTemp);
      const ids = resumo(t).aguard.map((c) => c.matriz_id).filter((id) => porId.get(id)?.conta_no_rebanho);
      if (!ids.length) return toast(`Nenhuma vaca desta temporada aguardando confirmação. Registre antes a ${t.tipo === 'tetf' ? 'transferência' : 'inseminação'}.`, 'aviso', 7000);
      F.abrirDiagnostico(null, async (info) => {
        try { await gravarEtapas(t, t.etapas.map((x) => (x.chave === 'diagnostico' ? { ...x, feito_em: info?.data || hojeISO() } : x))); } catch (err) { toast(traduzirErro(err), 'erro', 8000); }
        recarregar();
      }, ids);
    } else if (d.encerrar) {
      const t = porTemp(d.encerrar);
      try { exigirConexao(); } catch (e) { return toast(e.message, 'aviso', 7000); }
      const { error } = await sb.from('temporadas').update({ encerrada: !t.encerrada }).eq('id', t.id);
      if (error) return toast(traduzirErro(error), 'erro', 8000);
      toast(t.encerrada ? 'Temporada reaberta.' : 'Temporada encerrada.'); recarregar();
    }
  });
  if (ctx.destaque) painel.querySelector(`#temp-${ctx.destaque}`)?.scrollIntoView({ block: 'start' });
}

const pl = (n, um, varios) => `${fmtNum(n)} ${n === 1 ? um : varios}`;

// ---------------------------------------------------------------------
// Marcar etapa como feita (com a data)
// ---------------------------------------------------------------------
function marcarFeito(t, chave, ctx) {
  try { exigirConexao(); } catch (e) { return toast(e.message, 'aviso', 7000); }
  const e = t.etapas.find((x) => x.chave === chave);
  const prev = dataEtapa(t, e);
  const { el, fechar } = abrirModal({
    titulo: `${rotuloDia(t, e)} — ${nomeEtapa(t, e)}`,
    html: `<form id="f-feito" class="grade" style="gap:14px">
      <p class="small muted" style="margin:0">${esc(t.nome)} · ${pl(ativasDa(t).length, 'vaca', 'vacas')} no protocolo. Data prevista: ${fmtData(prev)}.</p>
      <div class="campo"><label for="fe-data">Data em que foi feito <span class="obrig">*</span></label><input id="fe-data" type="date" required max="${hojeISO()}" value="${prev < hojeISO() ? prev : hojeISO()}"></div>
      <p class="small muted" style="margin:0">Se alguma vaca não passou por esta etapa (ex.: perdeu o implante), tire ela do protocolo no botão <b>Vacas</b>.</p>
    </form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-feito">Marcar como feito</button>',
  });
  el.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const data = el.querySelector('#fe-data').value;
    try { await gravarEtapas(t, t.etapas.map((x) => (x.chave === chave ? { ...x, feito_em: data } : x))); toast('Etapa marcada como feita.'); fechar(); ctx.recarregar(); }
    catch (err) { toast(traduzirErro(err), 'erro', 8000); }
  });
}

// ---------------------------------------------------------------------
// Nova temporada / editar temporada
// ---------------------------------------------------------------------
export function abrirTemporada(existente, ctx) {
  if (!pode('reproducao')) return toast('Você não tem permissão para registrar eventos de reprodução.', 'erro');
  try { exigirConexao(); } catch (e) { return toast(e.message, 'aviso', 7000); }
  const ed = existente || {};
  let tipo = ed.tipo || 'iatf';
  let etapas = (ed.etapas || ETAPAS_PADRAO[tipo]).map((e) => ({ ...e }));
  const femeas = [...ctx.porId.values()].filter((a) => a.sexo === 'F' && a.conta_no_rebanho && ['novilha', 'matriz'].includes(a.categoria_grupo))
    .sort((a, b) => String(a.brinco).localeCompare(String(b.brinco), 'pt-BR', { numeric: true }));

  const { el, fechar } = abrirModal({
    titulo: existente ? 'Editar temporada' : 'Nova temporada de IATF / TETF',
    largo: true,
    html: `<form id="f-temp" class="grade" style="gap:14px">
      <div class="campo"><label>Tipo <span class="obrig">*</span></label><div class="opcoes-radio">
        ${Object.entries(ROTULO_TIPO_TEMP).map(([k, r]) => `<label><input type="radio" name="tipo" value="${k}" ${tipo === k ? 'checked' : ''} ${existente ? 'disabled' : ''}> ${r}${k === 'tetf' ? ' (transferência de embrião)' : ' (inseminação em tempo fixo)'}</label>`).join('')}</div></div>
      <div class="grade grade-2" style="gap:14px">
        <div class="campo"><label for="t-d0">Início do protocolo (D0) <span class="obrig">*</span></label><input id="t-d0" type="date" required value="${ed.data_inicio || hojeISO()}"></div>
        <div class="campo"><label for="t-nome">Nome da temporada <span class="obrig">*</span></label><input id="t-nome" required value="${esc(ed.nome || nomeSugerido(tipo, hojeISO()))}"></div>
      </div>
      <div class="campo"><label>Etapas e dias</label>
        <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Dia</th><th>Etapa</th><th>Data</th></tr></thead><tbody id="t-etapas"></tbody></table></div>
        <span class="ajuda">Datas calculadas a partir do D0, pelo protocolo da fazenda.</span></div>
      ${existente ? '' : `<div class="campo"><label>Vacas e novilhas que entram <span class="obrig">*</span></label>
        <div id="t-sel"></div></div>`}
      <div class="campo"><label for="t-obs">Observações</label><textarea id="t-obs" rows="2" placeholder="Ex.: veterinário, protocolo hormonal usado">${esc(ed.observacoes || '')}</textarea></div>
    </form>`,
    rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-temp">${existente ? 'Salvar alterações' : 'Criar temporada'}</button>`,
  });
  const f = el.querySelector('form');
  const d0 = f.querySelector('#t-d0'); const nome = f.querySelector('#t-nome');
  let nomeMexido = !!existente;
  nome.addEventListener('input', () => { nomeMexido = true; });
  const corpo = f.querySelector('#t-etapas');
  const desenhar = () => {
    const tFake = { data_inicio: d0.value || hojeISO(), etapas };
    const tF = { ...tFake, tipo };
    corpo.innerHTML = etapas.map((e) => `<tr><td><b>${rotuloDia(tF, e)}</b></td>
      <td>${esc(nomeEtapa(tF, e))}${e.feito_em ? ' <span class="badge ativo">feito</span>' : ''}</td><td class="small">${d0.value ? fmtData(dataEtapa(tF, e)) : '—'}</td></tr>`).join('');
  };
  desenhar();
  d0.addEventListener('input', () => { if (!nomeMexido) nome.value = nomeSugerido(tipo, d0.value); desenhar(); });
  f.querySelectorAll('input[name=tipo]').forEach((r) => r.addEventListener('change', () => {
    tipo = f.querySelector('input[name=tipo]:checked').value;
    etapas = ETAPAS_PADRAO[tipo].map((e) => ({ ...e }));
    if (!nomeMexido) nome.value = nomeSugerido(tipo, d0.value);
    desenhar();
  }));
  if (!existente) nome.value = nomeSugerido(tipo, d0.value);

  let selecionadas = () => [];
  if (!existente) {
    const sit = (a) => ctx.sitPorId?.get(a.id);
    selecionadas = F.listaMultipla(f.querySelector('#t-sel'), femeas, { detalhe: (a) => [a.categoria_nome, sit(a), a.lote_nome && `lote ${a.lote_nome}`].filter(Boolean).join(' · '),
      botoes: '<button type="button" class="btn btn-sm" data-vazias>Marcar só as vazias</button>', mostrarSelecionadas: true, marcarVisiveis: false });
    f.querySelector('[data-vazias]').addEventListener('click', () => {
      f.querySelectorAll('#t-sel .lista-selecao input[type=checkbox]').forEach((c) => { c.checked = ctx.sitChave?.get(c.value) === 'vazia'; c.dispatchEvent(new Event('change')); });
    });
  }

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try { exigirConexao(); } catch (e) { return toast(e.message, 'aviso', 7000); }
    const ids = selecionadas();
    if (!existente && !ids.length) return toast('Escolha ao menos uma vaca ou novilha.', 'erro');
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    etapas = etapas.map((e) => ({ ...e, nome: nomeEtapa({ tipo }, e) }));
    const dados = { nome: nome.value.trim(), data_inicio: d0.value, etapas, observacoes: textoOuNulo(f.querySelector('#t-obs').value) };
    try {
      if (existente) {
        const { error } = await sb.from('temporadas').update(dados).eq('id', existente.id);
        if (error) throw error;
        toast('Temporada alterada.');
      } else {
        const p = store.prop.id;
        const { data: t, error } = await sb.from('temporadas').insert({ ...dados, propriedade_id: p, tipo }).select('id').single();
        if (error) throw error;
        const { error: e2 } = await sb.from('temporada_animais').insert(ids.map((animal_id) => ({ propriedade_id: p, temporada_id: t.id, animal_id })));
        if (e2) { await sb.from('temporadas').delete().eq('id', t.id); throw e2; }
        toast(`Temporada criada com ${pl(ids.length, 'vaca', 'vacas')}.`);
      }
      fechar(); ctx.recarregar();
    } catch (err) { btn.disabled = false; toast(traduzirErro(err), 'erro', 8000); }
  });
  icones();
}

// ---------------------------------------------------------------------
// Vacas da temporada: tirar do protocolo, voltar e adicionar
// ---------------------------------------------------------------------
function abrirVacas(t, ctx) {
  try { exigirConexao(); } catch (e) { return toast(e.message, 'aviso', 7000); }
  const { porId } = ctx;
  const linhas = (t.temporada_animais || []).filter((x) => porId.get(x.animal_id))
    .sort((a, b) => String(porId.get(a.animal_id).brinco).localeCompare(String(porId.get(b.animal_id).brinco), 'pt-BR', { numeric: true }));
  const dentro = new Set(linhas.map((x) => x.animal_id));
  const outras = [...porId.values()].filter((a) => a.sexo === 'F' && a.conta_no_rebanho && ['novilha', 'matriz'].includes(a.categoria_grupo) && !dentro.has(a.id))
    .sort((a, b) => String(a.brinco).localeCompare(String(b.brinco), 'pt-BR', { numeric: true }));
  const opcEtapa = (sel) => (t.etapas || []).map((e) => `<option value="${esc(e.chave)}" ${sel === e.chave ? 'selected' : ''}>${esc(`${rotuloDia(t, e)} · ${nomeEtapa(t, e)}`)}</option>`).join('');
  const { el, fechar } = abrirModal({
    titulo: `${t.nome} — vacas`,
    largo: true,
    html: `<form id="f-tv" class="grade" style="gap:14px">
      <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Vaca</th><th>Situação no protocolo</th><th>Etapa em que saiu</th><th>Motivo</th></tr></thead><tbody>
        ${linhas.map((x) => { const a = porId.get(x.animal_id); return `<tr data-id="${x.id}">
          <td><b>${esc(a.brinco)}</b><div class="small muted">${esc(a.categoria_nome || '')}</div></td>
          <td><select data-sit><option value="dentro" ${x.saiu_etapa ? '' : 'selected'}>No protocolo</option><option value="saiu" ${x.saiu_etapa ? 'selected' : ''}>Saiu do protocolo</option></select></td>
          <td><select data-etapa ${x.saiu_etapa ? '' : 'disabled'}>${opcEtapa(x.saiu_etapa)}</select></td>
          <td><input data-motivo placeholder="Ex.: perdeu o implante" value="${esc(x.motivo_saida || '')}" ${x.saiu_etapa ? '' : 'disabled'}></td></tr>`; }).join('')
          || '<tr><td colspan="4" class="muted">Nenhuma vaca nesta temporada.</td></tr>'}
      </tbody></table></div>
      ${outras.length && !t.encerrada ? '<div class="campo"><label>Adicionar vacas</label><div id="tv-add"></div></div>' : ''}
    </form>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="f-tv">Salvar</button>',
  });
  el.querySelectorAll('tr[data-id]').forEach((tr) => tr.querySelector('[data-sit]').addEventListener('change', (ev) => {
    const saiu = ev.target.value === 'saiu';
    tr.querySelector('[data-etapa]').disabled = !saiu; tr.querySelector('[data-motivo]').disabled = !saiu;
  }));
  const novas = el.querySelector('#tv-add') ? F.listaMultipla(el.querySelector('#tv-add'), outras, { detalhe: (a) => [a.categoria_nome, ctx.sitPorId?.get(a.id)].filter(Boolean).join(' · ') }) : () => [];
  el.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try { exigirConexao(); } catch (e) { return toast(e.message, 'aviso', 7000); }
    const btn = el.querySelector('[type=submit]'); btn.disabled = true;
    try {
      for (const tr of el.querySelectorAll('tr[data-id]')) {
        const x = linhas.find((y) => y.id === tr.dataset.id);
        const saiu = tr.querySelector('[data-sit]').value === 'saiu';
        const alt = saiu ? { saiu_etapa: tr.querySelector('[data-etapa]').value, motivo_saida: textoOuNulo(tr.querySelector('[data-motivo]').value) } : { saiu_etapa: null, motivo_saida: null };
        if (alt.saiu_etapa === (x.saiu_etapa || null) && alt.motivo_saida === (x.motivo_saida || null)) continue;
        const { error } = await sb.from('temporada_animais').update(alt).eq('id', x.id);
        if (error) throw error;
      }
      const ids = novas();
      if (ids.length) {
        const { error } = await sb.from('temporada_animais').insert(ids.map((animal_id) => ({ propriedade_id: store.prop.id, temporada_id: t.id, animal_id })));
        if (error) throw error;
      }
      toast('Vacas da temporada atualizadas.'); fechar(); ctx.recarregar();
    } catch (err) { btn.disabled = false; toast(traduzirErro(err), 'erro', 8000); }
  });
  icones();
}

async function excluirTemporada(t, ctx) {
  try { exigirConexao(); } catch (e) { return toast(e.message, 'aviso', 7000); }
  const ok = await confirmar({ titulo: 'Excluir temporada', botao: 'Excluir', perigo: true,
    mensagem: `Excluir a temporada <b>${esc(t.nome)}</b>?<br><br>As coberturas e confirmações de prenhez já registradas continuam no sistema (só deixam de estar ligadas à temporada). Esta ação não pode ser desfeita.` });
  if (!ok) return;
  const { error } = await sb.from('temporadas').delete().eq('id', t.id);
  if (error) return toast(traduzirErro(error), 'erro', 8000);
  toast('Temporada excluída.'); ctx.recarregar();
}
