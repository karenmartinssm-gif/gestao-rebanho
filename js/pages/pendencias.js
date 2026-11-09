// =====================================================================
// PENDÊNCIAS — todos os quadros de atenção do rebanho (inclusive os vazios)
// =====================================================================
import { store, param } from '../store.js';
import { icones, erroCarga, fmtData, hojeISO } from '../ui.js';
import { listarAnimais } from '../components/animais-comum.js';
import { consultasPendencias, montarPendencias, htmlCardsPendencias, ligarCardsPendencias } from '../components/pendencias.js';

export async function render(el) {
  let animais;
  try { animais = await listarAnimais(); } catch (e) { el.innerHTML = erroCarga(e); icones(); return; }
  const [manejos, cobs, desm, estq, nasc, temp] = await Promise.all(consultasPendencias(store.prop.id));
  const { pend } = montarPendencias({ animais, manejos, cobs, desm, estq, nasc, temp });
  const total = pend.reduce((s, b) => s + b.itens.length, 0);
  el.innerHTML = `
    <div class="cabecalho-pagina"><div><h1>Pendências</h1>
      <p>${total ? `${total} item(ns) pedindo atenção em ${fmtData(hojeISO())}.` : 'Nenhuma pendência no momento.'}</p></div></div>
    ${htmlCardsPendencias(pend)}
    <p class="small muted">Os prazos seguem as Configurações › Parâmetros: manejos nos próximos ${param('dias_alerta_manejo')} dias, partos nos próximos ${param('dias_alerta_parto')} dias, desmames nos próximos ${param('dias_alerta_desmame')} dias e diagnóstico ${param('dias_diagnostico_gestacao')} dias após a cobertura. Quadros com pendência ficam destacados (em vermelho quando há algo atrasado); toque no quadro para ver a lista.</p>`;
  ligarCardsPendencias(el, pend);
  icones();
}
