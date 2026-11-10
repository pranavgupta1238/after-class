import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const require=createRequire(import.meta.url);
const {createOperations,percentile}=require('../server/admin-operations');
const {analyticsWindow}=require('../server/admin-analytics');
test('service percentiles distinguish no observations from zero latency',()=>{
 assert.equal(percentile([],.95),null);assert.equal(percentile([0],.95),0);assert.equal(percentile([20,1,7,4],.95),20);
 assert.equal(percentile(Array.from({length:100},(_,i)=>i+1),.95),95);
});
test('admin operations database and access boundaries',{skip:process.env.RUN_ADMIN_OPERATIONS_TESTS!=='1',timeout:90000},async t=>{
 const {PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken');
 const url='postgresql://postgres:afterclass_local_review@127.0.0.1:55432/afterclass_review';
 const db=new PrismaClient({datasourceUrl:url}),suffix=Date.now(),campuses=[],users=[];let server;
 const DAY=86400000,now=new Date(),today=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())),old=new Date(today-40*DAY),secret='operations-integration-only',base='http://127.0.0.1:3017';
 try{
  for(const name of ['Ops North','Ops South'])campuses.push(await db.campus.create({data:{name,slug:name.replace(' ','-')+suffix,emailDomain:name.replace(' ','-')+suffix+'.invalid'}}));
  for(const [alias,college]of [['Root',0],['Reviewer',0],['Reporter',0],['Subject',0],['Outsider',1]])users.push(await db.user.create({data:{campusId:campuses[college].id,email:alias.toLowerCase()+suffix+'@ops.invalid',publicAlias:alias,isVerified:true,verificationStatus:'approved',createdAt:old}}));
  const [root,reviewer,reporter,subject,outsider]=users;
  const report=await db.report.create({data:{campusId:campuses[0].id,reporterId:reporter.id,reportedUserId:subject.id,reason:'spam',detail:'PRIVATE EVIDENCE',createdAt:new Date(now-3*DAY)}});
  await t.test('retention uses mature exact-day cohorts and ignores activity on the wrong day',async()=>{
   await db.$transaction(async tx=>{
    const [original]=await tx.$queryRaw`SELECT started_at FROM admin_measurement_config WHERE id=1`;
    await tx.$executeRaw`UPDATE admin_measurement_config SET started_at=${new Date(old-DAY)} WHERE id=1`;
    await tx.$executeRaw`INSERT INTO account_activity_days(user_id,campus_id,activity_date) VALUES(${subject.id}::uuid,${campuses[0].id}::uuid,${new Date(old.getTime()+7*DAY)}::date),(${reporter.id}::uuid,${campuses[0].id}::uuid,${new Date(old.getTime()+8*DAY)}::date)`;
    const d=await createOperations(tx).cohorts(campuses[0].id,analyticsWindow(90,now));
    const seven=d.retention.find(r=>r.offset_day===7);assert.equal(seven.eligible,4);assert.equal(seven.returned,1);assert.equal(d.activation.accounts,4);
    const thirty=d.retention.find(r=>r.offset_day===30);assert.equal(thirty.eligible,4);assert.equal(thirty.returned,0);
    await tx.$executeRaw`UPDATE users SET created_at=${new Date(today-7*DAY)} WHERE id=${root.id}::uuid`;
    const fresh=await createOperations(tx).cohorts(campuses[0].id,analyticsWindow(90,now));assert.equal(fresh.retention.filter(r=>r.offset_day===7).reduce((n,r)=>n+r.eligible,0),3,'today is still incomplete');
    await tx.$executeRaw`UPDATE admin_measurement_config SET started_at=${original.started_at} WHERE id=1`;
   });
  });
  server=spawn(process.execPath,['server/index.js'],{env:{...process.env,AFTERCLASS_REVIEW:'1',DATABASE_URL:url,DIRECT_URL:url,HOST:'127.0.0.1',PORT:'3017',NODE_ENV:'development',JWT_SECRET:secret,ADMIN_EMAILS:root.email,REDIS_URL:'',RESEND_API_KEY:''},stdio:'ignore'});
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/review')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const call=async(u,path,{college,body,method}={})=>{const r=await fetch(base+'/api'+path,{method:method||(body===undefined?'GET':'POST'),headers:{...(u?{Authorization:'Bearer '+jwt.sign({sub:u.id,sv:u.sessionVersion},secret,{issuer:'afterclass',audience:'afterclass-web',expiresIn:'5m'})}:{}),'Content-Type':'application/json',...(college?{'X-Afterclass-Campus':college}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  await t.test('activity is deduplicated and always bound to authenticated identity',async()=>{
   for(let i=0;i<2;i++)assert.equal((await call(subject,'/activity',{body:{userId:root.id,campusId:campuses[1].id}})).status,200);
   const [r]=await db.$queryRaw`SELECT COUNT(*)::int n FROM account_activity_days WHERE user_id=${subject.id}::uuid AND activity_date=(now() AT TIME ZONE 'UTC')::date`;assert.equal(r.n,1);
   assert.equal((await call(null,'/activity',{body:{}})).status,401);
  });
  await call(root,'/admin/moderators',{body:{email:reviewer.email,role:'moderator'}});
  await call(root,'/admin/moderators',{body:{email:reporter.email,role:'moderator'}});
  await t.test('assignments reject conflicts and stale writes, while preserving audit evidence',async()=>{
   const endpoint='/admin/operations/cases/'+report.id+'/assign';
   assert.equal((await call(root,endpoint,{body:{assigneeId:reporter.id,expectedAssigneeId:null}})).status,400);
   assert.equal((await call(root,endpoint,{body:{assigneeId:outsider.id,expectedAssigneeId:null}})).status,400);
   assert.equal((await call(root,endpoint,{body:{assigneeId:reviewer.id,expectedAssigneeId:null}})).status,200);
   assert.equal((await call(root,endpoint,{body:{assigneeId:null,expectedAssigneeId:null}})).status,409);
   const queue=await call(reviewer,'/admin/operations/cases');assert.equal(queue.status,200);assert.equal(queue.data.cases.find(x=>x.id===report.id).assignee_id,reviewer.id);assert.ok(!JSON.stringify(queue.data).includes('PRIVATE EVIDENCE'));
   const audit=await call(root,'/admin/operations/audit');assert.ok(audit.data.events.some(x=>x.operation==='case.assignment'&&x.metadata.to===reviewer.id));assert.ok(!JSON.stringify(audit.data).includes('@ops.invalid'));
   assert.equal((await call(root,'/admin/operations/audit?before=invalid')).status,400);
  });
  await t.test('operations scope and service privileges cannot be bypassed',async()=>{
   for(const path of ['/admin/operations/cohorts','/admin/operations/cases','/admin/operations/audit']){
    assert.equal((await call(reviewer,path+'?scope=all')).status,403);
    assert.equal((await call(reviewer,path,{college:campuses[1].id})).status,403);
    assert.equal((await call(subject,path)).status,403);
   }
   assert.equal((await call(reviewer,'/admin/operations/service')).status,403);
   assert.equal((await call(root,'/admin/operations/service')).status,200);
   assert.equal((await call(root,'/admin/operations/budget',{body:{service:'supabase',used:-1,capacity:50,unit:'MB',measuredAt:old}})).status,400);
   assert.equal((await call(root,'/admin/operations/budget',{body:{service:'supabase',used:1,capacity:50,unit:'MB',measuredAt:new Date(Date.now()+DAY)}})).status,400);
   // Preserve any manually entered fixture value while testing a successful snapshot write.
   const previous=await db.$queryRaw`SELECT * FROM service_budget_snapshots WHERE service='hosting'`;
   try{
    assert.equal((await call(root,'/admin/operations/budget',{body:{service:'hosting',used:85,capacity:100,unit:'requests',measuredAt:old.toISOString()}})).status,200);
    const health=await call(root,'/admin/operations/service');const budget=health.data.budgets.find(x=>x.service==='hosting');assert.equal(budget.used,85);assert.equal(budget.capacity,100);
   }finally{
    if(previous.length){const b=previous[0];await db.$executeRaw`UPDATE service_budget_snapshots SET used=${Number(b.used)},capacity=${Number(b.capacity)},unit=${b.unit},measured_at=${b.measured_at},updated_by=${b.updated_by}::uuid WHERE service='hosting'`;}
    else await db.$executeRaw`DELETE FROM service_budget_snapshots WHERE service='hosting'`;
   }
   assert.equal((await call(reviewer,'/admin/operations/export?scope=all',{body:{scope:'all',days:30}})).status,403);
   assert.equal((await call(root,'/admin/operations/export?scope=all',{body:{scope:'all',days:30}})).status,200);
   await new Promise(r=>setTimeout(r,200));
   const audit=await call(root,'/admin/operations/audit');assert.ok(audit.data.events.some(x=>x.operation.endsWith('/export')&&x.outcome==='succeeded'));
  });
 }finally{
  if(server){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}
  const ids=campuses.map(c=>c.id);if(ids.length){await db.$executeRaw`DELETE FROM admin_audit_events WHERE campus_id=ANY(${ids}::uuid[])`;await db.report.deleteMany({where:{campusId:{in:ids}}});await db.user.deleteMany({where:{campusId:{in:ids}}});await db.campus.deleteMany({where:{id:{in:ids}}});}await db.$disconnect();
 }
});
