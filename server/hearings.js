const {EventEmitter} = require('node:events');
const p = require('./review-policy');
const MINUTE = 60000;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const include = {slot:true,review:{include:{action:true}},participants:true};
const unavailable = u => !u || u.accountStatus==='banned' || (u.accountStatus==='suspended'&&!u.suspendedUntil) || u.suspendedUntil>new Date();

function registerHearings({app,prisma,sessionAuth,isAdminUser,limit}) {
 const changes = new EventEmitter(); changes.setMaxListeners(200);
 const signal = id => changes.emit(id);
 async function isJudge(user) { return !unavailable(user) && await isAdminUser(user); }
 async function independent(tx,review,user) {
  if(!p.independent(review.action,user.id) || await tx.report.findFirst({where:{reportedUserId:review.userId,reporterId:user.id},select:{id:true}})) p.fail('An uninvolved moderator must chair this hearing.',403);
 }
 async function load(id,user,tx=prisma) {
  if(!uuid(id))p.fail('Invalid hearing ID.');
  const h=await tx.hearing.findUnique({where:{id},include});
  if(!h || h.review.action.campusId!==user.campusId)p.fail('Hearing not found.',404);
  if(h.judgeId===user.id) { if(!await isJudge(user))p.fail('Moderator access required.',403);await independent(tx,h.review,user);return {h,role:'judge',member:null}; }
  const member=h.participants.find(x=>x.userId===user.id);
  if(!member)p.fail('Hearing not found.',404);
  return {h,role:member.role,member};
 }
 async function expire(h) {
  const now=new Date();
  const timed=h.status==='live'&&h.deadline<=now;
  const missed=h.status==='scheduled'&&h.slot?.endsAt<=now;
  if(!timed&&!missed)return;
  const updated=await prisma.hearing.updateMany({where:{id:h.id,status:h.status},data:{status:timed?'ended':'cancelled',endedAt:now,endReason:timed?'time_limit':'appointment_missed'}});
  if(updated.count)signal(h.id);
 }
 async function locked(id,user,fn) {
  return prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM hearings WHERE id=${id}::uuid FOR UPDATE`;
   const context=await load(id,user,tx);return fn(tx,context);
  },{timeout:20000});
 }
 function endpoint(method,path,handler) {
  app[method](path,sessionAuth,async(req,res)=>{
   res.set('Cache-Control','no-store');
   try {
    if(req.params.id&&!uuid(req.params.id))p.fail('Invalid ID.');
    if(method!=='get'&&!await limit('hearing:'+req.user.id,120,60000))p.fail('Please slow down and try again.',429);
    await handler(req,res);
   } catch(e) {const conflict=['P2002','P2034'].includes(e.code);if(!e.status&&!conflict)console.error('[Hearings]',e.code||e.message);res.status(e.status||(conflict?409:500)).json({error:e.status?e.message:conflict?'This appointment changed. Refresh and choose again.':'Unable to complete this hearing request. Please try again.'});}
  });
 }
 function summary(h,user) {
  const member=h.participants.find(m=>m.userId===user.id);
  return {id:h.id,reviewId:h.reviewId,status:h.status,startsAt:h.slot?.startsAt,endsAt:h.slot?.endsAt,role:h.judgeId===user.id?'judge':member?.role,response:member?.response,policy:h.review.action.policy||'Account review'};
 }
 endpoint('get','/api/hearings',async(req,res)=>{
  const staff=await isJudge(req.user);
  const rows=await prisma.hearing.findMany({where:{review:{action:{campusId:req.user.campusId}},OR:[{participants:{some:{userId:req.user.id}}},...(staff?[{judgeId:req.user.id}]:[])]},include:{slot:true,review:{select:{action:{select:{campusId:true,policy:true}}}},participants:true},orderBy:{createdAt:'desc'},take:100});
  await Promise.all(rows.map(expire));
  res.json({staff,hearings:rows.map(h=>{if(h.status==='live'&&h.deadline<=new Date())h.status='ended';if(h.status==='scheduled'&&h.slot?.endsAt<=new Date())h.status='cancelled';return summary(h,req.user);})});
 });
 endpoint('get','/api/hearings/slots',async(req,res)=>{
  const staff=await isJudge(req.user);
  let review;
  if(req.query.review){if(!uuid(req.query.review))p.fail('Invalid case.');review=await prisma.accountReview.findFirst({where:{id:req.query.review,userId:req.user.id},include:{action:true}});if(!review)p.fail('Case not found.',404);}
  if(!review&&!staff)p.fail('Select your appeal first.',403);
  const slots=await prisma.hearingSlot.findMany({where:{campusId:req.user.campusId,cancelledAt:null,startsAt:{gt:new Date()},...(review?{hearing:null}:{judgeId:req.user.id})},include:{hearing:{select:{id:true}}},orderBy:{startsAt:'asc'},take:120});
  const result=[];
  for(const s of slots){
   if(review){if(review.reviewerId&&review.reviewerId!==s.judgeId)continue;const judge=await prisma.user.findUnique({where:{id:s.judgeId}});if(!await isJudge(judge))continue;try{await independent(prisma,review,judge);}catch{continue;}}
   result.push({id:s.id,startsAt:s.startsAt,endsAt:s.endsAt,booked:Boolean(s.hearing)});
  }
  res.json({slots:result});
 });
 endpoint('post','/api/hearings/slots',async(req,res)=>{
  if(!await isJudge(req.user))p.fail('Moderator access required.',403);
  const start=new Date(req.body.startsAt),count=req.body.count??1;
  if(!Number.isFinite(start.getTime())||start<=new Date()||start>Date.now()+90*86400000||!Number.isInteger(count)||count<1||count>8)p.fail('Choose a future date within 90 days and 1–8 half-hour slots.');
  await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${req.user.id}))::text`;
   const end=new Date(start.getTime()+count*30*MINUTE);
   if(await tx.hearingSlot.findFirst({where:{judgeId:req.user.id,cancelledAt:null,startsAt:{lt:end},endsAt:{gt:start}}}))p.fail('This overlaps your existing availability.',409);
   await tx.hearingSlot.createMany({data:Array.from({length:count},(_,i)=>({id:require('node:crypto').randomUUID(),campusId:req.user.campusId,judgeId:req.user.id,startsAt:new Date(start.getTime()+i*30*MINUTE),endsAt:new Date(start.getTime()+(i+1)*30*MINUTE)}))});
  });res.status(201).json({ok:true});
 });
 endpoint('post','/api/hearings/slots/:id/withdraw',async(req,res)=>{
  if(!await isJudge(req.user))p.fail('Moderator access required.',403);
  await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM hearing_slots WHERE id=${req.params.id}::uuid FOR UPDATE`;
   const slot=await tx.hearingSlot.findUnique({where:{id:req.params.id},include:{hearing:true}});
   if(!slot||slot.judgeId!==req.user.id)p.fail('Slot not found.',404);
   if(slot.hearing)p.fail('Cancel the booked appointment before withdrawing this slot.',409);
   await tx.hearingSlot.update({where:{id:slot.id},data:{cancelledAt:new Date()}});
  });res.json({ok:true});
 });
 endpoint('post','/api/hearings/book',async(req,res)=>{
  const {reviewId,slotId}=req.body;if(!uuid(reviewId)||!uuid(slotId))p.fail('Select a case and a slot.');
  const id=await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM users WHERE id=${req.user.id}::uuid FOR UPDATE`;
   await tx.$queryRaw`SELECT id FROM account_reviews WHERE id=${reviewId}::uuid FOR UPDATE`;
   const review=await tx.accountReview.findFirst({where:{id:reviewId,userId:req.user.id},include:{action:true,hearing:true}});
   if(!review)p.fail('Case not found.',404);
   if(review.status==='resolved')p.fail('This case is resolved.',409);
   if(review.hearing&&(review.hearing.startedAt||review.hearing.status!=='cancelled'))p.fail('Your hearing for this decision is already booked or has been held.',409);
   await tx.$queryRaw`SELECT id FROM hearing_slots WHERE id=${slotId}::uuid FOR UPDATE`;
   const slot=await tx.hearingSlot.findUnique({where:{id:slotId},include:{hearing:true}});
   if(!slot||slot.campusId!==req.user.campusId||slot.cancelledAt||slot.startsAt<=new Date()||slot.hearing)p.fail('This slot is no longer available.',409);
   const judge=await tx.user.findUnique({where:{id:slot.judgeId}});if(!await isJudge(judge))p.fail('This reviewer is unavailable.',409);await independent(tx,review,judge);
   if(review.reviewerId&&review.reviewerId!==judge.id)p.fail('Choose a slot with your assigned reviewer.',409);
   const reporters=[...new Set([...(review.action.evidence?.reporterIds||[]),...(!review.action.evidence?(await tx.report.findMany({where:{reportedUserId:review.userId,campusId:req.user.campusId,createdAt:{lte:review.action.createdAt}},select:{reporterId:true},take:100})).map(r=>r.reporterId):[])])].filter(id=>id!==review.userId&&id!==judge.id);
   const validReporters=await tx.user.findMany({where:{id:{in:reporters},campusId:req.user.campusId},select:{id:true}});
   let hearing;
   if(review.hearing){hearing=await tx.hearing.update({where:{id:review.hearing.id},data:{slotId,judgeId:judge.id,status:'scheduled',endedAt:null,endReason:null}});await tx.hearingParticipant.updateMany({where:{hearingId:hearing.id},data:{response:'invited',joinedAt:null,lastSeenAt:null}});await tx.hearingParticipant.updateMany({where:{hearingId:hearing.id,role:'appellant'},data:{response:'accepted'}});}
   else hearing=await tx.hearing.create({data:{reviewId,slotId,judgeId:judge.id,participants:{create:[{userId:req.user.id,role:'appellant',label:'Account holder',response:'accepted'},...validReporters.map((r,i)=>({userId:r.id,role:'reporter',label:'Reporting participant '+(i+1)}))]}}});
   await tx.accountReview.update({where:{id:review.id},data:{reviewerId:judge.id,status:'in_review'}});
   await tx.hearingMessage.create({data:{hearingId:hearing.id,label:'Afterclass',body:'Appointment booked. Participation by reporting students is optional. A moderator will chair the conversation.'}});
   return hearing.id;
  },{timeout:20000});signal(id);res.status(201).json({id});
 });
 endpoint('get','/api/hearings/:id',async(req,res)=>{
  let context=await load(req.params.id,req.user);await expire(context.h);context=await load(req.params.id,req.user);
  const {h,role,member}=context,canRead=role==='judge'||role==='appellant'||member.response==='accepted';
  const messages=await prisma.hearingMessage.findMany({where:{hearingId:h.id,...(role==='judge'?{}:{OR:[{authorId:req.user.id},...(canRead?[{visibility:'shared'}]:[])]})},orderBy:{createdAt:'asc'},take:600});
  const caseEntries=role==='judge'?await prisma.reviewEntry.findMany({where:{reviewId:h.reviewId},orderBy:{createdAt:'asc'}}):[];
  const decision=await prisma.reviewEntry.findFirst({where:{reviewId:h.reviewId,kind:'decision'},orderBy:{createdAt:'desc'},select:{body:true,createdAt:true}});
  res.json({...summary(h,req.user),caseEvidence:role==='judge'?{reports:h.review.action.evidence?.reports||[],entries:caseEntries.map(x=>({kind:x.kind,body:x.body,attachments:x.attachments}))}:null,serverNow:new Date(),deadline:h.deadline,startedAt:h.startedAt,endReason:h.endReason,floor:h.floor,
   mine:member?{id:member.id,label:member.label,response:member.response,speakRequestedAt:member.speakRequestedAt,speakRequestKind:member.speakRequestKind}:null,
   judgeOnline:Boolean(h.judgeLastSeenAt&&Date.now()-h.judgeLastSeenAt.getTime()<45000),
   participants:canRead?h.participants.filter(m=>role==='judge'||m.role==='appellant'||m.response==='accepted').map(m=>({id:m.id,label:m.label,role:m.role,response:m.response,speakRequestedAt:h.status==='live'?m.speakRequestedAt:null,speakRequestKind:h.status==='live'?m.speakRequestKind:null,online:Boolean(m.lastSeenAt&&Date.now()-m.lastSeenAt.getTime()<45000)})):[],
   messages:messages.map(m=>({id:m.id,label:m.label,body:m.body,visibility:m.visibility,attachments:m.attachments,createdAt:m.createdAt,mine:m.authorId===req.user.id})),decision:h.review.status==='resolved'?{...decision,outcome:h.review.outcome}:null});
 });
 endpoint('post','/api/hearings/:id/rsvp',async(req,res)=>{
  const response=req.body.response;if(!['accepted','declined','written'].includes(response))p.fail('Choose a participation option.');
  await locked(req.params.id,req.user,async(tx,{h,role,member})=>{
   if(role!=='reporter')p.fail('This invitation is for a reporting participant.',403);
   if(!['scheduled','live'].includes(h.status))p.fail('This appointment has ended.',409);
   await tx.hearingParticipant.update({where:{id:member.id},data:{response,lastSeenAt:response==='accepted'?new Date():null,speakRequestedAt:null,speakRequestKind:null}});
   if(response!=='accepted'&&h.floor===member.id)await tx.hearing.update({where:{id:h.id},data:{floor:'paused'}});
  });signal(req.params.id);res.json({ok:true});
 });
 endpoint('post','/api/hearings/:id/presence',async(req,res)=>{
  const {h,member,role}=await load(req.params.id,req.user);
  if(role==='judge'&&['scheduled','live'].includes(h.status))await prisma.hearing.update({where:{id:h.id},data:{judgeLastSeenAt:new Date()}});
  if(member&&member.response==='accepted'&&['scheduled','live'].includes(h.status))await prisma.hearingParticipant.update({where:{id:member.id},data:{lastSeenAt:new Date(),...(!member.joinedAt?{joinedAt:new Date()}: {})}});
  res.json({ok:true});
 });
 endpoint('post','/api/hearings/:id/speak-request',async(req,res)=>{
  const kind=req.body.kind;if(!['objection','speak','withdraw'].includes(kind))p.fail('Choose objection or request to speak.');
  const {h}=await load(req.params.id,req.user);await expire(h);
  await locked(req.params.id,req.user,async(tx,{h,member})=>{
   if(h.status!=='live'||h.deadline<=new Date())p.fail('Speaking requests are available during the hearing.',409);
   if(!member||member.response!=='accepted')p.fail('Only participating students can request the floor.',403);
   if(kind==='withdraw'){await tx.hearingParticipant.update({where:{id:member.id},data:{speakRequestedAt:null,speakRequestKind:null}});return;}
   if(h.floor===member.id||(member.role==='appellant'&&h.floor==='appellant'))p.fail('You already have the floor.',409);
   if(member.speakRequestedAt)p.fail('Your request is already waiting for the moderator.',409);
   if(member.speakRequestedLastAt&&Date.now()-member.speakRequestedLastAt.getTime()<15000)p.fail('Please wait a moment before requesting again.',429);
   const now=new Date();await tx.hearingParticipant.update({where:{id:member.id},data:{speakRequestedAt:now,speakRequestedLastAt:now,speakRequestKind:kind,lastSeenAt:now}});
  });signal(req.params.id);res.status(201).json({ok:true});
 });
 endpoint('post','/api/hearings/:id/control',async(req,res)=>{
  const {h}=await load(req.params.id,req.user);await expire(h);
  await locked(req.params.id,req.user,async(tx,{h,role})=>{
   const action=req.body.action,now=new Date();
   if(action==='cancel'){
    if(!['judge','appellant'].includes(role))p.fail('Only the account holder or chair can cancel.',403);
    if(h.status!=='scheduled')p.fail('Only an upcoming appointment can be cancelled.',409);
    const reason=p.text(req.body.reason,10,500);
    await tx.hearing.update({where:{id:h.id},data:{status:'cancelled',slotId:null,endedAt:now,endReason:'cancelled'}});
    await tx.hearingMessage.create({data:{hearingId:h.id,label:'Afterclass',body:'Appointment cancelled: '+reason}});return;
   }
   if(role!=='judge')p.fail('Only the assigned moderator can control the hearing.',403);
   await tx.hearing.update({where:{id:h.id},data:{judgeLastSeenAt:now}});
   if(action==='start'){
    if(h.status!=='scheduled'||now<h.slot.startsAt||now>=h.slot.endsAt)p.fail('Start during the scheduled appointment window.',409);
    const appellant=h.participants.find(m=>m.role==='appellant');
    if(!appellant?.lastSeenAt||now-appellant.lastSeenAt>45000)p.fail('Wait for the account holder to join. Absence does not decide the appeal.',409);
    if(await tx.hearing.findFirst({where:{judgeId:req.user.id,status:'live',deadline:{gt:now},id:{not:h.id}}}))p.fail('Finish your current hearing first.',409);
    await tx.hearing.update({where:{id:h.id},data:{status:'live',startedAt:now,deadline:h.slot.endsAt,floor:'appellant'}});
    await tx.hearingMessage.create({data:{hearingId:h.id,label:'Afterclass',body:'The hearing is open. The moderator controls speaking turns. Private evidence goes only to the moderator.'}});
   }else if(action==='allow-request'||action==='dismiss-request'){
    if(h.status!=='live'||h.deadline<=now)p.fail('The hearing is not live.',409);
    const participant=h.participants.find(m=>m.id===req.body.participantId&&m.response==='accepted'&&m.speakRequestedAt);
    if(!participant)p.fail('This speaking request is no longer pending.',409);
    await tx.hearingParticipant.update({where:{id:participant.id},data:{speakRequestedAt:null,speakRequestKind:null}});
    if(action==='allow-request')await tx.hearing.update({where:{id:h.id},data:{floor:participant.role==='appellant'?'appellant':participant.id}});
    await tx.hearingMessage.create({data:{hearingId:h.id,label:'Afterclass',body:action==='allow-request'?'The moderator allowed '+participant.label+' to speak.':'The moderator deferred the speaking request from '+participant.label+'.'}});
   }else if(action==='floor'){
    if(h.status!=='live'||h.deadline<=now)p.fail('The hearing is not live.',409);
    const allowed=['paused','appellant',...h.participants.filter(m=>m.role==='reporter'&&m.response==='accepted').map(m=>m.id)];
    if(!allowed.includes(req.body.floor))p.fail('Select a confirmed participant or pause speaking.');
    await tx.hearing.update({where:{id:h.id},data:{floor:req.body.floor}});
    const selected=h.participants.find(m=>m.id===req.body.floor||(req.body.floor==='appellant'&&m.role==='appellant'));if(selected)await tx.hearingParticipant.update({where:{id:selected.id},data:{speakRequestedAt:null,speakRequestKind:null}});
   }else if(action==='end'){
    if(h.status!=='live')p.fail('The hearing is not live.',409);
    await tx.hearing.update({where:{id:h.id},data:{status:'ended',endedAt:now,endReason:'chair_closed'}});
    await tx.hearingMessage.create({data:{hearingId:h.id,label:'Afterclass',body:'The hearing has closed. The moderator will share a reasoned decision after reviewing the evidence.'}});
   }else p.fail('Unknown hearing control.');
  });signal(req.params.id);res.json({ok:true});
 });
 endpoint('post','/api/hearings/:id/messages',async(req,res)=>{
  const body=p.text(req.body.body,1,4000),attachments=p.attachments(req.body.attachments),visibility=req.body.visibility;
  if(!['shared','private'].includes(visibility))p.fail('Choose who can see your message.');
  const {h}=await load(req.params.id,req.user);await expire(h);
  await locked(req.params.id,req.user,async(tx,{h,role,member})=>{
   if(h.review.status==='resolved'||!['scheduled','live'].includes(h.status))p.fail('Submissions are closed for this appointment.',409);
   if(visibility==='shared'){
    if(h.status!=='live'||h.deadline<=new Date())p.fail('The hearing is not live.',409);
    if(role!=='judge'&&(member.response!=='accepted'||!(h.floor===member.id||(role==='appellant'&&h.floor==='appellant'))))p.fail('Please wait for the moderator to give you the floor.',403);
    if(attachments.length)p.fail('Submit images privately to the moderator.');
   }else if(role==='reporter'&&!['accepted','written'].includes(member.response))p.fail('Choose written evidence or accept the invitation first.',403);
   if(await tx.hearingMessage.count({where:{hearingId:h.id}})>=550)p.fail('The transcript limit has been reached. The chair can close the hearing.',409);
   if(attachments.length&&await tx.hearingMessage.count({where:{hearingId:h.id,authorId:req.user.id,visibility:'private'}})>=12)p.fail('Your evidence submission limit has been reached.',409);
   await tx.hearingMessage.create({data:{hearingId:h.id,authorId:req.user.id,label:role==='judge'?'Review moderator':member.label,visibility,body,attachments}});
  });signal(req.params.id);res.status(201).json({ok:true});
 });
 // Event notifications carry no case content. Every refresh rechecks current session and access.
 endpoint('get','/api/hearings/:id/events',async(req,res)=>{
  await load(req.params.id,req.user);
  res.set({'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
  const send=()=>res.write('data: changed\n\n');send();changes.on(req.params.id,send);
  const heartbeat=setInterval(()=>res.write(': ping\n\n'),25000);
  const close=()=>{clearInterval(heartbeat);changes.off(req.params.id,send);};req.on('close',close);
  // Reconnect periodically so authentication is rechecked even for idle streams.
  const expiry=setTimeout(()=>res.end(),120000);req.on('close',()=>clearTimeout(expiry));
 });
 return {signal};
}
module.exports={registerHearings};
