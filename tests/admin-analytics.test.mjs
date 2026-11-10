import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const require=createRequire(import.meta.url);
const {analytics,analyticsWindow}=require('../server/admin-analytics');

test('analytics periods use UTC boundaries and reject unsupported ranges',()=>{
 const now=new Date('2026-11-10T18:30:00Z');
 for(const days of [7,30,90]){const w=analyticsWindow(days,now);assert.equal(w.days,days);assert.equal(w.start.getUTCHours(),0);assert.equal(w.end,now);assert.equal(w.start-w.previousStart,days*86400000);}
 assert.equal(analyticsWindow(7,now).start.toISOString(),'2026-11-04T00:00:00.000Z');
 for(const v of [0,365,'all','7 OR 1=1',[],null])assert.throws(()=>analyticsWindow(v,now),/Choose/);
});

test('college analytics and moderation authorization with real database and HTTP',{skip:process.env.RUN_ADMIN_ANALYTICS_TESTS!=='1',timeout:90000},async t=>{
 const {PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken');
 const url='postgresql://postgres:afterclass_local_review@127.0.0.1:55432/afterclass_review';
 const db=new PrismaClient({datasourceUrl:url}),suffix=Date.now(),ids=[];
 const now=new Date(),day=86400000,w=analyticsWindow(7,now),current=new Date(now-day),previous=new Date(w.start-day),old=new Date(w.previousStart-day);
 const secret='admin-analytics-test-only',base='http://127.0.0.1:3018';let server;
 try{
  for(const name of ['Analytics North','Analytics South'])ids.push((await db.campus.create({data:{name,slug:name.replaceAll(' ','-')+suffix,emailDomain:name.replaceAll(' ','-')+suffix+'.invalid'}})).id);
  const make=(name,campusId,extra={})=>db.user.create({data:{publicAlias:name,email:name.toLowerCase()+suffix+'@review.invalid',campusId,isVerified:true,verificationStatus:'approved',createdAt:old,...extra}});
  const root=await make('Root',ids[0]),member=await make('Member',ids[0],{createdAt:current}),other=await make('Other',ids[1]),mod=await make('Mod',ids[1]),pending=await make('Pending',ids[1],{isVerified:false,verificationStatus:'pending',verificationPhoto:'verify_scope_test.png'});
  const room=await db.chatRoom.create({data:{campusId:ids[0],kind:'campus'}});
  await db.message.createMany({data:[previous,current,current].map(createdAt=>({roomId:room.id,senderId:root.id,senderAlias:root.publicAlias,content:'PRIVATE MESSAGE MUST NOT BE IN ANALYTICS',createdAt}))});
  const plan=await db.matchRequest.create({data:{campusId:ids[0],requesterId:member.id,activity:'Coffee',location:'Cafe',scheduledAt:new Date(now.getTime()+day),expiresAt:new Date(now.getTime()+2*day),createdAt:current,status:'matched'}});
  await db.matchRequest.create({data:{campusId:ids[0],requesterId:member.id,activity:'Walk',location:'Park',scheduledAt:current,expiresAt:current,createdAt:current,status:'expired'}});
  await db.matchApplication.create({data:{requestId:plan.id,applicantId:root.id,createdAt:current}});
  const chat=await db.chatRoom.create({data:{campusId:ids[0],kind:'match'}});
  await db.match.create({data:{requestId:plan.id,userOneId:member.id,userTwoId:root.id,roomId:chat.id,scheduledAt:plan.scheduledAt,createdAt:current,status:'completed',completedAt:current,confirmedOneAt:current,confirmedTwoAt:current}});
  const reportA=await db.report.create({data:{campusId:ids[0],reporterId:root.id,reportedUserId:member.id,reason:'spam',createdAt:new Date(now-3*day),detail:'Private evidence'}});
  await db.report.create({data:{campusId:ids[0],reporterId:root.id,reportedUserId:member.id,reason:'spam',createdAt:current}});
  const reportB=await db.report.create({data:{campusId:ids[1],reporterId:mod.id,reportedUserId:other.id,reason:'harassment',createdAt:current,status:'resolved',resolvedAt:current}});
  await t.test('distinct participation, conversion, snapshots and daily totals agree',async()=>{
   const d=await analytics(db,ids[0],w),c=d.campuses[0];assert.equal(d.campuses.length,1);
   assert.equal(c.accounts,2);assert.equal(c.signups,1);assert.equal(c.verified,2);assert.equal(c.participants,2);assert.equal(c.returning,1);
   assert.equal(c.plans,2);assert.equal(c.matched_plans,1);assert.equal(c.unmatched_past_plans,1);assert.equal(c.matches,1);assert.equal(c.completed,1);assert.equal(c.confirmed,1);
   assert.equal(c.reports,2);assert.equal(c.pending_reports,2);assert.equal(c.reported_accounts,1);assert.equal(c.aged_reports,1);
   assert.equal(d.daily.length,7);assert.equal(d.daily.reduce((n,x)=>n+x.plans,0),2);assert.equal(d.daily.reduce((n,x)=>n+x.signups,0),1);
   assert.deepEqual(d.reasons,[{reason:'spam',count:2}]);assert.ok(!JSON.stringify(d).includes(root.email));assert.ok(!JSON.stringify(d).includes('PRIVATE MESSAGE'));
   const south=(await analytics(db,ids[1],w)).campuses[0];assert.equal(south.accounts,3);assert.equal(south.verification_pending,1);assert.equal(south.resolved_reports,1);assert.equal(south.pending_reports,0);assert.equal(south.participants,0);
   const all=await analytics(db,null,w);assert.ok(all.campuses.some(c=>c.id===ids[0]));assert.ok(all.campuses.some(c=>c.id===ids[1]));
  });
  server=spawn(process.execPath,['server/index.js'],{env:{...process.env,AFTERCLASS_REVIEW:'1',DATABASE_URL:url,DIRECT_URL:url,HOST:'127.0.0.1',PORT:'3018',NODE_ENV:'development',JWT_SECRET:secret,SESSION_COOKIE_NAME:'analytics_test',ADMIN_EMAILS:root.email,ADMIN_KEY:'legacy-key',REDIS_URL:'',RESEND_API_KEY:''},stdio:'ignore'});
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/review')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const call=async(u,path,{college,body,method,headers={}}={})=>{const r=await fetch(base+'/api'+path,{method:method||(body===undefined?'GET':'POST'),headers:{...(u?{Authorization:'Bearer '+jwt.sign({sub:u.id,sv:u.sessionVersion},secret,{issuer:'afterclass',audience:'afterclass-web',expiresIn:'5m'})}:{}),'Content-Type':'application/json',...(college?{'X-Afterclass-Campus':college}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.text()};};
  await t.test('platform admin can select colleges; student and legacy key cannot',async()=>{
   const me=await call(root,'/me');assert.equal(JSON.parse(me.data).user.isPlatformAdmin,true);assert.equal(JSON.parse(me.data).user.adminCampusId,ids[0]);
   assert.equal((await call(root,'/admin/analytics?scope=all')).status,200);
   const south=await call(root,'/admin/reports',{college:ids[1]});assert.equal(south.status,200);assert.ok(south.data.includes(reportB.id));assert.ok(!south.data.includes(reportA.id));
   assert.equal((await call(member,'/admin/analytics?scope=all')).status,403);
   assert.equal((await call(null,'/admin/analytics',{headers:{'x-admin-key':'legacy-key'}})).status,401);
   assert.equal((await call(root,'/admin/analytics?days=365')).status,400);
   assert.equal((await call(root,'/admin/analytics',{college:'bad-id'})).status,400);
   assert.equal((await call(root,'/admin/moderators',{college:ids[1],body:{email:mod.email,role:'moderator'}})).status,200);
  });
  await t.test('college moderator cannot read or mutate other colleges or grant privileges',async()=>{
   assert.equal(JSON.parse((await call(mod,'/me')).data).user.isPlatformAdmin,false);
   const d=await call(mod,'/admin/analytics');assert.equal(d.status,200);assert.equal(JSON.parse(d.data).campuses[0].id,ids[1]);
   assert.equal((await call(mod,'/admin/analytics?scope=all')).status,403);
   for(const path of ['/admin/analytics','/admin/reports','/admin/verifications','/admin/moderators'])assert.equal((await call(mod,path,{college:ids[0]})).status,403,path);
   assert.equal((await call(mod,'/admin/analytics?campusId='+ids[0])).status,403);
   assert.equal((await call(mod,'/admin/reports/'+reportA.id+'/context')).status,404);
   assert.equal((await call(mod,'/admin/users/'+member.id+'/action',{body:{action:'warn'}})).status,403);
   assert.equal((await call(mod,'/admin/reports/'+reportA.id+'/action',{body:{action:'dismiss'}})).status,403);
   assert.equal((await call(mod,'/admin/verifications/'+member.id+'/approve',{body:{}})).status,404);
   assert.equal((await call(root,'/admin/verifications/photo/verify_scope_test.png')).status,404);
   assert.equal((await call(mod,'/admin/moderators',{body:{email:other.email,role:'super_admin'}})).status,403);
   assert.equal((await call(mod,'/admin/moderators/'+encodeURIComponent(root.email),{method:'DELETE'})).status,403);
  });
 }finally{
  if(server){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}
  if(ids.length){await db.report.deleteMany({where:{campusId:{in:ids}}});await db.matchApplication.deleteMany({where:{request:{campusId:{in:ids}}}});await db.match.deleteMany({where:{request:{campusId:{in:ids}}}});await db.matchRequest.deleteMany({where:{campusId:{in:ids}}});await db.message.deleteMany({where:{room:{campusId:{in:ids}}}});await db.chatRoom.deleteMany({where:{campusId:{in:ids}}});await db.user.deleteMany({where:{campusId:{in:ids}}});await db.campus.deleteMany({where:{id:{in:ids}}});}await db.$disconnect();
 }
});
