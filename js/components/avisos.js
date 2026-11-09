// =====================================================================
// CENTRAL DE AVISOS (sino no topo)
// Os avisos são calculados a partir dos registros do sistema (nada é inventado).
// "Marcar como visto" vale só neste aparelho; um aviso novo (ou com data nova) volta a aparecer.
// =====================================================================
import { sb } from '../supabase.js';
import { store, pode, param, ehProprietario } from '../store.js';
import { ultimoBackup } from './backup.js';
import { esc, hojeISO, addDias, diasEntre, fmtData, fmtNum, fmtMoeda, abrirModal, icones, vazio } from '../ui.js';
import { listarAnimais } from './animais-comum.js';
import { todos } from './consulta.js';

const chaveVistos = () => `rebanho.avisos.vistos.${store.usuario?.id}.${store.prop?.id}`;
function lerVistos() { try { return new Set(JSON.parse(localStorage.getItem(chaveVistos()) || '[]')); } catch { return new Set(); } }
function gravarVistos(s) { try { localStorage.setItem(chaveVistos(), JSON.stringify([...s].slice(-2000))); } catch { /* ignora */ } }

const GRUPOS = {
  sanidade: { titulo: 'Sanidade', icone: 'syringe' },
  reproducao: { titulo: 'Reprodução e cria', icone: 'heart' },
  estoque: { titulo: 'Estoque', icone: 'package-open' },
  financeiro: { titulo: 'Financeiro', icone: 'wallet' },
  pesagens: { titulo: 'Pesagens', icone: 'scale' },
  sistema: { titulo: 'Cópia de segurança', icone: 'shield-check' },
};

let cache = null;          // { quando, avisos }
const ouvintes = new Set();
export const aoAtualizar = (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); };

/** Calcula os avisos. Usa cache de 5 minutos, a não ser que forcar = true. */
export async function carregarAvisos(forcar = false) {
  if (!forcar && cache && Date.now() - cache.quando < 5 * 60 * 1000 && cache.prop === store.prop.id) return cache.avisos;
  const p = store.prop.id;
  const hoje = hojeISO();
  const q = async (x) => { const { data, error } = await x; if (error) throw error; return data || []; };
  const [animais, cobs, desm, manejos, supl, sanit, rec, desp] = await Promise.all([
    listarAnimais(),
    todos(() => sb.from('coberturas').select('id, matriz_id, data_cobertura, data_prevista_parto, situacao').eq('propriedade_id', p).in('situacao', ['prenhe', 'aguardando_diagnostico']).order('id')),
    todos(() => sb.from('desmames').select('id, bezerro_id').eq('propriedade_id', p).order('id')),
    todos(() => sb.from('manejos_sanitarios').select('id, tipo_manejo_id, lote_id, proxima_aplicacao, proxima_resolvida, situacao, carencia_ate, manejo_animais(animal_id)')
      .eq('propriedade_id', p).eq('proxima_resolvida', false).not('proxima_aplicacao', 'is', null).neq('situacao', 'cancelado').order('id'), 500),
    q(sb.from('vw_estoque_suplementos').select('id, nome, unidade, estoque_minimo, saldo, validade, ativo').eq('propriedade_id', p).eq('ativo', true)),
    q(sb.from('vw_estoque_sanitarios').select('id, nome, unidade, estoque_minimo, saldo, ativo').eq('propriedade_id', p).eq('ativo', true)),
    pode('financeiro') ? q(sb.from('receitas').select('id, descricao, valor, data_lancamento').eq('propriedade_id', p).neq('situacao', 'realizado')) : [],
    pode('financeiro') ? q(sb.from('despesas').select('id, descricao, valor, data_lancamento').eq('propriedade_id', p).neq('situacao', 'realizado')) : [],
  ]);
  const porId = new Map(animais.map((a) => [a.id, a]));
  const ativo = (id) => porId.get(id)?.conta_no_rebanho;
  const brinco = (id) => porId.get(id)?.brinco || '?';
  const tipos = new Map(store.base.tiposManejo.map((t) => [t.id, t]));
  const lotes = new Map(store.base.lotes.map((l) => [l.id, l]));
  const avisos = [];
  const add = (a) => avisos.push(a);
  const prazo = (d) => { const n = diasEntre(hoje, d); return n < 0 ? `atrasado há ${-n} dia(s)` : n === 0 ? 'hoje' : `em ${n} dia(s) · ${fmtData(d)}`; };

  // Sanidade: próximas aplicações e retornos
  const limManejo = addDias(hoje, param('dias_alerta_manejo'));
  manejos.filter((m) => m.proxima_aplicacao <= limManejo).forEach((m) => {
    const ids = (m.manejo_animais || []).map((x) => x.animal_id).filter(ativo);
    if (!ids.length) return;
    const alvo = m.lote_id ? `Lote ${lotes.get(m.lote_id)?.nome || ''} (${ids.length})` : ids.length === 1 ? `Animal ${brinco(ids[0])}` : `${ids.length} animais`;
    add({ chave: `man:${m.id}:${m.proxima_aplicacao}`, grupo: 'sanidade', nivel: m.proxima_aplicacao < hoje ? 'perigo' : 'aviso', data: m.proxima_aplicacao,
      titulo: `${tipos.get(m.tipo_manejo_id)?.nome || 'Manejo'} — ${alvo}`, texto: prazo(m.proxima_aplicacao), link: '#/sanidade' });
  });

  // Reprodução: partos, diagnósticos, desmames
  const limParto = addDias(hoje, param('dias_alerta_parto'));
  cobs.filter((c) => c.situacao === 'prenhe' && c.data_prevista_parto && c.data_prevista_parto <= limParto && ativo(c.matriz_id)).forEach((c) => add({
    chave: `parto:${c.id}:${c.data_prevista_parto}`, grupo: 'reproducao', nivel: c.data_prevista_parto < hoje ? 'perigo' : 'aviso', data: c.data_prevista_parto,
    titulo: `Parto previsto — vaca ${brinco(c.matriz_id)}`, texto: prazo(c.data_prevista_parto), link: `#/animais/${c.matriz_id}` }));
  const limDiag = addDias(hoje, -param('dias_diagnostico_gestacao'));
  cobs.filter((c) => c.situacao === 'aguardando_diagnostico' && c.data_cobertura <= limDiag && ativo(c.matriz_id)).forEach((c) => add({
    chave: `diag:${c.id}`, grupo: 'reproducao', nivel: 'aviso', data: addDias(c.data_cobertura, param('dias_diagnostico_gestacao')),
    titulo: `Diagnóstico de gestação — vaca ${brinco(c.matriz_id)}`, texto: `coberta em ${fmtData(c.data_cobertura)}`, link: `#/animais/${c.matriz_id}` }));
  const desmamados = new Set(desm.map((d) => d.bezerro_id));
  const limDesm = addDias(hoje, param('dias_alerta_desmame'));
  animais.filter((a) => a.conta_no_rebanho && a.categoria_grupo === 'bezerro' && a.origem === 'nascido' && a.data_nascimento && !desmamados.has(a.id)).forEach((a) => {
    const d = addDias(a.data_nascimento, param('idade_desmame_dias'));
    if (d <= limDesm) add({ chave: `desm:${a.id}`, grupo: 'reproducao', nivel: d < hoje ? 'aviso' : 'info', data: d,
      titulo: `Desmame — bezerro(a) ${a.brinco}`, texto: prazo(d), link: `#/animais/${a.id}` });
  });

  // Estoque baixo / vencido
  const baixo = (x) => Number(x.estoque_minimo) > 0 && Number(x.saldo) <= Number(x.estoque_minimo);
  supl.filter(baixo).forEach((x) => add({ chave: `esup:${x.id}:${fmtNum(x.saldo, 1)}`, grupo: 'estoque', nivel: Number(x.saldo) <= 0 ? 'perigo' : 'aviso', data: hoje,
    titulo: `Estoque baixo — ${x.nome}`, texto: `${fmtNum(x.saldo, 1)} ${x.unidade} (mínimo ${fmtNum(x.estoque_minimo, 1)})`, link: '#/alimentacao' }));
  supl.filter((x) => x.validade && x.validade <= addDias(hoje, 30)).forEach((x) => add({ chave: `vsup:${x.id}:${x.validade}`, grupo: 'estoque', nivel: x.validade < hoje ? 'perigo' : 'aviso', data: x.validade,
    titulo: `${x.validade < hoje ? 'Vencido' : 'Vence em breve'} — ${x.nome}`, texto: `validade ${fmtData(x.validade)}`, link: '#/alimentacao' }));
  sanit.filter(baixo).forEach((x) => add({ chave: `esan:${x.id}:${fmtNum(x.saldo, 1)}`, grupo: 'estoque', nivel: Number(x.saldo) <= 0 ? 'perigo' : 'aviso', data: hoje,
    titulo: `Estoque baixo — ${x.nome}`, texto: `${fmtNum(x.saldo, 1)} ${x.unidade} (mínimo ${fmtNum(x.estoque_minimo, 1)})`, link: '#/sanidade' }));

  // Financeiro: vencidos e a vencer em 7 dias
  const lim7 = addDias(hoje, 7);
  [...rec.map((x) => ({ ...x, t: 'receber' })), ...desp.map((x) => ({ ...x, t: 'pagar' }))].filter((x) => x.data_lancamento <= lim7).forEach((x) => add({
    chave: `fin:${x.t}:${x.id}:${x.data_lancamento}`, grupo: 'financeiro', nivel: x.data_lancamento < hoje ? 'perigo' : 'aviso', data: x.data_lancamento,
    titulo: `${x.t === 'pagar' ? 'A pagar' : 'A receber'} — ${x.descricao}`, texto: `${fmtMoeda(x.valor)} · ${prazo(x.data_lancamento)}`, link: '#/financeiro' }));

  // Pesagens: resumo dos animais sem pesagem há mais de 90 dias
  const semPeso = animais.filter((a) => a.conta_no_rebanho && (!a.data_ultima_pesagem || diasEntre(a.data_ultima_pesagem, hoje) > 90)).length;
  if (semPeso) add({ chave: `pes:${hoje.slice(0, 7)}:${semPeso}`, grupo: 'pesagens', nivel: 'info', data: hoje,
    titulo: `${semPeso} animal(is) sem pesagem há mais de 90 dias`, texto: 'veja a lista em Pesagens › Sem pesagem recente', link: '#/pesagens' });

  // Lembrete de cópia de segurança (proprietário, a cada 30 dias, por aparelho)
  if (ehProprietario()) {
    const ult = ultimoBackup();
    const dias = ult ? diasEntre(ult.slice(0, 10), hoje) : null;
    if (dias === null || dias > 30) add({ chave: `backup:${hoje.slice(0, 7)}`, grupo: 'sistema', nivel: 'aviso', data: hoje,
      titulo: 'Baixe uma cópia de segurança', texto: dias === null ? 'nenhuma cópia baixada neste aparelho' : `a última foi há ${dias} dias`, link: '#/relatorios' });
  }

  const ordem = { perigo: 0, aviso: 1, info: 2 };
  avisos.sort((a, b) => ordem[a.nivel] - ordem[b.nivel] || a.data.localeCompare(b.data));
  cache = { quando: Date.now(), avisos, prop: p };
  ouvintes.forEach((fn) => fn(avisos));
  return avisos;
}

export const naoVistos = (avisos) => { const v = lerVistos(); return avisos.filter((a) => a.nivel !== 'info' && !v.has(a.chave)); };

/** Abre a lista de avisos. */
export async function abrirAvisos() {
  const { el, fechar } = abrirModal({ titulo: 'Avisos', largo: true, html: '<div class="carregando"><div class="spinner"></div>Verificando…</div>' });
  let avisos;
  try { avisos = await carregarAvisos(true); } catch (e) { el.querySelector('.modal-corpo').innerHTML = `<div class="alerta perigo">${esc(e.message || 'Não foi possível carregar os avisos.')}</div>`; return; }
  const desenhar = () => {
    const vistos = lerVistos();
    const corpo = el.querySelector('.modal-corpo');
    if (!avisos.length) { corpo.innerHTML = vazio({ icone: 'check-circle-2', titulo: 'Nenhum aviso no momento', texto: 'Partos, manejos, desmames, estoque e contas aparecem aqui quando estiverem próximos.' }); icones(); return; }
    const grupos = Object.keys(GRUPOS).filter((g) => avisos.some((a) => a.grupo === g));
    corpo.innerHTML = `<div class="acoes" style="justify-content:space-between;margin-bottom:10px"><span class="small muted">${avisos.length} aviso(s) · ${naoVistos(avisos).length} novo(s)</span>
      <button class="btn btn-sm" data-todos><i data-lucide="check-check"></i> Marcar todos como vistos</button></div>
      ${grupos.map((g) => `<section class="secao" style="margin-top:12px"><h3 style="display:flex;gap:8px;align-items:center;margin:0 0 8px"><i data-lucide="${GRUPOS[g].icone}"></i>${GRUPOS[g].titulo}</h3>
        <ul class="lista-avisos">${avisos.filter((a) => a.grupo === g).map((a) => `<li class="${a.nivel} ${vistos.has(a.chave) || a.nivel === 'info' ? 'visto' : ''}">
          <a href="${esc(a.link)}" data-ir><b>${esc(a.titulo)}</b><span class="small">${esc(a.texto)}</span></a>
          <span class="badge ${a.nivel === 'perigo' ? 'perigo' : a.nivel === 'aviso' ? 'aviso' : 'info'}">${a.nivel === 'perigo' ? 'atrasado' : a.nivel === 'aviso' ? 'atenção' : 'info'}</span></li>`).join('')}</ul></section>`).join('')}
      <p class="small muted">Os prazos seguem as Configurações da propriedade (dias de alerta de manejo, parto e desmame). "Visto" vale só neste aparelho.</p>`;
    icones();
  };
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-todos]')) { const v = lerVistos(); avisos.forEach((a) => v.add(a.chave)); gravarVistos(v); desenhar(); ouvintes.forEach((fn) => fn(avisos)); }
    if (e.target.closest('[data-ir]')) fechar();
  });
  desenhar();
}
