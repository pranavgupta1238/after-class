const p = require('./review-policy');
const includeCase = { action:true, entries:{orderBy:{createdAt:'asc'}} };
const restrictionTypes = ['suspension','ban'];
async function lockUser(tx,id){await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;}
// Called by both moderation entry points. The restriction and its evidence are atomic.
async function restrictAccount(prisma,{userId,actor,action,body,reportId}){
 if(!actor)p.fail('Sign in with your moderator account.',403);
 const policy=body.policy;
 if(!p.POLICIES.includes(policy))p.fail('Select the guideline involved.');
 const summary=p.text(body.summary,20,1000);
 const until=action==='suspension'?new Date(Date.now()+p.hours(body.hours??24)*3600000):null;
 return prisma.$transaction(async tx=>{
  await lockUser(tx,userId);
  const user=await tx.user.findUnique({where:{id:userId}});
  if(!user||user.campusId!==actor.campusId)p.fail('Student unavailable.',404);
  if(user.id===actor.id)p.fail('You cannot moderate your own account.',403);
  const reports=await tx.report.findMany({where:{reportedUserId:userId,campusId:actor.campusId,...(reportId?{id:reportId}:{status:'pending'})},include:{message:{select:{content:true,createdAt:true,senderAlias:true}}},take:100});
  const record=await tx.moderationAction.create({data:{userId,campusId:user.campusId,adminUserId:actor.id,type:action,reason:summary,publicSummary:summary,policy,endsAt:until,evidence:{reports:reports.map(r=>({id:r.id,reason:r.reason,detail:r.detail,message:r.message})),reporterIds:[...new Set(reports.map(r=>r.reporterId))]}}});
  await tx.user.update({where:{id:userId},data:{accountStatus:action==='ban'?'banned':'suspended',suspendedUntil:until,sessionVersion:{increment:1}}});
  await tx.report.updateMany({where:{id:{in:reports.map(r=>r.id)}},data:{status:'resolved',resolvedAt:new Date()}});
  return record;
 },{timeout:20000});
}
function registerAccountReviews({app,prisma,sessionAuth,auth,isAdminUser,io,limit,hearingService}){
 const guardAdmin=(req,res,next)=>auth(req,res,async()=>{
  try{if(!await isAdminUser(req.user))return res.status(403).json({error:'Moderator access required.'});next();}catch{res.status(503).json({error:'Please try again.'});}
 });
 const route=(method,path,guard,handler)=>app[method](path,guard,async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{
   if(method!=='get'&&!await limit('account-review:'+req.user.id,30,600000))p.fail('Please wait before making another change.',429);
   if(req.params.id&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id))p.fail('Invalid case ID.');
   if(path==='/api/reviews'&&method==='post'&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.body.actionId||''))p.fail('Select a valid decision.');
   await handler(req,res);
  }catch(e){const conflict=['P2002','P2034'].includes(e.code);if(!e.status&&!conflict)console.error('[Account review]',e.code||e.message);res.status(e.status||(conflict?409:500)).json({error:e.status?e.message:conflict?'This case changed. Refresh before trying again.':'The review could not be loaded or saved. Please try again.'});}
 });
 async function owned(id,user){const c=await prisma.accountReview.findFirst({where:{id,userId:user.id},include:includeCase});if(!c)p.fail('Case not found.',404);return c;}
 async function staffCase(tx,id,user){const c=await tx.accountReview.findFirst({where:{id,action:{campusId:user.campusId}},include:includeCase});if(!c)p.fail('Case not found.',404);return c;}
 async function independent(tx,c,user){
  if(!p.independent(c.action,user.id)||await tx.report.findFirst({where:{reportedUserId:c.userId,reporterId:user.id},select:{id:true}}))p.fail('A different, uninvolved moderator must review this case.',403);
 }
 async function change(id,user,fn){
  return prisma.$transaction(async tx=>{
   const base=await tx.accountReview.findUnique({where:{id}});if(!base)p.fail('Case not found.',404);
   await lockUser(tx,base.userId);
   return fn(tx);
  },{timeout:20000});
 }
 route('get','/api/reviews',sessionAuth,async(req,res)=>{
  // Give pre-existing restrictions a stable decision ID without inventing evidence.
  if(req.restricted)await prisma.$transaction(async tx=>{
   await lockUser(tx,req.user.id);
   const u=await tx.user.findUnique({where:{id:req.user.id}});
   if(u.accountStatus!=='banned'&&!(u.accountStatus==='suspended'&&!u.suspendedUntil)&&!(u.suspendedUntil>new Date()))return;
   const last=await tx.moderationAction.findFirst({where:{userId:u.id,type:{in:restrictionTypes},liftedAt:null},orderBy:{createdAt:'desc'}});
   if(!last)await tx.moderationAction.create({data:{userId:u.id,campusId:u.campusId,type:u.accountStatus==='banned'?'ban':'suspension',reason:'Legacy restriction; original decision record unavailable.',endsAt:u.suspendedUntil}});
  },{timeout:20000});
  const actions=await prisma.moderationAction.findMany({where:{userId:req.user.id,type:{in:restrictionTypes}},include:{review:{select:{id:true,status:true,outcome:true,createdAt:true}}},orderBy:{createdAt:'desc'},take:50});
  res.json({restricted:Boolean(req.restricted),decisions:actions.map(a=>({...p.publicAction(a),review:a.review})),policies:p.POLICIES});
 });
 route('post','/api/reviews',sessionAuth,async(req,res)=>{
  const statement=p.text(req.body.statement);const attachments=p.attachments(req.body.attachments);
  const result=await prisma.$transaction(async tx=>{
   await lockUser(tx,req.user.id);
   const action=await tx.moderationAction.findFirst({where:{id:req.body.actionId,userId:req.user.id,type:{in:restrictionTypes}}});if(!action)p.fail('Decision not found.',404);
   return tx.accountReview.create({data:{actionId:action.id,userId:req.user.id,entries:{create:{kind:'submitted',body:statement,attachments}}}});
  },{timeout:20000});res.status(201).json({id:result.id});
 });
 route('get','/api/reviews/:id',sessionAuth,async(req,res)=>res.json({case:p.publicReview(await owned(req.params.id,req.user))}));
 route('post','/api/reviews/:id/evidence',sessionAuth,async(req,res)=>{
  const body=p.text(req.body.statement),attachments=p.attachments(req.body.attachments);
  await change(req.params.id,req.user,async tx=>{
   const c=await tx.accountReview.findFirst({where:{id:req.params.id,userId:req.user.id},include:{entries:{select:{id:true}}}});if(!c)p.fail('Case not found.',404);
   if(c.entries.length>=40)p.fail('This case has reached its submission limit. Wait for the reviewer’s response.',409);
   const reopening=c.status==='resolved';
   if(reopening&&(!req.body.reopen||c.reopenedAt))p.fail('A resolved case can be reopened once with significant new evidence.',409);
   await tx.reviewEntry.create({data:{reviewId:c.id,kind:reopening?'reopened':'evidence',body,attachments}});
   await tx.accountReview.update({where:{id:c.id},data:reopening?{status:'submitted',outcome:null,resolvedAt:null,reopenedAt:new Date()}:{status:c.reviewerId?'in_review':'submitted'}});
  });res.json({ok:true});
 });
 route('get','/api/review-admin',guardAdmin,async(req,res)=>{
  const cases=await prisma.accountReview.findMany({where:{action:{campusId:req.user.campusId}},include:{action:true,user:{select:{publicAlias:true}}},orderBy:{createdAt:'desc'},take:100});
  res.json({cases:cases.map(c=>({id:c.id,status:c.status,outcome:c.outcome,createdAt:c.createdAt,alias:c.user.publicAlias,policy:c.action.policy,assignedToMe:c.reviewerId===req.user.id,assigned:Boolean(c.reviewerId)}))});
 });
 route('get','/api/review-admin/:id',guardAdmin,async(req,res)=>{
  const c=await staffCase(prisma,req.params.id,req.user);
  await independent(prisma,c,req.user);
  res.json({case:p.publicReview(c),evidence:c.action.evidence,eligible:true,assigned:Boolean(c.reviewerId),assignedToMe:c.reviewerId===req.user.id});
 });
 route('post','/api/review-admin/:id/claim',guardAdmin,async(req,res)=>{
  await change(req.params.id,req.user,async tx=>{
   const c=await staffCase(tx,req.params.id,req.user);await independent(tx,c,req.user);
   if(c.status==='resolved')p.fail('This case is already resolved.',409);
   if(c.reviewerId&&c.reviewerId!==req.user.id)p.fail('Another moderator has this case.',409);
   if(c.reviewerId===req.user.id&&c.status!=='submitted')return;
   await tx.accountReview.update({where:{id:c.id},data:{reviewerId:req.user.id,status:'in_review'}});
   await tx.reviewEntry.create({data:{reviewId:c.id,kind:'assigned',body:'An independent moderator has started your review.'}});
  });res.json({ok:true});
 });
 route('post','/api/review-admin/:id/respond',guardAdmin,async(req,res)=>{
  const body=p.text(req.body.response);const outcome=req.body.outcome;
  if(!['question','restored','reduced','upheld'].includes(outcome))p.fail('Choose an outcome.');
  await change(req.params.id,req.user,async tx=>{
   const c=await staffCase(tx,req.params.id,req.user);await independent(tx,c,req.user);
   if(c.reviewerId!==req.user.id||!['in_review','awaiting_user'].includes(c.status))p.fail('Claim this open case before responding.',409);
   if(outcome!=='question'){
    const hearing=await tx.hearing.findUnique({where:{reviewId:c.id}});
    if(hearing&&['scheduled','live'].includes(hearing.status))p.fail('Close or cancel the hearing before sharing a final decision.',409);
    const latest=await tx.moderationAction.findFirst({where:{userId:c.userId,type:{in:restrictionTypes}},orderBy:{createdAt:'desc'}});
    if(outcome!=='upheld'&&(latest?.id!==c.actionId||c.action.liftedAt))p.fail('A newer decision or restoration exists. Review the current restriction instead.',409);
    if(outcome==='restored'){
     await tx.user.update({where:{id:c.userId},data:{accountStatus:'active',suspendedUntil:null}});
     await tx.moderationAction.update({where:{id:c.actionId},data:{liftedAt:new Date()}});
    }
    if(outcome==='reduced'){
     const until=new Date(Date.now()+p.hours(req.body.hours)*3600000);
     if(c.action.endsAt&&until>=c.action.endsAt)p.fail('The reduced restriction must end earlier than the current one.');
     await tx.user.update({where:{id:c.userId},data:{accountStatus:'suspended',suspendedUntil:until}});
     await tx.moderationAction.update({where:{id:c.actionId},data:{endsAt:until}});
    }
   }
   await tx.accountReview.update({where:{id:c.id},data:outcome==='question'?{status:'awaiting_user'}:{status:'resolved',outcome,resolvedAt:new Date()}});
   await tx.reviewEntry.create({data:{reviewId:c.id,kind:outcome==='question'?'question':'decision',body}});
  });
  const hearing=await prisma.hearing.findUnique({where:{reviewId:req.params.id},select:{id:true}});if(hearing)hearingService?.signal(hearing.id);
  res.json({ok:true});
 });
}
module.exports={registerAccountReviews,restrictAccount};
