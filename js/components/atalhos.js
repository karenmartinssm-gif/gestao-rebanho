// Atalhos da rotina da fazenda (painel e botão flutuante no celular)
import { pode } from '../store.js';
import { esc, abrirModal, toast, icones } from '../ui.js';

export const ATALHOS = [
  { id: 'animal', titulo: 'Cadastrar animal', icone: 'plus-circle', perm: 'rebanho_editar', acao: () => { location.hash = '#/animais/novo'; } },
  { id: 'nascimento', titulo: 'Registrar nascimento', icone: 'baby', perm: 'reproducao', acao: () => import('./reproducao-forms.js').then((m) => m.abrirNascimento(null, (id) => { if (id) location.hash = `#/animais/${id}`; else window.dispatchEvent(new HashChangeEvent('hashchange')); })) },
  { id: 'pesagem', titulo: 'Registrar pesagem', icone: 'scale', perm: 'pesagens', acao: () => import('./pesagem.js').then((m) => m.abrirPesagem(null, () => window.dispatchEvent(new HashChangeEvent('hashchange')))) },
  { id: 'vacina', titulo: 'Registrar vacinação', icone: 'syringe', perm: 'sanidade', etapa: 3 },
  { id: 'tratamento', titulo: 'Registrar tratamento', icone: 'stethoscope', perm: 'sanidade', etapa: 3 },
  { id: 'pasto', titulo: 'Transferir de pasto', icone: 'move', perm: 'movimentacoes', etapa: 3 },
  { id: 'suplemento', titulo: 'Registrar suplementação', icone: 'wheat', perm: 'suplementacao', etapa: 3 },
  { id: 'morte', titulo: 'Registrar morte', icone: 'circle-x', perm: 'movimentacoes', acao: () => import('./saida.js').then((m) => m.abrirSaida(null, { tipo: 'saida_morte', aoSalvar: () => window.dispatchEvent(new HashChangeEvent('hashchange')) })) },
  { id: 'pendencias', titulo: 'Consultar pendências', icone: 'bell-ring', acao: () => { location.hash = '#/painel'; setTimeout(() => document.getElementById('pendencias')?.scrollIntoView({ behavior: 'smooth' }), 400); } },
];

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
