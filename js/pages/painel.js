// =====================================================================
// PAINEL — indicadores calculados a partir dos registros reais
// =====================================================================
import { sb } from '../supabase.js';
import { store, param, nomePasto } from '../store.js';
import { esc, icones, fmtNum, fmtMoeda, fmtData, hojeISO, addDias, ultimosMeses, rotuloMes, fimDoMes, vazio, erroCarga, diasEntre } from '../ui.js';
import { listarAnimais } from '../components/animais-comum.js';
import { htmlAtalhos, ligarAtalhos } from '../components/atalhos.js';
import { todos } from '../components/consulta.js';
import { htmlInstalar, ligarInstalar } from '../components/instalar.js';
import { grafico, CORES } from '../components/graficos.js';
import { consultasPendencias, montarPendencias, htmlPendencias } from '../components/pendencias.js';

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

  const [matr, manejos, cobs, desm, estq, nasc] = await Promise.all([
    consulta(sb.from('matrizes').select('animal_id, situacao_reprodutiva').eq('propriedade_id', p)),
    ...consultasPendencias(p, hoje),
  ]);

  const porId = new Map(animais.map((a) => [a.id, a]));
  const ativos = animais.filter((a) => a.conta_no_rebanho);
  const ativo = (id) => porId.get(id)?.conta_no_rebanho;
  const conta = (f) => ativos.filter(f).length;
  const registrados = conta((a) => a.registrado);
  const grupo = (g) => conta((a) => a.categoria_grupo === g);

  const nascMes = animais.filter((a) => a.origem === 'nascido' && a.data_nascimento?.startsWith(mesAtual)).length;
  const mortesMes = animais.filter((a) => a.status === 'morto' && a.data_saida?.startsWith(mesAtual)).length;
  const vendMes = animais.filter((a) => a.status === 'vendido' && a.data_saida?.startsWith(mesAtual)).length;
  const vendAno = animais.filter((a) => a.status === 'vendido' && a.data_saida?.startsWith(hoje.slice(0, 4))).length;

  // Quadro "Vacas" = categorias do grupo matriz (vacas e primíparas); novilhas contam à parte
  const doGrupo = (g) => matr.data.filter((m) => ativo(m.animal_id) && porId.get(m.animal_id)?.categoria_grupo === g);
  const contaSit = (lista, sits) => lista.filter((m) => sits.includes(m.situacao_reprodutiva)).length;
  const matrizesAtivas = doGrupo('matriz');
  const prenhes = contaSit(matrizesAtivas, ['prenhe', 'proxima_parto']);
  const posParto = contaSit(matrizesAtivas, ['pos_parto']);
  const vazias = contaSit(matrizesAtivas, ['vazia']);
  const cobertas = contaSit(matrizesAtivas, ['coberta', 'aguardando_diagnostico', 'em_reproducao']);
  const novilhasPrenhes = contaSit(doGrupo('novilha'), ['prenhe', 'proxima_parto']);

  const { pend, emTratamento, manejosPend } = montarPendencias({ animais, manejos, cobs, desm, estq, nasc });
  const comPendencia = pend.filter((b) => b.itens.length).sort((x, y) => y.itens.length - x.itens.length);

  // Link para o Rebanho com as categorias do grupo já marcadas (ex.: Matrizes = Vaca, Primípara, Matriz)
  const linkCats = (...grupos) => `#/animais?categoria=${store.base.categorias.filter((c) => grupos.includes(c.grupo)).map((c) => c.id).join(',')}`;
  // Separação por sexo, sempre com o número maior primeiro (ex.: "80 fêmeas · 3 machos")
  const porSexo = (filtro) => {
    const f = conta((a) => filtro(a) && a.sexo === 'F'), m = conta((a) => filtro(a) && a.sexo === 'M');
    const partes = [[f, plural(f, 'fêmea', 'fêmeas')], [m, plural(m, 'macho', 'machos')]];
    return partes.sort((x, y) => y[0] - x[0]).map((p) => p[1]).join(' · ');
  };
  // Quadros por raça (animais ativos), da maior para a menor; raça sem animais não aparece
  const racasPainel = [
    ...store.base.racas.map((r) => ({ id: r.id, nome: r.nome, filtro: (a) => a.raca_id === r.id })),
    { nome: 'Raça não informada', filtro: (a) => !a.raca_id },
  ].map((r) => ({ ...r, total: conta(r.filtro) })).filter((r) => r.total).sort((x, y) => y.total - x.total || x.nome.localeCompare(y.nome, 'pt-BR'));
  // Quadros zerados ficam ocultos (aparecem quando houver registro). O quadro em destaque sempre aparece.
  const kpi = (rotulo, valor, icone, detalhe = '', destaque = false, link = '') => (!destaque && !Number(valor) ? '' : `
    <${link ? `a href="${link}"` : 'div'} class="card kpi ${destaque ? 'destaque' : ''}">
      <span class="rotulo"><i data-lucide="${icone}"></i>${esc(rotulo)}</span>
      <span class="valor">${fmtNum(valor)}</span>
      ${detalhe ? `<span class="detalhe">${detalhe}</span>` : ''}
    </${link ? 'a' : 'div'}>`);

  const nomeMes = new Date().toLocaleDateString('pt-BR', { month: 'long' });
  const agora = new Date();
  const saudacao = agora.getHours() < 12 ? 'Bom dia' : agora.getHours() < 18 ? 'Boa tarde' : 'Boa noite';
  const primeiroNome = (store.perfil?.nome || '').trim().split(/\s+/)[0];
  const dataExtenso = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  // Composição do rebanho: categorias dos animais ativos, da maior para a menor (as menores viram "Outros")
  const porCat = store.base.categorias.map((c) => ({ nome: c.nome, n: conta((a) => a.categoria_id === c.id) }))
    .concat([{ nome: 'Sem categoria', n: conta((a) => !a.categoria_id) }])
    .filter((x) => x.n).sort((x, y) => y.n - x.n);
  const resumir = (l) => (l.length > 6 ? [...l.slice(0, 5), { nome: 'Outros', n: l.slice(5).reduce((t, x) => t + x.n, 0) }] : l);
  // Duas visões na mesma rosca: por raça (padrão) e por categoria
  const visoes = {
    raca: { sub: 'Animais ativos', itens: resumir(racasPainel.map((x) => ({ nome: x.nome, n: x.total, extra: porSexo(x.filtro) }))) },
    categoria: { sub: 'Animais ativos', itens: resumir(porCat) },
  };
  let visao = 'raca';
  try { if (localStorage.getItem('painel.composicao') === 'categoria') visao = 'categoria'; } catch { /* sem armazenamento */ }
  const temComp = ativos.length > 0;
  const pctDe = (n) => { const v = (n / (ativos.length || 1)) * 100; return v > 0 && v < 1 ? '<1' : String(Math.round(v)); };

  // Quadros pequenos: só os que têm valor; 4 quadros ficam 2 em cima e 2 embaixo
  const miniCards = [
    kpi('Vacas', grupo('matriz'), 'heart', [plural(prenhes, 'prenhe', 'prenhes'), posParto && `${fmtNum(posParto)} pós-parto`, cobertas && `${fmtNum(cobertas)} aguardando diagnóstico`, plural(vazias, 'vazia', 'vazias')].filter(Boolean).join(' · '), false, linkCats('matriz')),
    kpi('Novilhas', grupo('novilha'), 'sprout', novilhasPrenhes ? plural(novilhasPrenhes, 'prenhe', 'prenhes') : '', false, linkCats('novilha')),
    kpi('Bezerros', grupo('bezerro'), 'baby', porSexo((a) => a.categoria_grupo === 'bezerro'), false, linkCats('bezerro')),
    kpi('Touros', grupo('touro'), 'shield', '', false, linkCats('touro')),
    kpi('Outros (garrotes, bois…)', conta((a) => ['garrote', 'boi', 'outro'].includes(a.categoria_grupo)), 'layers', '', false, linkCats('garrote', 'boi', 'outro')),
    kpi(`Nascimentos em ${nomeMes}`, nascMes, 'sunrise', '', false, '#/reproducao'),
    kpi(`Mortes em ${nomeMes}`, mortesMes, 'circle-x', '', false, '#/animais?situacao=st:morto'),
    kpi(`Vendidos em ${nomeMes}`, vendMes, 'handshake', `${fmtNum(vendAno)} no ano`, false, '#/animais?situacao=st:vendido'),
    kpi('Em tratamento', emTratamento.size, 'stethoscope', '', false, '#/sanidade'),
    kpi('Manejos pendentes', manejosPend.length, 'calendar-clock', `próximos ${param('dias_alerta_manejo')} dias e atrasados`, false, '#/sanidade'),
  ].filter(Boolean);
  const colsMini = miniCards.length === 4 ? 2 : Math.min(Math.max(miniCards.length, 1), 3);

  el.innerHTML = `
    <div class="boas-vindas">
      <div><h1>${saudacao}${primeiroNome ? `, ${esc(primeiroNome)}` : ''}!</h1>
        <p>${esc(store.prop.nome.toUpperCase())}</p></div>
      <div class="bv-data"><b>${esc(dataExtenso)}</b></div>
    </div>

    <div class="painel-busca">
      <div class="busca-animal">
        <i data-lucide="search"></i>
        <input id="busca-animal" type="search" placeholder="Buscar animal — insira o número ou apelido" autocomplete="off" enterkeyhint="search"
          role="combobox" aria-expanded="false" aria-controls="busca-sugestoes" aria-label="Buscar animal pelo número do brinco ou apelido">
        <ul class="busca-sugestoes oculto" id="busca-sugestoes" role="listbox"></ul>
      </div>
      <a class="btn" href="#/animais" title="Ver rebanho" aria-label="Ver rebanho"><i data-lucide="tag"></i><span class="txt-ver"> Ver rebanho</span></a>
    </div>

    ${!animais.length ? `<div class="card" style="margin-bottom:20px">${vazio({ icone: 'tag', titulo: 'Nenhum animal cadastrado ainda',
      texto: 'Comece cadastrando os animais da propriedade. Todos os indicadores e gráficos deste painel são calculados a partir dos registros feitos no sistema.',
      acao: '<a class="btn btn-primario" href="#/animais/novo"><i data-lucide="plus"></i> Cadastrar primeiro animal</a>' })}</div>` : ''}

    ${htmlInstalar()}
    <div class="painel-topo">
      <div class="painel-kpis">
        <div class="kpi-grupo kpi-principal">
          ${kpi('Animais ativos', ativos.length, 'tag', porSexo(() => true), true, '#/animais?situacao=ativos')}
          ${kpi('Animais registrados', registrados, 'badge-check', `${fmtNum(ativos.length ? Math.round(registrados / ativos.length * 100) : 0)}% do rebanho`, false, '#/animais?registro=sim')}
        </div>
        <div class="kpi-grupo kpi-mini" style="--cols:${colsMini}">
          ${miniCards.join('')}
        </div>
      </div>

      ${temComp ? `<div class="card composicao">
        <h3>Composição do rebanho</h3>
        <div class="comp-topo"><span class="small muted" id="comp-sub"></span>
          <div class="comp-abas" role="tablist">
            <button type="button" role="tab" data-visao="raca">Raça</button><button type="button" role="tab" data-visao="categoria">Categoria</button>
          </div></div>
        <div class="comp-corpo">
          <div class="comp-rosca"><canvas id="g-composicao" aria-label="Composição do rebanho"></canvas>
            <div class="comp-centro"><b>${fmtNum(ativos.length)}</b><span>animais</span></div></div>
          <ul class="comp-legenda" id="comp-legenda"></ul>
        </div>
      </div>` : ''}

      <section id="mercado" class="painel-mercado" hidden></section>
    </div>

    <div class="painel-baixo ${comPendencia.length ? '' : 'sem-pend'}">
      ${comPendencia.length ? `<section id="pendencias" style="--pc3:${Math.min(comPendencia.length, 3)};--pc2:${Math.min(comPendencia.length, 2)}">
        <div class="painel-sec-titulo"><h2><i data-lucide="bell-ring"></i> Atenção e pendências</h2>
          <a class="btn btn-sm" href="#/pendencias">Ver todas as pendências</a></div>
        ${htmlPendencias(comPendencia)}
      </section>` : ''}
      <section class="painel-atalhos"><div class="painel-sec-titulo"><h2><i data-lucide="zap"></i> Atalhos</h2></div>
        <div id="atalhos" class="card">${htmlAtalhos()}</div></section>
    </div>

`;
  const desenharComp = () => {
    const v = visoes[visao];
    el.querySelectorAll('[data-visao]').forEach((b) => { b.classList.toggle('ativo', b.dataset.visao === visao); b.setAttribute('aria-selected', b.dataset.visao === visao); });
    el.querySelector('#comp-sub').textContent = v.sub;
    el.querySelector('#comp-legenda').innerHTML = v.itens.map((x, i) => `<li title="${esc(x.extra || '')}"><i style="background:${CORES[i % CORES.length]}"></i><span>${esc(x.nome)}</span><b>${fmtNum(x.n)} · ${pctDe(x.n)}%</b></li>`).join('');
    grafico(el.querySelector('#g-composicao'), {
      type: 'doughnut',
      data: { labels: v.itens.map((x) => x.nome), datasets: [{ data: v.itens.map((x) => x.n), backgroundColor: v.itens.map((x, i) => CORES[i % CORES.length]), borderWidth: 2, borderColor: '#fff' }] },
      options: { cutout: '64%', plugins: { legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ` ${v.itens[ctx.dataIndex].nome}: ${ctx.raw} (${pctDe(ctx.raw)}%)${v.itens[ctx.dataIndex].extra ? ` · ${v.itens[ctx.dataIndex].extra}` : ''}` } } } },
    });
  };
  if (temComp) {
    desenharComp();
    el.querySelector('.comp-abas').addEventListener('click', (e) => {
      const b = e.target.closest('[data-visao]'); if (!b || b.dataset.visao === visao) return;
      visao = b.dataset.visao;
      try { localStorage.setItem('painel.composicao', visao); } catch { /* sem armazenamento */ }
      desenharComp();
    });
  }
  ligarBusca(el, animais);
  ligarAtalhos(el.querySelector('#atalhos'));
  ligarInstalar(el);
  icones();
  mostrarMercado(el.querySelector('#mercado'));

}

// Fechamento do mercado pecuário de SP (mercado.json é atualizado todo dia útil pelo GitHub Actions)
async function mostrarMercado(sec) {
  if (!sec) return;
  let m;
  try {
    const r = await fetch('mercado.json', { cache: 'no-cache' });
    if (!r.ok) return;
    m = await r.json();
  } catch { return; }
  const itens = (m.itens || []).filter((x) => Number(x.valor) > 0);
  if (!itens.length || !sec.isConnected) return;
  const fech = itens.map((x) => x.fechamento).sort().pop();
  const ddmm = (d) => fmtData(d).slice(0, 5);
  const preco = (x) => `${fmtMoeda(x.valor)}${x.unidade === 'arroba' ? '<small>/@</small>' : ''}`;
  const barras = itens.filter((x) => x.unidade === 'arroba').sort((a, b) => b.valor - a.valor);
  const maior = Math.max(...barras.map((x) => x.valor));
  sec.innerHTML = `<div class="card mercado">
    <div class="mercado-topo">
      <div><h3>Mercado pecuário · ${esc(m.regiao || 'SP')}</h3><span class="small muted">Fechamento ${fmtData(fech)}</span></div>
      <a class="btn btn-sm mercado-link" href="${esc(m.link || 'https://www.noticiasagricolas.com.br/cotacoes/boi-gordo')}" target="_blank" rel="noopener noreferrer">Ver mercado <i data-lucide="arrow-right"></i></a>
    </div>
    <div class="mercado-grade">${itens.map((x) => `
      <div class="mercado-item"><span class="rotulo">${esc(x.nome)}</span>
        <span class="valor">${preco(x)}</span>
        <span class="detalhe">${x.unidade === 'arroba' ? 'por arroba' : 'por cabeça'}${x.fechamento !== fech ? ` · ${ddmm(x.fechamento)}` : ''}</span></div>`).join('')}
    </div>
    <div class="mercado-rodape"><span>Fonte: ${esc(m.fonte || 'Scot Consultoria')}</span><span>Preço de referência</span></div>
    ${barras.map((x) => `<div class="mercado-barra"><span>${esc(x.nome)}</span>
      <div class="trilho"><div style="width:${Math.max(4, (x.valor / maior) * 100).toFixed(1)}%"></div></div>
      <b>${fmtMoeda(x.valor)}</b></div>`).join('')}
  </div>`;
  sec.hidden = false;
  icones();
}

// Busca rápida de animal pelo brinco ou apelido (inclui vendidos e mortos)
function ligarBusca(el, animais) {
  const input = el.querySelector('#busca-animal');
  const lista = el.querySelector('#busca-sugestoes');
  if (!input) return;
  if (window.innerWidth <= 720) input.placeholder = 'Buscar animal';
  const norm = (t) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  let achados = [];
  let marcado = -1;
  const fechar = () => { lista.classList.add('oculto'); input.setAttribute('aria-expanded', 'false'); marcado = -1; };
  const abrir = (a) => { location.hash = `#/animais/${a.id}`; };
  const procurar = () => {
    const t = norm(input.value);
    if (!t) { achados = []; fechar(); return; }
    const nota = (a) => {
      const b = norm(a.brinco), n = norm(a.nome);
      if (b === t || n === t) return 0;
      if (b.startsWith(t) || n.startsWith(t)) return 1;
      return (b.includes(t) || n.includes(t)) ? 2 : 9;
    };
    achados = animais.map((a) => ({ a, n: nota(a) })).filter((x) => x.n < 9)
      .sort((x, y) => x.n - y.n || (y.a.conta_no_rebanho - x.a.conta_no_rebanho) || x.a.brinco.localeCompare(y.a.brinco, 'pt-BR', { numeric: true }))
      .map((x) => x.a);
    marcado = -1;
    lista.innerHTML = achados.length
      ? achados.slice(0, 8).map((a, i) => `<li role="option" data-i="${i}"><b>${esc(a.brinco)}</b>${a.nome ? ` <span>${esc(a.nome)}</span>` : ''}
          <small>${esc(a.categoria_nome || '')}${a.conta_no_rebanho ? '' : ` · ${esc((a.status_nome || '').toLowerCase())}`}</small></li>`).join('')
        + (achados.length > 8 ? `<li class="mais" data-todos>Ver todos os ${achados.length} resultados no Rebanho</li>` : '')
      : '<li class="vazia">Nenhum animal encontrado.</li>';
    lista.classList.remove('oculto');
    input.setAttribute('aria-expanded', 'true');
  };
  const verTodos = () => { location.hash = `#/animais?busca=${encodeURIComponent(input.value.trim())}&situacao=todos`; };
  const marcar = (i) => {
    const itens = [...lista.querySelectorAll('[data-i]')];
    if (!itens.length) return;
    marcado = (i + itens.length) % itens.length;
    itens.forEach((li, k) => li.classList.toggle('marcado', k === marcado));
  };
  input.addEventListener('input', procurar);
  input.addEventListener('focus', () => { if (input.value.trim()) procurar(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); marcar(marcado + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); marcar(marcado - 1); }
    else if (e.key === 'Escape') fechar();
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (marcado >= 0 && achados[marcado]) abrir(achados[marcado]);
      else if (achados.length === 1 || (achados[0] && norm(achados[0].brinco) === norm(input.value))) abrir(achados[0]);
      else if (input.value.trim()) verTodos();
    }
  });
  lista.addEventListener('mousedown', (e) => {
    e.preventDefault();   // não perde o foco antes do clique
    const li = e.target.closest('[data-i], [data-todos]'); if (!li) return;
    if (li.dataset.todos !== undefined) verTodos(); else abrir(achados[Number(li.dataset.i)]);
  });
  input.addEventListener('blur', () => setTimeout(fechar, 120));
}
