/* Versioned, local-only app-shell cache. A failed install never replaces a working cache. */
const CACHE='snake3310-shell-v2-ebeaa2c56bcae205';
const FILES=['./','./index.html','./styles.css','./handset.css','./manifest.webmanifest','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png','./src/app.js','./src/engine.js','./src/lcd.js','./src/artwork.js','./src/font.js','./src/optics.js','./src/renderer.js','./src/audio.js','./src/storage.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('snake3310-shell-')&&key!==CACHE)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  const scope=new URL(self.registration.scope);
  if(!url.pathname.startsWith(scope.pathname))return;
  if(request.mode==='navigate'){
    // Keep the HTML and cached module graph in the same installed release.
    // A new content-versioned worker activates after old clients are closed.
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      return await cache.match('./index.html')||await cache.match('./')||fetch(request);
    })());return;
  }
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),match=await cache.match(request,{ignoreSearch:true});
    if(match)return match;
    return fetch(request);
  })());
});
