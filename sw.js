/* BASEBALL EMPIRE - network-first PWA updater; does not touch IndexedDB */
const VERSION='0.9.243';
self.addEventListener('install',event=>{self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('baseball-empire-')).map(k=>caches.delete(k)));await self.clients.claim()})())});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 const u=new URL(req.url);
 if(req.mode==='navigate'||u.pathname.endsWith('/index.html')||u.pathname.endsWith('/BASEBALL-EMPIRE/')){
  event.respondWith(fetch(new Request(req,{cache:'no-store'})).catch(()=>fetch(req)));
  return;
 }
 if(/\.(?:js|css|json|webmanifest)$/.test(u.pathname)){
  event.respondWith(fetch(new Request(req,{cache:'no-store'})).catch(()=>fetch(req)));
 }
});
