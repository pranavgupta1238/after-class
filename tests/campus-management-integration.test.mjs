import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {spawn} from 'node:child_process';
const require=createRequire(import.meta.url),{PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken'),{io}=require('socket.io-client');
const url='postgresql://postgres:afterclass_local_review@127.0.0.1:55432/afterclass_review';
test('university lifecycle, owner-only administration, enrollment and live session enforcement',{skip:process.env.RUN_CAMPUS_MANAGEMENT_TESTS!=='1',timeout:90000},async()=>{
 const db=new PrismaClient({datasourceUrl:url}),suffix=Date.now(),ids=[],secret='university-integration-secret',port=3027,base='http://127.0.0.1:'+port;let server,socket;
 const env={...process.env,DATABASE_URL:url,DIRECT_URL:url,AFTERCLASS_REVIEW:'1',HOST:'127.0.0.1',PORT:String(port),JWT_SECRET:secret,REDIS_URL:'',RESEND_API_KEY:'',ADMIN_EMAILS:'',CLIENT_URL:base,NODE_ENV:'development'};
 try{
  const home=await db.campus.create({data:{slug:'policy-owner-'+suffix,name:'Owner campus',emailDomain:'owner'+suffix+'.invalid'}});ids.push(home.id);
  const owner=await db.user.create({data:{campusId:home.id,email:'owner'+suffix+'@review.invalid',publicAlias:'Owner'}}),mod=await db.user.create({data:{campusId:home.id,email:'mod'+suffix+'@review.invalid',publicAlias:'Moderator'}});
  await db.$executeRaw`INSERT INTO staff_access(email,role) VALUES(${owner.email},'super_admin'),(${mod.email},'moderator')`;
  const token=u=>jwt.sign({sub:u.id,sv:0},secret,{issuer:'afterclass',audience:'afterclass-web',expiresIn:'1h'});
  const call=async(path,body,method='POST',who=owner)=>{const r=await fetch(base+'/api'+path,{method,headers:{Authorization:'Bearer '+token(who),'Content-Type':'application/json'},body:method==='GET'?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  server=spawn(process.execPath,['server/index.js'],{env,stdio:['ignore','pipe','pipe']});let logs='';server.stderr.on('data',x=>logs+=x);server.stdout.on('data',x=>logs+=x);
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,150));}assert.ok(ready,logs);
  const domain='uni'+suffix+'.invalid';let body={name:'Policy University',slug:'policy-'+suffix,emailDomain:domain,location:'Test',status:'paused',audience:'students',enrollmentOpen:true,reason:'Testing institution enrollment',accessPolicy:{domains:[{domain,role:'roster'},{domain:'s.'+domain,role:'student'},{domain:'f.'+domain,role:'faculty'}],members:[{email:'roster@'+domain,role:'faculty'}]}};
  assert.equal((await call('/admin/universities',body,'POST',mod)).status,403);
  assert.equal((await call('/admin/universities',{...body,status:'active'})).status,400);
  const created=await call('/admin/universities',body);assert.equal(created.status,201,JSON.stringify(created));let c=created.data.university;ids.push(c.id);assert.equal(await db.chatRoom.count({where:{campusId:c.id}}),1);
  const create=async(email,role)=>db.user.create({data:{campusId:c.id,email,publicAlias:role,campusRole:role,campusEligible:true,isVerified:true,verificationStatus:'approved',gender:'man'}});
  const student=await create('student@s.'+domain,'student'),faculty=await create('faculty@f.'+domain,'faculty');
  assert.equal((await call('/match-requests',null,'GET',student)).status,403);
  const update=async patch=>{body={...body,...patch,revision:c.policyRevision,confirmName:c.name};const r=await call('/admin/universities/'+c.id,body,'PUT');if(r.status===200)c=r.data.university;return r;};
  const preview=await call('/admin/universities/'+c.id+'/preview',{...body,status:'active'});assert.equal(preview.data.impact.allowed,1);assert.equal(preview.data.impact.blocked,1);
  assert.equal((await update({status:'active'})).status,200);assert.equal((await call('/match-requests',null,'GET',student)).status,200);assert.equal((await call('/match-requests',null,'GET',faculty)).status,403);
  assert.equal((await call('/admin/universities/'+c.id,{...body,revision:1},'PUT')).status,409);
  const duplicate=await call('/admin/universities',{...body,status:'paused',slug:'duplicate-'+suffix});assert.equal(duplicate.status,409);
  assert.equal((await update({audience:'both'})).status,200);assert.equal((await call('/match-requests',null,'GET',faculty)).status,200);
  const policy=require('../server/campus-policy');assert.equal((await policy.admission(db,'roster@'+domain)).role,'faculty');await assert.rejects(()=>policy.admission(db,'unknown@'+domain),/not eligible/);
  assert.equal((await update({enrollmentOpen:false})).status,200);await assert.rejects(()=>policy.admission(db,'new@s.'+domain),/closed/);assert.equal((await policy.admission(db,student.email)).role,'student');
  socket=io(base,{auth:{token:token(student)},transports:['websocket'],reconnection:false});await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
  const disconnected=new Promise(resolve=>socket.once('disconnect',resolve));assert.equal((await update({status:'retired'})).status,200);await disconnected;
  assert.equal((await call('/match-requests',null,'GET',student)).status,403);assert.equal((await call('/me',null,'GET',student)).data.user.campusAccess,'Afterclass is no longer available at your university.');assert.equal(await db.user.count({where:{campusId:c.id}}),2);
  assert.ok(await db.adminAuditEvent.count({where:{campusId:c.id,operation:'university.policy.updated'}})>=4);
  // Even an owner can recover a paused home university, but cannot use its community APIs.
  await db.campus.update({where:{id:home.id},data:{status:'paused'}});assert.equal((await call('/admin/universities',null,'GET')).status,200);assert.equal((await call('/match-requests',null,'GET')).status,403);
  await db.$executeRaw`DELETE FROM staff_access WHERE email IN (${owner.email},${mod.email})`;
 }finally{socket?.disconnect();server?.kill('SIGTERM');if(server)await new Promise(r=>server.once('exit',r));await db.$executeRaw`DELETE FROM staff_access WHERE email IN (${"owner"+suffix+"@review.invalid"},${"mod"+suffix+"@review.invalid"})`;for(const id of ids.reverse()){await db.adminAuditEvent.deleteMany({where:{campusId:id}});await db.chatRoom.deleteMany({where:{campusId:id}});await db.user.deleteMany({where:{campusId:id}});await db.campus.delete({where:{id}});}await db.$disconnect();}
});

test('real OTP sign-in enforces university policy again at redemption',{skip:process.env.RUN_CAMPUS_MANAGEMENT_TESTS!=='1',timeout:90000},async()=>{
 const db=new PrismaClient({datasourceUrl:url}),suffix=Date.now(),domain='otp'+suffix+'.invalid',base='http://127.0.0.1:3028';let server,campus;
 try{
  campus=await db.campus.create({data:{name:'OTP university',slug:'otp-'+suffix,emailDomain:domain,audience:'students',accessPolicy:{domains:[{domain,role:'student'},{domain:'faculty.'+domain,role:'faculty'}],members:[]}}});
  server=spawn(process.execPath,['server/index.js'],{env:{...process.env,DATABASE_URL:url,DIRECT_URL:url,AFTERCLASS_REVIEW:'0',HOST:'127.0.0.1',PORT:'3028',JWT_SECRET:'university-otp-integration-only',REDIS_URL:'',RESEND_API_KEY:'',ADMIN_EMAILS:'',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',CLIENT_URL:base,NODE_ENV:'development'},stdio:'ignore'});
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,150));}assert.ok(ready);
  const post=async(path,body)=>{const r=await fetch(base+'/api/auth/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};};
  for(const email of ['person@faculty.'+domain,'person@fake.'+domain,'person@'+domain+'.evil.invalid'])assert.equal((await post('send-otp',{email})).status,403);
  const email='member@'+domain,otp=await post('send-otp',{email,gender:'woman'});assert.equal(otp.status,200);assert.match(otp.data.developmentCode,/^\d{6}$/);
  await db.campus.update({where:{id:campus.id},data:{enrollmentOpen:false}});
  assert.equal((await post('verify-otp',{email,code:otp.data.developmentCode})).status,403,'policy change after OTP issuance must win');
  assert.equal(await db.user.count({where:{campusId:campus.id}}),0);
  await db.campus.update({where:{id:campus.id},data:{enrollmentOpen:true}});
  const retry=await post('send-otp',{email}),verified=await post('verify-otp',{email,code:retry.data.developmentCode});assert.equal(verified.status,200);assert.equal(verified.data.user.campusRole,'student');
  await db.campus.update({where:{id:campus.id},data:{enrollmentOpen:false}});
  assert.equal((await post('send-otp',{email})).status,200,'existing members can still sign in');assert.equal((await post('send-otp',{email:'new@'+domain})).status,403);
  await db.campus.update({where:{id:campus.id},data:{status:'paused'}});
  assert.equal((await fetch(base+'/api/match-requests',{headers:{Cookie:verified.cookie.split(';')[0]}})).status,403,'existing sessions are checked on every community request');
  const restrictedOtp=await post('send-otp',{email}),restricted=await post('verify-otp',{email,code:restrictedOtp.data.developmentCode});assert.equal(restricted.status,200);assert.match(restricted.data.user.campusAccess,/paused/,'signed-in review access must not grant community access');
 }finally{if(server){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}if(campus){await db.user.deleteMany({where:{campusId:campus.id}});await db.campus.delete({where:{id:campus.id}});}await db.$disconnect();}
});
