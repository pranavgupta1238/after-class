import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {PrismaClient}=require('@prisma/client');const jwt=require('jsonwebtoken');const {io}=require('socket.io-client');
const base=process.env.AFTERCLASS_INTEGRATION_URL;
test('isolated review API: privacy, eligibility, meeting lifecycle, blocking and appeals', {skip:!base,timeout:60000}, async(t)=>{
 assert.equal(base,'http://127.0.0.1:3003');assert.equal((await(await fetch(base+'/api/review')).json()).enabled,true);
 const db=new PrismaClient({datasourceUrl:'postgresql://postgres:afterclass_local_review@127.0.0.1:55432/afterclass_review'});
 const suffix=Date.now().toString();const campus=await db.campus.create({data:{slug:'test-'+suffix,name:'Test campus',emailDomain:'test-'+suffix+'.invalid'}});
 const otherCampus=await db.campus.create({data:{slug:'other-'+suffix,name:'Other campus',emailDomain:'other-'+suffix+'.invalid'}});
 const sockets=[];const extraUsers=[];
 const user=async(alias,gender,extra={})=>db.user.create({data:{campusId:campus.id,email:alias+suffix+'@test.invalid',publicAlias:alias,gender,isVerified:true,verificationStatus:'approved',...extra}});
 const a=await user('A','man'),b=await user('B','woman'),c=await user('C','man'),outsider=await user('Outsider','woman',{campusId:otherCampus.id}),minor=await user('Minor','woman');
 const sign=u=>jwt.sign({sub:u.id,sv:u.sessionVersion},'isolated-afterclass-review-only',{issuer:'afterclass',audience:'afterclass-web',expiresIn:'1h'});
 async function api(u,path,method='GET',body){const r=await fetch(base+'/api'+path,{method,headers:{Authorization:'Bearer '+sign(u),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,...await r.json()};}
 const profile={bio:'<script>literal text</script>',interests:['Coffee','Books'],prompt:'My ideal free afternoon',answer:'Coffee together',birthDate:'2001-01-01',datingEnabled:true,datingIntent:'relationship',minAge:18,maxAge:30};
 const future=()=>new Date(Date.now()+86400000).toISOString();
 let plan,match;
 try{
  await t.test('profiles, age gates and availability expire on the server',async()=>{
   assert.equal((await api(a,'/connections/me','PATCH',profile)).status,200);assert.equal((await api(b,'/connections/me','PATCH',profile)).status,200);
   assert.equal((await api(minor,'/connections/me','PATCH',{...profile,birthDate:new Date(Date.now()-16*365.25*864e5).toISOString().slice(0,10)})).status,400);
   assert.equal((await api(a,'/connections/me','PATCH',{birthDate:'2000-01-01'})).status,400);
   assert.equal((await api(b,'/connections/availability','POST',{minutes:60,activity:'coffee'})).status,200);
   assert.equal((await api(c,'/connections/availability','POST',{minutes:60,activity:'study'})).status,200);
   const people=(await api(a,'/connections/available')).people;assert.deepEqual(people.map(p=>p.id),[b.id]);assert.equal(people[0].birthDate,undefined);
   assert.equal((await api(outsider,'/connections/profiles/'+b.id)).status,400);
   await db.connectionProfile.update({where:{userId:b.id},data:{availableUntil:new Date(0)}});
   assert.equal((await api(a,'/connections/available')).people.length,0);
  });
  await t.test('date discovery and application recheck both students preferences',async()=>{
   plan=(await api(b,'/match-requests','POST',{activity:'A date',location:'Public café',scheduledAt:future(),connectionMode:'dating'})).request;assert.ok(plan?.id);
   assert.equal((await api(a,'/match-requests?mode=social')).requests.length,0);
   assert.equal((await api(a,'/match-requests?mode=dating')).requests.length,1);
   assert.equal((await api(minor,'/match-requests?mode=dating')).requests.length,0);
   assert.equal((await api(minor,`/match-requests/${plan.id}/applications`,'POST',{})).status,400);
   await api(a,'/connections/me','PATCH',{datingIntent:'getting_to_know'});
   assert.equal((await api(a,`/match-requests/${plan.id}/applications`,'POST',{})).status,400);
   await api(a,'/connections/me','PATCH',{datingIntent:'relationship'});
   const applied=await api(a,`/match-requests/${plan.id}/applications`,'POST',{});assert.equal(applied.status,201);
   const accepted=await api(b,`/applications/${applied.application.id}/accept`,'POST',{});assert.equal(accepted.status,200);
   match=(await api(a,'/matches')).matches[0];assert.ok(match?.id);
  });
  await t.test('meeting revisions prevent stale writes; changes require the other participant',async()=>{
   const act=(u,action,revision,extra={})=>api(u,`/connections/meetings/${match.id}/action`,'POST',{action,revision,...extra});
   assert.equal((await act(c,'confirm',0)).status,400);
   assert.equal((await act(a,'confirm',0)).status,200);assert.equal((await act(b,'confirm',0)).status,400);
   assert.equal((await act(b,'confirm',1)).status,200);
   const time=new Date(Date.now()+2*864e5).toISOString();assert.equal((await act(a,'propose',2,{scheduledAt:time,location:'Library entrance'})).status,200);
   assert.equal((await act(a,'accept-change',3)).status,400);
   assert.equal((await act(b,'accept-change',3)).status,200);
   match=(await api(a,'/matches')).matches[0];assert.equal(match.location,'Library entrance');assert.equal(match.scheduledAt,time);assert.equal(match.myConfirmed,false);assert.equal(match.otherConfirmed,false);
   const concurrent=await Promise.all([act(a,'confirm',4),act(b,'confirm',4)]);assert.equal(concurrent.filter(r=>r.status===200).length,1);
   assert.equal((await api(a,`/matches/${match.id}/complete`,'POST',{revision:5})).status,400);
   assert.equal((await api(a,`/connections/meetings/${match.id}/feedback`,'POST',{outcome:'comfortable',note:''})).status,400);
  });
  await t.test('completed meetings accept private, editable feedback without reputation changes',async()=>{
   await db.match.update({where:{id:match.id},data:{scheduledAt:new Date(Date.now()-3600000)}});
   assert.equal((await api(a,`/connections/meetings/${match.id}/action`,'POST',{action:'complete',revision:5})).status,200);
   const endpoint=`/connections/meetings/${match.id}/feedback`;assert.equal((await api(a,endpoint,'POST',{outcome:'comfortable',note:'Good chat'})).status,200);
   assert.equal((await api(a,endpoint,'POST',{outcome:'did_not_meet',note:'Correcting my answer'})).status,200);
   assert.equal((await api(b,endpoint)).feedback,null);assert.equal((await api(c,endpoint)).status,400);
   assert.equal((await db.user.findUnique({where:{id:a.id}})).reputationScore,100);
  });
  await t.test('report tracking is private and rejects reports on inaccessible messages',async()=>{
   const room=await db.chatRoom.create({data:{campusId:campus.id,kind:'campus'}});
   const msg=await db.message.create({data:{roomId:room.id,senderId:b.id,senderAlias:b.publicAlias,content:'Test report'}});
   assert.equal((await api(a,'/reports','POST',{messageId:msg.id,reason:'privacy_violation'})).status,201);
   assert.equal((await api(a,'/reports','POST',{messageId:'invalid',reason:'spam'})).status,400);
   assert.equal((await api(outsider,'/reports','POST',{messageId:msg.id,reason:'spam'})).status,404);
   const list=(await api(a,'/connections/reports')).reports;assert.equal(list.length,1);assert.equal(list[0].reportedUserId,undefined);
   assert.equal((await api(b,'/connections/reports')).reports.length,0);
   const privateMsg=await db.message.create({data:{roomId:match.roomId,senderId:b.id,senderAlias:b.publicAlias,content:'Private test'}});
   assert.equal((await api(c,'/reports','POST',{messageId:privateMsg.id,reason:'spam'})).status,404);
  });
  await t.test('blocking filters discovery, profiles, messages and rejects stale applications',async()=>{
   const plan2=(await api(b,'/match-requests','POST',{activity:'A walk',location:'Library',scheduledAt:future()})).request;
   const applied=(await api(a,`/match-requests/${plan2.id}/applications`,'POST',{})).application;
   assert.equal((await api(a,'/connections/blocks/'+b.id,'POST',{})).status,200);
   assert.equal((await api(a,'/connections/profiles/'+b.id)).status,400);assert.equal((await api(b,'/connections/profiles/'+a.id)).status,400);
   assert.equal((await api(a,'/match-requests')).requests.length,0);
   assert.equal((await api(b,`/applications/${applied.id}/accept`,'POST',{})).status,404);
   assert.equal((await api(a,`/match-requests/${plan2.id}/applications`,'POST',{})).status,400);
   assert.equal((await api(a,'/messages')).messages.length,0);
   assert.equal((await api(a,'/connections/blocks')).blocks.length,1);
   assert.equal((await api(b,'/connections/blocks')).blocks.length,0);
   assert.equal((await api(a,'/connections/blocks/'+b.id,'DELETE')).status,200);
  });
  await t.test('live blocking closes existing rooms and stops direct and campus delivery',async()=>{
   const p=(await api(b,'/match-requests','POST',{activity:'A new coffee',location:'Café',scheduledAt:future()})).request;
   const app=(await api(a,`/match-requests/${p.id}/applications`,'POST',{})).application;
   assert.equal((await api(b,`/applications/${app.id}/accept`,'POST',{})).status,200);
   const m=(await api(a,'/matches')).matches.find(m=>m.status==='active');
   const connect=u=>new Promise((resolve,reject)=>{const s=io(base,{auth:{token:sign(u)},transports:['websocket'],forceNew:true});sockets.push(s);s.once('connect',()=>resolve(s));s.once('connect_error',reject);});
   const sa=await connect(a),sb=await connect(b);sa.emit('room:join',m.roomId);sb.emit('room:join',m.roomId);
   await new Promise(r=>setTimeout(r,150));let received=0;sa.on('message:new',()=>received++);
   await api(a,'/connections/blocks/'+b.id,'POST',{});
   const ack=await new Promise(r=>sb.emit('message:send',{roomId:m.roomId,content:'Blocked private message'},r));assert.ok(ack.error);
   const campusAck=await new Promise(r=>sb.emit('campus:message',{content:'Blocked campus message'},r));assert.equal(campusAck.ok,true);
   await new Promise(r=>setTimeout(r,150));assert.equal(received,0);assert.equal((await api(a,'/matches')).matches.length,0);
   assert.equal((await api(a,`/matches/${m.id}/reveal`,'POST',{})).status,404);
  });
  await t.test('verification appeals require a rejection and only one pending appeal',async()=>{
   assert.equal((await api(a,'/connections/appeals','POST',{reason:'Please review my verification.'})).status,400);
   await db.user.update({where:{id:c.id},data:{isVerified:false,verificationStatus:'rejected'}});
   assert.equal((await api(c,'/connections/appeals','POST',{reason:'My camera was unclear. Please review.'})).status,201);
   assert.equal((await api(c,'/connections/appeals','POST',{reason:'Please review again.'})).status,409);
   assert.equal((await api(a,'/connections/appeals')).appeals.length,0);assert.equal((await api(c,'/connections/appeals')).appeals.length,1);
   assert.equal((await api(c,'/connections/admin/appeals')).status,403);
  });
  await t.test('moderators can answer only same-campus appeals and students see their response',async()=>{
   const admin=await db.user.findUnique({where:{email:'admin@review.invalid'}});assert.ok(admin);
   const applicant=await user('AppealReview','woman',{campusId:admin.campusId,isVerified:false,verificationStatus:'rejected'});extraUsers.push(applicant.id);
   const created=await api(applicant,'/connections/appeals','POST',{reason:'Please review the unclear photo and let me resubmit.'});assert.equal(created.status,201);
   const list=await api(admin,'/connections/admin/appeals');assert.equal(list.status,200);assert.ok(list.appeals.some(x=>x.id===created.appeal.id));
   const foreign=(await api(c,'/connections/appeals')).appeals[0];assert.ok(!list.appeals.some(x=>x.id===foreign.id));
   assert.equal((await api(admin,'/connections/admin/appeals/'+foreign.id,'POST',{status:'resubmit',response:'Please submit again.'})).status,400);
   const endpoint='/connections/admin/appeals/'+created.appeal.id;
   assert.equal((await api(admin,endpoint,'POST',{status:'resubmit',response:'Please submit a new photo in better lighting.'})).status,200);
   assert.equal((await api(admin,endpoint,'POST',{status:'upheld',response:'A stale second decision.'})).status,400);
   const own=(await api(applicant,'/connections/appeals')).appeals[0];assert.equal(own.status,'resubmit');assert.match(own.response,/better lighting/);
   assert.equal((await db.user.findUnique({where:{id:applicant.id}})).isVerified,false);
  });
 } finally {
  sockets.forEach(s=>s.disconnect());
  const ids=[...extraUsers,...[a,b,c,outsider,minor].map(u=>u.id)];
  await db.report.deleteMany({where:{reporterId:{in:ids}}});await db.message.deleteMany({where:{senderId:{in:ids}}});
  await db.match.deleteMany({where:{OR:[{userOneId:{in:ids}},{userTwoId:{in:ids}}]}});await db.matchRequest.deleteMany({where:{requesterId:{in:ids}}});await db.chatRoom.deleteMany({where:{campusId:{in:[campus.id,otherCampus.id]}}});await db.user.deleteMany({where:{id:{in:ids}}});await db.campus.deleteMany({where:{id:{in:[campus.id,otherCampus.id]}}});await db.$disconnect();
 }
});
