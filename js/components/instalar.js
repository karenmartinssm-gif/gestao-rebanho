// Instalação como aplicativo (tela inicial do celular/computador) e service worker
import { esc } from '../ui.js';

const estado = { evento: null };
const CHAVE = 'rebanho.instalar.dispensado';
const instalado = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const celular = () => window.matchMedia('(max-width: 900px)').matches || /android|iphone|ipad/i.test(navigator.userAgent);

export function registrarAplicativo() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); estado.evento = e; window.dispatchEvent(new Event('rebanho:instalavel')); });
  window.addEventListener('appinstalled', () => { estado.evento = null; document.querySelectorAll('.card-instalar').forEach((c) => c.remove()); });
  if (!('serviceWorker' in navigator) || !(location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) return;
  const reg = () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker não registrado:', e));
  if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg);
}

/** Cartão no painel convidando a instalar (só no celular, se ainda não instalado e não dispensado). */
export function htmlInstalar() {
  let dispensado = false;
  try { dispensado = localStorage.getItem(CHAVE) === '1'; } catch { /* ignora */ }
  if (instalado() || dispensado || !celular()) return '';
  const passos = ehIOS()
    ? 'No Safari, toque em <b>Compartilhar</b> <span aria-hidden="true">⬆︎</span> e depois em <b>Adicionar à Tela de Início</b>.'
    : 'Toque em <b>Instalar</b> abaixo. Se o botão não aparecer, abra o menu do navegador (⋮) e escolha <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b>.';
  return `<div class="card card-corpo card-instalar" style="margin-bottom:18px;display:flex;gap:14px;align-items:flex-start">
    <img src="img/icon-192.png" alt="" width="48" height="48" style="border-radius:10px;flex:none">
    <div style="flex:1;min-width:0"><b>Instale o Rebanho Pucci no celular</b>
      <p class="small" style="margin:4px 0 10px">Ele ganha um ícone na tela inicial e abre mesmo sem internet no curral. ${passos}</p>
      <div class="acoes">${ehIOS() ? '' : '<button class="btn btn-primario btn-sm" data-instalar>Instalar</button>'}<button class="btn btn-sm" data-dispensar>Agora não</button></div></div></div>`;
}

export function ligarInstalar(container) {
  const card = container.querySelector('.card-instalar');
  if (!card) return;
  card.querySelector('[data-dispensar]').addEventListener('click', () => { try { localStorage.setItem(CHAVE, '1'); } catch { /* ignora */ } card.remove(); });
  card.querySelector('[data-instalar]')?.addEventListener('click', async () => {
    if (!estado.evento) { card.querySelector('p').insertAdjacentHTML('beforeend', `<br><b>${esc('Use o menu do navegador (⋮) › Instalar aplicativo.')}</b>`); return; }
    estado.evento.prompt();
    const r = await estado.evento.userChoice.catch(() => null);
    estado.evento = null;
    if (r?.outcome === 'accepted') card.remove();
  });
}
