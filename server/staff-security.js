const crypto=require('crypto');
const jwt=require('jsonwebtoken');
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function encode(buffer){let bits=0,value=0,out='';for(const b of buffer){value=(value<<8)|b;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;}}if(bits)out+=alphabet[(value<<(5-bits))&31];return out;}
function decode(secret){let bits=0,value=0,out=[];for(const c of secret){value=(value<<5)|alphabet.indexOf(c);bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);}
function totp(secret,step,digits=6){const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));const h=crypto.createHmac('sha1',decode(secret)).update(counter).digest(),offset=h[19]&15;return String((h.readUInt32BE(offset)&0x7fffffff)%10**digits).padStart(digits,'0');}
function equal(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function createStaffSecurity({prisma,secret,reviewMode,sessionCookie}){
 const cookie=`${sessionCookie}_staff`,key=crypto.createHash('sha256').update(process.env.STAFF_ENCRYPTION_KEY||secret).digest();
 function seal(s){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(s,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),data].map(x=>x.toString('base64')).join('.');}
 function open(s){const [iv,tag,data]=s.split('.').map(x=>Buffer.from(x,'base64'));const c=crypto.createDecipheriv('aes-256-gcm',key,iv);c.setAuthTag(tag);return Buffer.concat([c.update(data),c.final()]).toString();}
 async function access(user){if(!user?.email)return null;const [row]=await prisma.$queryRaw`SELECT * FROM staff_access WHERE email=${user.email.toLowerCase()} AND revoked_at IS NULL`;user.staffRole=row?.role;return row;}
 async function bootstrap(redis){
  // Import existing grants once per email. Revoked records are never restored by environment settings.
  const excluded=new Set(await redis.getExcludedAdminEmails()),owners=(process.env.ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(process.env.NODE_ENV==='production'&&await redis.ping()!=='PONG')throw new Error('Redis must be available to import legacy staff grants safely.');
  for(const [role,emails] of [['super_admin',owners],['moderator',await redis.getModeratorEmails()]])for(const email of emails){await prisma.$executeRaw`INSERT INTO staff_access(email,role,revoked_at) VALUES(${email},${role},${excluded.has(email)?new Date():null}) ON CONFLICT DO NOTHING`;}
 }
 async function changeAccess(actor,email,role=null){
  return prisma.$transaction(async tx=>{
   // Serialise role changes so two owners cannot concurrently revoke each other.
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(481932)`;
   const [grant]=await tx.$queryRaw`SELECT role FROM staff_access WHERE email=${actor.email.toLowerCase()} AND revoked_at IS NULL`;
   if(grant?.role!=='super_admin')throw new Error('Owner access has changed. Sign in again.');
   if(email===actor.email.toLowerCase())throw new Error('Another owner must change your access.');
   if(role)await tx.$executeRaw`INSERT INTO staff_access(email,role) VALUES(${email},${role}) ON CONFLICT(email) DO UPDATE SET role=EXCLUDED.role,revoked_at=NULL,version=staff_access.version+1,updated_at=now()`;
   else await tx.$executeRaw`UPDATE staff_access SET revoked_at=now(),version=version+1,updated_at=now() WHERE email=${email}`;
  });
 }
 async function active(req){
  if(reviewMode)return true;
  try{const grant=await access(req.user);if(!grant)return false;const p=jwt.verify(req.cookies[cookie],secret,{issuer:'afterclass',audience:'afterclass-staff'});const [factor]=await prisma.$queryRaw`SELECT version,confirmed FROM staff_authenticators WHERE user_id=${req.user.id}::uuid`;
   return p.sub===req.user.id&&p.sv===req.user.sessionVersion&&p.rv===grant.version&&p.fv===factor?.version&&factor.confirmed;
  }catch{return false;}
 }
 async function requireSession(req,res){if(await active(req))return true;res.status(403).json({code:'STAFF_AUTH_REQUIRED',error:'Unlock the staff workspace with your authenticator.'});return false;}
 function register(app,auth){
  function route(method,path,fn){app[method](path,auth,async(req,res)=>{res.set('Cache-Control','no-store');try{if(!await access(req.user))return res.status(403).json({error:'Staff access required.'});await fn(req,res);}catch(e){console.error('[Staff security]',e.code||'request failed');res.status(503).json({error:'Staff authentication is unavailable. Retry shortly.'});}});}
  route('get','/api/staff/session',async(req,res)=>{const [f]=await prisma.$queryRaw`SELECT confirmed FROM staff_authenticators WHERE user_id=${req.user.id}::uuid`;res.json({active:await active(req),enrolled:Boolean(f?.confirmed),reviewMode});});
  route('post','/api/staff/enrol',async(req,res)=>{
   if(Date.now()/1000-req.authIssuedAt>600)return res.status(401).json({error:'Sign in again before setting up your authenticator.'});
   const seed=encode(crypto.randomBytes(20));
   const rows=await prisma.$queryRaw`INSERT INTO staff_authenticators(user_id,secret,expires_at) VALUES(${req.user.id}::uuid,${seal(seed)},now()+interval '10 minutes') ON CONFLICT(user_id) DO UPDATE SET secret=EXCLUDED.secret,expires_at=EXCLUDED.expires_at WHERE staff_authenticators.confirmed=false RETURNING user_id`;
   if(!rows.length)return res.status(409).json({error:'An authenticator is already enrolled.'});
   res.json({secret:seed,uri:`otpauth://totp/Afterclass:${encodeURIComponent(req.user.email)}?secret=${seed}&issuer=Afterclass&algorithm=SHA1&digits=6&period=30`});
  });
  route('post','/api/staff/verify',async(req,res)=>{
   const code=String(req.body.code||'').trim();if(!/^(\d{6}|[a-f0-9]{16})$/.test(code))return res.status(400).json({error:'Enter a six-digit code or a recovery code.'});
   const [rate]=await prisma.$queryRaw`INSERT INTO staff_auth_attempts(user_id,attempts,window_start) VALUES(${req.user.id}::uuid,1,now()) ON CONFLICT(user_id) DO UPDATE SET attempts=CASE WHEN staff_auth_attempts.window_start<now()-interval '10 minutes' THEN 1 ELSE staff_auth_attempts.attempts+1 END,window_start=CASE WHEN staff_auth_attempts.window_start<now()-interval '10 minutes' THEN now() ELSE staff_auth_attempts.window_start END RETURNING attempts`;
   if(rate.attempts>10)return res.status(429).json({error:'Too many attempts. Wait ten minutes.'});
   const result=await prisma.$transaction(async tx=>{
    const [f]=await tx.$queryRaw`SELECT * FROM staff_authenticators WHERE user_id=${req.user.id}::uuid FOR UPDATE`;
    if(!f||(!f.confirmed&&f.expires_at<new Date()))return null;
    const now=Math.floor(Date.now()/30000),step=[now-1,now,now+1].find(n=>BigInt(n)>f.last_step&&equal(totp(open(f.secret),n),code));
    const recovery=f.confirmed&&f.recovery_hashes.find(x=>equal(x,hash(code)));
    if(step===undefined&&!recovery)return null;
    const codes=f.confirmed?null:Array.from({length:8},()=>crypto.randomBytes(8).toString('hex'));
    const hashes=codes?codes.map(hash):f.recovery_hashes.filter(x=>x!==recovery);
    const version=f.version+(recovery?1:0);
    await tx.$executeRaw`UPDATE staff_authenticators SET confirmed=true,expires_at=NULL,last_step=${step===undefined?f.last_step:BigInt(step)},recovery_hashes=${JSON.stringify(hashes)}::jsonb,version=${version} WHERE user_id=${req.user.id}::uuid`;
    await tx.$executeRaw`INSERT INTO admin_audit_events(actor_id,campus_id,operation,outcome,status_code) VALUES(${req.user.id}::uuid,${req.user.campusId}::uuid,${codes?'staff.enrol':recovery?'staff.recover':'staff.unlock'},'succeeded',200)`;
    return {codes,version};
   });
   if(!result)return res.status(400).json({error:'Code is invalid, expired, or already used.'});
   const grant=await access(req.user);if(!grant)return res.status(403).json({error:'Access has been revoked.'});
   res.cookie(cookie,jwt.sign({sub:req.user.id,sv:req.user.sessionVersion,rv:grant.version,fv:result.version},secret,{expiresIn:'30m',issuer:'afterclass',audience:'afterclass-staff'}),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',maxAge:1800000,path:'/api'});
   res.json({ok:true,recoveryCodes:result.codes});
  });
  route('post','/api/staff/lock',async(req,res)=>{await prisma.$executeRaw`UPDATE staff_authenticators SET version=version+1 WHERE user_id=${req.user.id}::uuid`;res.clearCookie(cookie,{path:'/api'});res.json({ok:true});});
 }
 return {access,bootstrap,active,requireSession,register,changeAccess};
}
module.exports={createStaffSecurity,totp,encode};
