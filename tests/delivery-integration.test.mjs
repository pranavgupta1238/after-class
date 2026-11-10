import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';const require=createRequire(import.meta.url);
const {PrismaClient}=require('@prisma/client'),{createNotifications}=require('../server/notifications');
test('durable push: atomic events, retries, privacy, quiet hours and revocation',{skip:process.env.RUN_DELIVERY_TESTS!=='1',timeout:60000},async t=>{
 const db=new PrismaClient({datasourceUrl:'postgresql://postgres:afterclass_local_review@127.0.0.1:55432/afterclass_review'});let campus,one,two,room,request,match;const delivered=[];let fail=0;
 const worker=createNotifications({prisma:db,redis:{limit:async()=>true},send:async(s,p)=>{if(fail){const code=fail;fail=0;throw Object.assign(Error('private provider error'),{statusCode:code});}delivered.push(JSON.parse(p));}});
 try{
  const suffix=Date.now();campus=await db.campus.create({data:{name:'Delivery test',slug:'delivery-'+suffix,emailDomain:'delivery-'+suffix+'.invalid'}});
  one=await db.user.create({data:{campusId:campus.id,email:'one'+suffix+'@example.invalid',publicAlias:'One',isVerified:true}});two=await db.user.create({data:{campusId:campus.id,email:'two'+suffix+'@example.invalid',publicAlias:'Two',isVerified:true}});
  const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/test'+suffix,keys:{p256dh:Buffer.alloc(65,1).toString('base64url'),auth:Buffer.alloc(16,2).toString('base64url')}};
  const [device]=await db.$queryRaw`INSERT INTO push_devices(user_id,endpoint,subscription,session_version) VALUES(${two.id}::uuid,${subscription.endpoint},${JSON.stringify(subscription)}::jsonb,0) RETURNING id`;
  await db.$executeRaw`INSERT INTO notification_preferences(user_id,enabled) VALUES(${two.id}::uuid,true)`;
  room=await db.chatRoom.create({data:{campusId:campus.id,kind:'match'}});
  request=await db.matchRequest.create({data:{campusId:campus.id,requesterId:one.id,activity:'Private activity',location:'Private place',scheduledAt:new Date(Date.now()+3600000),expiresAt:new Date(Date.now()+3600000)}});
  match=await db.match.create({data:{requestId:request.id,userOneId:one.id,userTwoId:two.id,roomId:room.id,scheduledAt:new Date(Date.now()+3600000)}});
  const enqueue=async event=>{await db.$executeRaw`SELECT queue_afterclass_push(${two.id}::uuid,${event},'message',${match.id}::uuid,${one.id}::uuid)`;};
  const job=async event=>(await db.$queryRaw`SELECT * FROM notification_deliveries WHERE device_id=${device.id}::uuid AND event_key=${event}`)[0];
  await t.test('transaction events enqueue once and payload excludes private contents',async()=>{
   const message=await db.message.create({data:{roomId:room.id,senderId:one.id,senderAlias:'One',content:'PRIVATE MESSAGE CONTENT'}});
   await enqueue('message:'+message.id);await worker.tick();assert.equal((await job('message:'+message.id)).status,'accepted');assert.equal(delivered.length,2);assert.ok(!JSON.stringify(delivered).includes('PRIVATE'));assert.ok(!JSON.stringify(delivered).includes('One'));
   await worker.tick();assert.equal(delivered.length,2);
   await assert.rejects(()=>db.$transaction(async tx=>{await tx.message.create({data:{roomId:room.id,senderId:one.id,senderAlias:'One',content:'rollback'}});throw Error('rollback');}));
   const [count]=await db.$queryRaw`SELECT COUNT(*)::int n FROM notification_deliveries WHERE device_id=${device.id}::uuid`;assert.equal(count.n,2);
  });
  await t.test('transient errors retry without exposing provider errors',async()=>{
   await enqueue('retry');fail=503;await worker.tick();assert.equal((await job('retry')).status,'pending');assert.equal((await job('retry')).reason,'retry');await db.$executeRaw`UPDATE notification_deliveries SET next_at=now() WHERE event_key='retry' AND device_id=${device.id}::uuid`;await worker.tick();assert.equal((await job('retry')).status,'accepted');
  });
  await t.test('blocks, quiet hours, disabled preferences and revoked sessions are enforced at delivery',async()=>{
   await enqueue('blocked');await db.userBlock.create({data:{blockerId:two.id,blockedId:one.id}});await worker.tick();assert.equal((await job('blocked')).reason,'connection_unavailable');await db.userBlock.deleteMany({where:{blockerId:two.id}});
   const now=new Date(),minute=now.getUTCHours()*60+now.getUTCMinutes();await db.$executeRaw`UPDATE notification_preferences SET timezone='UTC',quiet_start=${minute},quiet_end=${(minute+60)%1440} WHERE user_id=${two.id}::uuid`;
   await enqueue('quiet');await worker.tick();assert.equal((await job('quiet')).reason,'quiet_hours');assert.equal((await job('quiet')).attempts,0);
   await db.$executeRaw`UPDATE notification_preferences SET quiet_start=NULL,quiet_end=NULL WHERE user_id=${two.id}::uuid`;
   await enqueue('disabled');await db.$executeRaw`UPDATE notification_preferences SET enabled=false WHERE user_id=${two.id}::uuid`;await worker.tick();assert.equal((await job('disabled')).reason,'disabled');await db.$executeRaw`UPDATE notification_preferences SET enabled=true WHERE user_id=${two.id}::uuid`;
   await enqueue('revoked');await db.user.update({where:{id:two.id},data:{sessionVersion:1}});await worker.tick();assert.equal((await job('revoked')).reason,'account_unavailable');await db.user.update({where:{id:two.id},data:{sessionVersion:0}});
   await enqueue('expired');await db.$executeRaw`UPDATE notification_deliveries SET expires_at=now()-interval '1 second' WHERE device_id=${device.id}::uuid AND event_key='expired'`;await worker.tick();assert.equal((await job('expired')).reason,'expired');
  });
  await t.test('gone endpoints are removed with all queued deliveries',async()=>{await enqueue('gone');fail=410;await worker.tick();const [n]=await db.$queryRaw`SELECT COUNT(*)::int n FROM push_devices WHERE id=${device.id}::uuid`;assert.equal(n.n,0);});
  await t.test('device enrollment binds to the session and transfers ownership on a shared browser',async()=>{
   const express=require('express'),app=express();app.use(express.json());
   const auth=async(req,res,next)=>{const id=req.get('x-test-user');if(![one.id,two.id].includes(id))return res.status(401).json({error:'Authentication required'});req.user=await db.user.findUnique({where:{id}});next();};
   const service=createNotifications({prisma:db,redis:{limit:async()=>true},config:{VAPID_PUBLIC_KEY:'test',VAPID_PRIVATE_KEY:'test',VAPID_SUBJECT:'mailto:test@example.invalid'}});service.register(app,auth,auth);
   const http=app.listen(0,'127.0.0.1');await new Promise(r=>http.once('listening',r));
   const call=async(user,path,method='GET',body)=>{const r=await fetch('http://127.0.0.1:'+http.address().port+'/api/notifications'+path,{method,headers:{'Content-Type':'application/json',...(user?{'x-test-user':user.id}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
   try{
    assert.equal((await call(null,'')).status,401);
    assert.equal((await call(one,'/devices','POST',{...subscription,endpoint:'https://127.0.0.1/x'})).status,400);
    assert.equal((await call(one,'/devices','POST',{...subscription,userId:two.id})).status,201);
    assert.equal((await call(one,'')).data.devices,1);assert.equal((await call(two,'')).data.devices,0);
    assert.equal((await call(one,'/preferences','PUT',{enabled:true,messages:true,plans:true,quiet_start:null,quiet_end:null,timezone:'UTC'})).status,200);
    assert.equal((await call(one,'/test','POST',{})).data.queued,1);
    assert.equal((await call(two,'/devices','POST',subscription)).status,201);
    assert.equal((await call(one,'')).data.devices,0);assert.equal((await call(two,'')).data.devices,1);
    const [old]=await db.$queryRaw`SELECT COUNT(*)::int n FROM notification_deliveries n JOIN push_devices d ON n.device_id=d.id WHERE d.user_id=${one.id}::uuid`;assert.equal(old.n,0);
    await call(one,'/devices','DELETE',{all:true});assert.equal((await call(two,'')).data.devices,1);
    await call(two,'/devices','DELETE',{all:true});assert.equal((await call(two,'')).data.devices,0);
   }finally{await new Promise(r=>http.close(r));}
  });

 }finally{
  if(room)await db.message.deleteMany({where:{roomId:room.id}});if(match)await db.match.delete({where:{id:match.id}});if(request)await db.matchRequest.delete({where:{id:request.id}});if(room)await db.chatRoom.delete({where:{id:room.id}});if(campus){await db.user.deleteMany({where:{campusId:campus.id}});await db.campus.delete({where:{id:campus.id}});}await db.$disconnect();
 }
});
