// Isolated review environment: never reads .env or uses Supabase/Upstash/email.
const {spawnSync,spawn}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const url='postgresql://postgres:afterclass_local_review@127.0.0.1:55432/afterclass_review';
const env={...process.env,AFTERCLASS_REVIEW:'1',VITE_API_URL:'/api',VITE_REVIEW:'1',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',GOOGLE_REDIRECT_URI:'',DATABASE_URL:url,DIRECT_URL:url,REDIS_URL:'',RESEND_API_KEY:'',NODE_ENV:'development',HOST:'127.0.0.1',PORT:'3003',CLIENT_URL:'http://127.0.0.1:3003',JWT_SECRET:'isolated-afterclass-review-only',SESSION_COOKIE_NAME:'afterclass_review',ADMIN_EMAILS:'admin@review.invalid',ADMIN_KEY:'',STATIC_DIR:'dist-review'};
function run(command,args){const r=spawnSync(command,args,{cwd:root,env,stdio:'inherit'});if(r.error||r.status!==0){console.error(r.error?.message||command+' failed');process.exit(r.status||1);}}
async function seed(){
  process.env.DATABASE_URL=url;process.env.DIRECT_URL=url;
  const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
  const campus=await db.campus.upsert({where:{slug:'review-campus'},create:{slug:'review-campus',name:'NIIT University · Demo',emailDomain:'review.invalid'},update:{}});
  const users=[];
  for(const [i,alias,gender,email,age,verified] of [[1,'CalmClover','man','admin',24,true],[2,'VelvetWillow','woman','mira',23,true],[3,'SunnyFox','man','noah',25,true],[4,'DaringMoon','woman','zara',24,true],[5,'AmberRobin','woman','underage',17,true],[6,'MossyHeron','man','appeal',23,false]]){
    const date=new Date();date.setUTCFullYear(date.getUTCFullYear()-age);date.setUTCMonth(0,15);
    const u=await db.user.upsert({where:{email:email+'@review.invalid'},create:{campusId:campus.id,email:email+'@review.invalid',publicAlias:alias,gender,isVerified:verified,verificationStatus:verified?'approved':'rejected',genderLocked:verified},update:{}});users.push(u);
    await db.connectionProfile.upsert({where:{userId:u.id},create:{userId:u.id,bio:i===2?'Usually reading, always up for coffee.':'A good conversation makes a free afternoon.',interests:i===2?['Books','Coffee','Music']:['Walking','Food','Films'],prompt:'My ideal free afternoon',answer:'A walk, a coffee and no rush to be anywhere.',birthDate:date,datingEnabled:age>=18&&verified,minAge:18,maxAge:30,availableUntil:verified?new Date(Date.now()+3600000):null},update:{}});
  }
  let room=await db.chatRoom.findFirst({where:{campusId:campus.id,kind:'campus'}});if(!room)room=await db.chatRoom.create({data:{campusId:campus.id,kind:'campus'}});
  if(!await db.message.count({where:{roomId:room.id}}))await db.message.createMany({data:[{roomId:room.id,senderId:users[1].id,senderAlias:users[1].publicAlias,content:'Coffee after class? I’ll be at the campus café.'},{roomId:room.id,senderId:users[0].id,senderAlias:users[0].publicAlias,content:'Sounds good. I have an hour free.'}]});
  if(!await db.matchRequest.count({where:{campusId:campus.id}})){
    for(const [host,activity,mode] of [[users[1],'Coffee and a book swap','social'],[users[3],'A walk before dinner','social'],[users[1],'Coffee, just the two of us','dating']])await db.matchRequest.create({data:{campusId:campus.id,requesterId:host.id,activity,location:'Campus café',connectionMode:mode,scheduledAt:new Date(Date.now()+86400000),expiresAt:new Date(Date.now()+2*86400000)}});
    for(const [status,hours] of [['active',3],['completed',-24]]){
      const request=await db.matchRequest.create({data:{campusId:campus.id,requesterId:users[0].id,activity:status==='active'?'Coffee after class':'An afternoon walk',location:'Campus café',scheduledAt:new Date(Date.now()+hours*3600000),expiresAt:new Date(Date.now()+2*86400000),status:status==='active'?'matched':'completed'}});
      const chat=await db.chatRoom.create({data:{campusId:campus.id,kind:'match'}});
      const m=await db.match.create({data:{requestId:request.id,userOneId:users[0].id,userTwoId:users[1].id,roomId:chat.id,scheduledAt:request.scheduledAt,status,completedAt:status==='completed'?new Date():null}});
      await db.revealConsent.createMany({data:[{matchId:m.id,userId:users[0].id},{matchId:m.id,userId:users[1].id}]});
    }
    await db.verificationAppeal.create({data:{userId:users[5].id,reason:'My camera was blurry during the check. Could I try again in better light?'}});
  }
  await db.$disconnect();
}
(async()=>{
  const existing=spawnSync('docker',['inspect','afterclass-review-db'],{stdio:'ignore'});
  if(existing.status===0)run('docker',['start','afterclass-review-db']);
  else run('docker',['run','-d','--name','afterclass-review-db','-p','127.0.0.1:55432:5432','-e','POSTGRES_PASSWORD=afterclass_local_review','-e','POSTGRES_DB=afterclass_review','postgres:16-alpine']);
  let ready=false;
  for(let i=0;i<30;i++){
    if(spawnSync('docker',['exec','afterclass-review-db','pg_isready','-U','postgres','-d','afterclass_review'],{stdio:'ignore'}).status===0){ready=true;break;}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(!ready)throw new Error('The local review database did not become ready.');
  run('npx',['prisma','generate','--schema','server/prisma/schema.prisma']);
  run('npx',['prisma','migrate','deploy','--schema','server/prisma/schema.prisma']);
  await seed();
  run('npx',['vite','build','--outDir','dist-review']);
  const child=spawn(process.execPath,['server/index.js'],{cwd:root,env,stdio:'inherit'});
  process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'));
})().catch(e=>{console.error(e.message);process.exit(1)});
