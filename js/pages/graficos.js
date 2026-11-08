// =====================================================================
// GRÁFICOS — evolução e composição do rebanho (antes ficavam no Painel)
// =====================================================================
import { sb } from '../supabase.js';
import { store, nomePasto } from '../store.js';
import { icones, erroCarga, ultimosMeses, rotuloMes, fimDoMes } from '../ui.js';
import { listarAnimais } from '../components/animais-comum.js';
import { grafico, semDados, CORES } from '../components/graficos.js';
import { todos } from '../components/consulta.js';

export async function render(el) {
  const p = store.prop.id;
  const meses = ultimosMeses(12);
  const inicio12 = `${meses[0]}-01`;
  let animais, pesagens;
  try {
    [animais, pesagens] = await Promise.all([
      listarAnimais(),
      todos(() => sb.from('pesagens').select('id, animal_id, data_pesagem, peso_kg, tipo').eq('propriedade_id', p).gte('data_pesagem', inicio12).neq('tipo', 'nascimento').order('id')),
    ]);
  } catch (e) { el.innerHTML = erroCarga(e); icones(); return; }
  const pes = { data: pesagens };
  const ativos = animais.filter((a) => a.conta_no_rebanho);
  const conta = (f) => ativos.filter(f).length;


  el.innerHTML = `
    <div class="cabecalho-pagina"><div><h1>Gráficos</h1><p>Evolução e composição do rebanho nos últimos 12 meses, calculadas a partir dos registros.</p></div></div>
    <section class="secao" style="margin-top:0">
      <div class="grade grade-2">
        <div class="card"><div class="card-titulo"><h3>Animais por categoria</h3><span class="small muted">animais ativos</span></div><div class="grafico" id="w-categoria"><canvas id="g-categoria"></canvas></div></div>
        <div class="card"><div class="card-titulo"><h3>Animais por raça</h3><span class="small muted">animais ativos</span></div><div class="grafico" id="w-raca"><canvas id="g-raca"></canvas></div></div>
        <div class="card"><div class="card-titulo"><h3>Animais registrados</h3><span class="small muted">animais ativos</span></div><div class="grafico" id="w-registro"><canvas id="g-registro"></canvas></div></div>
        <div class="card"><div class="card-titulo"><h3>Distribuição por sexo</h3><span class="small muted">animais ativos</span></div><div class="grafico" id="w-sexo"><canvas id="g-sexo"></canvas></div></div>
        <div class="card"><div class="card-titulo"><h3>Evolução do tamanho do rebanho</h3><span class="small muted">fim de cada mês</span></div><div class="grafico"><canvas id="g-evolucao"></canvas></div></div>
        <div class="card"><div class="card-titulo"><h3>Animais por pasto</h3></div><div class="grafico" id="w-pasto"><canvas id="g-pasto"></canvas></div></div>
        <div class="card"><div class="card-titulo"><h3>Nascimentos por mês</h3></div><div class="grafico"><canvas id="g-nasc"></canvas></div></div>
        <div class="card"><div class="card-titulo"><h3>Mortalidade por mês</h3></div><div class="grafico"><canvas id="g-mort"></canvas></div></div>
        <div class="card" style="grid-column:1/-1"><div class="card-titulo"><h3>Evolução do peso médio</h3>
          <span class="small muted">média das pesagens registradas no mês (exceto peso ao nascer)</span></div><div class="grafico" id="w-peso"><canvas id="g-peso"></canvas></div></div>
      </div>
    </section>`;
  icones();

  // ---------- Gráficos ----------
  const porMes = (lista, campo) => meses.map((m) => lista.filter((x) => x[campo]?.startsWith(m)).length);

  grafico(el.querySelector('#g-evolucao'), {
    type: 'line',
    data: { labels: meses.map(rotuloMes), datasets: [{ label: 'Animais', data: meses.map((m) => { const fim = fimDoMes(m); return animais.filter((a) => a.data_entrada <= fim && (!a.data_saida || a.data_saida > fim)).length; }), borderColor: CORES[0], backgroundColor: 'rgba(46,90,61,.12)', fill: true, tension: .3 }] },
  });

  // Pizza com a porcentagem ao lado de cada cor na legenda (ex.: "Novilha · 33%")
  const pizza = (id, itens, cores = CORES) => {
    const lista = itens.filter((x) => x.n).sort((x, y) => y.n - x.n);   // sempre do maior para o menor
    if (!lista.length) { el.querySelector(`#w-${id}`).innerHTML = semDados('Nenhum animal ativo.'); return; }
    const total = lista.reduce((s, x) => s + x.n, 0);
    const pct = (n) => { const v = (n / total) * 100; return v > 0 && v < 1 ? '<1' : String(Math.round(v)); };
    grafico(el.querySelector(`#g-${id}`), {
      type: 'doughnut',
      data: { labels: lista.map((x) => `${x.nome} · ${pct(x.n)}%`), datasets: [{ data: lista.map((x) => x.n), backgroundColor: lista.map((x, i) => x.cor || cores[i % cores.length]), borderWidth: 2, borderColor: '#fff' }] },
      options: { plugins: {
        legend: { display: true, position: window.innerWidth < 720 ? 'bottom' : 'right', labels: { boxWidth: 14, boxHeight: 14, padding: 12, font: { size: 13 } } },
        tooltip: { callbacks: { label: (ctx) => ` ${lista[ctx.dataIndex].nome}: ${ctx.raw} ${ctx.raw === 1 ? 'animal' : 'animais'} (${pct(ctx.raw)}%)` } },
      } },
    });
  };
  const maiorPrimeiro = (l) => l.sort((x, y) => y.n - x.n);

  pizza('categoria', store.base.categorias.map((c) => ({ nome: c.nome, n: conta((a) => a.categoria_id === c.id) })));
  pizza('raca', maiorPrimeiro([...store.base.racas.map((r) => ({ nome: r.nome, n: conta((a) => a.raca_id === r.id) })), { nome: 'Não informada', n: conta((a) => !a.raca_id) }]));
  pizza('registro', [{ nome: 'Registrados', n: conta((a) => a.registrado), cor: CORES[0] }, { nome: 'Não registrados', n: conta((a) => !a.registrado), cor: CORES[9] }]);

  grafico(el.querySelector('#g-nasc'), { type: 'bar', data: { labels: meses.map(rotuloMes), datasets: [{ label: 'Nascimentos', data: porMes(animais.filter((a) => a.origem === 'nascido'), 'data_nascimento'), backgroundColor: CORES[1], borderRadius: 4 }] } });
  grafico(el.querySelector('#g-mort'), { type: 'bar', data: { labels: meses.map(rotuloMes), datasets: [{ label: 'Mortes', data: porMes(animais.filter((a) => a.status === 'morto'), 'data_saida'), backgroundColor: CORES[7], borderRadius: 4 }] } });

  pizza('sexo', maiorPrimeiro([{ nome: 'Fêmeas', n: conta((a) => a.sexo === 'F'), cor: CORES[1] }, { nome: 'Machos', n: conta((a) => a.sexo === 'M'), cor: CORES[3] }]));

  const semPastoN = conta((a) => !a.pasto_id);
  const pastos = [...store.base.pastos.map((pt) => ({ nome: nomePasto(pt), n: ativos.filter((a) => a.pasto_id === pt.id).length })),
    { nome: 'Sem pasto definido', n: semPastoN }].filter((x) => x.n).sort((x, y) => y.n - x.n);
  const semPasto = 0;
  if (pastos.length || semPasto) grafico(el.querySelector('#g-pasto'), { type: 'bar', data: { labels: [...pastos.map((x) => x.nome), ...(semPasto ? ['Sem pasto definido'] : [])], datasets: [{ label: 'Animais', data: [...pastos.map((x) => x.n), ...(semPasto ? [semPasto] : [])], backgroundColor: CORES[0], borderRadius: 4 }] }, options: { indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } } } });
  else el.querySelector('#w-pasto').innerHTML = semDados();

  const medias = meses.map((m) => { const l = pes.data.filter((x) => x.data_pesagem.startsWith(m)); return l.length ? l.reduce((s, x) => s + Number(x.peso_kg), 0) / l.length : null; });
  if (medias.some((v) => v !== null)) grafico(el.querySelector('#g-peso'), { type: 'line', beginAtZero: false, data: { labels: meses.map(rotuloMes), datasets: [{ label: 'Peso médio (kg)', data: medias.map((v) => (v === null ? null : Math.round(v * 10) / 10)), borderColor: CORES[2], backgroundColor: CORES[2], spanGaps: true, tension: .3 }] }, options: { scales: { y: { ticks: { callback: (v) => `${v} kg` } } } } });
  else el.querySelector('#w-peso').innerHTML = semDados('Nenhuma pesagem registrada nos últimos 12 meses.');
}
