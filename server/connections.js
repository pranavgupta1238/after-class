const policy = require('./connection-policy');
const meeting = require('./meeting-service');
const { eligibleForPairing } = require('./match-policy');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function registerConnections({app,prisma,auth,requireAdmin,io,closeMatch}) {
  const route=(method,path,guard,fn)=>app[method](path,guard,async(req,res)=>{
    res.set('Cache-Control','no-store');
    try { await fn(req,res); } catch(e) {
      const known=e.code?.startsWith('P');
      res.status(e.code==='P2002'?409:400).json({error:known?'This request could not be saved. Refresh and try again.':e.message||'Please try again.'});
    }
  });
  route('get','/api/connections/me',auth,async(req,res)=>{
    const profile=await prisma.connectionProfile.findUnique({where:{userId:req.user.id}});
    res.json({profile,options:{interests:policy.INTERESTS,prompts:policy.PROMPTS},datingLaunchReady:process.env.NODE_ENV!=='production'&&req.user.campusRole!=='faculty',datingEligible:policy.datingEligible(req.user,profile)});
  });
  route('patch','/api/connections/me',auth,async(req,res)=>{
    const profile=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${req.user.id}::uuid FOR UPDATE`;
      const current=await tx.connectionProfile.findUnique({where:{userId:req.user.id}});
      const data=policy.profileInput(req.body,current,req.user);
      if(!data.datingEnabled) {
        await tx.matchRequest.updateMany({where:{requesterId:req.user.id,connectionMode:'dating',status:'open'},data:{status:'cancelled',cancelledAt:new Date()}});
        await tx.matchApplication.updateMany({where:{applicantId:req.user.id,status:'pending',request:{connectionMode:'dating'}},data:{status:'withdrawn'}});
      }
      return tx.connectionProfile.upsert({where:{userId:req.user.id},create:{userId:req.user.id,...data},update:data});
    });
    res.json({profile,datingLaunchReady:process.env.NODE_ENV!=='production'&&req.user.campusRole!=='faculty',datingEligible:policy.datingEligible(req.user,profile)});
  });
  route('post','/api/connections/availability',auth,async(req,res)=>{
    if(!eligibleForPairing(req.user)) throw new Error('Complete account verification before sharing availability.');
    const {minutes,activity='coffee'}=req.body;
    if(![0,30,60,120].includes(minutes) || !['coffee','study','move','play'].includes(activity)) throw new Error('Choose an activity and availability window.');
    const data={availableUntil:minutes?new Date(Date.now()+minutes*60000):null,availabilityActivity:activity};
    const profile=await prisma.connectionProfile.upsert({where:{userId:req.user.id},create:{userId:req.user.id,...data},update:data});
    res.json({profile});
  });
  route('get','/api/connections/available',auth,async(req,res)=>{
    const excluded=await policy.blockedIds(prisma,req.user.id);
    const users=await prisma.user.findMany({where:{campusId:req.user.campusId,id:{notIn:[req.user.id,...excluded]},connectionProfile:{availableUntil:{gt:new Date()}}},include:{connectionProfile:true},orderBy:{id:'asc'},take:100});
    const viewer={...req.user,connectionProfile:await prisma.connectionProfile.findUnique({where:{userId:req.user.id}})};
    const ranked=require('./availability-ranking').rankAvailable(viewer,users.filter(u=>policy.canConnect(req.user,u)));
    res.json({people:ranked.map(({user:u,reasons,overlapMinutes,sharedInterests})=>({...policy.publicProfile(u),availableUntil:u.connectionProfile.availableUntil,activity:u.connectionProfile.availabilityActivity,reasons,overlapMinutes,sharedInterests}))});
  });
  route('get','/api/connections/profiles/:id',auth,async(req,res)=>{
    if(!UUID.test(req.params.id)) throw new Error('Profile unavailable.');
    const user=await prisma.user.findFirst({where:{id:req.params.id,campusId:req.user.campusId,accountStatus:'active'},include:{connectionProfile:true}});
    if(!user || await policy.isBlocked(prisma,req.user.id,user.id)) throw new Error('Profile unavailable.');
    const mode=req.query.mode==='dating'?'dating':'social';
    if(mode==='dating') {
      const viewer={...req.user,connectionProfile:await prisma.connectionProfile.findUnique({where:{userId:req.user.id}})};
      if(!policy.canConnect(viewer,user,'dating')) throw new Error('Profile unavailable for your dating preferences.');
    }
    res.json({profile:policy.publicProfile(user,mode)});
  });
  route('get','/api/connections/blocks',auth,async(req,res)=>{
    const blocks=await prisma.userBlock.findMany({where:{blockerId:req.user.id},include:{blocked:{select:{id:true,publicAlias:true}}},orderBy:{createdAt:'desc'}});
    res.json({blocks:blocks.map(b=>({id:b.blocked.id,alias:b.blocked.publicAlias,createdAt:b.createdAt}))});
  });
  route('post','/api/connections/blocks/:id',auth,async(req,res)=>{
    const target=req.params.id;
    if(!UUID.test(target) || target===req.user.id) throw new Error('Choose another student.');
    const other=await prisma.user.findFirst({where:{id:target,campusId:req.user.campusId}});
    if(!other) throw new Error('Student unavailable.');
    const matches=await prisma.$transaction(async tx=>{
      // Use the same participant lock order as application acceptance.
      const ids=[target,req.user.id].sort();
      for(const id of ids) await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
      await tx.userBlock.upsert({where:{blockerId_blockedId:{blockerId:req.user.id,blockedId:target}},create:{blockerId:req.user.id,blockedId:target},update:{}});
      const matches=await tx.match.findMany({where:{status:'active',OR:[{userOneId:req.user.id,userTwoId:target},{userOneId:target,userTwoId:req.user.id}]}});
      await tx.match.updateMany({where:{id:{in:matches.map(m=>m.id)}},data:{status:'cancelled',revision:{increment:1}}});
      await tx.matchRequest.updateMany({where:{id:{in:matches.map(m=>m.requestId)}},data:{status:'cancelled',cancelledAt:new Date()}});
      await tx.matchApplication.updateMany({where:{status:'pending',OR:[{applicantId:req.user.id,request:{requesterId:target}},{applicantId:target,request:{requesterId:req.user.id}}]},data:{status:'withdrawn'}});
      return matches;
    });
    for(const m of matches) closeMatch(m);
    for(const id of [target,req.user.id]) io.to('user:'+id).emit('connections:changed');
    res.json({ok:true});
  });
  route('delete','/api/connections/blocks/:id',auth,async(req,res)=>{
    if(!UUID.test(req.params.id)) throw new Error('Student unavailable.');
    await prisma.userBlock.deleteMany({where:{blockerId:req.user.id,blockedId:req.params.id}});res.json({ok:true});
  });
  route('get','/api/connections/reports',auth,async(req,res)=>{
    const reports=await prisma.report.findMany({where:{reporterId:req.user.id},select:{id:true,reason:true,status:true,createdAt:true,resolvedAt:true},orderBy:{createdAt:'desc'},take:100});res.json({reports});
  });
  route('get','/api/connections/appeals',auth,async(req,res)=>{
    const appeals=await prisma.verificationAppeal.findMany({where:{userId:req.user.id},select:{id:true,reason:true,status:true,response:true,createdAt:true,resolvedAt:true},orderBy:{createdAt:'desc'},take:20});res.json({appeals});
  });
  route('post','/api/connections/appeals',auth,async(req,res)=>{
    if(req.user.verificationStatus!=='rejected') throw new Error('Appeals are available after a verification is declined.');
    if(typeof req.body.reason!=='string' || req.body.reason.trim().length<10 || req.body.reason.length>1000) throw new Error('Explain your appeal in 10–1,000 characters.');
    const appeal=await prisma.verificationAppeal.create({data:{userId:req.user.id,reason:req.body.reason.trim()}});res.status(201).json({appeal});
  });
  route('get','/api/connections/admin/appeals',requireAdmin,async(req,res)=>{
    if(!req.user) throw new Error('Sign in as a moderator.');
    const appeals=await prisma.verificationAppeal.findMany({where:{user:{campusId:req.user.campusId}},include:{user:{select:{publicAlias:true,verificationStatus:true}}},orderBy:{createdAt:'desc'},take:100});res.json({appeals});
  });
  route('post','/api/connections/admin/appeals/:id',requireAdmin,async(req,res)=>{
    if(!req.user || !['resubmit','upheld'].includes(req.body.status) || typeof req.body.response!=='string' || req.body.response.trim().length<5 || req.body.response.length>1000) throw new Error('Choose a decision and add a short explanation.');
    const result=await prisma.verificationAppeal.updateMany({where:{id:req.params.id,status:'pending',user:{campusId:req.user.campusId},userId:{not:req.user.id}},data:{status:req.body.status,response:req.body.response.trim(),reviewerId:req.user.id,resolvedAt:new Date()}});
    if(!result.count) throw new Error('Appeal unavailable or already reviewed.');
    res.json({ok:true});
  });
  route('get','/api/connections/meetings/:id/feedback',auth,async(req,res)=>{
    const m=await prisma.match.findFirst({where:{id:req.params.id,OR:[{userOneId:req.user.id},{userTwoId:req.user.id}]}});if(!m) throw new Error('Meeting unavailable.');
    res.json({feedback:await prisma.meetingFeedback.findUnique({where:{matchId_userId:{matchId:m.id,userId:req.user.id}}})});
  });
  route('post','/api/connections/meetings/:id/feedback',auth,async(req,res)=>{await meeting.feedback(prisma,req.user,req.params.id,req.body);res.json({ok:true});});
  route('post','/api/connections/meetings/:id/action',auth,async(req,res)=>{
    if(!UUID.test(req.params.id)) throw new Error('Meeting unavailable.');
    const m=await meeting.act(prisma,req.user,req.params.id,req.body);
    if(m.status!=='active') closeMatch(m);
    for(const id of [m.userOneId,m.userTwoId]) io.to('user:'+id).emit('meeting:updated',{matchId:m.id});
    res.json({ok:true});
  });
  // Legacy URLs cannot bypass revision checks or meeting eligibility.
  for(const action of ['cancel','complete']) route('post',`/api/matches/:id/${action}`,auth,async(req,res)=>{
    const m=await meeting.act(prisma,req.user,req.params.id,{...req.body,action});closeMatch(m);res.json({ok:true});
  });
}
module.exports={registerConnections};
