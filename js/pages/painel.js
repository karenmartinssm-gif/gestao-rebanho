// =====================================================================
// PAINEL — indicadores calculados a partir dos registros reais
// =====================================================================
import { sb } from '../supabase.js';
import { store, param, nomePasto } from '../store.js';
import { esc, icones, fmtNum, fmtData, hojeISO, addDias, ultimosMeses, rotuloMes, fimDoMes, vazio, erroCarga, diasEntre } from '../ui.js';
import { listarAnimais } from '../components/animais-comum.js';
import { htmlAtalhos, ligarAtalhos } from '../components/atalhos.js';
import { grafico, semDados, CORES } from '../components/graficos.js';
import { todos } from '../components/consulta.js';
import { htmlInstalar, ligarInstalar } from '../components/instalar.js';

const plural = (n, um, varios) => `${fmtNum(n)} ${n === 1 ? um : varios}`;

async function consulta(promessa) {
  const { data, error } = await promessa;
  if (error) { console.warn(error); return { erro: error, data: [] }; }
  return { data: data || [] };
}

export async function render(el) {
  const p = store.prop.id;
  const hoje = hojeISO();
  const meses = ultimosMeses(12);
  const inicio12 = `${meses[0]}-01`;
  const mesAtual = hoje.slice(0, 7);

  let animais;
  try { animais = await listarAnimais(); } catch (e) { el.innerHTML = erroCarga(e); icones(); return; }

  const [pes, matr, manejos, cobs, desm, estq] = await Promise.all([
    consulta(todos(() => sb.from('pesagens').select('id, animal_id, data_pesagem, peso_kg, tipo').eq('propriedade_id', p).gte('data_pesagem', inicio12).neq('tipo', 'nascimento').order('id')).then((data) => ({ data }), (error) => ({ error }))),
    consulta(sb.from('matrizes').select('animal_id, situacao_reprodutiva').eq('propriedade_id', p)),
    consulta(sb.from('manejos_sanitarios').select('id, tipo_manejo_id, data_aplicacao, proxima_aplicacao, proxima_resolvida, situacao, carencia_ate, manejo_animais(animal_id)')
      .eq('propriedade_id', p).or(`situacao.eq.em_andamento,and(proxima_aplicacao.not.is.null,proxima_resolvida.eq.false),carencia_ate.gte.${hoje}`)),
    consulta(sb.from('coberturas').select('id, matriz_id, data_cobertura, data_prevista_parto, situacao').eq('propriedade_id', p).in('situacao', ['prenhe', 'aguardando_diagnostico'])),
    consulta(sb.from('desmames').select('bezerro_id').eq('propriedade_id', p)),
    consulta(sb.from('vw_estoque_suplementos').select('id, nome, unidade, estoque_minimo, saldo, ativo').eq('propriedade_id', p).eq('ativo', true)),
  ]);

  const porId = new Map(animais.map((a) => [a.id, a]));
  const ativos = animais.filter((a) => a.conta_no_rebanho);
  const ativo = (id) => porId.get(id)?.conta_no_rebanho;
  const conta = (f) => ativos.filter(f).length;
  const grupo = (g) => conta((a) => a.categoria_grupo === g);

  const nascMes = animais.filter((a) => a.origem === 'nascido' && a.data_nascimento?.startsWith(mesAtual)).length;
  const mortesMes = animais.filter((a) => a.status === 'morto' && a.data_saida?.startsWith(mesAtual)).length;
  const vendMes = animais.filter((a) => a.status === 'vendido' && a.data_saida?.startsWith(mesAtual)).length;
  const vendAno = animais.filter((a) => a.status === 'vendido' && a.data_saida?.startsWith(hoje.slice(0, 4))).length;

  // Quadro "Matrizes" = categorias do grupo matriz (vacas, primíparas, matrizes); novilhas contam à parte
  const doGrupo = (g) => matr.data.filter((m) => ativo(m.animal_id) && porId.get(m.animal_id)?.categoria_grupo === g);
  const contaSit = (lista, sits) => lista.filter((m) => sits.includes(m.situacao_reprodutiva)).length;
  const matrizesAtivas = doGrupo('matriz');
  const prenhes = contaSit(matrizesAtivas, ['prenhe', 'proxima_parto']);
  const posParto = contaSit(matrizesAtivas, ['pos_parto']);
  const vazias = contaSit(matrizesAtivas, ['vazia']);
  const cobertas = contaSit(matrizesAtivas, ['coberta', 'aguardando_diagnostico', 'em_reproducao']);
  const novilhasPrenhes = contaSit(doGrupo('novilha'), ['prenhe', 'proxima_parto']);

  const tipoManejo = new Map(store.base.tiposManejo.map((t) => [t.id, t]));
  const emTratamento = new Set(manejos.data.filter((m) => m.situacao === 'em_andamento')
    .flatMap((m) => m.manejo_animais.map((x) => x.animal_id)).filter(ativo));
  const limiteManejo = addDias(hoje, param('dias_alerta_manejo'));
  const manejosPend = manejos.data.filter((m) => m.proxima_aplicacao && !m.proxima_resolvida && m.proxima_aplicacao <= limiteManejo && m.situacao !== 'cancelado');

  // ---------- Pendências ----------
  const descrAnimais = (m) => {
    const ids = m.manejo_animais.map((x) => x.animal_id).filter(ativo);
    if (ids.length === 1) return `Animal ${porId.get(ids[0]).brinco}`;
    return `${ids.length} animais`;
  };
  const quando = (d) => {
    const n = diasEntre(hoje, d);
    if (n < 0) return `<span class="badge perigo">atrasado ${-n}d</span>`;
    if (n === 0) return '<span class="badge aviso">hoje</span>';
    return `<span class="badge aviso">${fmtData(d)}</span>`;
  };
  const porClasse = (c) => manejosPend.filter((m) => tipoManejo.get(m.tipo_manejo_id)?.classe === c);
  const limiteParto = addDias(hoje, param('dias_alerta_parto'));
  const limiteDiag = addDias(hoje, -param('dias_diagnostico_gestacao'));
  const desmamados = new Set(desm.data.map((d) => d.bezerro_id));
  const limiteDesmame = addDias(hoje, param('dias_alerta_desmame'));

  const pend = [
    { titulo: 'Vacinas próximas', icone: 'syringe', itens: porClasse('vacina').map((m) => [`${tipoManejo.get(m.tipo_manejo_id)?.nome} · ${descrAnimais(m)}`, quando(m.proxima_aplicacao)]) },
    { titulo: 'Vermifugações pendentes', icone: 'bug', itens: porClasse('vermifugacao').map((m) => [descrAnimais(m), quando(m.proxima_aplicacao)]) },
    { titulo: 'Outros manejos e retornos', icone: 'clipboard-list', itens: manejosPend.filter((m) => !['vacina', 'vermifugacao'].includes(tipoManejo.get(m.tipo_manejo_id)?.classe)).map((m) => [`${tipoManejo.get(m.tipo_manejo_id)?.nome} · ${descrAnimais(m)}`, quando(m.proxima_aplicacao)]) },
    { titulo: 'Previsões de parto', icone: 'baby', itens: cobs.data.filter((c) => c.situacao === 'prenhe' && c.data_prevista_parto && c.data_prevista_parto <= limiteParto && ativo(c.matriz_id)).sort((a, b) => a.data_prevista_parto.localeCompare(b.data_prevista_parto)).map((c) => [`Matriz ${porId.get(c.matriz_id).brinco}`, quando(c.data_prevista_parto)]) },
    { titulo: 'Diagnósticos de gestação pendentes', icone: 'scan-search', itens: cobs.data.filter((c) => c.situacao === 'aguardando_diagnostico' && c.data_cobertura <= limiteDiag && ativo(c.matriz_id)).map((c) => [`Matriz ${porId.get(c.matriz_id).brinco}`, `<span class="small muted">coberta ${fmtData(c.data_cobertura)}</span>`]) },
    { titulo: 'Desmames previstos', icone: 'milk-off', itens: ativos.filter((a) => a.categoria_grupo === 'bezerro' && a.origem === 'nascido' && a.data_nascimento && !desmamados.has(a.id) && addDias(a.data_nascimento, param('idade_desmame_dias')) <= limiteDesmame).map((a) => [`Bezerro(a) ${a.brinco}`, quando(addDias(a.data_nascimento, param('idade_desmame_dias')))]) },
    { titulo: 'Tratamentos em andamento', icone: 'stethoscope', itens: [...emTratamento].map((id) => [`Animal ${porId.get(id).brinco}`, '<span class="badge info">em andamento</span>']) },
    { titulo: 'Fim de carência', icone: 'timer', itens: manejos.data.filter((m) => m.carencia_ate && m.carencia_ate >= hoje).map((m) => [`${tipoManejo.get(m.tipo_manejo_id)?.nome} · ${descrAnimais(m)}`, `<span class="small">até ${fmtData(m.carencia_ate)}</span>`]) },
    { titulo: 'Suplementos com estoque baixo', icone: 'package-open', itens: estq.data.filter((s) => Number(s.estoque_minimo) > 0 && Number(s.saldo) <= Number(s.estoque_minimo)).map((s) => [s.nome, `<span class="badge perigo">${fmtNum(s.saldo, 1)} ${esc(s.unidade)}</span>`]) },
  ];

  // Separação por sexo, sempre com o número maior primeiro (ex.: "80 fêmeas · 3 machos")
  const porSexo = (filtro) => {
    const f = conta((a) => filtro(a) && a.sexo === 'F'), m = conta((a) => filtro(a) && a.sexo === 'M');
    const partes = [[f, plural(f, 'fêmea', 'fêmeas')], [m, plural(m, 'macho', 'machos')]];
    return partes.sort((x, y) => y[0] - x[0]).map((p) => p[1]).join(' · ');
  };
  // Quadros zerados ficam ocultos (aparecem quando houver registro). O quadro em destaque sempre aparece.
  const kpi = (rotulo, valor, icone, detalhe = '', destaque = false, link = '') => (!destaque && !Number(valor) ? '' : `
    <${link ? `a href="${link}"` : 'div'} class="card kpi ${destaque ? 'destaque' : ''}">
      <span class="rotulo"><i data-lucide="${icone}"></i>${esc(rotulo)}</span>
      <span class="valor">${fmtNum(valor)}</span>
      ${detalhe ? `<span class="detalhe">${detalhe}</span>` : ''}
    </${link ? 'a' : 'div'}>`);

  const nomeMes = new Date().toLocaleDateString('pt-BR', { month: 'long' });

  el.innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>${esc(store.prop.nome)}</h1><p>Situação do rebanho em ${fmtData(hoje)}</p></div>
      <div class="acoes"><a class="btn" href="#/animais"><i data-lucide="tag"></i> Ver rebanho</a>
        <a class="btn btn-primario" href="#/animais/novo"><i data-lucide="plus"></i> Cadastrar animal</a></div>
    </div>

    ${!animais.length ? `<div class="card" style="margin-bottom:20px">${vazio({ icone: 'tag', titulo: 'Nenhum animal cadastrado ainda',
      texto: 'Comece cadastrando os animais da propriedade. Todos os indicadores e gráficos deste painel são calculados a partir dos registros feitos no sistema.',
      acao: '<a class="btn btn-primario" href="#/animais/novo"><i data-lucide="plus"></i> Cadastrar primeiro animal</a>' })}</div>` : ''}

    ${htmlInstalar()}
    <div class="grade grade-kpi">
      ${kpi('Animais ativos', ativos.length, 'tag', porSexo(() => true), true, '#/animais')}
      ${kpi('Matrizes', grupo('matriz'), 'heart', [plural(prenhes, 'prenhe', 'prenhes'), posParto && `${fmtNum(posParto)} pós-parto`, cobertas && `${fmtNum(cobertas)} aguardando diagnóstico`, plural(vazias, 'vazia', 'vazias')].filter(Boolean).join(' · '))}
      ${kpi('Touros', grupo('touro'), 'shield')}
      ${kpi('Animais registrados', conta((a) => a.registrado), 'badge-check', `de ${fmtNum(ativos.length)} ativos`)}
      ${kpi('Novilhas', grupo('novilha'), 'sprout', novilhasPrenhes ? plural(novilhasPrenhes, 'prenhe', 'prenhes') : '')}
      ${kpi('Bezerros', grupo('bezerro'), 'baby', porSexo((a) => a.categoria_grupo === 'bezerro'))}
      ${kpi('Outros (garrotes, bois…)', conta((a) => ['garrote', 'boi', 'outro'].includes(a.categoria_grupo)), 'layers')}
      ${kpi(`Nascimentos em ${nomeMes}`, nascMes, 'sunrise')}
      ${kpi(`Mortes em ${nomeMes}`, mortesMes, 'circle-x')}
      ${kpi(`Vendidos em ${nomeMes}`, vendMes, 'handshake', `${fmtNum(vendAno)} no ano`)}
      ${kpi('Em tratamento', emTratamento.size, 'stethoscope')}
      ${kpi('Manejos pendentes', manejosPend.length, 'calendar-clock', `próximos ${param('dias_alerta_manejo')} dias e atrasados`)}
    </div>

    <section class="secao"><h2><i data-lucide="zap"></i> Atalhos</h2><div id="atalhos">${htmlAtalhos()}</div></section>

    <section class="secao" id="pendencias"><h2><i data-lucide="bell-ring"></i> Atenção e pendências</h2>
      <div class="pendencias">${pend.map((b) => `
        <div class="card"><div class="card-titulo"><h3><i data-lucide="${b.icone}"></i>${esc(b.titulo)}</h3>
          <span class="contador ${b.itens.length ? 'alerta-c' : ''}">${b.itens.length}</span></div>
          <ul class="lista-pend">${b.itens.length ? b.itens.slice(0, 6).map(([a, d]) => `<li><span>${esc(a)}</span>${d}</li>`).join('')
            + (b.itens.length > 6 ? `<li class="vazia">e mais ${b.itens.length - 6}…</li>` : '') : '<li class="vazia">Nada pendente.</li>'}</ul>
        </div>`).join('')}</div>
    </section>

    <section class="secao"><h2><i data-lucide="chart-column"></i> Gráficos</h2>
      <div class="grade grade-2">
        <div class="card"><div class="card-titulo"><h3>Evolução do tamanho do rebanho</h3><span class="small muted">fim de cada mês</span></div><div class="grafico"><canvas id="g-evolucao"></canvas></div></div>
        <div class="card"><div class="card-titulo"><h3>Animais por categoria</h3></div><div class="grafico"><canvas id="g-categoria"></canvas></div></div>
        <div class="card"><div class="card-titulo"><h3>Nascimentos por mês</h3></div><div class="grafico"><canvas id="g-nasc"></canvas></div></div>
        <div class="card"><div class="card-titulo"><h3>Mortalidade por mês</h3></div><div class="grafico"><canvas id="g-mort"></canvas></div></div>
        <div class="card"><div class="card-titulo"><h3>Distribuição por sexo</h3></div><div class="grafico"><canvas id="g-sexo"></canvas></div></div>
        <div class="card"><div class="card-titulo"><h3>Animais por pasto</h3></div><div class="grafico" id="w-pasto"><canvas id="g-pasto"></canvas></div></div>
        <div class="card" style="grid-column:1/-1"><div class="card-titulo"><h3>Evolução do peso médio</h3>
          <span class="small muted">média das pesagens registradas no mês (exceto peso ao nascer)</span></div><div class="grafico" id="w-peso"><canvas id="g-peso"></canvas></div></div>
      </div>
    </section>`;
  ligarAtalhos(el.querySelector('#atalhos'));
  ligarInstalar(el);
  icones();

  // ---------- Gráficos ----------
  const porMes = (lista, campo) => meses.map((m) => lista.filter((x) => x[campo]?.startsWith(m)).length);

  grafico(el.querySelector('#g-evolucao'), {
    type: 'line',
    data: { labels: meses.map(rotuloMes), datasets: [{ label: 'Animais', data: meses.map((m) => { const fim = fimDoMes(m); return animais.filter((a) => a.data_entrada <= fim && (!a.data_saida || a.data_saida > fim)).length; }), borderColor: CORES[0], backgroundColor: 'rgba(46,90,61,.12)', fill: true, tension: .3 }] },
  });

  const cats = store.base.categorias.map((c) => ({ nome: c.nome, n: ativos.filter((a) => a.categoria_id === c.id).length })).filter((c) => c.n);
  if (cats.length) grafico(el.querySelector('#g-categoria'), { type: 'doughnut', data: { labels: cats.map((c) => c.nome), datasets: [{ data: cats.map((c) => c.n), backgroundColor: CORES, borderWidth: 2, borderColor: '#fff' }] } });
  else el.querySelector('#g-categoria').parentElement.innerHTML = semDados();

  grafico(el.querySelector('#g-nasc'), { type: 'bar', data: { labels: meses.map(rotuloMes), datasets: [{ label: 'Nascimentos', data: porMes(animais.filter((a) => a.origem === 'nascido'), 'data_nascimento'), backgroundColor: CORES[1], borderRadius: 4 }] } });
  grafico(el.querySelector('#g-mort'), { type: 'bar', data: { labels: meses.map(rotuloMes), datasets: [{ label: 'Mortes', data: porMes(animais.filter((a) => a.status === 'morto'), 'data_saida'), backgroundColor: CORES[7], borderRadius: 4 }] } });

  if (ativos.length) grafico(el.querySelector('#g-sexo'), { type: 'doughnut', data: { labels: ['Machos', 'Fêmeas'], datasets: [{ data: [conta((a) => a.sexo === 'M'), conta((a) => a.sexo === 'F')], backgroundColor: [CORES[3], CORES[1]], borderWidth: 2, borderColor: '#fff' }] } });
  else el.querySelector('#g-sexo').parentElement.innerHTML = semDados();

  const pastos = store.base.pastos.map((pt) => ({ nome: nomePasto(pt), n: ativos.filter((a) => a.pasto_id === pt.id).length })).filter((x) => x.n);
  const semPasto = conta((a) => !a.pasto_id);
  if (pastos.length || semPasto) grafico(el.querySelector('#g-pasto'), { type: 'bar', data: { labels: [...pastos.map((x) => x.nome), ...(semPasto ? ['Sem pasto definido'] : [])], datasets: [{ label: 'Animais', data: [...pastos.map((x) => x.n), ...(semPasto ? [semPasto] : [])], backgroundColor: CORES[0], borderRadius: 4 }] }, options: { indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } } } });
  else el.querySelector('#w-pasto').innerHTML = semDados();

  const medias = meses.map((m) => { const l = pes.data.filter((x) => x.data_pesagem.startsWith(m)); return l.length ? l.reduce((s, x) => s + Number(x.peso_kg), 0) / l.length : null; });
  if (medias.some((v) => v !== null)) grafico(el.querySelector('#g-peso'), { type: 'line', beginAtZero: false, data: { labels: meses.map(rotuloMes), datasets: [{ label: 'Peso médio (kg)', data: medias.map((v) => (v === null ? null : Math.round(v * 10) / 10)), borderColor: CORES[2], backgroundColor: CORES[2], spanGaps: true, tension: .3 }] }, options: { scales: { y: { ticks: { callback: (v) => `${v} kg` } } } } });
  else el.querySelector('#w-peso').innerHTML = semDados('Nenhuma pesagem registrada nos últimos 12 meses.');
}
