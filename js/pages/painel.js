// =====================================================================
// PAINEL — indicadores calculados a partir dos registros reais
// =====================================================================
import { sb } from '../supabase.js';
import { store, param, nomePasto } from '../store.js';
import { esc, icones, fmtNum, fmtData, hojeISO, addDias, ultimosMeses, rotuloMes, fimDoMes, vazio, erroCarga, diasEntre } from '../ui.js';
import { listarAnimais } from '../components/animais-comum.js';
import { htmlAtalhos, ligarAtalhos } from '../components/atalhos.js';
import { todos } from '../components/consulta.js';
import { htmlInstalar, ligarInstalar } from '../components/instalar.js';
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

  const [matr, manejos, cobs, desm, estq] = await Promise.all([
    consulta(sb.from('matrizes').select('animal_id, situacao_reprodutiva').eq('propriedade_id', p)),
    ...consultasPendencias(p, hoje),
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

  const { pend, emTratamento, manejosPend } = montarPendencias({ animais, manejos, cobs, desm, estq });
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
    <div class="kpi-faixa">
      <div class="kpi-grupo kpi-principal">
        ${kpi('Animais ativos', ativos.length, 'tag', porSexo(() => true), true, '#/animais?situacao=ativos')}
        ${kpi('Animais registrados', conta((a) => a.registrado), 'badge-check', `de ${fmtNum(ativos.length)} ativos`, false, '#/animais?registro=sim')}
      </div>
      <div class="kpi-divisor" aria-hidden="true"></div>
      <div class="kpi-grupo">
        ${kpi('Matrizes', grupo('matriz'), 'heart', [plural(prenhes, 'prenhe', 'prenhes'), posParto && `${fmtNum(posParto)} pós-parto`, cobertas && `${fmtNum(cobertas)} aguardando diagnóstico`, plural(vazias, 'vazia', 'vazias')].filter(Boolean).join(' · '), false, linkCats('matriz'))}
        ${kpi('Novilhas', grupo('novilha'), 'sprout', novilhasPrenhes ? plural(novilhasPrenhes, 'prenhe', 'prenhes') : '', false, linkCats('novilha'))}
        ${kpi('Bezerros', grupo('bezerro'), 'baby', porSexo((a) => a.categoria_grupo === 'bezerro'), false, linkCats('bezerro'))}
        ${kpi('Touros', grupo('touro'), 'shield', '', false, linkCats('touro'))}
        ${kpi('Outros (garrotes, bois…)', conta((a) => ['garrote', 'boi', 'outro'].includes(a.categoria_grupo)), 'layers', '', false, linkCats('garrote', 'boi', 'outro'))}
        ${kpi(`Nascimentos em ${nomeMes}`, nascMes, 'sunrise', '', false, '#/reproducao')}
        ${kpi(`Mortes em ${nomeMes}`, mortesMes, 'circle-x', '', false, '#/animais?situacao=st:morto')}
        ${kpi(`Vendidos em ${nomeMes}`, vendMes, 'handshake', `${fmtNum(vendAno)} no ano`, false, '#/animais?situacao=st:vendido')}
        ${kpi('Em tratamento', emTratamento.size, 'stethoscope', '', false, '#/sanidade')}
        ${kpi('Manejos pendentes', manejosPend.length, 'calendar-clock', `próximos ${param('dias_alerta_manejo')} dias e atrasados`, false, '#/sanidade')}
      </div>
    </div>

    ${racasPainel.length ? `<section class="secao"><h2><i data-lucide="dna"></i> Raças</h2><div class="grade grade-kpi">
      ${racasPainel.map((r) => kpi(r.nome, r.total, 'dna', porSexo(r.filtro), false, `#/animais?raca=${r.id || '__sem'}`)).join('')}
    </div></section>` : ''}

    <section class="secao"><h2><i data-lucide="zap"></i> Atalhos</h2><div id="atalhos">${htmlAtalhos()}</div></section>

    ${comPendencia.length ? `<section class="secao" id="pendencias"><div class="cabecalho-pagina" style="margin-bottom:10px"><h2 style="margin:0"><i data-lucide="bell-ring"></i> Atenção e pendências</h2>
      <a class="btn btn-sm" href="#/pendencias">Ver todas as pendências</a></div>
      ${htmlPendencias(comPendencia)}
    </section>` : ''}`;
  ligarAtalhos(el.querySelector('#atalhos'));
  ligarInstalar(el);
  icones();

}
