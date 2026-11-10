// Never cache the authenticated app shell or API responses. An old shell can
// reference retired assets and leave the app stuck on its loading screen.
const OFFLINE_HTML = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Afterclass · Reconnect</title><style>body{margin:0;background:#f8f7ef;color:#204b40;font:16px/1.6 system-ui,sans-serif;min-height:100vh;display:grid;place-items:center}main{max-width:390px;padding:32px;text-align:center}h1{font-size:28px;letter-spacing:-1px}p{color:#657469}button{background:#204b40;color:white;border:0;border-radius:12px;padding:13px 24px;font:600 15px system-ui;cursor:pointer}button:focus-visible{outline:3px solid #a2b391;outline-offset:4px}</style><main><strong>afterclass.</strong><h1>Let’s reconnect.</h1><p>Afterclass couldn’t reach the server. Check your connection, or start the local server if you’re testing on localhost.</p><button onclick="location.reload()">Try again</button></main></html>`;
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith('afterclass-')).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE_HTML, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  })));
});
