const policy=require('./campus-policy');
function registerCampusManagement({app,prisma,requireAdmin,io}) {
 const wrap=fn=>async(req,res)=>{try{if(!req.isPlatformAdmin)return res.status(403).json({error:'Only platform administrators can change university access.'});await fn(req,res);}catch(err){res.status(err.status||(err.code==='P2002'?409:500)).json({error:err.status?err.message:err.code==='P2002'?'That domain or university identifier is already registered.':'Unable to update university settings. Please retry.'});}};
 const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
 const read=c=>({...c,accessPolicy:policy.policyFor(c)});
 async function validateOwnership(tx,data,id){const others=await tx.campus.findMany({where:id?{id:{not:id}}:{}});const claimed=new Set([data.emailDomain,...data.accessPolicy.domains.map(r=>r.domain)]);for(const c of others){if([c.emailDomain,...policy.policyFor(c).domains.map(r=>r.domain)].some(d=>claimed.has(d)))fail('An email domain is already assigned to another university, including retired universities.',409);}}
 const audit=async(tx,req,campus,old)=>tx.adminAuditEvent.create({data:{campusId:campus.id,actorId:req.user.id,operation:old?'university.policy.updated':'university.created',targetId:campus.id,outcome:'succeeded',statusCode:200,metadata:{before:old?{name:old.name,status:old.status,audience:old.audience,enrollmentOpen:old.enrollmentOpen,revision:old.policyRevision}:null,after:{name:campus.name,status:campus.status,audience:campus.audience,enrollmentOpen:campus.enrollmentOpen,domains:campus.accessPolicy.domains,rosterEntries:campus.accessPolicy.members.length,revision:campus.policyRevision},reason:req.body.reason.trim()}}});
 app.get('/api/admin/universities',requireAdmin,wrap(async(req,res)=>res.json({universities:(await prisma.campus.findMany({orderBy:{name:'asc'},include:{_count:{select:{users:true}}}})).map(read)})));
 app.post('/api/admin/universities/:id/preview',requireAdmin,wrap(async(req,res)=>{
  const c=await prisma.campus.findUnique({where:{id:req.params.id}});if(!c)fail('University not found.',404);const proposed={...c,...policy.normalize(req.body)};
  await validateOwnership(prisma,proposed,c.id);const users=await prisma.user.findMany({where:{campusId:c.id},select:{email:true,campusRole:true,campusEligible:true}});
  res.json({impact:policy.assess(proposed,users),test:req.body.testEmail?{role:policy.classify(proposed,req.body.testEmail),eligible:proposed.status==='active'&&policy.eligible(proposed,policy.classify(proposed,req.body.testEmail))}:null,revision:c.policyRevision});
 }));
 app.post('/api/admin/universities/test-email',requireAdmin,wrap(async(req,res)=>{const c=policy.normalize(req.body),role=policy.classify(c,req.body.testEmail);res.json({role,eligible:c.status==='active'&&policy.eligible(c,role)});}));
 app.post('/api/admin/universities',requireAdmin,wrap(async(req,res)=>{
  const data=policy.normalize(req.body),slug=String(req.body.slug||'').trim();if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>80)fail('Use a short, lowercase university identifier with hyphens.');
  if(data.status!=='paused')fail('Create the university paused. Review its rules before activation.');
  const emailDomain=policy.domain(req.body.emailDomain);if(!data.accessPolicy.domains.some(r=>r.domain===emailDomain))fail('The primary domain must appear in the domain rules.');
  if(typeof req.body.reason!=='string'||req.body.reason.trim().length<8||req.body.reason.length>500)fail('Add a brief administrative reason (8–500 characters).');
  const campus=await prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(710112026)`;await validateOwnership(tx,{...data,emailDomain});const c=await tx.campus.create({data:{...data,slug,emailDomain}});await tx.chatRoom.create({data:{campusId:c.id,kind:'campus'}});await audit(tx,req,c);return c;});res.status(201).json({university:read(campus)});
 }));
 app.put('/api/admin/universities/:id',requireAdmin,wrap(async(req,res)=>{
  const data=policy.normalize(req.body);if(typeof req.body.reason!=='string'||req.body.reason.trim().length<8||req.body.reason.length>500)fail('Add a brief administrative reason (8–500 characters).');
  const campus=await prisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(710112026)`;
   const old=await tx.campus.findUnique({where:{id:req.params.id}});if(!old)fail('University not found.',404);
   if(req.body.revision!==old.policyRevision)fail('Another administrator changed these settings. Reopen the university and review the latest version.',409);
   if(req.body.confirmName!==old.name)fail('Type the university’s current name to confirm this access change.');
   await validateOwnership(tx,{...data,emailDomain:old.emailDomain},old.id);
   const c=await tx.campus.update({where:{id:old.id},data:{...data,policyRevision:{increment:1}}});
   const users=await tx.user.findMany({where:{campusId:c.id},select:{id:true,email:true}});
   for(const role of ['student','faculty','unknown']){const ids=users.filter(u=>policy.classify(c,u.email)===role).map(u=>u.id);if(ids.length)await tx.user.updateMany({where:{id:{in:ids}},data:{campusRole:role,campusEligible:policy.eligible(c,role)}});}
   // Withdraw stale invitations when access or affiliation changes; preserve records and cases.
   const affected=users.filter(u=>!policy.eligible(c,policy.classify(c,u.email))||policy.classify(c,u.email)!==policy.classify(old,u.email)||c.status!=='active').map(u=>u.id);
   if(affected.length){await tx.connectionProfile.updateMany({where:{userId:{in:affected}},data:{availableUntil:null}});await tx.matchRequest.updateMany({where:{requesterId:{in:affected},status:'open'},data:{status:'cancelled',cancelledAt:new Date()}});await tx.matchApplication.updateMany({where:{applicantId:{in:affected},status:'pending'},data:{status:'withdrawn'}});await tx.match.updateMany({where:{status:'active',OR:[{userOneId:{in:affected}},{userTwoId:{in:affected}}]},data:{status:'cancelled'}});}
   await audit(tx,req,c,old);return c;
  },{timeout:20000});
  io.to('campus:'+campus.slug).emit('campus:policy-changed');io.in('campus:'+campus.slug).disconnectSockets(true);
  res.json({university:read(campus)});
 }));
}
module.exports={registerCampusManagement};
