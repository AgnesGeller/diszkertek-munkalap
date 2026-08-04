const CACHE="diszkertek-onallo-munkalap-v3";
const ASSETS=["./","./index.html","./styles.css","./logo-overrides.css","./app.js?v=2","./manifest.webmanifest","./official-logo.png","./official-emblem.png","./botanical.svg","./official-icon-192.png","./official-icon-512.png","./apple-touch-icon-official.png"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{if(event.request.method!=="GET")return;event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;})));});
