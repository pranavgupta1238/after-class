import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function reactions(redis) {
 const context={require:()=>redis,module:{exports:{}},console};vm.createContext(context);
 vm.runInContext(fs.readFileSync(new URL('../server/reactions.js',import.meta.url),'utf8'),context);
 return context.module.exports;
}
test('50 messages use one batch read and preserve reaction counts and viewer state',async()=>{
 const batches=[];
 const service=reactions({getOtpBatch:async keys=>{batches.push(keys);return keys.map((_,i)=>i===0?{'❤️':['me','other']} : null);}});
 const ids=Array.from({length:50},(_,i)=>`message-${i}`);
 const result=await service.getBatchReactions(ids,'me');
 assert.equal(batches.length,1);assert.equal(batches[0].length,50);
 assert.equal(Object.keys(result).length,50);assert.equal(result[ids[0]][0].count,2);assert.equal(result[ids[0]][0].userReacted,true);
 assert.equal(result[ids[1]].length,0);
});
test('warm entries avoid redis reads and empty history does no work',async()=>{
 let calls=0;const service=reactions({getOtpBatch:async()=>{calls++;return [{'👍':['other']}];}});
 await service.getBatchReactions([],'me');assert.equal(calls,0);
 await service.getBatchReactions(['m'],'me');const warm=await service.getBatchReactions(['m'],'me');assert.equal(calls,1);assert.equal(warm.m[0].userReacted,false);
});
test('batch cache reader handles missing and malformed entries independently',async()=>{
 let commands=0;
 class Redis {on(){} async mget(...keys){commands++;assert.equal(keys.length,3);return ['{"ok":true}','broken',null];}}
 const context={require:()=>Redis,module:{exports:{}},process:{env:{REDIS_URL:'rediss://test.invalid'}},console};vm.createContext(context);
 vm.runInContext(fs.readFileSync(new URL('../server/redis.js',import.meta.url),'utf8'),context);
 const values=await context.module.exports.getOtpBatch(['a','b','c']);assert.equal(commands,1);assert.equal(values[0].ok,true);assert.equal(values[1],null);assert.equal(values[2],null);
});
