const crypto = require('crypto');
const webpush = require('web-push');
const {accessReason} = require('./campus-policy');
const {isBlocked} = require('./connection-policy');
const DEFAULTS = {enabled:false,messages:true,plans:true,quiet_start:null,quiet_end:null,timezone:'Asia/Kolkata'};
const hosts = new Set(['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com','wns2-par02p.notify.windows.com']);
function validSubscription(value) {
 try {
  const url = new URL(value.endpoint);
  if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash||!hosts.has(url.hostname)||value.endpoint.length>2048) return false;
  const keys=value.keys;
  return /^[A-Za-z0-9_-]+={0,2}$/.test(keys.p256dh)&&Buffer.from(keys.p256dh,'base64url').length===65&&/^[A-Za-z0-9_-]+={0,2}$/.test(keys.auth)&&Buffer.from(keys.auth,'base64url').length===16;
 } catch {return false;}
}
function preferences(input) {
 for(const key of ['enabled','messages','plans'])if(typeof input[key]!=='boolean')throw new Error('Choose your notification preferences.');
 const {quiet_start:start,quiet_end:end,timezone}=input;
 if(!((start===null&&end===null)||(Number.isInteger(start)&&Number.isInteger(end)&&start>=0&&start<1440&&end>=0&&end<1440&&start!==end)))throw new Error('Choose different start and end times for quiet hours.');
 if(typeof timezone!=='string'||timezone.length>80)throw new Error('Choose a valid time zone.');
 try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format();}catch{throw new Error('Choose a valid time zone.');}
 return {enabled:input.enabled,messages:input.messages,plans:input.plans,quiet_start:start,quiet_end:end,timezone};
}
function inQuietHours(p,now=new Date()) {
 if(p.quiet_start===null)return false;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:p.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const minute=Number(parts.find(x=>x.type==='hour').value)*60+Number(parts.find(x=>x.type==='minute').value);
 return p.quiet_start<p.quiet_end?minute>=p.quiet_start&&minute<p.quiet_end:minute>=p.quiet_start||minute<p.quiet_end;
}
function createNotifications({prisma,redis,reviewMode=false,send,config=process.env}) {
 const ready=!reviewMode&&!!(config.VAPID_PUBLIC_KEY&&config.VAPID_PRIVATE_KEY&&config.VAPID_SUBJECT);
 let running=false;
 const dispatch=send||((subscription,payload)=>webpush.sendNotification(subscription,payload,{TTL:300,timeout:6000,vapidDetails:{subject:config.VAPID_SUBJECT,publicKey:config.VAPID_PUBLIC_KEY,privateKey:config.VAPID_PRIVATE_KEY}}));
 async function allowed(job) {
  const user=await prisma.user.findUnique({where:{id:job.user_id},include:{campus:true}});
  if(!user||!user.isVerified||user.sessionVersion!==job.session_version||user.accountStatus!=='active'||accessReason(user))return 'account_unavailable';
  if(!job.enabled||!(job.kind==='message'?job.messages:job.plans))return 'disabled';
  if(job.actor_id){
   const actor=await prisma.user.findUnique({where:{id:job.actor_id},include:{campus:true}});
   if(!actor||!actor.isVerified||actor.accountStatus!=='active'||accessReason(actor)||actor.campusId!==user.campusId||await isBlocked(prisma,user.id,actor.id))return 'connection_unavailable';
  }
  if(job.kind==='invitation'){
   const application=await prisma.matchApplication.findUnique({where:{id:job.source_id},include:{request:true}});
   if(!application||application.status!=='pending'||application.request.status!=='open'||application.request.requesterId!==user.id||application.request.expiresAt<=new Date())return 'expired_invitation';
  }else if(job.source_id){
   const match=await prisma.match.findUnique({where:{id:job.source_id}});
   if(!match||![match.userOneId,match.userTwoId].includes(user.id)||(job.kind!=='meeting'&&match.status!=='active')||(job.kind==='reminder'&&(!match.scheduledAt||match.scheduledAt<=new Date()||match.scheduledAt>Date.now()+30*60000||!match.confirmedOneAt||!match.confirmedTwoAt)))return 'expired_connection';
  }
  return null;
 }
 async function tick() {
  if(running||(!ready&&!send))return;running=true;
  try {
   // Durable reminder key includes the confirmed time, so reschedules get their own reminder.
   await prisma.$executeRaw`INSERT INTO notification_deliveries(device_id,event_key,kind,source_id,actor_id,expires_at)
    SELECT d.id,'reminder:'||m.id||':'||m.scheduled_at,'reminder',m.id,CASE WHEN m.user_one_id=d.user_id THEN m.user_two_id ELSE m.user_one_id END,m.scheduled_at
    FROM matches m JOIN push_devices d ON d.user_id IN(m.user_one_id,m.user_two_id) JOIN notification_preferences p ON p.user_id=d.user_id
    WHERE m.status='active' AND m.confirmed_one_at IS NOT NULL AND m.confirmed_two_at IS NOT NULL AND m.scheduled_at>now() AND m.scheduled_at<=now()+interval '30 minutes' AND p.enabled AND p.plans ON CONFLICT DO NOTHING`;
   const jobs=await prisma.$queryRaw`WITH due AS (
    SELECT id FROM notification_deliveries WHERE (status='pending' OR status='sending') AND next_at<=now() ORDER BY next_at LIMIT 10 FOR UPDATE SKIP LOCKED
   ), claimed AS (UPDATE notification_deliveries n SET status='sending',next_at=now()+interval '5 minutes',attempts=attempts+1 FROM due WHERE n.id=due.id RETURNING n.*)
   SELECT n.*,d.user_id,d.subscription,d.session_version,p.enabled,p.messages,p.plans,p.quiet_start,p.quiet_end,p.timezone
   FROM claimed n JOIN push_devices d ON d.id=n.device_id LEFT JOIN notification_preferences p ON p.user_id=d.user_id`;
   for(const job of jobs){
    let status='suppressed',reason=null;
    try {
     reason=job.attempts>4?'attempt_limit':job.expires_at<=new Date()?'expired':await allowed(job);
     if(reason==='attempt_limit')status='failed';
     if(!reason&&inQuietHours(job)){
      await prisma.$executeRaw`UPDATE notification_deliveries SET status='pending',attempts=attempts-1,next_at=now()+interval '5 minutes',reason='quiet_hours' WHERE id=${job.id}`;continue;
     }
     if(!reason){
      if(!validSubscription(job.subscription)){reason='invalid_endpoint';status='failed';}
      else {
       const text={message:'You have a new private message.',invitation:'Someone is interested in your plan.',match:'Your invitation was accepted.',meeting:'A meeting has been updated.',reminder:'Your confirmed meeting starts within 30 minutes.',test:'Notifications are ready on this device.'}[job.kind];
       await dispatch(job.subscription,JSON.stringify({title:'Afterclass',body:text,url:'/inbox',tag:crypto.createHash('sha256').update(job.event_key).digest('hex').slice(0,24)}));status='accepted';
      }
     }
    }catch(err){
     const code=Number(err.statusCode);
     if([404,410].includes(code)){await prisma.$executeRaw`DELETE FROM push_devices WHERE id=${job.device_id}::uuid`;continue;}
     if((!code||code===429||code>=500)&&job.attempts<4){await prisma.$executeRaw`UPDATE notification_deliveries SET status='pending',reason='retry',next_at=now()+(${Math.min(900,30*2**job.attempts)}*interval '1 second') WHERE id=${job.id}`;continue;}
     status='failed';reason='provider_rejected';
    }
    await prisma.$executeRaw`UPDATE notification_deliveries SET status=${status},reason=${reason},finished_at=now() WHERE id=${job.id}`;
   }
   await prisma.$executeRaw`DELETE FROM notification_deliveries WHERE created_at<now()-interval '30 days'`;
  }catch{console.error('[Push] Delivery worker unavailable; pending notifications remain queued.');}
  finally{running=false;}
 }
 function register(app,auth,sessionAuth){
  const route=(method,path,handler,guard=auth)=>app[method](path,guard,async(req,res)=>{res.set('Cache-Control','no-store');try{await handler(req,res);}catch(err){res.status(err.status||503).json({error:err.status?err.message:'Notification settings are temporarily unavailable.'});}});
  route('get','/api/notifications',async(req,res)=>{
   const [p]=await prisma.$queryRaw`SELECT enabled,messages,plans,quiet_start,quiet_end,timezone FROM notification_preferences WHERE user_id=${req.user.id}::uuid`;
   const [d]=await prisma.$queryRaw`SELECT COUNT(*)::int count FROM push_devices WHERE user_id=${req.user.id}::uuid AND session_version=${req.user.sessionVersion}`;
   res.json({configured:ready,reviewMode,publicKey:ready?config.VAPID_PUBLIC_KEY:null,preferences:p||DEFAULTS,devices:d.count});
  });
  route('put','/api/notifications/preferences',async(req,res)=>{
   let p;try{p=preferences(req.body);}catch(err){return res.status(400).json({error:err.message});}
   if(p.enabled&&!ready)return res.status(503).json({error:reviewMode?'Background delivery is disabled in the isolated demo.':'Background delivery has not been configured yet.'});
   await prisma.$executeRaw`INSERT INTO notification_preferences(user_id,enabled,messages,plans,quiet_start,quiet_end,timezone) VALUES(${req.user.id}::uuid,${p.enabled},${p.messages},${p.plans},${p.quiet_start},${p.quiet_end},${p.timezone}) ON CONFLICT(user_id) DO UPDATE SET enabled=EXCLUDED.enabled,messages=EXCLUDED.messages,plans=EXCLUDED.plans,quiet_start=EXCLUDED.quiet_start,quiet_end=EXCLUDED.quiet_end,timezone=EXCLUDED.timezone,updated_at=now()`;
   res.json({ok:true,preferences:p});
  });
  route('post','/api/notifications/devices',async(req,res)=>{
   if(!ready)return res.status(503).json({error:'Background delivery is not enabled on this server.'});
   if(!validSubscription(req.body))return res.status(400).json({error:'This browser’s push provider is not supported or its subscription is invalid.'});
   if(!await redis.limit('push-enrol:'+req.user.id,10,3600000))return res.status(429).json({error:'Please try again later.'});
   const subscription={endpoint:req.body.endpoint,keys:{p256dh:req.body.keys.p256dh,auth:req.body.keys.auth}};
   await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM users WHERE id=${req.user.id}::uuid FOR UPDATE`;
    const [count]=await tx.$queryRaw`SELECT COUNT(*)::int n FROM push_devices WHERE user_id=${req.user.id}::uuid AND endpoint<>${subscription.endpoint}`;
    if(count.n>=10)throw Object.assign(new Error('Remove an old device before adding another.'),{status:409});
    // Shared browser: move the endpoint to the new owner with a fresh row; old deliveries cascade away.
    await tx.$executeRaw`DELETE FROM push_devices WHERE endpoint=${subscription.endpoint}`;
    await tx.$executeRaw`INSERT INTO push_devices(user_id,endpoint,subscription,session_version) VALUES(${req.user.id}::uuid,${subscription.endpoint},${JSON.stringify(subscription)}::jsonb,${req.user.sessionVersion})`;
   });res.status(201).json({ok:true});
  });
  route('delete','/api/notifications/devices',async(req,res)=>{
   if(req.body.all===true)await prisma.$executeRaw`DELETE FROM push_devices WHERE user_id=${req.user.id}::uuid`;
   else if(typeof req.body.endpoint==='string')await prisma.$executeRaw`DELETE FROM push_devices WHERE user_id=${req.user.id}::uuid AND endpoint=${req.body.endpoint}`;
   else return res.status(400).json({error:'Choose a device to remove.'});
   res.json({ok:true});
  },sessionAuth);
  route('post','/api/notifications/test',async(req,res)=>{
   if(!ready)return res.status(503).json({error:'Background delivery is not configured.'});
   if(!await redis.limit('push-test:'+req.user.id,3,3600000))return res.status(429).json({error:'Please wait before another test.'});
   const n=await prisma.$executeRaw`INSERT INTO notification_deliveries(device_id,event_key,kind) SELECT d.id,${'test:'+crypto.randomUUID()},'test' FROM push_devices d JOIN notification_preferences p ON p.user_id=d.user_id WHERE d.user_id=${req.user.id}::uuid AND p.enabled`;
   res.json({queued:n});
  });
 }
 return {register,tick,ready,start(){const timer=setInterval(tick,15000);timer.unref();return timer;}};
}
module.exports={createNotifications,validSubscription,preferences,inQuietHours};
