// Fictional analytics history for the isolated review database only. Never run on Supabase.
async function seedReviewAnalytics(db) {
 if(!/^postgresql:\/\/[^@]+@127\.0\.0\.1:55432\/afterclass_review$/.test(process.env.DATABASE_URL||''))throw new Error('Analytics fixtures require the isolated review database.');
 const [{name}]=await db.$queryRaw`SELECT current_database() name`;if(name!=='afterclass_review')throw new Error('Wrong fixture database.');
 if(await db.user.findUnique({where:{email:'analytics-demo-0@fixtures.invalid'}}))return;
 const colleges=await db.campus.findMany({where:{slug:{in:['review-campus','lakeside-review']}},orderBy:{slug:'asc'}});
 // Use whatever demo colleges were registered by review-colleges; never add real colleges.
 const second=await db.campus.findFirst({where:{name:'Lakeside College · Demo'}});
 if(second&&!colleges.some(c=>c.id===second.id))colleges.push(second);
 if(!colleges.length)throw new Error('Seed review colleges first.');
 const day=86400000,now=new Date(),today=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
 await db.$transaction(async tx=>{
  await tx.$executeRaw`UPDATE admin_measurement_config SET started_at=${new Date(today-90*day)} WHERE id=1`;
  const users=[];
  for(let i=0;i<28;i++){
   const campus=colleges[i%colleges.length],age=2+i*2,createdAt=new Date(today-age*day+10*3600000);
   const u=await tx.user.create({data:{email:`analytics-demo-${i}@fixtures.invalid`,publicAlias:`DemoMember${String(i+1).padStart(2,'0')}`,campusId:campus.id,gender:i%2?'woman':'man',createdAt,isVerified:i%5!==0,verificationStatus:i%5?'approved':'pending'}});users.push(u);
   for(const offset of [0,1,7,30])if(age>offset&&(offset===0||i%(offset===30?3:4)!==0))await tx.$executeRaw`INSERT INTO account_activity_days(user_id,campus_id,activity_date) VALUES(${u.id}::uuid,${u.campusId}::uuid,${new Date(createdAt.getTime()+offset*day)}::date) ON CONFLICT DO NOTHING`;
  }
  for(let i=0;i<users.length;i++){
   if(i%5===0)continue;
   const u=users[i],partner=users.find(v=>v.campusId===u.campusId&&v.id!==u.id),createdAt=new Date(u.createdAt.getTime()+day),scheduledAt=new Date(createdAt.getTime()+2*day);
   const request=await tx.matchRequest.create({data:{campusId:u.campusId,requesterId:u.id,activity:'Demo · Coffee after class',location:'Demo campus café',createdAt,scheduledAt,expiresAt:scheduledAt,status:i%3===0?'expired':'matched'}});
   if(i%3===0)continue;
   await tx.matchApplication.create({data:{requestId:request.id,applicantId:partner.id,createdAt:new Date(createdAt.getTime()+3600000),status:'accepted'}});
   const room=await tx.chatRoom.create({data:{campusId:u.campusId,kind:'match'}});
   await tx.match.create({data:{requestId:request.id,userOneId:u.id,userTwoId:partner.id,roomId:room.id,scheduledAt,createdAt:new Date(createdAt.getTime()+2*3600000),status:i%4===0?'cancelled':'completed',confirmedOneAt:createdAt,confirmedTwoAt:createdAt,completedAt:i%4===0?null:scheduledAt}});
  }
 },{timeout:20000});
}
module.exports={seedReviewAnalytics};
