const {Prisma} = require('@prisma/client');
const DAY = 86400000;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const fail = (message,status=400) => { throw Object.assign(new Error(message),{status}); };
function percentile(values,p) { return values.length ? [...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*p)-1)] : null; }
function createOperations(prisma) {
 const startedAt = new Date(); let requests=[],auditFailures=0;
 function monitor(req,res,next) {
  const start=performance.now();
  res.once('finish',()=>{
   if(!req.originalUrl.startsWith('/api/') || req.originalUrl.startsWith('/api/admin/operations'))return;
   requests.push({at:Date.now(),ms:Math.round(performance.now()-start),status:res.statusCode});
   if(requests.length>10000)requests.splice(0,requests.length-10000);
  });next();
 }
 async function audit(req,res) {
  const route=String(req.route?.path||'unknown').slice(0,120);
  if(req.method==='GET' && /\/(analytics|operations)(\/|$)/.test(route))return;
  let target=uuid(req.params?.id)?req.params.id:null;
  if(route.includes('/moderators')){const email=req.params?.email||req.body?.email;if(typeof email==='string'){const u=await prisma.user.findFirst({where:{email:email.trim().toLowerCase(),campusId:req.adminCampusId},select:{id:true}});target=u?.id||null;}}
  if(req.params?.filename){const u=await prisma.user.findFirst({where:{verificationPhoto:req.params.filename,campusId:req.adminCampusId},select:{id:true}});target=u?.id||null;}
  const action=['warn','unban','dismiss','delete_message','timeout_user','ban_user'].includes(req.body?.action)?req.body.action:null;
  const metadata=JSON.stringify({...(['moderator','super_admin'].includes(req.body?.role)?{role:req.body.role}:{}),...(action?{action}:{}),...(req.query.scope==='all'?{scope:'network'}:{}),...(route.endsWith('/export')?{days:[7,30,90].includes(Number(req.body?.days))?Number(req.body.days):30}: {})});
  // Persist the attempt BEFORE allowing privileged reads or mutations. If this fails, the handler cannot run.
  const [entry]=await prisma.$queryRaw`INSERT INTO admin_audit_events(campus_id,actor_id,operation,target_id,outcome,status_code,metadata) VALUES(${req.adminCampusId}::uuid,${req.user.id}::uuid,${req.method+' '+route},${target}::uuid,'started',0,${metadata}::jsonb) RETURNING id`;
  res.once('finish',()=>prisma.$executeRaw`UPDATE admin_audit_events SET outcome=${res.statusCode<400?'succeeded':'rejected'},status_code=${res.statusCode} WHERE id=${entry.id}`.catch(()=>{auditFailures++;console.error('[Audit] Outcome update failed; attempt remains recorded.');}));
 }
 async function cohorts(campusId,window) {
  const scope=Prisma.sql`(${campusId}::uuid IS NULL OR u.campus_id=${campusId}::uuid)`;
  const [config]=await prisma.$queryRaw`SELECT started_at FROM admin_measurement_config WHERE id=1`;
  const activation=await prisma.$queryRaw(Prisma.sql`
   WITH cohort AS (SELECT u.id FROM users u WHERE ${scope} AND u.created_at BETWEEN ${window.start} AND ${window.end}), steps AS (
    SELECT c.id,
     EXISTS(SELECT 1 FROM match_requests r WHERE r.requester_id=c.id) OR EXISTS(SELECT 1 FROM match_applications a WHERE a.applicant_id=c.id) invited,
     EXISTS(SELECT 1 FROM matches m WHERE m.user_one_id=c.id OR m.user_two_id=c.id) matched,
     EXISTS(SELECT 1 FROM matches m WHERE (m.user_one_id=c.id OR m.user_two_id=c.id) AND m.confirmed_one_at IS NOT NULL AND m.confirmed_two_at IS NOT NULL AND m.status!='cancelled') confirmed,
     EXISTS(SELECT 1 FROM matches m WHERE (m.user_one_id=c.id OR m.user_two_id=c.id) AND m.status='completed') completed FROM cohort c)
   SELECT COUNT(*)::int accounts,COUNT(*) FILTER(WHERE invited)::int invited,COUNT(*) FILTER(WHERE matched)::int matched,COUNT(*) FILTER(WHERE confirmed)::int confirmed,COUNT(*) FILTER(WHERE completed)::int completed FROM steps`);
  // A cohort day is eligible only once its entire return day has elapsed. No historical zeroes before instrumentation.
  const retention=await prisma.$queryRaw(Prisma.sql`
   WITH cohort AS (SELECT u.id,(u.created_at AT TIME ZONE 'UTC')::date joined FROM users u WHERE ${scope} AND u.created_at>=${config.started_at} AND u.created_at>=${new Date(window.end-90*DAY)}),
   measured AS (SELECT c.*,n.offset_day,(c.joined+n.offset_day)<(${window.end} AT TIME ZONE 'UTC')::date mature,
    EXISTS(SELECT 1 FROM account_activity_days a WHERE a.user_id=c.id AND a.activity_date=c.joined+n.offset_day) returned FROM cohort c CROSS JOIN (VALUES(1),(7),(30)) n(offset_day))
   SELECT date_trunc('week',joined)::date cohort,offset_day,COUNT(*)::int accounts,COUNT(*) FILTER(WHERE mature)::int eligible,COUNT(*) FILTER(WHERE mature AND returned)::int returned FROM measured GROUP BY cohort,offset_day ORDER BY cohort DESC,offset_day`);
  return {trackingStartedAt:config.started_at,activation:activation[0],retention:retention.map(r=>({...r,cohort:r.cohort.toISOString().slice(0,10)}))};
 }
 function register({app,auth,requireAdmin,isAdminUser,redis}) {
  const route=(method,path,handler)=>app[method](path,requireAdmin,async(req,res)=>{try{await handler(req,res);}catch(err){res.status(err.status||503).json({error:err.status?err.message:'Operations are temporarily unavailable. Please retry.'});}});
  const scope=req=>{if(req.query.scope==='all'){if(!req.isPlatformAdmin)fail('Platform administrator access required.',403);return null;}return req.adminCampusId;};
  app.post('/api/activity',auth,async(req,res)=>{
   try{await prisma.$executeRaw`INSERT INTO account_activity_days(user_id,campus_id) VALUES(${req.user.id}::uuid,${req.user.campusId}::uuid) ON CONFLICT DO NOTHING`;res.json({ok:true});}
   catch{res.status(503).json({error:'Activity could not be recorded.'});}
  });
  route('get','/api/admin/operations/cohorts',async(req,res)=>res.json(await cohorts(scope(req),require('./admin-analytics').analyticsWindow(req.query.days))));
  route('post','/api/admin/operations/export',async(req,res)=>{
   if(req.body.scope==='all'&&!req.isPlatformAdmin)fail('Platform administrator access required.',403);
   res.json({ok:true});
  });
  route('get','/api/admin/operations/audit',async(req,res)=>{
   const campus=scope(req),before=String(req.query.before||'9223372036854775807');if(!/^\d{1,19}$/.test(before)||BigInt(before)>9223372036854775807n)fail('Invalid page.');
   const rows=await prisma.$queryRaw`SELECT a.id::text,a.occurred_at,a.operation,a.target_id,a.outcome,a.status_code,a.metadata,u.public_alias actor,c.name college FROM admin_audit_events a LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN campuses c ON c.id=a.campus_id WHERE (${campus}::uuid IS NULL OR a.campus_id=${campus}::uuid) AND a.id<${before}::bigint ORDER BY a.id DESC LIMIT 51`;
   res.json({events:rows.slice(0,50),next:rows.length>50?rows[49].id:null});
  });
  route('get','/api/admin/operations/cases',async(req,res)=>{
   const campus=scope(req);
   const cases=await prisma.$queryRaw`SELECT r.id,r.campus_id,r.reason,r.status,r.created_at,c.name college,u.public_alias account,a.assignee_id,v.public_alias assignee,a.updated_at FROM reports r JOIN campuses c ON c.id=r.campus_id JOIN users u ON u.id=r.reported_user_id LEFT JOIN report_assignments a ON a.report_id=r.id LEFT JOIN users v ON v.id=a.assignee_id WHERE (${campus}::uuid IS NULL OR r.campus_id=${campus}::uuid) AND r.status IN ('pending','reviewing') ORDER BY r.created_at ASC LIMIT 100`;
   const grants=await prisma.$queryRaw`SELECT email FROM staff_access WHERE revoked_at IS NULL`;
   const staffEmails=grants.map(x=>x.email);
   const staff=await prisma.user.findMany({where:{email:{in:staffEmails},...(campus?{campusId:campus}:{}),accountStatus:'active'},select:{id:true,publicAlias:true,campusId:true}});
   const eligible=[];for(const u of staff){const full=await prisma.user.findUnique({where:{id:u.id}});if(await isAdminUser(full))eligible.push(u);}
   res.json({cases,staff:eligible,limit:100});
  });
  route('post','/api/admin/operations/cases/:id/assign',async(req,res)=>{
   if(!uuid(req.params.id)||(req.body.assigneeId!==null&&!uuid(req.body.assigneeId)))fail('Select a valid report and reviewer.');
   if(!Object.hasOwn(req.body,'expectedAssigneeId')||(req.body.expectedAssigneeId!==null&&!uuid(req.body.expectedAssigneeId)))fail('Refresh the assignment before saving.');
   const owner=req.body.assigneeId;
   if(owner){const u=await prisma.user.findUnique({where:{id:owner}});if(!u||u.campusId!==req.adminCampusId||u.accountStatus!=='active'||!await isAdminUser(u))fail('Choose an active reviewer from this college.');}
   await prisma.$transaction(async tx=>{
    const [report]=await tx.$queryRaw`SELECT * FROM reports WHERE id=${req.params.id}::uuid AND campus_id=${req.adminCampusId}::uuid FOR UPDATE`;
    if(!report)fail('Report not found.',404);
    if(!['pending','reviewing'].includes(report.status))fail('This report is already closed.',409);
    if(owner===report.reporter_id||owner===report.reported_user_id)fail('Choose a reviewer who is not involved in this report.');
    const [previous]=await tx.$queryRaw`SELECT assignee_id FROM report_assignments WHERE report_id=${report.id}::uuid`;
    if((previous?.assignee_id||null)!==req.body.expectedAssigneeId)fail('Another reviewer changed this assignment. Refresh first.',409);
    await tx.$executeRaw`INSERT INTO report_assignments(report_id,assignee_id,assigned_by) VALUES(${report.id}::uuid,${owner}::uuid,${req.user.id}::uuid) ON CONFLICT(report_id) DO UPDATE SET assignee_id=EXCLUDED.assignee_id,assigned_by=EXCLUDED.assigned_by,updated_at=now()`;
    await tx.$executeRaw`INSERT INTO admin_audit_events(campus_id,actor_id,operation,target_id,outcome,status_code,metadata) VALUES(${req.adminCampusId}::uuid,${req.user.id}::uuid,'case.assignment',${report.id}::uuid,'succeeded',200,${JSON.stringify({from:previous?.assignee_id||null,to:owner})}::jsonb)`;
   });res.json({ok:true});
  });
  route('get','/api/admin/operations/service',async(req,res)=>{
   if(!req.isPlatformAdmin)fail('Platform administrator access required.',403);
   const now=Date.now();requests=requests.filter(r=>r.at>now-15*60000);const errors=requests.filter(r=>r.status>=500).length;
   const dbStart=performance.now();let database='unavailable';try{await prisma.$queryRaw`SELECT 1`;database='connected';}catch{}
   const databaseMs=Math.round(performance.now()-dbStart);let cache='unavailable';try{cache=await redis.ping();}catch{}
   const budgets=await prisma.$queryRaw`SELECT service,used::float8,capacity::float8,unit,measured_at FROM service_budget_snapshots ORDER BY service`;
   res.json({startedAt,windowMinutes:15,samples:requests.length,errors,errorRate:requests.length?100*errors/requests.length:null,p95:percentile(requests.map(r=>r.ms),.95),auditFailures,database,databaseMs,cache,budgets,at:new Date()});
  });
  route('post','/api/admin/operations/budget',async(req,res)=>{
   if(!req.isPlatformAdmin)fail('Platform administrator access required.',403);
   const {service,used,capacity,unit,measuredAt}=req.body;const date=new Date(measuredAt);
   if(!['supabase','upstash','email','hosting'].includes(service)||typeof used!=='number'||typeof capacity!=='number'||!Number.isFinite(used)||!Number.isFinite(capacity)||used<0||capacity<=0||typeof unit!=='string'||!unit.trim()||unit.length>40||!Number.isFinite(date.getTime())||date>Date.now())fail('Enter a service, valid usage, positive limit, unit, and past measurement date.');
   await prisma.$executeRaw`INSERT INTO service_budget_snapshots(service,used,capacity,unit,measured_at,updated_by) VALUES(${service},${used},${capacity},${unit.trim()},${date},${req.user.id}::uuid) ON CONFLICT(service) DO UPDATE SET used=EXCLUDED.used,capacity=EXCLUDED.capacity,unit=EXCLUDED.unit,measured_at=EXCLUDED.measured_at,updated_by=EXCLUDED.updated_by`;
   res.json({ok:true});
  });
 }
 return {monitor,audit,register,cohorts};
}
module.exports={createOperations,percentile};
