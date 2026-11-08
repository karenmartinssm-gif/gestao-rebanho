// =====================================================================
// Service worker: guarda uma cópia do sistema no aparelho para ele abrir
// mesmo sem internet. Os DADOS continuam vindo do Supabase (nunca ficam
// guardados aqui); sem internet, o sistema usa só o que já está no aparelho
// e a fila de sincronização.
// =====================================================================
const CACHE = 'rebanho-app-v1';
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;
const BASICOS = ['./', 'index.html', 'manifest.webmanifest', 'favicon.ico', 'img/icon-192.png', 'img/icon-512.png', 'img/favicon-32.png', 'img/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(BASICOS).catch(() => {});
    await guardarVersao(c).catch(() => {});
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Baixa a versão atual e todos os arquivos dela (para funcionar offline depois)
async function guardarVersao(c, resposta) {
  const r = resposta || await fetch('versao.json', { cache: 'no-store' });
  if (!r.ok) return;
  const v = await r.clone().json();
  await c.put('versao.json', r);
  const atuais = new Set(Object.entries(v.arquivos || {}).map(([p, h]) => new URL(`${p}?v=${h}`, self.registration.scope).href));
  // Remove arquivos de versões antigas
  for (const req of await c.keys()) {
    const u = new URL(req.url);
    if (u.origin === location.origin && u.searchParams.has('v') && !atuais.has(u.href)) await c.delete(req);
  }
  const faltam = [];
  for (const u of atuais) if (!(await c.match(u))) faltam.push(u);
  await Promise.all(faltam.map((u) => fetch(u).then((x) => (x.ok ? c.put(u, x) : null)).catch(() => null)));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.hostname.endsWith('.supabase.co')) return;            // dados: sempre direto do servidor

  if (u.origin === location.origin) {
    if (u.pathname.endsWith('/versao.json')) { e.respondWith(versao(req)); return; }
    if (req.mode === 'navigate') { e.respondWith(redePrimeiro(req, 'index.html')); return; }
    if (u.searchParams.has('v')) { e.respondWith(cachePrimeiro(req)); return; }   // arquivo com versão: não muda
    e.respondWith(redePrimeiro(req));
    return;
  }
  if (CDN.test(req.url)) e.respondWith(cachePrimeiro(req));    // bibliotecas com versão fixa
});

async function versao(req) {
  const c = await caches.open(CACHE);
  try {
    const r = await fetch(req, { cache: 'no-store' });
    if (r.ok) guardarVersao(c, r.clone()).catch(() => {});
    return r;
  } catch {
    return (await c.match('versao.json')) || new Response('{}', { headers: { 'Content-Type': 'application/json' } });
  }
}

async function redePrimeiro(req, reserva) {
  const c = await caches.open(CACHE);
  try {
    const r = await fetch(req);
    if (r.ok) c.put(reserva || req, r.clone());
    return r;
  } catch {
    return (await c.match(reserva || req, { ignoreSearch: !reserva })) || Response.error();
  }
}

async function cachePrimeiro(req) {
  const c = await caches.open(CACHE);
  const achado = await c.match(req);
  if (achado) return achado;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') c.put(req, r.clone());
  return r;
}
