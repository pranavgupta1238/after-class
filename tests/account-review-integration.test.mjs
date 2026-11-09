import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const require=createRequire(import.meta.url),{PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken');
const url='postgresql://postgres:afterclass_local_review@127.0.0.1:55432/afterclass_review';
test('account review lifecycle against an isolated database and real authentication',{skip:process.env.RUN_ACCOUNT_REVIEW_TESTS!=='1',timeout:90000},async t=>{
 const db=new PrismaClient({datasourceUrl:url});const suffix=Date.now();let server;let campus,other;
 const secret='review-integration-only';const base='http://127.0.0.1:3014';
 try{
  campus=await db.campus.create({data:{slug:'appeal-'+suffix,name:'Appeal test campus',emailDomain:'appeal-'+suffix+'.invalid'}});
  other=await db.campus.create({data:{slug:'outside-'+suffix,name:'Outside',emailDomain:'outside-'+suffix+'.invalid'}});
  const make=(name,campusId=campus.id)=>db.user.create({data:{campusId,email:name+suffix+'@review.invalid',publicAlias:name,isVerified:true,verificationStatus:'approved'}});
  const [owner,original,reviewer,second,reporter,outsider]=await Promise.all(['Owner','Original','Reviewer','Second','Reporter'].map(n=>make(n)).concat(make('Outsider',other.id)));
  const users=[owner,original,reviewer,second,reporter,outsider];
  server=spawn(process.execPath,['server/index.js'],{env:{...process.env,AFTERCLASS_REVIEW:'1',HOST:'127.0.0.1',PORT:'3014',NODE_ENV:'development',DATABASE_URL:url,DIRECT_URL:url,REDIS_URL:'',RESEND_API_KEY:'',ADMIN_KEY:'',JWT_SECRET:secret,SESSION_COOKIE_NAME:'review_test',ADMIN_EMAILS:[original,reviewer,second,reporter,outsider].map(u=>u.email).join(',')},stdio:'ignore'});
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/review')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const sign=u=>jwt.sign({sub:u.id,sv:u.sessionVersion},secret,{issuer:'afterclass',audience:'afterclass-web',expiresIn:'5m'});
  const call=async(u,path,body)=>{const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+sign(u),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,...await r.json()};};
  const room=await db.chatRoom.create({data:{campusId:campus.id,kind:'campus'}});
  const message=await db.message.create({data:{roomId:room.id,senderId:owner.id,senderAlias:'Owner',content:'Snapshot evidence'}});
  await db.report.create({data:{campusId:campus.id,reporterId:reporter.id,reportedUserId:owner.id,messageId:message.id,reason:'spam',detail:'Private reporter detail'}});
  let action,id;
  await t.test('restriction records explanation and evidence; stale sessions are revoked',async()=>{
   const result=await call(original,'/admin/users/'+owner.id+'/action',{action:'timeout',hours:168,policy:'Spam or misuse',summary:'Repeated unsolicited messages violated our spam guideline.'});assert.equal(result.status,200,JSON.stringify(result));
   assert.equal((await call(owner,'/me')).status,401);Object.assign(owner,await db.user.findUnique({where:{id:owner.id}}));
   const me=await call(owner,'/me');assert.equal(me.user.restricted,true);assert.equal((await call(owner,'/messages')).status,403);
   action=(await call(owner,'/reviews')).decisions[0];assert.ok(action.id);assert.equal(action.summary,'Repeated unsolicited messages violated our spam guideline.');assert.equal(action.evidence,undefined);
  });
  await t.test('one appeal per decision even with simultaneous submissions; owner isolation',async()=>{
   const body={actionId:action.id,statement:'These messages were part of an agreed campus activity. Please reconsider.'};
   const results=await Promise.all([call(owner,'/reviews',body),call(owner,'/reviews',body)]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);id=results.find(r=>r.id).id;
   assert.equal((await call(reviewer,'/reviews/'+id)).status,404);assert.equal((await call(outsider,'/review-admin/'+id)).status,404);
   const own=await call(owner,'/reviews/'+id);assert.equal(JSON.stringify(own).includes(reporter.id),false);assert.equal(JSON.stringify(own).includes('Private reporter detail'),false);
  });
  await t.test('original moderator and reporter cannot claim; concurrent claims have one winner',async()=>{
   assert.equal((await call(original,'/review-admin/'+id)).status,403);
   assert.equal((await call(reporter,'/review-admin/'+id)).status,403);
   assert.equal((await call(original,'/review-admin/'+id+'/claim',{})).status,403);
   assert.equal((await call(reporter,'/review-admin/'+id+'/claim',{})).status,403);
   const results=await Promise.all([call(reviewer,'/review-admin/'+id+'/claim',{}),call(second,'/review-admin/'+id+'/claim',{})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
   if(results[1].status===200){Object.assign(second,{winning:true});}else reviewer.winning=true;
  });
  const winner=reviewer.winning?reviewer:second;
  await t.test('reviewer asks for context; evidence submission advances timeline',async()=>{
   assert.equal((await call(winner,'/review-admin/'+id+'/respond',{outcome:'question',response:'Please explain the date and context of the campus activity.'})).status,200);
   assert.equal((await call(owner,'/reviews/'+id)).case.status,'awaiting_user');
   assert.equal((await call(owner,'/reviews/'+id+'/evidence',{statement:'The activity was advertised in our campus group on Monday.',attachments:[{data:'data:image/svg+xml;base64,PHN2Zz4='}]})).status,400);
   assert.equal((await call(owner,'/reviews/'+id+'/evidence',{statement:'The activity was advertised in our campus group on Monday.'})).status,200);
   assert.equal((await call(owner,'/reviews/'+id)).case.status,'in_review');
  });
  await t.test('reduction cannot lengthen a restriction, and restoration is recorded',async()=>{
   assert.equal((await call(winner,'/review-admin/'+id+'/respond',{outcome:'reduced',hours:200,response:'We reviewed the evidence and are reducing this restriction.'})).status,400);
   assert.equal((await call(winner,'/review-admin/'+id+'/respond',{outcome:'restored',response:'The conversation context supports your explanation. Access has been restored.'})).status,200);
   assert.equal((await call(owner,'/me')).user.restricted,false);assert.equal((await call(owner,'/reviews/'+id)).case.outcome,'restored');
  });
  await t.test('reopening requires an explicit request and is limited to once',async()=>{
   const body={statement:'I have additional context about the original decision and request a corrected explanation.'};
   assert.equal((await call(owner,'/reviews/'+id+'/evidence',body)).status,409);
   assert.equal((await call(owner,'/reviews/'+id+'/evidence',{...body,reopen:true})).status,200);
   assert.equal((await call(winner,'/review-admin/'+id+'/claim',{})).status,200);
   assert.equal((await call(winner,'/review-admin/'+id+'/respond',{outcome:'upheld',response:'The restored-access decision remains in place after considering your additional context.'})).status,200);
   assert.equal((await call(owner,'/reviews/'+id+'/evidence',{...body,reopen:true})).status,409);
  });
  await t.test('an old appeal cannot restore access over a newer restriction',async()=>{
   const restrict=()=>call(original,'/admin/users/'+owner.id+'/action',{action:'ban',policy:'Spam or misuse',summary:'A new independent incident requires a new account restriction.'});await restrict();Object.assign(owner,await db.user.findUnique({where:{id:owner.id}}));
   const a=(await call(owner,'/reviews')).decisions[0];const appeal=await call(owner,'/reviews',{actionId:a.id,statement:'Please reconsider this new restriction and review the context.'});await call(winner,'/review-admin/'+appeal.id+'/claim',{});
   await restrict();assert.equal((await call(winner,'/review-admin/'+appeal.id+'/respond',{outcome:'restored',response:'This old case should not lift a newer account restriction.'})).status,409);
   assert.equal((await db.user.findUnique({where:{id:owner.id}})).accountStatus,'banned');
  });
  await t.test('legacy restrictions receive a single appealable record and sign-out stays available',async()=>{
   await db.user.update({where:{id:outsider.id},data:{accountStatus:'banned'}});
   const results=await Promise.all([call(outsider,'/reviews'),call(outsider,'/reviews')]);assert.equal(results[0].decisions[0].id,results[1].decisions[0].id);
   assert.equal((await call(outsider,'/auth/logout',{})).status,200);
  });
 }finally{
  if(server){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}
  const ids=[campus?.id,other?.id].filter(Boolean);
  if(ids.length){await db.reviewEntry.deleteMany({where:{review:{action:{campusId:{in:ids}}}}});await db.accountReview.deleteMany({where:{action:{campusId:{in:ids}}}});await db.moderationAction.deleteMany({where:{campusId:{in:ids}}});await db.report.deleteMany({where:{campusId:{in:ids}}});await db.message.deleteMany({where:{room:{campusId:{in:ids}}}});await db.chatRoom.deleteMany({where:{campusId:{in:ids}}});await db.user.deleteMany({where:{campusId:{in:ids}}});await db.campus.deleteMany({where:{id:{in:ids}}});}
  await db.$disconnect();
 }
});
