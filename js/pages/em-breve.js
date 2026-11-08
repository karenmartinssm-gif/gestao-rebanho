// Módulos planejados para as próximas etapas (sem dados fictícios)
import { esc, vazio } from '../ui.js';

const MODULOS = {
  relatorios: { etapa: 5, icone: 'file-text', titulo: 'Relatórios', itens: ['Inventário, matrizes, touros, bezerros', 'Nascimentos, mortalidade, reprodução, desmame', 'Sanidade, pesagens, pastos, suplementos', 'Exportação em PDF e Excel'] },
};

export async function render(el, [chave]) {
  const m = MODULOS[chave];
  el.innerHTML = `<div class="cabecalho-pagina"><div><h1>${esc(m.titulo)}</h1><p>Módulo previsto para a etapa ${m.etapa} do desenvolvimento.</p></div></div>
    <div class="card">${vazio({ icone: m.icone, titulo: `Disponível na etapa ${m.etapa}`, texto: 'As tabelas e regras de segurança deste módulo já estão criadas no banco de dados. As telas serão entregues e testadas na próxima etapa.' })}
      <div class="card-corpo" style="border-top:1px solid var(--borda)"><h3 style="margin-bottom:8px">O que este módulo terá</h3>
      <ul>${m.itens.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>${m.obs ? `<div class="alerta sucesso"><i data-lucide="check"></i><div>${esc(m.obs)}</div></div>` : ''}</div></div>`;
}
