import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),express=require('express'),cookies=require('cookie-parser'),{PrismaClient}=require('@prisma/client'),{createStaffSecurity,totp}=require('../server/staff-security');
test('real database staff MFA, replay protection, recovery and durable revocation',{skip:process.env.RUN_STAFF_SECURITY_TESTS!=='1',timeout:30000},async()=>{
 const db=new PrismaClient({datasourceUrl:'postgresql://postgres:afterclass_local_review@127.0.0.1:55432/afterclass_review'});let server,campus,user;
 try{
  const suffix=Date.now();campus=await db.campus.create({data:{slug:'staff-test-'+suffix,name:'Staff test',emailDomain:'staff-'+suffix+'.invalid'}});user=await db.user.create({data:{campusId:campus.id,email:'staff'+suffix+'@test.invalid',publicAlias:'StaffTest',gender:'man'}});
  await db.$executeRaw`INSERT INTO staff_access(email,role) VALUES(${user.email},'super_admin')`;
  const app=express();app.use(express.json(),cookies());const staff=createStaffSecurity({prisma:db,secret:'integration-only-secret',reviewMode:false,sessionCookie:'integration'});
  const auth=(req,res,next)=>{req.user={...user};req.authIssuedAt=Math.floor(Date.now()/1000);next();};staff.register(app,auth);
  app.get('/protected',auth,async(req,res)=>{if(await staff.requireSession(req,res))res.json({ok:true});});
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
  const call=async(path,body,cookie='')=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]||''};};
  assert.equal((await call('/protected')).status,403);
  const enrol=await call('/api/staff/enrol',{});assert.equal(enrol.status,200);assert.ok(enrol.data.secret);
  const [stored]=await db.$queryRaw`SELECT secret FROM staff_authenticators WHERE user_id=${user.id}::uuid`;assert.notEqual(stored.secret,enrol.data.secret);
  const code=totp(enrol.data.secret,Math.floor(Date.now()/30000));const both=await Promise.all([call('/api/staff/verify',{code}),call('/api/staff/verify',{code})]);assert.deepEqual(both.map(x=>x.status).sort(),[200,400]);const verified=both.find(x=>x.status===200);assert.equal(verified.data.recoveryCodes.length,8);
  assert.equal((await call('/protected',null,verified.cookie)).status,200);
  assert.equal((await call('/api/staff/enrol',{})).status,409);
  const recovered=await call('/api/staff/verify',{code:verified.data.recoveryCodes[0]});assert.equal(recovered.status,200);assert.equal((await call('/protected',null,verified.cookie)).status,403);assert.equal((await call('/protected',null,recovered.cookie)).status,200);assert.equal((await call('/api/staff/verify',{code:verified.data.recoveryCodes[0]})).status,400);
  await db.$executeRaw`UPDATE staff_access SET revoked_at=now(),version=version+1 WHERE email=${user.email}`;
  assert.equal((await call('/api/staff/session',null,recovered.cookie)).status,403);assert.equal((await call('/protected',null,recovered.cookie)).status,403);
  const old=process.env.ADMIN_EMAILS;process.env.ADMIN_EMAILS=user.email;await staff.bootstrap({getExcludedAdminEmails:async()=>[],getModeratorEmails:async()=>[],ping:async()=>'PONG'});if(old===undefined)delete process.env.ADMIN_EMAILS;else process.env.ADMIN_EMAILS=old;
  assert.equal(await staff.access(user),undefined);
 }finally{server?.close();if(user){await db.$executeRaw`DELETE FROM staff_access WHERE email=${user.email}`;await db.user.delete({where:{id:user.id}});}if(campus)await db.campus.delete({where:{id:campus.id}});await db.$disconnect();}
});

test('operations persists campus preparation, restricts network access, and returns chart measurements',{skip:process.env.RUN_STAFF_SECURITY_TESTS!=='1',timeout:30000},async()=>{
 const {createReliability}=require('../server/reliability');const db=new PrismaClient({datasourceUrl:'postgresql://postgres:afterclass_local_review@127.0.0.1:55432/afterclass_review'});let server,campus,other,user;const id='operations-test-'+Date.now();
 try{
  campus=await db.campus.create({data:{slug:id,name:'Operations test',emailDomain:id+'.invalid'}});other=await db.campus.create({data:{slug:id+'-other',name:'Other test',emailDomain:id+'-other.invalid'}});user=await db.user.create({data:{campusId:campus.id,email:id+'@test.invalid',publicAlias:'Operator',gender:'man'}});
  const app=express();app.use(express.json());const ops=createReliability({prisma:db,redis:{ping:async()=>'PONG'}});
  ops.register(app,(req,res,next)=>{req.user=user;req.adminCampusId=req.get('campus')==='other'?other.id:campus.id;req.isPlatformAdmin=req.get('owner')==='yes';next();});
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
  const call=async(path,body,headers={})=>{const r=await fetch(base+'/api/admin/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  assert.equal((await call('readiness',{key:'hosts',completed:true,note:'Confirmed demo owner'})).status,200);
  assert.equal((await call('readiness')).data.tasks.find(t=>t.key==='hosts').completed,true);
  assert.equal((await call('readiness',null,{campus:'other'})).data.tasks.find(t=>t.key==='hosts').completed,undefined);
  assert.equal((await call('readiness',{key:'unknown',completed:true,note:''})).status,400);
  await db.$executeRaw`INSERT INTO service_observations(instance_id,database_ms,cache_ok,requests,errors) VALUES(${id},25,true,10,1)`;
  const [alert]=await db.$queryRaw`INSERT INTO operational_alerts(alert_key,severity,summary) VALUES(${id},'warning','Integration test') RETURNING id::text`;
  assert.equal((await call('reliability')).status,403);
  const chart=await call('reliability',null,{owner:'yes'});assert.equal(chart.status,200);assert.ok(chart.data.history.some(h=>h.requests>=10&&h.errors>=1&&h.hour));assert.ok(chart.data.lastSample);
  assert.equal((await call('reliability/'+alert.id+'/acknowledge',{})).status,403);
  assert.equal((await call('reliability/'+alert.id+'/acknowledge',{},{owner:'yes'})).status,200);
  const [stored]=await db.$queryRaw`SELECT acknowledged_by,resolved_at FROM operational_alerts WHERE alert_key=${id}`;assert.equal(stored.acknowledged_by,user.id);assert.equal(stored.resolved_at,null);
 }finally{server?.close();await db.$executeRaw`DELETE FROM service_observations WHERE instance_id=${id}`;await db.$executeRaw`DELETE FROM operational_alerts WHERE alert_key=${id}`;if(user)await db.user.delete({where:{id:user.id}});if(campus)await db.campus.delete({where:{id:campus.id}});if(other)await db.campus.delete({where:{id:other.id}});await db.$disconnect();}
});

test('concurrent owner revocations preserve one active owner',{skip:process.env.RUN_STAFF_SECURITY_TESTS!=='1',timeout:10000},async()=>{
 const db=new PrismaClient({datasourceUrl:'postgresql://postgres:afterclass_local_review@127.0.0.1:55432/afterclass_review'}),prefix='owner-race-'+Date.now(),a=prefix+'a@test.invalid',b=prefix+'b@test.invalid';
 try{
  await db.$executeRaw`INSERT INTO staff_access(email,role) VALUES(${a},'super_admin'),(${b},'super_admin')`;
  const staff=createStaffSecurity({prisma:db,secret:'test',reviewMode:false,sessionCookie:'test'});
  const result=await Promise.allSettled([staff.changeAccess({email:a},b),staff.changeAccess({email:b},a)]);
  assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
  const rows=await db.$queryRaw`SELECT email FROM staff_access WHERE email IN (${a},${b}) AND revoked_at IS NULL`;assert.equal(rows.length,1);
 }finally{await db.$executeRaw`DELETE FROM staff_access WHERE email IN (${a},${b})`;await db.$disconnect();}
});
