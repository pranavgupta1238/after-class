import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
function worker(fetcher=async()=>new Response('current app')){
 const events={},deleted=[];let claimed=false,skipped=false;
 vm.runInNewContext(source,{Response,fetch:fetcher,caches:{keys:async()=>['afterclass-v1','afterclass-old','unrelated-cache'],delete:async k=>{deleted.push(k);}},self:{skipWaiting:async()=>{skipped=true;},clients:{claim:async()=>{claimed=true;}},addEventListener:(name,fn)=>{events[name]=fn;}}});
 return {events,deleted,get claimed(){return claimed;},get skipped(){return skipped;}};
}
test('worker upgrade retires old app shells without deleting unrelated caches',async()=>{
 const w=worker();let pending;w.events.install({waitUntil:p=>{pending=p;}});await pending;assert.equal(w.skipped,true);
 w.events.activate({waitUntil:p=>{pending=p;}});await pending;assert.deepEqual(w.deleted,['afterclass-v1','afterclass-old']);assert.equal(w.claimed,true);
});
test('unavailable server shows retry screen instead of a cached loading skeleton',async()=>{
 const w=worker(async()=>{throw new Error('offline');});let pending;
 w.events.fetch({request:{method:'GET',mode:'navigate'},respondWith:p=>{pending=p;}});
 const response=await pending;assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');const html=await response.text();assert.match(html,/Try again/);assert.doesNotMatch(html,/skeleton|shimmer|Opening your campus/);
});
test('online navigations use current server response; assets and API bypass the worker',async()=>{
 const w=worker();let pending;
 w.events.fetch({request:{method:'GET',mode:'navigate'},respondWith:p=>{pending=p;}});assert.equal(await(await pending).text(),'current app');
 for(const request of [{method:'GET',mode:'cors'},{method:'POST',mode:'cors'}])w.events.fetch({request,respondWith:()=>assert.fail('API or asset intercepted')});
});
