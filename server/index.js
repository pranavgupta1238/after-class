require('dotenv').config?.();
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const { Server } = require('socket.io');
const { PrismaClient, RoomKind } = require('@prisma/client');
const store = require('./store');
const campuses = require('./campuses');
const matchService = require('./match-service');
const redis = require('./redis');
const app = express(), server=http.createServer(app), io=new Server(server,{cors:{origin:process.env.CLIENT_URL||'http://localhost:5173',credentials:true}});
const PORT=process.env.PORT||3001, HOST=process.env.HOST||'0.0.0.0', SECRET=process.env.JWT_SECRET||'local-development-secret-change-me', OTP_PEPPER=process.env.OTP_PEPPER||SECRET;
if (!process.env.DATABASE_URL && process.env.NODE_ENV !== 'production') process.env.DATABASE_URL='postgresql://afterclass:local-development-only@localhost:5432/afterclass';
const prisma = new PrismaClient();
const resend=process.env.RESEND_API_KEY?new Resend(process.env.RESEND_API_KEY):null;
const names={ adjectives:['Amber','Brisk','Clever','Daring','Gentle','Mossy','Quiet','Sunny','Velvet','Witty','Bright','Kind','Swift','Calm','Happy','Cosmic'], nouns:['Acorn','Badger','Cedar','Comet','Clover','Heron','Mango','Otter','Pine','Robin','Sparrow','Willow','Fox','Maple','Moon','River'] };
app.use(express.json({limit:'32kb'})); app.use(cookieParser());
function username(){for(let n=0;n<100;n++){const value=names.adjectives[Math.floor(Math.random()*names.adjectives.length)]+names.nouns[Math.floor(Math.random()*names.nouns.length)];if(!store.find('users',u=>u.publicUsername===value))return value}return 'Campus'+Date.now()}
function publicUser(u){const campus=campuses.get(u.university)||{id:u.university,name:u.university};return {username:u.publicUsername,university:campus.name,campusId:campus.id,reputation:u.reputation,createdAt:u.createdAt}}
function token(user){return jwt.sign({sub:user.id,sv:user.sessionVersion||0},SECRET,{expiresIn:'30d',issuer:'afterclass',audience:'afterclass-web'})}
function hashOtp(email,code){return crypto.createHmac('sha256',OTP_PEPPER).update(`${email}:${code}`).digest('hex')}
function accountUnavailable(user){return !user||user.accountStatus==='banned'||user.banStatus==='permanent'||(user.suspendedUntil&&new Date(user.suspendedUntil)>new Date())}
function validHealthSecret(value){const expected=process.env.HEALTH_SECRET;if(!expected||typeof value!=='string')return false;const actual=Buffer.from(value),target=Buffer.from(expected);return actual.length===target.length&&crypto.timingSafeEqual(actual,target)}
async function deliverOtp(email,code){if(process.env.NODE_ENV!=='production')return;if(!resend||!process.env.RESEND_FROM)throw new Error('Email delivery is not configured.');const {error}=await resend.emails.send({from:process.env.RESEND_FROM,to:[email],subject:'Your Afterclass verification code',text:`Your Afterclass verification code is ${code}. It expires in 10 minutes.`,html:`<p>Your Afterclass verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`});if(error)throw new Error('Unable to send verification email.');}
function auth(req,res,next){try{const raw=req.cookies.session||req.headers.authorization?.replace('Bearer ','');const p=jwt.verify(raw,SECRET,{issuer:'afterclass',audience:'afterclass-web'});const user=store.find('users',u=>u.id===p.sub);if(accountUnavailable(user)||(p.sv!==(user.sessionVersion||0)))return res.status(401).json({error:'Account unavailable'});req.user=user;next()}catch{return res.status(401).json({error:'Authentication required'})}}
function compatible(requester, host){if(requester.id===host.id)return false; if(requester.university!==host.university)return false; const gp=requester.genderPref||'any';return gp==='any'||gp===host.gender}
function clean(content){return content.trim().slice(0,500).replace(/\b(fuck|shit|bitch|asshole)\b/gi,'****')}
async function campusRoom(user){const campus=await prisma.campus.findUnique({where:{slug:user.university}});if(!campus)throw new Error('Campus unavailable');await prisma.user.upsert({where:{id:user.id},update:{publicAlias:user.publicUsername,lastActiveAt:new Date()},create:{id:user.id,campusId:campus.id,email:user.email,publicAlias:user.publicUsername}});const room=await prisma.chatRoom.findFirst({where:{campusId:campus.id,kind:RoomKind.campus}});if(!room)throw new Error('Campus room unavailable');return room}
function publicMessage(m){return {id:m.id,content:m.content,isFiltered:m.isFiltered,createdAt:m.createdAt,sender:{username:m.senderAlias}}}
app.get('/api/health',async(req,res)=>{try{res.json({ok:true,service:'afterclass',redis:await redis.ping()})}catch{res.status(503).json({ok:false,service:'afterclass',redis:'unavailable'})}});
app.get('/health',async(req,res)=>{if(!validHealthSecret(req.get('x-health-secret')))return res.status(401).json({status:'unauthorized'});try{await prisma.$queryRaw`SELECT 1`;res.json({status:'ok',db:'connected'})}catch{res.status(503).json({status:'unavailable',db:'disconnected'})}});
app.post('/api/auth/send-otp',async(req,res)=>{const email=String(req.body.email||'').trim().toLowerCase(),campus=campuses.fromEmail(email);if(!campus)return res.status(400).json({error:'Use an email from a supported university.'});if(!await redis.limit('otp:send:'+email,3,3600000))return res.status(429).json({error:'Too many codes requested. Try again later.'});const code=String(crypto.randomInt(100000,1000000));try{await deliverOtp(email,code)}catch(err){return res.status(503).json({error:err.message})}store.remove('otps',x=>x.email===email);store.add('otps',{email,codeHash:hashOtp(email,code),campusId:campus.id,attempts:0,expiresAt:Date.now()+600000});if(process.env.NODE_ENV!=='production')console.info(`[DEV OTP] ${email}: ${code}`);res.json({ok:true,campus:campus.name,...(process.env.NODE_ENV!=='production'?{developmentCode:code}:{})})});
app.post('/api/auth/verify-otp',async(req,res)=>{const email=String(req.body.email||'').trim().toLowerCase(),code=String(req.body.code||'');if(!await redis.limit('otp:verify:'+email,10,600000))return res.status(429).json({error:'Too many verification attempts. Request a new code.'});const otp=store.find('otps',o=>o.email===email&&o.expiresAt>Date.now());if(!otp||otp.codeHash!==hashOtp(email,code)){if(otp){otp.attempts=(otp.attempts||0)+1;if(otp.attempts>=5)store.remove('otps',o=>o.id===otp.id);else store.save()}return res.status(400).json({error:'That code is invalid or expired.'})}store.remove('otps',o=>o.id===otp.id);let user=store.find('users',u=>u.email===email);if(accountUnavailable(user))return res.status(403).json({error:'This account is not available.'});if(!user)user=store.add('users',{email,publicUsername:username(),university:otp.campusId,gender:req.body.gender||'undisclosed',orientation:req.body.orientation||'undisclosed',genderPref:'any',reputation:100,accountStatus:'active',sessionVersion:0,noShowCount:0});res.cookie('session',token(user),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:2592000000,path:'/'});res.json({user:publicUser(user)})});
app.post('/api/auth/logout',auth,(req,res)=>{store.update('users',req.user.id,{sessionVersion:(req.user.sessionVersion||0)+1});res.clearCookie('session',{path:'/'}).json({ok:true})}); app.get('/api/me',auth,(req,res)=>res.json({user:publicUser(req.user)}));
app.get('/api/messages',auth,async(req,res)=>{try{const room=await campusRoom(req.user);const messages=await prisma.message.findMany({where:{roomId:room.id,isDeleted:false},orderBy:{createdAt:'desc'},take:50});res.json({messages:messages.reverse().map(publicMessage)})}catch{res.status(503).json({error:'Campus chat is unavailable.'})}});
app.get('/api/match-requests',auth,async(req,res)=>{try{const requests=await prisma.matchRequest.findMany({where:{campus:{slug:req.user.university},requesterId:{not:req.user.id},status:'open',expiresAt:{gt:new Date()}},include:{requester:true},orderBy:{createdAt:'desc'}});res.json({requests:requests.map(matchService.publicRequest)})}catch{res.status(503).json({error:'Matching is unavailable.'})}});
app.post('/api/match-requests',auth,async(req,res)=>{try{const {activity,location,scheduledAt,genderPreference,orientationPreference}=req.body;if(!activity||!location||!scheduledAt)return res.status(400).json({error:'Activity, location and time are required.'});const request=await matchService.createRequest(prisma,req.user,{activity:String(activity).slice(0,100),location:String(location).slice(0,120),scheduledAt,genderPreference,orientationPreference});res.status(201).json({request})}catch{res.status(400).json({error:'Unable to create request.'})}});
app.post('/api/match-requests/:id/applications',auth,async(req,res)=>{try{const application=await matchService.apply(prisma,req.user,req.params.id);res.status(201).json({application:{id:application.id,status:application.status}})}catch{res.status(404).json({error:'Request unavailable.'})}});
app.get('/api/match-requests/mine/applications',auth,async(req,res)=>{const applications=await prisma.matchApplication.findMany({where:{request:{requesterId:req.user.id},status:'pending'},include:{request:true}});res.json({applications:applications.map(a=>({id:a.id,requestId:a.requestId,activity:a.request.activity,interestCount:1}))})});
app.post('/api/applications/:id/accept',auth,async(req,res)=>{try{const match=await matchService.accept(prisma,req.user,req.params.id);io.to('user:'+match.userTwoId).emit('match:accepted',{matchId:match.id});res.json({match:{id:match.id,status:match.status}})}catch{res.status(404).json({error:'Application unavailable.'})}});
app.get('/api/requests',auth,(req,res)=>{const items=store.table('requests').filter(r=>r.status==='open'&&new Date(r.expiresAt)>new Date()).filter(r=>compatible(r,store.find('users',u=>u.id===r.requesterId))).map(r=>({...r,host:publicUser(store.find('users',u=>u.id===r.requesterId)),interested:store.table('applications').filter(a=>a.requestId===r.id&&a.status==='pending').length}));res.json({requests:items})});
app.post('/api/requests',auth,async(req,res)=>{if(!await redis.limit('request:'+req.user.id,5,86400000))return res.status(429).json({error:'Daily plan limit reached.'});const {activity,location,scheduledAt,genderPref='any'}=req.body;if(!activity||!location||!scheduledAt)return res.status(400).json({error:'Activity, location and time are required.'});const item=store.add('requests',{requesterId:req.user.id,activity:String(activity).slice(0,100),location:String(location).slice(0,120),scheduledAt,genderPref,status:'open',expiresAt:new Date(Date.now()+48*3600e3).toISOString()});res.status(201).json({request:item})});
app.post('/api/requests/:id/apply',auth,(req,res)=>{const request=store.find('requests',r=>r.id===req.params.id&&r.status==='open');if(!request)return res.status(404).json({error:'Plan is no longer available.'});if(request.requesterId===req.user.id)return res.status(400).json({error:'You cannot apply to your own plan.'});if(store.find('applications',a=>a.requestId===request.id&&a.applicantId===req.user.id))return res.status(409).json({error:'Already interested.'});store.add('applications',{requestId:request.id,applicantId:req.user.id,status:'pending'});res.json({ok:true})});
app.get('/api/requests/mine/applications',auth,(req,res)=>res.json({applications:store.table('applications').filter(a=>store.find('requests',r=>r.id===a.requestId&&r.requesterId===req.user.id)&&a.status==='pending').map(a=>({id:a.id,request:store.find('requests',r=>r.id===a.requestId)}))}));
app.post('/api/applications/:id/accept',auth,(req,res)=>{const a=store.find('applications',x=>x.id===req.params.id&&x.status==='pending');const r=a&&store.find('requests',x=>x.id===a.requestId&&x.requesterId===req.user.id);if(!r)return res.status(404).json({error:'Application not found.'});const room='match:'+store.id();const match=store.add('matches',{requestId:r.id,user1Id:req.user.id,user2Id:a.applicantId,roomId:room,status:'matched',reveals:{[req.user.id]:false,[a.applicantId]:false}});store.update('applications',a.id,{status:'accepted'});store.update('requests',r.id,{status:'matched'});io.to('user:'+a.applicantId).emit('match:accepted',{matchId:match.id});res.json({match})});
app.get('/api/matches',auth,(req,res)=>res.json({matches:store.table('matches').filter(m=>m.user1Id===req.user.id||m.user2Id===req.user.id).map(m=>{const other=store.find('users',u=>u.id===(m.user1Id===req.user.id?m.user2Id:m.user1Id));return {...m,other:publicUser(other),revealed:m.reveals[req.user.id]&&m.reveals[other.id]}})}));
app.post('/api/matches/:id/reveal',auth,(req,res)=>{const m=store.find('matches',x=>x.id===req.params.id&&(x.user1Id===req.user.id||x.user2Id===req.user.id));if(!m)return res.status(404).json({error:'Match not found'});m.reveals[req.user.id]=true;store.save();const other=m.user1Id===req.user.id?m.user2Id:m.user1Id;io.to('user:'+other).emit('reveal:requested',{matchId:m.id});res.json({mutual:m.reveals[other]})});
app.post('/api/reports',auth,async(req,res)=>{if(!await redis.limit('report:'+req.user.id,10,86400000))return res.status(429).json({error:'Report limit reached.'});const {messageId,reason='inappropriate_content'}=req.body;const message=messageId&&await prisma.message.findUnique({where:{id:messageId}});if(!message||message.senderId===req.user.id)return res.status(404).json({error:'Message not found.'});const campus=await prisma.campus.findUnique({where:{slug:req.user.university}});await prisma.report.create({data:{campusId:campus.id,reporterId:req.user.id,reportedUserId:message.senderId,messageId:message.id,reason}});res.status(201).json({ok:true})});
app.get('/api/admin/reports',auth,(req,res)=>{if(req.headers['x-admin-key']!==process.env.ADMIN_KEY)return res.status(403).json({error:'Admin access required'});res.json({reports:store.table('reports').filter(r=>r.status==='pending')})});
function socketCookie(socket,name){const part=(socket.handshake.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));return part?decodeURIComponent(part.slice(name.length+1)):undefined}
io.use((socket,next)=>{try{const raw=socket.handshake.auth.token||socketCookie(socket,'session');const p=jwt.verify(raw,SECRET,{issuer:'afterclass',audience:'afterclass-web'});socket.user=store.find('users',u=>u.id===p.sub);if(accountUnavailable(socket.user)||(p.sv!==(socket.user.sessionVersion||0)))throw 0;next()}catch{next(new Error('Unauthorized'))}});
io.on('connection',socket=>{
  const user=socket.user;
  socket.join('user:'+user.id);
  socket.join('campus:'+user.university);
  socket.on('room:join',room=>{if(room===`campus:${user.university}`||store.find('matches',m=>m.roomId===room&&(m.user1Id===user.id||m.user2Id===user.id)))socket.join(room)});
  socket.on('message:send',async({roomId,content},ack=()=>{})=>{
    if(!await redis.limit('chat:'+user.id,20,60000))return ack({error:'Slow down — 20 messages per minute.'});
    if(!content?.trim())return ack({error:'Message cannot be empty.'});
    const allowed=roomId===`campus:${user.university}`||store.find('matches',m=>m.roomId===roomId&&(m.user1Id===user.id||m.user2Id===user.id));
    if(!allowed)return ack({error:'Room unavailable.'});
    const cleaned=clean(content),m=store.add('messages',{roomId,senderId:user.id,content:cleaned,isFiltered:cleaned!==content.trim(),deleted:false});
    const payload={...m,sender:publicUser(user)};
    io.to(roomId).emit('message:new',payload);
    ack({ok:true,message:payload});
  });
  socket.on('campus:message',async({content},ack=()=>{})=>{
    if(!await redis.limit('chat:'+user.id,20,60000))return ack({error:'Slow down — 20 messages per minute.'});
    if(!content?.trim())return ack({error:'Message cannot be empty.'});
    try{
      const room=await campusRoom(user),cleaned=clean(content);
      const message=await prisma.message.create({data:{roomId:room.id,senderId:user.id,senderAlias:user.publicUsername,content:cleaned,isFiltered:cleaned!==content.trim()}});
      const payload=publicMessage(message);
      io.to('campus:'+user.university).emit('message:new',payload);
      ack({ok:true,message:payload});
    }catch{ack({error:'Campus chat is unavailable.'})}
  });
});
app.use(express.static(path.join(__dirname,'..','dist')));app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'..','dist','index.html')));
server.listen(PORT,HOST,()=>console.log(`Afterclass API listening on http://${HOST}:${PORT}`));
