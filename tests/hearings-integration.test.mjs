import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const require=createRequire(import.meta.url),{PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken');
const url='postgresql://postgres:afterclass_local_review@127.0.0.1:55432/afterclass_review';
test('private scheduled hearings: booking, consent, live moderation and outcome',{skip:process.env.RUN_HEARING_TESTS!=='1',timeout:90000},async t=>{
 const db=new PrismaClient({datasourceUrl:url});let campus,other,server;const base='http://127.0.0.1:3016',secret='hearing-test-only';
 try{
  const suffix=Date.now();campus=await db.campus.create({data:{slug:'hearing-'+suffix,name:'Hearing test',emailDomain:'hearing.invalid'}});other=await db.campus.create({data:{slug:'outside-hearing-'+suffix,name:'Outside',emailDomain:'outside-hearing.invalid'}});
  const make=(name,campusId=campus.id)=>db.user.create({data:{campusId,email:name+suffix+'@hearing.invalid',publicAlias:name,isVerified:true,verificationStatus:'approved'}});
  const [owner,owner2,original,judge,reporter,stranger,outsider]=await Promise.all(['Owner','Owner2','Original','Judge','Reporter','Stranger'].map(n=>make(n)).concat(make('Outside',other.id)));
  await db.user.update({where:{id:owner.id},data:{accountStatus:'banned'}});
  const action=await db.moderationAction.create({data:{userId:owner.id,campusId:campus.id,adminUserId:original.id,type:'ban',reason:'Integration test decision',policy:'Unwanted contact',publicSummary:'Repeated invitations after a request to stop.',evidence:{reporterIds:[reporter.id],reports:[]}}});
  const review=await db.accountReview.create({data:{userId:owner.id,actionId:action.id,entries:{create:{kind:'submitted',body:'Please consider the full conversation and context.'}}}});
  const a2=await db.moderationAction.create({data:{userId:owner2.id,campusId:campus.id,adminUserId:original.id,type:'ban',reason:'Integration test decision',policy:'Spam or misuse'}});const review2=await db.accountReview.create({data:{userId:owner2.id,actionId:a2.id}});
  server=spawn(process.execPath,['server/index.js'],{env:{...process.env,AFTERCLASS_REVIEW:'1',HOST:'127.0.0.1',PORT:'3016',NODE_ENV:'development',DATABASE_URL:url,DIRECT_URL:url,REDIS_URL:'',RESEND_API_KEY:'',ADMIN_KEY:'',JWT_SECRET:secret,SESSION_COOKIE_NAME:'hearing_test',ADMIN_EMAILS:[judge,original,reporter,outsider].map(u=>u.email).join(',')},stdio:['ignore','ignore','pipe']});
  server.stderr.on('data',chunk=>process.stderr.write(chunk));
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/review')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const call=async(u,path,body)=>{const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+jwt.sign({sub:u.id,sv:u.sessionVersion},secret,{issuer:'afterclass',audience:'afterclass-web',expiresIn:'5m'}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,...await r.json()};};
  let slot,hearing;
  await t.test('only active moderators publish; overlapping slots are rejected',async()=>{
   const startsAt=new Date(Date.now()+3600000).toISOString();assert.equal((await call(owner,'/hearings/slots',{startsAt})).status,403);
   assert.equal((await call(judge,'/hearings/slots',{startsAt,count:2})).status,201);assert.equal((await call(judge,'/hearings/slots',{startsAt,count:1})).status,409);
   for(const excluded of [original,reporter])assert.equal((await call(excluded,'/hearings/slots',{startsAt,count:1})).status,201);
   const eligible=(await call(owner,'/hearings/slots?review='+review.id)).slots;assert.equal(eligible.length,2);slot=eligible[0];assert.ok(slot);
   assert.equal((await call(stranger,'/hearings/slots?review='+review.id)).status,404);
  });
  await t.test('booking is atomic and creates private reporter invitations',async()=>{
   const results=await Promise.all([call(owner,'/hearings/book',{reviewId:review.id,slotId:slot.id}),call(owner2,'/hearings/book',{reviewId:review2.id,slotId:slot.id})]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
   // Ensure the appellant fixture owns the contested slot for the remaining flow.
   if(results[1].status===201){const next=(await call(owner,'/hearings/slots?review='+review.id)).slots[0];const r=await call(owner,'/hearings/book',{reviewId:review.id,slotId:next.id});assert.equal(r.status,201);hearing=r.id;}else hearing=results[0].id;
   assert.equal((await call(owner,'/hearings/book',{reviewId:review.id,slotId:slot.id})).status,409);
   const list=await call(reporter,'/hearings');assert.equal(list.hearings.length,1);assert.equal(list.hearings[0].response,'invited');
   const own=await call(owner,'/hearings/'+hearing);assert.equal(JSON.stringify(own).includes(reporter.id),false);assert.equal(own.participants.some(p=>p.role==='reporter'),false);
  });
  await t.test('strangers, cross-campus staff and original moderator cannot enter',async()=>{
   for(const u of [stranger,outsider,original])assert.equal((await call(u,'/hearings/'+hearing)).status,404);
   assert.equal((await call(owner,'/hearings/'+hearing+'/control',{action:'start'})).status,403);
   assert.equal((await call(judge,'/hearings/'+hearing+'/control',{action:'start'})).status,409);
   assert.equal((await call(judge,'/review-admin/'+review.id+'/respond',{outcome:'restored',response:'This must wait for the scheduled hearing to conclude.'})).status,409);
  });
  await t.test('reporters can decline or provide private evidence without joining',async()=>{
   assert.equal((await call(reporter,'/hearings/'+hearing+'/rsvp',{response:'declined'})).status,200);
   assert.equal((await call(reporter,'/hearings/'+hearing+'/messages',{body:'My confidential evidence',visibility:'private'})).status,403);
   await call(reporter,'/hearings/'+hearing+'/rsvp',{response:'written'});
   assert.equal((await call(reporter,'/hearings/'+hearing+'/messages',{body:'PRIVATE-REPORTER-EVIDENCE',visibility:'private'})).status,201);
   assert.equal(JSON.stringify(await call(owner,'/hearings/'+hearing)).includes('PRIVATE-REPORTER-EVIDENCE'),false);
   assert.equal(JSON.stringify(await call(judge,'/hearings/'+hearing)).includes('PRIVATE-REPORTER-EVIDENCE'),true);
  });
  await t.test('chair opens only after appellant arrival; speaking turns are enforced',async()=>{
   const h=await db.hearing.findUnique({where:{id:hearing}});const start=new Date(Date.now()-60000);await db.hearingSlot.update({where:{id:h.slotId},data:{startsAt:start,endsAt:new Date(start.getTime()+30*60000)}});
   assert.equal((await call(judge,'/hearings/'+hearing+'/control',{action:'start'})).status,409);
   await call(owner,'/hearings/'+hearing+'/presence',{});assert.equal((await call(judge,'/hearings/'+hearing+'/control',{action:'start'})).status,200);
   assert.equal((await call(owner,'/hearings/'+hearing+'/messages',{body:'Here is my explanation.',visibility:'shared'})).status,201);
   assert.equal((await call(reporter,'/hearings/'+hearing+'/messages',{body:'Not my turn.',visibility:'shared'})).status,403);
   await call(reporter,'/hearings/'+hearing+'/rsvp',{response:'accepted'});const invited=await call(reporter,'/hearings/'+hearing);
   await call(judge,'/hearings/'+hearing+'/control',{action:'floor',floor:invited.mine.id});
   assert.equal((await call(owner,'/hearings/'+hearing+'/messages',{body:'Not my turn.',visibility:'shared'})).status,403);
   assert.equal((await call(reporter,'/hearings/'+hearing+'/messages',{body:'Here is my response to the moderator.',visibility:'shared'})).status,201);
   await call(reporter,'/hearings/'+hearing+'/rsvp',{response:'declined'});
   assert.equal((await call(reporter,'/hearings/'+hearing)).messages.some(m=>m.body==='Here is my explanation.'),false);
  });
  await t.test('deadline closes chat on the server; no second hearing after it starts',async()=>{
   await db.hearing.update({where:{id:hearing},data:{deadline:new Date(Date.now()-1000)}});
   assert.equal((await call(judge,'/hearings/'+hearing+'/messages',{body:'Too late',visibility:'shared'})).status,409);
   assert.equal((await call(owner,'/hearings/'+hearing)).status,'ended');
   const next=(await call(owner,'/hearings/slots?review='+review.id)).slots[0];if(next)assert.equal((await call(owner,'/hearings/book',{reviewId:review.id,slotId:next.id})).status,409);
  });
  await t.test('reasoned six-month outcome is applied and visible to participants',async()=>{
   assert.equal((await call(judge,'/review-admin/'+review.id+'/respond',{outcome:'reduced',hours:24*180,response:'After reviewing the conversation and both accounts, the restriction is reduced to six months.'})).status,200);
   const u=await db.user.findUnique({where:{id:owner.id}});assert.equal(u.accountStatus,'suspended');assert.ok(u.suspendedUntil>Date.now()+179*86400000);
   const outcome=await call(reporter,'/hearings/'+hearing);assert.equal(outcome.decision.outcome,'reduced');
  });
  await t.test('upcoming cancellation releases a slot and allows rescheduling',async()=>{
   let h=await db.hearing.findUnique({where:{reviewId:review2.id}});
   if(!h){const next=(await call(owner2,'/hearings/slots?review='+review2.id)).slots[0];assert.ok(next);const r=await call(owner2,'/hearings/book',{reviewId:review2.id,slotId:next.id});h=await db.hearing.findUnique({where:{id:r.id}});}
   const oldSlot=h.slotId;assert.equal((await call(owner2,'/hearings/'+h.id+'/control',{action:'cancel',reason:'I need a different appointment time.'})).status,200);
   assert.equal((await db.hearing.findUnique({where:{id:h.id}})).slotId,null);
   assert.equal((await call(owner2,'/hearings/book',{reviewId:review2.id,slotId:oldSlot})).status,201);
   const start=new Date(Date.now()-31*60000);await db.hearingSlot.update({where:{id:oldSlot},data:{startsAt:start,endsAt:new Date(start.getTime()+30*60000)}});
   const missed=await call(owner2,'/hearings/'+h.id);assert.equal(missed.status,'cancelled');assert.equal(missed.endReason,'appointment_missed');assert.equal((await db.accountReview.findUnique({where:{id:review2.id}})).status,'in_review');
  });
 }finally{if(server){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}const ids=[campus?.id,other?.id].filter(Boolean);if(ids.length){await db.accountReview.deleteMany({where:{action:{campusId:{in:ids}}}});await db.hearingSlot.deleteMany({where:{campusId:{in:ids}}});await db.moderationAction.deleteMany({where:{campusId:{in:ids}}});await db.user.deleteMany({where:{campusId:{in:ids}}});await db.campus.deleteMany({where:{id:{in:ids}}});}await db.$disconnect();}
});
