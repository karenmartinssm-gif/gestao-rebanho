// =====================================================================
// CALCULADORA — preço de venda de uma vaca pelo peso vivo.
// Arrobas = peso vivo × rendimento de carcaça ÷ peso da arroba (15 kg).
// Preço da @ = fechamento mais recente da vaca gorda (mercado.json,
// atualizado todo dia útil). Todos os campos são editáveis; rendimento e
// preço da @ já vêm preenchidos com o padrão da fazenda e o mercado.
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
  const dec = (v, c) => (v == null ? '' : Number(v).toFixed(c).replace('.', ',').replace(/,0+$/, ''));
  const preco = await precoVaca();

  el.innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>Calculadora</h1><p>Preço de venda de uma vaca pelo peso vivo. O rendimento e o preço da @ já vêm preenchidos e podem ser alterados.</p></div>
    </div>
    <div class="calc-grade">
      <div class="card">
        <div class="card-titulo"><h3><i data-lucide="calculator"></i> Preço de venda da vaca</h3></div>
        <div class="card-corpo">
        <div class="campo"><label for="calc-peso">Peso vivo (kg) <span class="obrig">*</span></label>
          <input id="calc-peso" type="text" inputmode="decimal" placeholder="Ex.: 450" autocomplete="off" autofocus></div>
        <div class="calc-linha2">
          <div class="campo"><label for="calc-rend">Rendimento de carcaça (%)</label>
            <input id="calc-rend" type="text" inputmode="decimal" value="${dec(rend, 1)}" autocomplete="off">
            <span class="ajuda">Padrão da fazenda: ${dec(rend, 1)}% (Configurações › Parâmetros).</span></div>
          <div class="campo"><label for="calc-arroba">Preço da @ (R$)</label>
            <input id="calc-arroba" type="text" inputmode="decimal" value="${preco ? Number(preco.valor).toFixed(2).replace('.', ',') : ''}" placeholder="Ex.: 358,00" autocomplete="off">
            <span class="ajuda">${preco ? `Vaca gorda: ${fmtMoeda(preco.valor)} no fechamento de ${fmtData(preco.fechamento)} · ${esc(preco.regiao || 'SP')} · ${esc(preco.fonte || 'Scot Consultoria')}` : 'Não foi possível buscar o preço do mercado agora (sem internet?). Digite o preço da @.'}</span></div>
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

  const $ = (sel) => el.querySelector(sel);
  const calcular = () => {
    const p = numOuNulo($('#calc-peso').value);
    const r = numOuNulo($('#calc-rend').value);
    const v = numOuNulo($('#calc-arroba').value);
    const total = $('#calc-total'); const arr = $('#calc-arrobas'); const form = $('#calc-formula');
    const falta = !p || p <= 0 ? 'Informe o peso vivo.' : (!r || r <= 0 || r > 100) ? 'Informe o rendimento de carcaça (entre 1 e 100%).' : null;
    if (falta) { total.textContent = '—'; arr.textContent = '—'; form.textContent = falta; return; }
    const a = (p * r / 100) / kgArroba;
    arr.textContent = `${fmtNum(a, 2)} @`;
    const n = (x) => fmtNum(x, Number.isInteger(x) ? 0 : 1);
    form.textContent = `${n(p)} kg × ${n(r)}% ÷ ${fmtNum(kgArroba)} kg = ${fmtNum(a, 2)} @${v ? ` × ${fmtMoeda(v)}` : ''}`;
    total.textContent = v && v > 0 ? fmtMoeda(a * v) : 'informe o preço da @';
  };
  ['#calc-peso', '#calc-rend', '#calc-arroba'].forEach((sel) => $(sel).addEventListener('input', calcular));
}
