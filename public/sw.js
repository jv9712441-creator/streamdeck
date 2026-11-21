// Guarda o app no celular para ele abrir mesmo sem o PC (e sem internet).
// Sempre abre o que está guardado e, em segundo plano, baixa a versão nova para a próxima vez.
const CACHE = 'deck-v5';
const ARQUIVOS = ['./', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest', 'icone.svg', 'icone-192.png', 'icone-512.png',
  'marca.png', 'acordado.mp4', 'fontes/DSEG7Classic-Bold.woff2', 'fontes/DSEG14Classic-Regular.woff2', 'jsqr.js',
  'fundo-tatico.jpg', 'fundo-fantasma.jpg', 'fundo-viatura.jpg', 'fundo-pickup.jpg', 'textura-gasta.png', 'fontes/Oswald-500.woff2', 'fontes/Montserrat-900.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return; // conversa com o PC passa direto
  e.respondWith(caches.open(CACHE).then(async cache => {
    const guardado = await cache.match(req, { ignoreSearch: true });
    const rede = fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => guardado);
    return guardado || rede;
  }));
});
