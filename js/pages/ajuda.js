// =====================================================================
// AJUDA — "Como faço para…?" Busca por palavras (sem acento, com
// sinônimos e pequenos erros de digitação) nas respostas passo a passo.
// Tudo fica no próprio aparelho: funciona sem internet e sem IA.
// =====================================================================
import { esc, icones } from '../ui.js';
import { ASSUNTOS, ARTIGOS, SINONIMOS } from '../components/ajuda-conteudo.js';

const POPULARES = [['parto', 'Registrar nascimento'], ['pesagem-coletiva', 'Pesar um lote'], ['vacinar', 'Vacinar'], ['transferir-pasto', 'Mudar de pasto'], ['sem-internet', 'Usar sem internet'], ['foto-animal', 'Colocar foto']];

const PARADAS = new Set(('a o e os as um uma uns umas de do da dos das no na nos nas em ao aos pra pro pras pros para por com sem '
  + 'que como faco faz fazer fazemos onde qual quais quando quero queria preciso precisa posso pode consigo da dar tem ter eu meu minha '
  + 'seu sua isso esse essa este esta ele ela se ou mais ja so sistema aqui la tela jeito forma alguma algum coisa vou vai ir nao sim oi ola '
  + 'gostaria saber ajuda favor contra uns umas sobre tudo todo toda la').split(' '));

export const norm = (s) => String(s || '').replace(/<[^>]+>/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const raiz = (t) => (t.length > 4 ? t.replace(/(oes|aes|es|s)$/, '') : t);
const tokens = (s) => norm(s).split(' ').filter((t) => t && !PARADAS.has(t)).map(raiz);

// grupos de sinônimos já normalizados
const GRUPOS = SINONIMOS.map((g) => g.map((p) => raiz(norm(p))));

function parecido(a, b) {
  if (a === b) return 1;
  const n = Math.min(a.length, b.length);
  if (n >= 5 && (a.startsWith(b) || b.startsWith(a))) return 0.75;
  if (n >= 5 && a.slice(0, 5) === b.slice(0, 5)) return 0.55;
  if (n >= 5 && Math.abs(a.length - b.length) <= 1 && distancia1(a, b)) return 0.6;   // erro de digitação
  return 0;
}
function distancia1(a, b) {   // no máximo 1 letra diferente / faltando / sobrando
  let i = 0; let j = 0; let dif = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++dif > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return dif + (a.length - i) + (b.length - j) <= 1;
}

// índice: palavras do título (peso 3), das outras formas de perguntar (2) e dos passos (1)
const INDICE = ARTIGOS.map((a) => ({
  a,
  campos: [[new Set(tokens(a.titulo)), 3], [new Set(tokens(a.chaves)), 2], [new Set(tokens(a.passos.join(' ') + ' ' + (a.dica || ''))), 1]],
}));

function variantes(t) {
  const v = new Map([[t, 1]]);
  for (const g of GRUPOS) if (g.some((p) => parecido(p, t) >= 0.6)) g.forEach((p) => { if (!v.has(p)) v.set(p, 0.8); });
  return v;
}

export function buscar(texto) {
  const qs = [...new Set(tokens(texto))];
  if (!qs.length) return [];
  const vs = qs.map(variantes);
  // melhor encontro de cada palavra da pergunta em cada resposta
  const tabela = INDICE.map(({ a, campos }) => ({
    a,
    m: vs.map((v) => {
      let melhor = 0;
      for (const [palavras, peso] of campos) {
        for (const w of palavras) {
          for (const [p, fator] of v) {
            const s = parecido(w, p) * fator * peso;
            if (s > melhor) melhor = s;
          }
        }
      }
      return melhor;
    }),
  }));
  // palavra que aparece em quase todas as respostas (ex.: "animal") vale pouco; palavra rara vale muito
  const n = tabela.length;
  const peso = vs.map((_, i) => Math.log(1 + n / Math.max(1, tabela.filter((r) => r.m[i] > 0).length)));
  const somaPeso = peso.reduce((s, x) => s + x, 0) || 1;
  const notas = tabela.map(({ a, m }) => {
    const nota = m.reduce((s, x, i) => s + x * peso[i], 0) / somaPeso;
    const cobre = m.reduce((s, x, i) => s + (x > 0 ? peso[i] : 0), 0) / somaPeso;
    return { a, nota: nota * cobre };
  }).filter((r) => r.nota >= 0.6).sort((x, y) => y.nota - x.nota);
  const topo = notas[0]?.nota || 0;
  return notas.filter((r) => r.nota >= topo * 0.5).slice(0, 6).map((r) => r.a);
}

const nomeAssunto = Object.fromEntries(ASSUNTOS.map(([k, t]) => [k, t]));

function htmlArtigo(a, aberto = false, mostrarAssunto = false) {
  return `<details class="ajuda-item" id="aj-${a.id}" ${aberto ? 'open' : ''}>
    <summary><span>${mostrarAssunto ? `<span class="ajuda-tag">${esc(nomeAssunto[a.assunto])}</span>` : ''}${esc(a.titulo)}</span><i data-lucide="chevron-down"></i></summary>
    <div class="ajuda-corpo">
      <ol>${a.passos.map((p) => `<li>${p}</li>`).join('')}</ol>
      ${a.dica ? `<p class="ajuda-dica"><i data-lucide="lightbulb"></i><span>${esc(a.dica)}</span></p>` : ''}
      ${a.link ? `<a class="btn btn-primario btn-sm" href="#/${a.link[0]}"><i data-lucide="arrow-right"></i> ${esc(a.link[1])}</a>` : ''}
    </div></details>`;
}

function htmlTodos() {
  return ASSUNTOS.map(([k, t, ic]) => {
    const lista = ARTIGOS.filter((a) => a.assunto === k);
    if (!lista.length) return '';
    return `<section class="ajuda-grupo"><h2><i data-lucide="${ic}"></i>${esc(t)}</h2>${lista.map((a) => htmlArtigo(a)).join('')}</section>`;
  }).join('');
}

export async function render(el) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const porId = new Map(ARTIGOS.map((a) => [a.id, a]));
  el.innerHTML = `
    <div class="cabecalho-pagina"><div><h1>Ajuda</h1>
      <p>Escreva do seu jeito o que quer fazer. As respostas mostram o passo a passo.</p></div></div>
    <div class="ajuda-busca">
      <div class="busca-wrap"><i data-lucide="search"></i>
        <input id="ajuda-q" type="search" autocomplete="off" enterkeyhint="search" placeholder="Como faço para…? Ex.: registrar nascimento" aria-label="Como faço para"></div>
      <div class="chips ajuda-populares"><span class="small muted">Mais procurados:</span>
        ${POPULARES.filter(([id]) => porId.has(id)).map(([id, t]) => `<button type="button" class="chip" data-abrir="${id}">${esc(t)}</button>`).join('')}</div>
    </div>
    <div id="ajuda-res"></div>`;

  const campo = el.querySelector('#ajuda-q');
  const res = el.querySelector('#ajuda-res');

  function mostrar(texto) {
    const q = texto.trim();
    if (!q) { res.innerHTML = htmlTodos(); icones(); return; }
    const achados = buscar(q);
    res.innerHTML = achados.length
      ? `<p class="small muted ajuda-contagem">${achados.length === 1 ? '1 resposta' : `${achados.length} respostas`} para “${esc(q)}”</p>${achados.map((a, i) => htmlArtigo(a, i === 0, true)).join('')}
         <button type="button" class="btn btn-texto ajuda-ver-todas" data-limpar>Ver todas as respostas</button>`
      : `<div class="card card-corpo ajuda-vazio"><i data-lucide="search-x"></i><div><b>Não achei uma resposta para “${esc(q)}”.</b>
          <p class="small" style="margin:4px 0 0">Tente com outras palavras, por exemplo: <i>pesar lote</i>, <i>vaca pariu</i>, <i>mudar de pasto</i>. Ou veja todas as respostas abaixo.</p></div></div>${htmlTodos()}`;
    icones();
  }

  let espera;
  campo.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => mostrar(campo.value), 150); });
  campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(espera); mostrar(campo.value); campo.blur(); } });

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-abrir]');
    if (b) {
      campo.value = ''; mostrar('');
      const d = res.querySelector(`#aj-${b.dataset.abrir}`);
      if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      return;
    }
    if (e.target.closest('[data-limpar]')) { campo.value = ''; mostrar(''); campo.focus(); }
  });

  // "#/ajuda?q=…" já busca; "#/ajuda?a=<id>" abre a resposta
  const q = params.get('q') || '';
  campo.value = q;
  mostrar(q);
  const id = params.get('a');
  if (id) { const d = res.querySelector(`#aj-${CSS.escape(id)}`); if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); } }
  icones();
}
