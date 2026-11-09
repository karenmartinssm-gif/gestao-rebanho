// =====================================================================
// FICHA INDIVIDUAL DO ANIMAL
// =====================================================================
import { sb, BUCKET } from '../supabase.js';
import { store, pode, ehProprietario, nomePasto, podeExcluir, param } from '../store.js';
import {
  esc, icones, toast, traduzirErro, fmtData, fmtDataHora, fmtKg, fmtNum, fmtMoeda, idadeTexto, diasEntre, hojeISO,
  vazio, erroCarga, badgeStatus, montarTabela, confirmar, abrirModal, ROTULO_SEXO, ROTULO_ORIGEM, ROTULO_MOV, ROTULO_SITUACAO_REPRO,
} from '../ui.js';
import { rotuloSitCob } from '../components/reproducao-forms.js';
import { situacaoExibida } from '../components/reproducao-indicadores.js';
import { grafico, CORES } from '../components/graficos.js';
import { exigirConexao } from '../sync.js';

const ROTULO_CAMPO = {
  brinco: 'Brinco', nome: 'Nome', sexo: 'Sexo', raca_id: 'Raça', grau_pureza: 'Grau de pureza', registrado: 'Registrado', numero_registro: 'Número do registro', data_nascimento: 'Nascimento', nascimento_estimado: 'Nascimento estimado',
  categoria_id: 'Categoria', foto_path: 'Foto', origem: 'Origem', mae_id: 'Mãe', pai_id: 'Pai', mae_externa: 'Mãe (externa)',
  pai_externo: 'Pai (externo)', data_aquisicao: 'Data de aquisição', valor_aquisicao: 'Valor de aquisição', peso_nascimento: 'Peso ao nascer',
  peso_atual: 'Peso atual', data_ultima_pesagem: 'Última pesagem', pasto_id: 'Pasto', lote_id: 'Lote', status: 'Status',
  data_entrada: 'Data de entrada', data_saida: 'Data de saída', observacoes: 'Observações',
};

async function q(promessa) {
  const { data, error } = await promessa;
  if (error) { console.warn(error); return []; }
  return data || [];
}

export async function render(el, [id]) {
  const { data: a, error } = await sb.from('vw_animais').select('*').eq('id', id).maybeSingle();
  if (error || !a) { el.innerHTML = error ? erroCarga(error) : vazio({ icone: 'search-x', titulo: 'Animal não encontrado', acao: '<a class="btn" href="#/animais">Voltar ao rebanho</a>' }); icones(); return; }

  const reprodutor = store.base.reprodutores.find((r) => r.animal_id === id);
  // Touro / sêmen usado numa cobertura (nome + raça)
  const TIPO_COB = { monta_natural: 'Monta natural', inseminacao: 'Inseminação', iatf: 'IATF', tetf: 'TETF' };
  const nomeTouro = (rid) => {
    const r = store.base.reprodutores.find((x) => x.id === rid);
    if (!r) return null;
    const raca = store.base.racas.find((x) => x.id === r.raca_id)?.nome;
    return `${r.identificacao}${raca ? ` (${raca})` : ''}`;
  };
  const gestacao = (lista) => lista.find((c) => ['prenhe', 'aguardando_diagnostico'].includes(c.situacao));
  const [pesagens, manejos, movs, filhosMae, filhosPai, coberturas, diagnosticos, nascimentos, desmame, fornec, docs, hist] = await Promise.all([
    q(sb.from('pesagens').select('*').eq('animal_id', id).order('data_pesagem').order('criado_em')),
    q(sb.from('manejo_animais').select('id, manejo:manejos_sanitarios(*, produto:produtos_sanitarios(nome, fabricante))').eq('animal_id', id)),
    q(sb.from('movimentacao_animais').select('*, movimentacao:movimentacoes(*)').eq('animal_id', id)),
    q(sb.from('vw_animais').select('id, brinco, nome, sexo, data_nascimento, status_nome, conta_no_rebanho, status').eq('mae_id', id).order('data_nascimento')),
    reprodutor ? q(sb.from('vw_animais').select('id, brinco, nome, sexo, data_nascimento, status_nome, conta_no_rebanho, status').eq('pai_id', reprodutor.id).order('data_nascimento')) : [],
    a.sexo === 'F' ? q(sb.from('coberturas').select('*').eq('matriz_id', id).order('data_cobertura', { ascending: false })) : [],
    a.sexo === 'F' ? q(sb.from('diagnosticos_gestacao').select('*').eq('matriz_id', id).order('data_diagnostico', { ascending: false })) : [],
    a.sexo === 'F' ? q(sb.from('nascimentos').select('*').eq('matriz_id', id).order('data_nascimento', { ascending: false })) : [],
    q(sb.from('desmames').select('*').eq('bezerro_id', id)),
    q(sb.from('fornecimento_animais').select('id, fornecimento:fornecimentos(*, produto:produtos_suplementacao(nome, unidade))').eq('animal_id', id)),
    q(sb.from('documentos').select('*').eq('animal_id', id).order('criado_em', { ascending: false })),
    q(sb.from('historico_alteracoes').select('*').eq('tabela', 'animais').eq('registro_id', id).order('criado_em', { ascending: false }).limit(200)),
  ]);

  const [matrizRow, cobTouro] = await Promise.all([
    a.sexo === 'F' ? (async () => (await sb.from('matrizes').select('*').eq('animal_id', id).maybeSingle()).data)() : null,
    reprodutor ? q(sb.from('coberturas').select('*').eq('reprodutor_id', reprodutor.id).order('data_cobertura', { ascending: false })) : [],
  ]);
  if (cobTouro.length) {
    const mats = await q(sb.from('animais').select('id, brinco').in('id', [...new Set(cobTouro.map((c) => c.matriz_id))]));
    const nome = new Map(mats.map((m) => [m.id, m]));
    cobTouro.forEach((c) => { c.matriz = nome.get(c.matriz_id); });
  }

  // Ignora vínculos cujo registro principal não veio (ex.: sem permissão de leitura)
  for (const [lista, campo] of [[manejos, 'manejo'], [movs, 'movimentacao'], [fornec, 'fornecimento']]) {
    for (let i = lista.length - 1; i >= 0; i--) if (!lista[i][campo]) lista.splice(i, 1);
  }

  // Vendas em que o animal saiu (valor, comprador) — só aparece para quem pode ver o comercial
  const idsVenda = [...new Set(movs.map((m) => m.movimentacao.venda_id).filter(Boolean))];
  let vendas = new Map();
  if (idsVenda.length) {
    const { data } = await sb.from('vendas').select('*').in('id', idsVenda);
    vendas = new Map((data || []).map((v) => [v.id, v]));
  }
  const porCabeca = (v) => Number(v.valor_total) / (Number(v.quantidade) || 1);
  const vendaSaida = [...movs].filter((m) => vendas.has(m.movimentacao.venda_id))
    .sort((x, y) => y.movimentacao.data_movimentacao.localeCompare(x.movimentacao.data_movimentacao))[0]?.movimentacao.venda_id;
  const vSaida = vendas.get(vendaSaida);

  // Nomes dos usuários que registraram eventos
  const idsUsuarios = [...new Set([...hist.map((h) => h.usuario_id), ...pesagens.map((p) => p.criado_por), ...movs.map((m) => m.movimentacao?.criado_por)].filter(Boolean))];
  const usuarios = new Map((idsUsuarios.length ? await q(sb.from('usuarios').select('id, nome, email').in('id', idsUsuarios)) : []).map((u) => [u.id, u.nome || u.email]));
  const quem = (uid) => esc(usuarios.get(uid) || '—');

  // URLs temporárias das fotos/documentos (bucket privado)
  const caminhos = [...new Set([a.foto_path, ...docs.map((d) => d.storage_path)].filter(Boolean))];
  const urls = new Map();
  if (caminhos.length) {
    const r = await sb.storage.from(BUCKET).createSignedUrls(caminhos, 3600);
    (r.data || []).forEach((x) => x.signedUrl && urls.set(x.path, x.signedUrl));
  }

  const filhos = [...filhosMae, ...filhosPai];
  const ehMatriz = a.sexo === 'F' && ['novilha', 'matriz'].includes(a.categoria_grupo);
  const temRepro = a.sexo === 'F' || reprodutor;
  const pasto = store.base.pastos.find((p) => p.id === a.pasto_id);
  const ativo = a.conta_no_rebanho;
  const ref = a.data_saida || hojeISO();

  const abas = [
    ['dados', 'Dados cadastrais'], ['genealogia', 'Genealogia'], ['pesagens', `Pesagens (${pesagens.length})`],
    ['sanitario', `Sanitário (${manejos.length})`], ['movimentacoes', `Movimentações (${movs.length})`],
    ...(temRepro ? [['reprodutivo', 'Reprodutivo']] : []),
    ['alimentacao', `Alimentação (${fornec.length})`], ['observacoes', 'Observações'],
    ['documentos', `Documentos e fotos (${docs.length})`], ['alteracoes', 'Alterações'],
  ];

  el.innerHTML = `
    <div class="acoes" style="margin-bottom:12px"><a class="btn btn-texto" href="#/animais"><i data-lucide="arrow-left"></i> Rebanho</a></div>
    ${!ativo ? `<div class="alerta ${a.status === 'morto' ? 'perigo' : 'aviso'}" style="margin-bottom:16px"><i data-lucide="archive"></i><div>
      Animal <b>${esc(a.status_nome.toLowerCase())}</b>${a.data_saida ? ` em ${fmtData(a.data_saida)}` : ''}${vSaida ? ` para <b>${esc(vSaida.comprador)}</b> por <b>${fmtMoeda(porCabeca(vSaida))}</b>${Number(vSaida.quantidade) > 1 ? ` (valor por cabeça · venda de ${fmtNum(vSaida.quantidade)} animais, total ${fmtMoeda(vSaida.valor_total)})` : ''}` : ''}. A ficha e o histórico estão preservados e não contam no rebanho ativo.
      ${vSaida ? `<div style="margin-top:6px"><button type="button" class="btn btn-sm" data-ver-venda="${vSaida.id}"><i data-lucide="hand-coins"></i> Ver venda</button></div>` : ''}</div></div>` : ''}
    <div class="card"><div class="card-corpo">
      <div class="ficha-topo">
        ${(() => {
          const temFoto = a.foto_path && urls.get(a.foto_path);
          const miolo = temFoto ? `<img src="${esc(urls.get(a.foto_path))}" alt="Foto do animal ${esc(a.brinco)}">` : '<i data-lucide="camera"></i>';
          const ver = '<button type="button" role="menuitem" data-ver-foto><i data-lucide="maximize-2"></i> Ver foto</button>';
          const entrada = (rotulo) => `<input type="file" id="foto-rapida" accept="image/*" class="oculto" aria-label="${rotulo} do animal ${esc(a.brinco)}">`;
          if (!pode('rebanho_editar')) return temFoto ? `<button type="button" class="ficha-foto editavel com-foto" data-ver-foto title="Ver foto">${miolo}</button>` : `<div class="ficha-foto">${miolo}</div>`;
          // Sem foto: toque no quadro para tirar/escolher a foto (no celular abre câmera ou galeria)
          if (!temFoto) return `<label class="ficha-foto editavel" title="Adicionar foto">${miolo}<span class="ficha-foto-txt">Adicionar foto</span>${entrada('Adicionar foto')}</label>`;
          // Com foto: menu com "Ver foto" (abre grande) e "Trocar foto"
          return `<div class="menu-suspenso foto-suspenso">
            <button type="button" class="ficha-foto editavel com-foto" id="btn-foto" aria-haspopup="true" aria-expanded="false" title="Foto do animal">
              ${miolo}<span class="ficha-foto-cam" aria-hidden="true"><i data-lucide="camera"></i></span></button>
            <div class="menu oculto" role="menu">${ver}
              <label role="menuitem"><i data-lucide="camera"></i> Trocar foto${entrada('Trocar foto')}</label></div>
          </div>`;
        })()}
        <div class="ficha-info">
          <h1>Brinco ${esc(a.brinco)} ${a.nome ? `<span class="muted" style="font-weight:500">${esc(a.nome)}</span>` : ''} ${badgeStatus(a)}</h1>
          <div class="ficha-resumo">
            <span><b>${esc(a.categoria_nome)}</b></span><span>${ROTULO_SEXO[a.sexo]}</span><span>${esc(a.raca_nome || 'Raça não informada')}</span>
            <span>Idade: <b>${idadeTexto(a.data_nascimento, ref)}</b>${a.nascimento_estimado ? ' (estimada)' : ''}</span>
            <span>Peso: <b>${a.peso_atual ? fmtKg(a.peso_atual) : '—'}</b>${a.data_ultima_pesagem ? ` em ${fmtData(a.data_ultima_pesagem)}` : ''}</span>
            ${ativo ? `<span>Pasto: <b>${esc(pasto ? nomePasto(pasto) : '—')}</b></span><span>Lote: <b>${esc(a.lote_nome || '—')}</b></span>` : ''}
          </div>
        </div>
        <div class="acoes">
          ${pode('rebanho_editar') ? `<a class="btn" href="#/animais/${id}/editar"><i data-lucide="pencil"></i> Editar</a>` : ''}
          ${ativo && pode('pesagens') ? '<button class="btn" data-acao="pesagem"><i data-lucide="scale"></i> Registrar pesagem</button>' : ''}
          ${ativo && pode('reproducao') && a.categoria_grupo === 'bezerro' && !desmame.length ? '<button class="btn" data-acao="desmame"><i data-lucide="milk-off"></i> Registrar desmame</button>' : ''}
          ${ativo && pode('comercial') ? '<button class="btn" data-acao="venda"><i data-lucide="hand-coins"></i> Vender</button>' : ''}
          ${ativo && pode('movimentacoes') ? '<button class="btn btn-perigo" data-acao="saida"><i data-lucide="log-out"></i> Registrar saída</button>' : ''}
          ${!ativo && ehProprietario() ? '<button class="btn" data-acao="corrigir"><i data-lucide="undo-2"></i> Corrigir status</button>' : ''}
          ${podeExcluir('rebanho_editar') ? '<button class="btn btn-texto" data-acao="excluir" title="Excluir animal cadastrado por engano"><i data-lucide="trash-2"></i> Excluir</button>' : ''}
        </div>
      </div>
      <div class="abas" role="tablist">${abas.map(([k, t], i) => `<button class="aba ${i === 0 ? 'ativa' : ''}" role="tab" data-aba="${k}">${t}</button>`).join('')}</div>
      <div id="painel-aba"></div>
    </div></div>`;
  icones();

  const recarregar = () => render(el, [id]).then(icones);
  // Foto: menu (Ver foto / Trocar foto) e visualização ampliada
  const btnFoto = el.querySelector('#btn-foto');
  if (btnFoto) {
    const menuFoto = btnFoto.nextElementSibling;
    const fecharMenuFoto = () => { menuFoto.classList.add('oculto'); btnFoto.setAttribute('aria-expanded', 'false'); };
    btnFoto.addEventListener('click', (e) => {
      e.stopPropagation();
      const abrir = menuFoto.classList.contains('oculto');
      menuFoto.classList.toggle('oculto', !abrir); btnFoto.setAttribute('aria-expanded', String(abrir));
    });
    menuFoto.addEventListener('click', (e) => { if (e.target.closest('[data-ver-foto], label')) setTimeout(fecharMenuFoto, 0); });
    document.addEventListener('click', function fora(e) {
      if (!el.isConnected) { document.removeEventListener('click', fora); return; }
      if (!e.target.closest('.foto-suspenso')) fecharMenuFoto();
    });
  }
  el.querySelectorAll('[data-ver-foto]').forEach((b) => b.addEventListener('click', () => {
    const src = el.querySelector('.ficha-foto img')?.src;
    if (!src) return;
    abrirModal({ titulo: `Brinco ${a.brinco}`, largo: true,
      html: `<div class="foto-grande"><img src="${esc(src)}" alt="Foto do animal ${esc(a.brinco)}"></div>` });
  }));
  el.querySelector('#foto-rapida')?.addEventListener('change', async (e) => {
    const arq = e.target.files[0];
    if (!arq) return;
    if (!arq.type.startsWith('image/')) { toast('Escolha uma imagem (foto).', 'erro'); return; }
    const quadro = el.querySelector('.ficha-foto');
    try {
      exigirConexao();
      quadro.classList.add('enviando');
      const { enviarFoto } = await import('./animal-form.js');
      toast('Enviando foto…', 'info');
      const ok = await enviarFoto(a, arq, { tipo: 'foto', definirComoPrincipal: true });
      if (ok) { toast('Foto salva.'); recarregar(); } else quadro.classList.remove('enviando');
    } catch (err) { quadro.classList.remove('enviando'); toast(traduzirErro(err), 'erro'); }
  });
  el.querySelector('[data-acao=pesagem]')?.addEventListener('click', () => import('../components/pesagem.js').then((m) => m.abrirPesagem(a, recarregar)));
  el.querySelector('[data-acao=saida]')?.addEventListener('click', () => import('../components/saida.js').then((m) => m.abrirSaida(a, { aoSalvar: recarregar })));
  // "Ver venda" (aviso do topo e aba Movimentações) abre o detalhe da venda
  el.verVenda = (vid) => import('../components/comercial-forms.js').then((m) => m.abrirDetalheComercial('venda', vendas.get(vid), recarregar));
  if (!el.ouveVenda) {
    el.ouveVenda = true;
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-ver-venda]'); if (b) el.verVenda?.(b.dataset.verVenda); });
  }
  el.querySelector('[data-acao=venda]')?.addEventListener('click', () => import('../components/comercial-forms.js').then((m) => m.abrirVenda({ animais: [a.id] }, recarregar)));
  el.querySelector('[data-acao=desmame]')?.addEventListener('click', () => import('../components/reproducao-forms.js').then((m) => m.abrirDesmame(a, recarregar)));
  el.querySelector('[data-acao=excluir]')?.addEventListener('click', () => import('../components/excluir-animal.js').then((m) => m.excluirAnimal(a, () => { location.hash = '#/animais'; })));
  el.querySelector('[data-acao=corrigir]')?.addEventListener('click', () => import('../components/saida.js').then((m) => m.abrirCorrecaoStatus(a, recarregar)));

  const painel = el.querySelector('#painel-aba');
  const nomeCat = (cid) => store.base.categorias.find((c) => c.id === cid)?.nome;
  const nomeRaca = (rid) => store.base.racas.find((r) => r.id === rid)?.nome;
  const dado = (r, v) => `<div class="dado"><div class="r">${esc(r)}</div><div class="v">${v ?? '—'}</div></div>`;
  const linkAnimal = (x) => `<a href="#/animais/${x.id}">${esc(x.brinco)}</a>${x.nome ? ` <span class="muted">${esc(x.nome)}</span>` : ''}`;

  const conteudos = {
    dados: () => `<div class="dados-lista">
        ${dado('Brinco', esc(a.brinco))}${dado('Nome/apelido', esc(a.nome || '—'))}${dado('Sexo', ROTULO_SEXO[a.sexo])}
        ${dado('Raça', esc(a.raca_nome || '—'))}${dado('Grau de pureza', esc(a.grau_pureza || '—'))}${dado('Registro', a.registrado ? `Sim${a.numero_registro ? ` — nº ${esc(a.numero_registro)}` : ''}` : 'Não')}${dado('Categoria', esc(a.categoria_nome))}
        ${dado('Nascimento', `${fmtData(a.data_nascimento)}${a.nascimento_estimado ? ' <span class="badge">estimada</span>' : ''}`)}
        ${dado('Idade', idadeTexto(a.data_nascimento, ref))}${dado('Origem', ROTULO_ORIGEM[a.origem])}
        ${a.origem === 'comprado' ? dado('Data de aquisição', fmtData(a.data_aquisicao)) + dado('Valor de aquisição', fmtMoeda(a.valor_aquisicao)) : ''}
        ${dado('Peso ao nascer', fmtKg(a.peso_nascimento))}${dado('Peso atual', a.peso_atual ? `${fmtKg(a.peso_atual)} <span class="small muted">(${fmtData(a.data_ultima_pesagem)})</span>` : '—')}
        ${dado('Pasto atual', esc(pasto ? nomePasto(pasto) : '—'))}${dado('Lote atual', esc(a.lote_nome || '—'))}
        ${dado('Status', badgeStatus(a))}${dado('Entrada no rebanho', fmtData(a.data_entrada))}${a.data_saida ? dado('Saída do rebanho', fmtData(a.data_saida)) : ''}
        ${dado('Cadastrado em', fmtDataHora(a.criado_em))}${dado('Última alteração', fmtDataHora(a.atualizado_em))}
      </div>`,

    genealogia: () => `<div class="grade grade-2">
        <div class="card"><div class="card-titulo"><h3><i data-lucide="heart"></i> Mãe</h3></div><div class="card-corpo">
          ${a.mae_id ? linkAnimal({ id: a.mae_id, brinco: a.mae_brinco }) : a.mae_externa ? `${esc(a.mae_externa)} <span class="badge inativo">não cadastrada</span>` : '<span class="muted">Não informada</span>'}</div></div>
        <div class="card"><div class="card-titulo"><h3><i data-lucide="shield"></i> Pai</h3></div><div class="card-corpo">
          ${a.pai_id ? (a.pai_animal_id ? linkAnimal({ id: a.pai_animal_id, brinco: a.pai_identificacao }) : `${esc(a.pai_identificacao)} <span class="badge info">sêmen</span>`)
            : a.pai_externo ? `${esc(a.pai_externo)} <span class="badge inativo">não cadastrado</span>` : '<span class="muted">Não informado</span>'}</div></div>
      </div>
      ${a.sexo === 'F' && gestacao(coberturas) ? (() => { const g = gestacao(coberturas); const t = nomeTouro(g.reprodutor_id); return `
      <div class="card" style="margin-top:16px"><div class="card-titulo"><h3><i data-lucide="baby"></i> Gestação atual</h3><span class="small muted">o pai da cria que ela espera</span></div><div class="card-corpo">
        ${g.situacao === 'prenhe' ? '<b>Prenhe</b>' : '<b>Coberta, aguardando diagnóstico</b>'}${t ? ` de <b>${esc(t)}</b>` : ''} · ${esc(TIPO_COB[g.tipo] || g.tipo)} em ${fmtData(g.data_cobertura)}${g.data_prevista_parto ? ` · parto previsto <b>${fmtData(g.data_prevista_parto)}</b>` : ''}
        ${g.acasalamento ? `<div class="small muted" style="margin-top:4px">Acasalamento: ${esc(g.acasalamento)}</div>` : ''}</div></div>`; })() : ''}
      <p class="small muted" style="margin:10px 0 0">Mãe e Pai acima são os pais deste animal. O touro da gestação atual fica no quadro "Gestação atual" e na aba Reprodutivo.</p>
      <h3 style="margin:20px 0 10px">Filhos registrados (${filhos.length})</h3>
      ${filhos.length ? `<div class="card"><div id="t-filhos"></div></div>` : vazio({ icone: 'git-fork', titulo: 'Nenhum filho registrado', texto: 'Os filhos aparecem aqui quando este animal for informado como mãe ou pai no cadastro ou no registro de nascimento.' })}`,

    pesagens: () => `${pesagens.length ? `
        <div class="card" style="margin-bottom:16px"><div class="card-titulo"><h3>Evolução do peso</h3><span class="small muted">somente pesagens registradas</span></div>
          <div class="grafico"><canvas id="g-peso-animal"></canvas></div></div>
        <div class="card"><div id="t-pesagens"></div></div>
        <p class="small muted">GMD (ganho médio diário) = (peso atual − peso anterior) ÷ dias entre as pesagens.</p>`
      : vazio({ icone: 'scale', titulo: 'Nenhuma pesagem registrada', texto: 'Registre pesagens para acompanhar o ganho de peso e o GMD deste animal.',
          acao: ativo && pode('pesagens') ? '<button class="btn btn-primario" data-acao2="pesagem"><i data-lucide="scale"></i> Registrar pesagem</button>' : '' })}`,

    sanitario: () => `${ativo && pode('sanidade') ? '<div class="acoes" style="margin-bottom:12px"><button class="btn btn-primario" data-san="vacina"><i data-lucide="syringe"></i> Registrar aplicação</button><button class="btn" data-san="tratamento"><i data-lucide="stethoscope"></i> Tratamento / ocorrência</button></div>' : ''}
      ${manejos.length ? '<div class="card"><div id="t-sanitario"></div></div>'
      : vazio({ icone: 'syringe', titulo: 'Nenhum registro sanitário', texto: 'Vacinas, vermifugações, tratamentos e ocorrências aplicadas a este animal (individualmente ou no lote) aparecem aqui.' })}`,

    movimentacoes: () => (movs.length ? '<div class="card"><div id="t-movs"></div></div>' : vazio({ icone: 'arrow-left-right', titulo: 'Nenhuma movimentação' })),

    reprodutivo: () => {
      const botoes = (lista) => (ativo && pode('reproducao') ? `<div class="acoes" style="margin-bottom:16px">${lista}</div>` : '');
      if (a.sexo === 'M') {
        const nomeMat = (id) => esc(cobTouro.find((c) => c.matriz_id === id)?.matriz?.brinco || '—');
        return `<div class="dados-lista">${dado('Cadastrado como reprodutor', reprodutor ? 'Sim' : 'Não')}${dado('Coberturas registradas', fmtNum(cobTouro.length))}
            ${dado('Vacas vinculadas', fmtNum(new Set(cobTouro.map((c) => c.matriz_id)).size))}${dado('Filhos registrados', fmtNum(filhosPai.length))}</div>
          ${cobTouro.length ? `<h3 style="margin:18px 0 8px">Utilização</h3><ul class="linha-tempo">${cobTouro.map((c) => `<li><div class="quando">${fmtData(c.data_cobertura)}</div>
            Vaca <a href="#/animais/${c.matriz_id}">${nomeMat(c.matriz_id)}</a> · ${esc({ monta_natural: 'monta natural', inseminacao: 'inseminação', iatf: 'IATF', tetf: 'TETF' }[c.tipo])} · ${esc(rotuloSitCob(c))}</li>`).join('')}</ul>` : '<p class="small muted">Nenhuma cobertura registrada com este reprodutor.</p>'}`;
      }
      const partos = nascimentos.filter((n) => n.resultado !== 'aborto');
      const abortos = nascimentos.filter((n) => n.resultado === 'aborto');
      const ultimo = partos[0];
      const aberta = coberturas.find((c) => ['prenhe', 'aguardando_diagnostico'].includes(c.situacao));
      const matriz = ehMatriz ? '' : '<div class="alerta small" style="margin-bottom:12px"><i data-lucide="info"></i><div>Esta fêmea ainda não está na categoria novilha ou vaca.</div></div>';
      return `${matriz}${botoes(`<button class="btn" data-repro="cobertura"><i data-lucide="heart"></i> Registrar cobertura</button>
          <button class="btn" data-repro="diagnostico"><i data-lucide="scan-search"></i> Diagnóstico</button>
          <button class="btn btn-primario" data-repro="nascimento"><i data-lucide="baby"></i> Registrar parto</button>`)}
        <div class="dados-lista">
          ${dado('Situação reprodutiva', matrizRow ? `<span class="badge">${esc(ROTULO_SITUACAO_REPRO[situacaoExibida(matrizRow.situacao_reprodutiva, coberturas.find((c) => ['aguardando_diagnostico', 'prenhe'].includes(c.situacao)), { diasDiag: param('dias_diagnostico_gestacao'), diasAlertaParto: param('dias_alerta_parto') })])}</span>${!matrizRow.apta_reproducao ? ' <span class="badge perigo">descarte</span>' : ''}` : '—')}
          ${aberta ? dado('Touro da gestação', esc(nomeTouro(aberta.reprodutor_id) || (aberta.tipo === 'tetf' ? 'ver acasalamento' : 'não informado'))) : ''}
          ${aberta?.situacao === 'prenhe' ? dado('Previsão de parto', fmtData(aberta.data_prevista_parto)) : ''}
          ${dado('Número de partos', fmtNum(partos.length))}${dado('Bezerros nascidos vivos', fmtNum(nascimentos.filter((n) => n.resultado === 'vivo').length))}
          ${dado('Abortos', fmtNum(abortos.length))}${dado('Último parto', ultimo ? fmtData(ultimo.data_nascimento) : '—')}
          ${dado('Coberturas registradas', fmtNum(coberturas.length))}${dado('Diagnósticos', fmtNum(diagnosticos.length))}
        </div>
        ${!coberturas.length && !nascimentos.length ? `<div style="margin-top:16px">${vazio({ icone: 'heart', titulo: 'Sem histórico reprodutivo', texto: 'Registre coberturas, diagnósticos e partos pelos botões acima ou em Reprodução e cria.' })}</div>` : `
        <h3 style="margin:18px 0 8px">Linha do tempo</h3><ul class="linha-tempo">${[
          ...coberturas.map((c) => ({ d: c.data_cobertura, t: `Cobertura (${({ monta_natural: 'monta natural', iatf: 'IATF', tetf: 'TETF', inseminacao: 'inseminação' })[c.tipo] || c.tipo}${nomeTouro(c.reprodutor_id) ? ` · ${nomeTouro(c.reprodutor_id)}` : ''}${c.acasalamento ? ` · ${c.acasalamento}` : ''}) · ${rotuloSitCob(c)}${c.data_prevista_parto && ['prenhe', 'aguardando_diagnostico'].includes(c.situacao) ? ` · parto previsto ${fmtData(c.data_prevista_parto)}` : ''}` })),
          ...diagnosticos.map((x) => ({ d: x.data_diagnostico, t: `Diagnóstico de gestação: ${x.resultado}${x.metodo ? ` (${x.metodo})` : ''}` })),
          ...nascimentos.map((n) => ({ d: n.data_nascimento, t: n.resultado === 'aborto' ? 'Aborto' : n.resultado === 'natimorto' ? 'Parto — natimorto' : 'Parto — bezerro vivo' })),
        ].sort((x, y) => y.d.localeCompare(x.d)).map((e) => `<li><div class="quando">${fmtData(e.d)}</div>${esc(e.t)}</li>`).join('')}</ul>`}`;
    },

    alimentacao: () => (fornec.length ? '<div class="card"><div id="t-fornec"></div></div>'
      : vazio({ icone: 'wheat', titulo: 'Nenhum fornecimento registrado', texto: 'Os fornecimentos de sal, suplementos e ração para este animal, para o lote ou para o pasto dele aparecem aqui.' })),

    observacoes: () => `<div class="card"><div class="card-corpo">${a.observacoes ? `<p style="white-space:pre-wrap;margin:0">${esc(a.observacoes)}</p>` : '<p class="muted" style="margin:0">Sem observações.</p>'}</div></div>
      ${desmame[0] ? `<p class="small muted">Desmamado em ${fmtData(desmame[0].data_desmame)}${desmame[0].peso_desmame ? ` com ${fmtKg(desmame[0].peso_desmame)}` : ''}.</p>` : ''}`,

    documentos: () => `
      ${pode('rebanho_editar') ? `<div class="acoes" style="margin-bottom:14px"><label class="btn btn-primario"><i data-lucide="upload"></i> Adicionar foto ou documento
        <input type="file" id="up-doc" accept="image/*,application/pdf" class="oculto"></label></div>` : ''}
      ${docs.length ? `<div class="galeria">${docs.map((d) => `<div class="item">
          ${d.tipo === 'foto' && urls.get(d.storage_path) ? `<a href="${esc(urls.get(d.storage_path))}" target="_blank" rel="noopener"><img src="${esc(urls.get(d.storage_path))}" alt="${esc(d.nome)}"></a>`
            : `<a class="prev" href="${esc(urls.get(d.storage_path) || '#')}" target="_blank" rel="noopener"><i data-lucide="file-text"></i></a>`}
          <div class="leg"><span title="${esc(d.nome)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.nome)}<br><span class="muted">${fmtData(d.criado_em)}</span></span>
            <span class="acoes">${d.tipo === 'foto' && pode('rebanho_editar') && a.foto_path !== d.storage_path ? `<button class="btn btn-sm btn-texto" title="Usar como foto principal" data-principal="${esc(d.storage_path)}"><i data-lucide="star"></i></button>` : ''}
            ${ehProprietario() ? `<button class="btn btn-sm btn-texto" title="Excluir" data-excluir-doc="${d.id}"><i data-lucide="trash-2"></i></button>` : ''}</span></div>
        </div>`).join('')}</div>`
      : vazio({ icone: 'image', titulo: 'Nenhum arquivo', texto: 'Adicione fotos do animal, GTA, nota fiscal, exames e outros documentos.' })}`,

    alteracoes: () => (hist.length ? `<ul class="linha-tempo">${hist.map((h) => `<li>
        <div class="quando">${fmtDataHora(h.criado_em)} · ${quem(h.usuario_id)}</div>
        <div><b>${h.acao === 'INSERT' ? 'Cadastro do animal' : h.acao === 'DELETE' ? 'Exclusão' : 'Alteração'}</b></div>
        ${h.acao === 'UPDATE' ? `<div class="small">${(h.campos_alterados || []).filter((c) => ROTULO_CAMPO[c]).map((c) => `${esc(ROTULO_CAMPO[c])}: <span class="muted">${esc(valorHist(c, h.dados_antes?.[c], nomeCat, nomeRaca))}</span> → <b>${esc(valorHist(c, h.dados_depois?.[c], nomeCat, nomeRaca))}</b>`).join('<br>')}</div>` : ''}
      </li>`).join('')}</ul>` : vazio({ icone: 'history', titulo: 'Sem alterações registradas' })),
  };

  const montar = {
    reprodutivo: () => painel.querySelectorAll('[data-repro]').forEach((btn) => btn.addEventListener('click', () => import('../components/reproducao-forms.js').then((m) => {
      const fn = { cobertura: m.abrirCobertura, diagnostico: m.abrirDiagnostico, nascimento: m.abrirNascimento }[btn.dataset.repro];
      fn(a, (bez) => (bez ? (location.hash = `#/animais/${bez}`) : recarregar()));
    }))),
    genealogia: () => filhos.length && montarTabela(painel.querySelector('#t-filhos'), {
      colunas: [{ chave: 'brinco', titulo: 'Brinco', primaria: true, render: linkAnimal }, { chave: 'sexo', titulo: 'Sexo', render: (x) => ROTULO_SEXO[x.sexo] },
        { chave: 'data_nascimento', titulo: 'Nascimento', render: (x) => fmtData(x.data_nascimento) }, { chave: 'status_nome', titulo: 'Status', render: badgeStatus }],
      linhas: filhos, busca: filhos.length > 10, aoClicar: (fid) => { location.hash = `#/animais/${fid}`; },
    }),
    pesagens: () => {
      if (!pesagens.length) { painel.querySelector('[data-acao2=pesagem]')?.addEventListener('click', () => el.querySelector('[data-acao=pesagem]')?.click()); return; }
      const linhas = pesagens.map((p, i) => {
        const ant = pesagens[i - 1];
        const dias = ant ? diasEntre(ant.data_pesagem, p.data_pesagem) : null;
        const ganho = ant ? Number(p.peso_kg) - Number(ant.peso_kg) : null;
        return { ...p, dias, ganho, gmd: dias > 0 ? ganho / dias : null };
      });
      montarTabela(painel.querySelector('#t-pesagens'), {
        colunas: [
          { chave: 'data_pesagem', titulo: 'Data', primaria: true, render: (p) => fmtData(p.data_pesagem) },
          { chave: 'peso_kg', titulo: 'Peso', classe: 'dir num', render: (p) => fmtKg(p.peso_kg), valor: (p) => Number(p.peso_kg) },
          { chave: 'ganho', titulo: 'Ganho', classe: 'dir num', render: (p) => (p.ganho == null ? '—' : `${p.ganho > 0 ? '+' : ''}${fmtNum(p.ganho, 1)} kg`) },
          { chave: 'dias', titulo: 'Dias', classe: 'dir num', render: (p) => (p.dias == null ? '—' : fmtNum(p.dias)) },
          { chave: 'gmd', titulo: 'GMD (kg/dia)', classe: 'dir num', render: (p) => (p.gmd == null ? '—' : fmtNum(p.gmd, 3)) },
          { chave: 'tipo', titulo: 'Tipo', render: (p) => ({ rotina: 'Rotina', nascimento: 'Nascimento', desmame: 'Desmame', entrada: 'Entrada', saida: 'Saída' }[p.tipo]) },
          { chave: 'responsavel_nome', titulo: 'Responsável', render: (p) => esc(p.responsavel_nome || usuarios.get(p.criado_por) || '—') },
        ],
        linhas: [...linhas].reverse(), busca: false,
      });
      grafico(painel.querySelector('#g-peso-animal'), {
        type: 'line', beginAtZero: false,
        data: { labels: pesagens.map((p) => fmtData(p.data_pesagem)), datasets: [{ label: 'Peso (kg)', data: pesagens.map((p) => Number(p.peso_kg)), borderColor: CORES[0], backgroundColor: CORES[0], tension: .2, pointRadius: 4 }] },
        options: { scales: { x: { grid: { display: false } }, y: { ticks: { callback: (v) => `${v} kg` } } } },
      });
    },
    sanitario: () => {
      painel.querySelectorAll('[data-san]').forEach((btn) => btn.addEventListener('click', () => import('../components/sanidade-forms.js')
        .then((m) => m.abrirManejo({ classe: btn.dataset.san, animais: [a.id] }, recarregar))));
      if (manejos.length) montar.tabelaSanitario();
    },
    tabelaSanitario: () => montarTabela(painel.querySelector('#t-sanitario'), {
      colunas: [
        { chave: 'data', titulo: 'Data', primaria: true, render: (m) => fmtData(m.manejo.data_aplicacao), valor: (m) => m.manejo.data_aplicacao },
        { chave: 'tipo', titulo: 'Procedimento', render: (m) => esc(store.base.tiposManejo.find((t) => t.id === m.manejo.tipo_manejo_id)?.nome || '—'), valor: (m) => store.base.tiposManejo.find((t) => t.id === m.manejo.tipo_manejo_id)?.nome },
        { chave: 'produto', titulo: 'Produto', render: (m) => esc([m.manejo.produto?.nome, m.manejo.produto?.fabricante].filter(Boolean).join(' · ') || '—'), valor: (m) => m.manejo.produto?.nome },
        { chave: 'dose', titulo: 'Dosagem / via', render: (m) => esc([m.manejo.dosagem, m.manejo.via_administracao].filter(Boolean).join(' · ') || '—') },
        { chave: 'prox', titulo: 'Próxima', render: (m) => fmtData(m.manejo.proxima_aplicacao) },
        { chave: 'carencia', titulo: 'Carência até', render: (m) => fmtData(m.manejo.carencia_ate) },
        { chave: 'resp', titulo: 'Responsável', render: (m) => esc(m.manejo.responsavel_nome || '—') },
      ],
      linhas: [...manejos].sort((x, y) => y.manejo.data_aplicacao.localeCompare(x.manejo.data_aplicacao)),
    }),
    movimentacoes: () => movs.length && montarTabela(painel.querySelector('#t-movs'), {
      colunas: [
        { chave: 'data', titulo: 'Data', primaria: true, render: (m) => fmtData(m.movimentacao.data_movimentacao), valor: (m) => m.movimentacao.data_movimentacao },
        { chave: 'tipo', titulo: 'Tipo', render: (m) => esc(ROTULO_MOV[m.movimentacao.tipo]), valor: (m) => ROTULO_MOV[m.movimentacao.tipo] },
        { chave: 'de', titulo: 'Origem', render: (m) => esc([nomePasto(store.base.pastos.find((p) => p.id === m.pasto_origem_id)), store.base.lotes.find((l) => l.id === m.lote_origem_id)?.nome].filter(Boolean).join(' / ') || '—') },
        { chave: 'para', titulo: 'Destino', render: (m) => esc([nomePasto(store.base.pastos.find((p) => p.id === m.movimentacao.pasto_destino_id)), store.base.lotes.find((l) => l.id === m.movimentacao.lote_destino_id)?.nome, m.movimentacao.status_destino && store.base.status.find((s) => s.codigo === m.movimentacao.status_destino)?.nome].filter(Boolean).join(' / ') || '—') },
        { chave: 'motivo', titulo: 'Motivo / causa', render: (m) => esc([m.movimentacao.motivo, m.movimentacao.causa].filter(Boolean).join(' — ') || '—') },
        { chave: 'resp', titulo: 'Responsável', render: (m) => esc(m.movimentacao.responsavel_nome || usuarios.get(m.movimentacao.criado_por) || '—') },
        ...(vendas.size ? [{ chave: 'valor', titulo: 'Valor da venda', classe: 'dir', valor: (m) => (vendas.has(m.movimentacao.venda_id) ? porCabeca(vendas.get(m.movimentacao.venda_id)) : null),
          render: (m) => {
            const v = vendas.get(m.movimentacao.venda_id);
            if (!v) return '—';
            return `<b>${fmtMoeda(porCabeca(v))}</b>${Number(v.quantidade) > 1 ? `<div class="small muted">por cabeça · total ${fmtMoeda(v.valor_total)}</div>` : ''}`;
          } }] : []),
      ],
      linhas: [...movs].sort((x, y) => (y.movimentacao.data_movimentacao + y.criado_em).localeCompare(x.movimentacao.data_movimentacao + x.criado_em)),
    }),
    alimentacao: () => fornec.length && montarTabela(painel.querySelector('#t-fornec'), {
      colunas: [
        { chave: 'data', titulo: 'Data', primaria: true, render: (f) => fmtData(f.fornecimento.data_fornecimento), valor: (f) => f.fornecimento.data_fornecimento },
        { chave: 'produto', titulo: 'Produto', render: (f) => esc(f.fornecimento.produto?.nome || '—') },
        { chave: 'qtd', titulo: 'Quantidade (total do fornecimento)', classe: 'dir', render: (f) => `${fmtNum(f.fornecimento.quantidade, 2)} ${esc(f.fornecimento.produto?.unidade || '')}` },
        { chave: 'cab', titulo: 'Cabeças atendidas', classe: 'dir', render: (f) => fmtNum(f.fornecimento.num_cabecas) },
      ],
      linhas: [...fornec].sort((x, y) => y.fornecimento.data_fornecimento.localeCompare(x.fornecimento.data_fornecimento)),
    }),
    documentos: () => {
      painel.querySelector('#up-doc')?.addEventListener('change', async (e) => {
        const arq = e.target.files[0];
        if (!arq) return;
        try {
          exigirConexao();
          const { enviarFoto } = await import('./animal-form.js');
          toast('Enviando arquivo…', 'info');
          const ok = await enviarFoto(a, arq, { tipo: arq.type.startsWith('image/') ? 'foto' : 'documento', definirComoPrincipal: !a.foto_path && arq.type.startsWith('image/') });
          if (ok) { toast('Arquivo enviado.'); recarregar(); }
        } catch (err) { toast(traduzirErro(err), 'erro'); }
      });
      painel.querySelectorAll('[data-principal]').forEach((b) => b.addEventListener('click', async () => {
        const { error: e2 } = await sb.from('animais').update({ foto_path: b.dataset.principal }).eq('id', id);
        if (e2) return toast(traduzirErro(e2), 'erro');
        toast('Foto principal atualizada.'); recarregar();
      }));
      painel.querySelectorAll('[data-excluir-doc]').forEach((b) => b.addEventListener('click', async () => {
        const d = docs.find((x) => x.id === b.dataset.excluirDoc);
        if (!(await confirmar({ titulo: 'Excluir arquivo', mensagem: `Excluir definitivamente <b>${esc(d.nome)}</b>? Esta ação não pode ser desfeita.`, botao: 'Excluir', perigo: true }))) return;
        try {
          exigirConexao();
          if (a.foto_path === d.storage_path) { const r = await sb.from('animais').update({ foto_path: null }).eq('id', id); if (r.error) throw r.error; }
          const r1 = await sb.from('documentos').delete().eq('id', d.id); if (r1.error) throw r1.error;
          await sb.storage.from(BUCKET).remove([d.storage_path]);
          toast('Arquivo excluído.'); recarregar();
        } catch (err) { toast(traduzirErro(err), 'erro'); }
      }));
    },
  };

  const mostrar = (k) => {
    el.querySelectorAll('.aba').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === k));
    painel.innerHTML = conteudos[k]();
    montar[k]?.();
    icones();
  };
  el.querySelector('.abas').addEventListener('click', (e) => { const b = e.target.closest('[data-aba]'); if (b) mostrar(b.dataset.aba); });
  // "#/animais/<id>?aba=reprodutivo" abre direto na aba pedida (ex.: vindo de Pendências › Previsões de parto)
  const abaPedida = new URLSearchParams(location.hash.split('?')[1] || '').get('aba');
  mostrar(abas.some(([k]) => k === abaPedida) ? abaPedida : 'dados');
  if (abaPedida) el.querySelector(`[data-aba="${abaPedida}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function valorHist(campo, v, nomeCat, nomeRaca) {
  if (v === null || v === undefined || v === '') return '—';
  if (campo === 'categoria_id') return nomeCat(v) || v;
  if (campo === 'raca_id') return nomeRaca(v) || v;
  if (campo === 'pasto_id') return nomePasto(store.base.pastos.find((p) => p.id === v)) || v;
  if (campo === 'lote_id') return store.base.lotes.find((l) => l.id === v)?.nome || v;
  if (campo === 'sexo') return ROTULO_SEXO[v];
  if (campo === 'status') return store.base.status.find((s) => s.codigo === v)?.nome || v;
  if (campo === 'pai_id') return store.base.reprodutores.find((r) => r.id === v)?.identificacao || v;
  if (campo === 'foto_path') return 'arquivo';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtData(v);
  return String(v);
}
