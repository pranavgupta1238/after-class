import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';const require=createRequire(import.meta.url);
const {validSubscription,preferences,inQuietHours}=require('../server/notifications');const {checkHealth}=require('../server/health');const {probe,notify,needsAlert}=require('../scripts/health-probe.cjs');
const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/example',keys:{p256dh:Buffer.alloc(65,1).toString('base64url'),auth:Buffer.alloc(16,2).toString('base64url')}};
test('push endpoint validation rejects private addresses, redirects and malformed keys',()=>{
 assert.equal(validSubscription(subscription),true);
 for(const endpoint of ['http://fcm.googleapis.com/x','https://localhost/x','https://127.0.0.1/x','https://fcm.googleapis.com.evil.invalid/x','https://user@fcm.googleapis.com/x','https://fcm.googleapis.com:8080/x'])assert.equal(validSubscription({...subscription,endpoint}),false);
 assert.equal(validSubscription({...subscription,keys:{p256dh:'bad',auth:'bad'}}),false);
});
test('quiet hours cross midnight and use the account timezone, not server time',()=>{
 const p=preferences({enabled:true,messages:true,plans:false,quiet_start:22*60,quiet_end:7*60,timezone:'Asia/Kolkata'});
 assert.equal(inQuietHours(p,new Date('2026-11-10T18:00:00Z')),true);
 assert.equal(inQuietHours(p,new Date('2026-11-10T01:30:00Z')),false);
 assert.equal(inQuietHours({...p,quiet_start:540,quiet_end:600},new Date('2026-11-10T04:00:00Z')),true);
 for(const v of [{...p,enabled:'true'},{...p,quiet_end:null},{...p,quiet_end:1320},{...p,timezone:'Bad/Zone'}])assert.throws(()=>preferences(v));
});
test('health fails if a required Redis or database dependency fails',async()=>{
 const prisma={$queryRaw:async()=>[1]},redis={ping:async()=>'LOCAL_FALLBACK'};
 assert.equal((await checkHealth({prisma,redis,requiredRedis:true})).status,'degraded');
 assert.equal((await checkHealth({prisma,redis,requiredRedis:false})).status,'ok');
 assert.equal((await checkHealth({prisma:{$queryRaw:async()=>{throw Error('db');}},redis:{ping:async()=>'PONG'}})).status,'degraded');
});
test('independent alerts deduplicate failures, send recovery and redact health response content',async()=>{
 const now=1e9;assert.equal(needsAlert({}, {healthy:true},now),false);assert.equal(needsAlert({}, {healthy:false},now),true);
 assert.equal(needsAlert({notifiedHealthy:false,notifiedAt:now-1000},{healthy:false},now),false);
 assert.equal(needsAlert({notifiedHealthy:false,notifiedAt:now-7*3600000},{healthy:false},now),true);
 assert.equal(needsAlert({notifiedHealthy:false},{healthy:true},now),true);
 const env={AFTERCLASS_HEALTH_URL:'https://example.invalid/health',HEALTH_SECRET:'private'};
 const r=await probe(env,async()=>({ok:false,json:async()=>({status:'degraded',secret:'DO NOT EXPOSE'})}));assert.equal(r.healthy,false);assert.ok(!JSON.stringify(r).includes('DO NOT'));
 await assert.rejects(()=>probe({...env,AFTERCLASS_HEALTH_URL:'http://example.invalid/health'}));
 let payload;await notify({RESEND_API_KEY:'private',RESEND_FROM:'ops@example.invalid',OPERATIONS_ALERT_EMAIL:'recipient@example.invalid'},false,false,async(url,options)=>{payload=JSON.parse(options.body);return {ok:true};});assert.equal(payload.to[0],'recipient@example.invalid');assert.ok(!payload.text.includes('private'));
});
