const CACHE="diszkertek-onallo-munkalap-v49";
const OFFLINE_PAGE="./index.html?v=49";
const ASSETS=[OFFLINE_PAGE,"./styles.css?v=49","./logo-overrides.css?v=49","./app-shell.css?v=49","./app.js?v=49","./billing-math.js?v=49","./billing-settlements.js?v=49","./statistics-settlements.js?v=49","./supabase.js?v=49","./supabase-config.js?v=49","./munkalap-data.js?v=49","./manifest.webmanifest?v=49","./official-logo.png","./official-emblem.png","./botanical.svg","./official-icon-192.png","./munkalap-m-icon-32-v12.png","./munkalap-m-icon-192-v12.png","./munkalap-m-icon-512-v12.png","./munkalap-m-icon-maskable-512-v12.png","./munkalap-m-icon-apple-180-v12.png","./munkalap-m-favicon-v12.ico"];
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
