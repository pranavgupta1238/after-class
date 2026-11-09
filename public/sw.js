const CACHE='afterclass-v1';
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/','/manifest.webmanifest']))));
self.addEventListener('fetch', event => { if(event.request.method==='GET') event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then(x=>x||(event.request.mode==='navigate'?caches.match('/'):Response.error())))); });
