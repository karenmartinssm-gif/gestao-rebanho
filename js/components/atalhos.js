// Atalhos da rotina da fazenda (painel e botão flutuante no celular)
import { pode } from '../store.js';
import { esc, abrirModal, toast, icones } from '../ui.js';

const recarregarRota = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

export const ATALHOS = [
  { id: 'animal', titulo: 'Cadastrar animal', icone: 'plus-circle', perm: 'rebanho_editar', acao: () => { location.hash = '#/animais/novo'; } },
  { id: 'nascimento', titulo: 'Registrar nascimento', icone: 'baby', perm: 'reproducao', acao: () => import('./reproducao-forms.js').then((m) => m.abrirNascimento(null, (id) => { if (id) location.hash = `#/animais/${id}`; else window.dispatchEvent(new HashChangeEvent('hashchange')); })) },
  { id: 'pesagem', titulo: 'Registrar pesagem', icone: 'scale', perm: 'pesagens', acao: () => escolherPesagem() },
  { id: 'vacina', titulo: 'Registrar vacinação', icone: 'syringe', perm: 'sanidade', acao: () => import('./sanidade-forms.js').then((m) => m.abrirManejo({ classe: 'vacina' }, recarregarRota)) },
  { id: 'tratamento', titulo: 'Registrar tratamento', icone: 'stethoscope', perm: 'sanidade', acao: () => import('./sanidade-forms.js').then((m) => m.abrirManejo({ classe: 'tratamento' }, recarregarRota)) },
  { id: 'pasto', titulo: 'Transferir de pasto', icone: 'move', perm: 'movimentacoes', acao: () => import('./transferencia.js').then((m) => m.abrirTransferencia({}, recarregarRota)) },
  { id: 'suplemento', titulo: 'Registrar suplementação', icone: 'wheat', perm: 'suplementacao', acao: () => import('./alimentacao-forms.js').then((m) => m.abrirFornecimento({}, recarregarRota)) },
  { id: 'morte', titulo: 'Registrar morte', icone: 'circle-x', perm: 'movimentacoes', acao: () => import('./saida.js').then((m) => m.abrirSaida(null, { tipo: 'saida_morte', aoSalvar: () => window.dispatchEvent(new HashChangeEvent('hashchange')) })) },
];

// "Registrar pesagem": escolher individual ou coletiva
function escolherPesagem() {
  const { el, fechar } = abrirModal({
    titulo: 'Registrar pesagem',
    html: `<div class="grade grade-2" style="gap:12px">
      <button class="card card-corpo atalho-opcao" data-tipo="individual"><i data-lucide="tag"></i><b>Individual</b><span class="small muted">Um animal de cada vez, pelo brinco.</span></button>
      <button class="card card-corpo atalho-opcao" data-tipo="coletiva"><i data-lucide="users"></i><b>Coletiva</b><span class="small muted">Vários animais de um lote, pasto ou categoria, no curral.</span></button>
    </div>`,
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tipo]'); if (!b) return;
    fechar();
    import('./pesagem.js').then((m) => (b.dataset.tipo === 'coletiva' ? m.abrirPesagemColetiva({}, recarregarRota) : m.abrirPesagem(null, recarregarRota)));
  });
  icones();
}

export function htmlAtalhos() {
  return `<div class="atalhos">${ATALHOS.filter((a) => !a.perm || pode(a.perm)).map((a) => `
    <button class="atalho ${a.etapa ? 'indisponivel' : ''}" data-atalho="${a.id}">
      <i data-lucide="${a.icone}"></i>${esc(a.titulo)}${a.etapa ? `<span class="etapa">Etapa ${a.etapa}</span>` : ''}
    </button>`).join('')}</div>`;
}

export function ligarAtalhos(container, aoUsar) {
  container.addEventListener('click', (e) => {
    const b = e.target.closest('[data-atalho]');
    if (!b) return;
    const a = ATALHOS.find((x) => x.id === b.dataset.atalho);
    if (a.etapa) return toast(`"${a.titulo}" será liberado na etapa ${a.etapa} do desenvolvimento.`, 'info');
    aoUsar?.();
    a.acao();
  });
}

export function abrirAtalhos() {
  const { el, fechar } = abrirModal({ titulo: 'Atalhos rápidos', html: htmlAtalhos() });
  ligarAtalhos(el, fechar);
  icones();
}
