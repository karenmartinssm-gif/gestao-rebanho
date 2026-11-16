// =====================================================================
// CALCULADORA — preço de venda de uma vaca pelo peso vivo.
// Arrobas = peso vivo × rendimento de carcaça ÷ peso da arroba (15 kg).
// Preço da @ = fechamento mais recente da vaca gorda (mercado.json,
// atualizado todo dia útil). Só o peso vivo é editável.
// =====================================================================
import { esc, icones, fmtNum, fmtMoeda, fmtData, numOuNulo } from '../ui.js';
import { param } from '../store.js';

async function precoVaca() {
  try {
    const r = await fetch('mercado.json', { cache: 'no-cache' });
    if (!r.ok) return null;
    const m = await r.json();
    const x = (m.itens || []).find((i) => i.chave === 'vaca' && Number(i.valor) > 0);
    return x ? { valor: Number(x.valor), fechamento: x.fechamento, fonte: m.fonte, regiao: m.regiao } : null;
  } catch { return null; }
}

export async function render(el) {
  const rend = Number(param('rendimento_carcaca_pct'));
  const kgArroba = Number(param('peso_arroba_kg')) || 15;
  const pct = fmtNum(rend, Number.isInteger(rend) ? 0 : 1);
  const preco = await precoVaca();

  el.innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>Calculadora</h1><p>Preço de venda de uma vaca pelo peso vivo, com a arroba da vaca gorda mais recente.</p></div>
    </div>
    <div class="calc-grade">
      <div class="card">
        <div class="card-titulo"><h3><i data-lucide="calculator"></i> Preço de venda da vaca</h3></div>
        <div class="card-corpo">
        <div class="campo"><label for="calc-peso">Peso vivo (kg) <span class="obrig">*</span></label>
          <input id="calc-peso" type="text" inputmode="decimal" placeholder="Ex.: 450" autocomplete="off" autofocus></div>
        <div class="calc-linha2">
          <div class="campo"><label for="calc-rend">Rendimento de carcaça</label>
            <input id="calc-rend" value="${pct}%" readonly tabindex="-1">
            <span class="ajuda">Padrão da fazenda (ajuste em Configurações › Parâmetros).</span></div>
          <div class="campo"><label for="calc-arroba">Preço da @ (vaca gorda)</label>
            <input id="calc-arroba" value="${preco ? fmtMoeda(preco.valor) : 'indisponível'}" readonly tabindex="-1">
            <span class="ajuda">${preco ? `Fechamento de ${fmtData(preco.fechamento)} · ${esc(preco.regiao || 'SP')} · ${esc(preco.fonte || 'Scot Consultoria')}` : 'Não foi possível buscar o preço agora (sem internet?). Tente de novo mais tarde.'}</span></div>
        </div>
        </div>
      </div>
      <div class="card card-corpo calc-resultado" aria-live="polite">
        <span class="rotulo">Preço de venda</span>
        <span class="valor" id="calc-total">—</span>
        <dl class="calc-conta">
          <dt>Arrobas</dt><dd id="calc-arrobas">—</dd>
          <dt>Conta</dt><dd id="calc-formula" class="small muted">Informe o peso vivo.</dd>
        </dl>
        <p class="small muted" style="margin:0">1 arroba = ${fmtNum(kgArroba)} kg de carcaça. Valor de referência; o preço final depende do romaneio do frigorífico.</p>
      </div>
    </div>`;
  icones();

  const peso = el.querySelector('#calc-peso');
  const calcular = () => {
    const p = numOuNulo(peso.value);
    const total = el.querySelector('#calc-total');
    const arr = el.querySelector('#calc-arrobas');
    const form = el.querySelector('#calc-formula');
    if (!p || p <= 0) { total.textContent = '—'; arr.textContent = '—'; form.textContent = 'Informe o peso vivo.'; return; }
    const a = (p * rend / 100) / kgArroba;
    arr.textContent = `${fmtNum(a, 2)} @`;
    form.textContent = `${fmtNum(p, Number.isInteger(p) ? 0 : 1)} kg × ${pct}% ÷ ${fmtNum(kgArroba)} kg = ${fmtNum(a, 2)} @${preco ? ` × ${fmtMoeda(preco.valor)}` : ''}`;
    total.textContent = preco ? fmtMoeda(a * preco.valor) : 'sem preço da @';
  };
  peso.addEventListener('input', calcular);
}
