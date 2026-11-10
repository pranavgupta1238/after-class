const crypto=require('crypto');
const PILOT_TASKS=[
 ['safety','Assign an on-call safety reviewer'],['hosts','Recruit consenting campus hosts'],
 ['venues','Confirm public meeting places'],['schedule','Agree recurring activity windows'],
 ['recovery','Complete a backup restoration drill'],['feedback','Schedule student feedback interviews'],
 ['support','Publish a working support contact'],['age','Keep dating closed until age assurance is ready']
];
function createReliability({prisma,redis}){
 const instance=crypto.randomUUID();let requests=0,errors=0,running=false;
 function monitor(req,res,next){if(req.path.startsWith('/api/'))res.once('finish',()=>{requests++;if(res.statusCode>=500)errors++;});next();}
 async function alert(key,active,summary,severity='warning'){
  if(active)await prisma.$executeRaw`INSERT INTO operational_alerts(alert_key,severity,summary) VALUES(${key},${severity},${summary}) ON CONFLICT(alert_key) DO UPDATE SET last_seen=now(),summary=EXCLUDED.summary,severity=EXCLUDED.severity,first_seen=CASE WHEN operational_alerts.resolved_at IS NOT NULL THEN now() ELSE operational_alerts.first_seen END,acknowledged_by=CASE WHEN operational_alerts.resolved_at IS NOT NULL THEN NULL ELSE operational_alerts.acknowledged_by END,acknowledged_at=CASE WHEN operational_alerts.resolved_at IS NOT NULL THEN NULL ELSE operational_alerts.acknowledged_at END,resolved_at=NULL`;
  else await prisma.$executeRaw`UPDATE operational_alerts SET resolved_at=now() WHERE alert_key=${key} AND resolved_at IS NULL`;
 }
 async function sample(){if(running)return;running=true;const n=requests,e=errors;requests=0;errors=0;
  try{
   const start=performance.now();await prisma.$queryRaw`SELECT 1`;const ms=Math.round(performance.now()-start),cache=await redis.ping()==='PONG';
   await prisma.$executeRaw`INSERT INTO service_observations(instance_id,database_ms,cache_ok,requests,errors) VALUES(${instance},${ms},${cache},${n},${e})`;
   await alert('redis',Boolean(process.env.REDIS_URL)&&!cache,'Redis is unavailable. Production rate limits and OTP redemption fail closed.','critical');
   await alert('database-latency',ms>1500,'Database probe exceeded 1.5 seconds.');
   const [window]=await prisma.$queryRaw`SELECT COALESCE(SUM(requests),0)::int requests,COALESCE(SUM(errors),0)::int errors FROM service_observations WHERE observed_at>now()-interval '5 minutes'`;
   await alert('api-errors',window.errors>=5&&window.errors/Math.max(1,window.requests)>.05,'More than 5% of API requests failed in the last five minutes (at least five errors).','critical');
   const budgets=await prisma.$queryRaw`SELECT * FROM service_budget_snapshots`;
   for(const b of budgets){await alert('quota:'+b.service,Number(b.used)/Number(b.capacity)>=.8,`${b.service} recorded usage is at least 80% of the supplied limit.`);await alert('stale-quota:'+b.service,Date.now()-b.measured_at>86400000,`${b.service} usage snapshot is over 24 hours old.`);}
   await prisma.$executeRaw`DELETE FROM service_observations WHERE observed_at<now()-interval '30 days'`;
  }catch{console.error('[Operations] Health sample failed. Use the independent uptime probe; database outages cannot be recorded in this database.');}
  finally{running=false;}
 }
 function register(app,requireAdmin){
  function route(method,path,fn){app[method](path,requireAdmin,async(req,res)=>{try{await fn(req,res);}catch{res.status(503).json({error:'Operations data is unavailable. Please retry.'});}});}
  route('get','/api/admin/readiness',async(req,res)=>{
   const tasks=await prisma.$queryRaw`SELECT task_key,completed,note,updated_at FROM campus_pilot_tasks WHERE campus_id=${req.adminCampusId}::uuid`;
   res.json({tasks:PILOT_TASKS.map(([key,title])=>({key,title,...tasks.find(t=>t.task_key===key)}))});
  });
  route('post','/api/admin/readiness',async(req,res)=>{
   const {key,completed,note}=req.body;
   if(!PILOT_TASKS.some(t=>t[0]===key)||typeof completed!=='boolean'||typeof note!=='string'||note.length>600)return res.status(400).json({error:'Choose a checklist item and a note under 600 characters.'});
   await prisma.$executeRaw`INSERT INTO campus_pilot_tasks(campus_id,task_key,completed,note,updated_by) VALUES(${req.adminCampusId}::uuid,${key},${completed},${note.trim()},${req.user.id}::uuid) ON CONFLICT(campus_id,task_key) DO UPDATE SET completed=EXCLUDED.completed,note=EXCLUDED.note,updated_by=EXCLUDED.updated_by,updated_at=now()`;
   res.json({ok:true});
  });
  route('get','/api/admin/reliability',async(req,res)=>{
   if(!req.isPlatformAdmin)return res.status(403).json({error:'Platform administrator access required.'});
   const alerts=await prisma.$queryRaw`SELECT id::text,alert_key,severity,summary,first_seen,last_seen,resolved_at,acknowledged_at FROM operational_alerts ORDER BY resolved_at NULLS FIRST,last_seen DESC LIMIT 100`;
   const history=await prisma.$queryRaw`SELECT date_trunc('hour',observed_at) AS hour,SUM(requests)::int requests,SUM(errors)::int errors,ROUND(AVG(database_ms))::int database_ms,COUNT(*)::int samples FROM service_observations WHERE observed_at>now()-interval '24 hours' GROUP BY 1 ORDER BY 1`;
   const [heartbeat]=await prisma.$queryRaw`SELECT MAX(observed_at) last_sample FROM service_observations`;
   res.json({alerts,history,lastSample:heartbeat.last_sample,retentionDays:30});
  });
  route('post','/api/admin/reliability/:id/acknowledge',async(req,res)=>{
   if(!req.isPlatformAdmin)return res.status(403).json({error:'Platform administrator access required.'});
   if(!/^\d{1,15}$/.test(req.params.id))return res.status(400).json({error:'Invalid alert.'});
   await prisma.$executeRaw`UPDATE operational_alerts SET acknowledged_by=${req.user.id}::uuid,acknowledged_at=now() WHERE id=${BigInt(req.params.id)} AND resolved_at IS NULL`;res.json({ok:true});
  });
 }
 return {monitor,register,start(){sample();const timer=setInterval(sample,60000);timer.unref();return timer;}};
}
module.exports={createReliability,PILOT_TASKS};
