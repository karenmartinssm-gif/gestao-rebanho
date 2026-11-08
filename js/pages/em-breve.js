// Módulos planejados para as próximas etapas (sem dados fictícios)
import { esc, vazio } from '../ui.js';

const MODULOS = {
  sanidade: { etapa: 3, icone: 'syringe', titulo: 'Sanidade', itens: ['Calendário sanitário', 'Vacinas, vermifugação, carrapatos, moscas, exames, tratamentos', 'Aplicação coletiva por lote com histórico individual', 'Protocolos próprios da propriedade', 'Alertas de reforço, retorno e fim de carência'] },
  pastagens: { etapa: 3, icone: 'map', titulo: 'Pastagens e lotes', itens: ['Cadastro de pastos e piquetes', 'Lotes de animais', 'Transferências com histórico de ocupação', 'Lotação (cab/ha e UA/ha)'] },
  alimentacao: { etapa: 3, icone: 'wheat', titulo: 'Alimentação e suplementação', itens: ['Produtos e estoque', 'Fornecimentos por lote ou animal', 'Consumo mensal e por cabeça', 'Alerta de estoque baixo'] },
  pesagens: { etapa: 4, icone: 'scale', titulo: 'Pesagens e desempenho', itens: ['Pesagem coletiva (curral)', 'GMD por animal, lote e categoria', 'Evolução do rebanho'], obs: 'A pesagem individual já está disponível na ficha do animal e nos atalhos.' },
  movimentacoes: { etapa: 4, icone: 'arrow-left-right', titulo: 'Movimentações, compras e vendas', itens: ['Compras com valor por arroba, frete e documentos', 'Vendas com peso de saída e valores', 'Histórico geral de entradas e saídas'], obs: 'Mortes, perdas, transferências e doações já podem ser registradas na ficha do animal.' },
  financeiro: { etapa: 4, icone: 'wallet', titulo: 'Financeiro', itens: ['Receitas e despesas por categoria', 'Fluxo de caixa', 'Custo por cabeça e por lote', 'Separação entre realizado e estimado'] },
  relatorios: { etapa: 5, icone: 'file-text', titulo: 'Relatórios', itens: ['Inventário, matrizes, touros, bezerros', 'Nascimentos, mortalidade, reprodução, desmame', 'Sanidade, pesagens, pastos, suplementos', 'Exportação em PDF e Excel'] },
};

export async function render(el, [chave]) {
  const m = MODULOS[chave];
  el.innerHTML = `<div class="cabecalho-pagina"><div><h1>${esc(m.titulo)}</h1><p>Módulo previsto para a etapa ${m.etapa} do desenvolvimento.</p></div></div>
    <div class="card">${vazio({ icone: m.icone, titulo: `Disponível na etapa ${m.etapa}`, texto: 'As tabelas e regras de segurança deste módulo já estão criadas no banco de dados. As telas serão entregues e testadas na próxima etapa.' })}
      <div class="card-corpo" style="border-top:1px solid var(--borda)"><h3 style="margin-bottom:8px">O que este módulo terá</h3>
      <ul>${m.itens.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>${m.obs ? `<div class="alerta sucesso"><i data-lucide="check"></i><div>${esc(m.obs)}</div></div>` : ''}</div></div>`;
}
