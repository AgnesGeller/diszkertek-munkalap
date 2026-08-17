const CACHE="diszkertek-onallo-munkalap-v11";
const OFFLINE_PAGE="./index.html?v=11";
const ASSETS=[OFFLINE_PAGE,"./styles.css","./logo-overrides.css","./app.js?v=10","./manifest.webmanifest?v=11","./official-logo.png","./official-emblem.png","./botanical.svg","./official-icon-192.png","./diszkertek-logo-32-v11.png","./diszkertek-logo-192-v11.png","./diszkertek-logo-512-v11.png","./diszkertek-logo-maskable-512-v11.png","./diszkertek-logo-apple-180-v11.png","./favicon-v11.ico"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET"||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const response=await fetch(event.request,{cache:"no-store"});
      if(response.ok)await cache.put(event.request,response.clone());
      return response;
    }catch(error){
      const cached=await caches.match(event.request);
      if(cached)return cached;
      if(event.request.mode==="navigate")return caches.match(OFFLINE_PAGE);
      throw error;
    }
  })());
});
