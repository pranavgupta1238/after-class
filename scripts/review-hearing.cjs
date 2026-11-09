// Fictional hearing fixture. This module must only run against the local review database.
const url='postgresql://postgres:afterclass_local_review@127.0.0.1:55432/afterclass_review';
async function seedReviewHearing(db,{reset=false}={}) {
 const [database]=await db.$queryRaw`SELECT current_database() AS name`;
 if(database.name!=='afterclass_review')throw new Error('Hearing demos require the isolated review database.');
 const campus=await db.campus.findUnique({where:{slug:'review-campus'}});
 const judge=await db.user.findUnique({where:{email:'admin@review.invalid'}});
 const reporter=await db.user.findUnique({where:{email:'mira@review.invalid'}});
 const original=await db.user.findUnique({where:{email:'noah@review.invalid'}});
 if(!campus||!judge||!reporter||!original)throw new Error('Start npm run review once to create the demo accounts.');
 const owner=await db.user.upsert({where:{email:'hearing@review.invalid'},create:{campusId:campus.id,email:'hearing@review.invalid',publicAlias:'SilverAspen',gender:'man',isVerified:true,verificationStatus:'approved',accountStatus:'banned'},update:{}});
 let review=await db.accountReview.findFirst({where:{userId:owner.id},include:{hearing:{include:{slot:true}}}});
 if(reset){
  const slotId=review?.hearing?.slotId;
  await db.accountReview.deleteMany({where:{userId:owner.id}});
  if(slotId)await db.hearingSlot.delete({where:{id:slotId}});
  await db.moderationAction.deleteMany({where:{userId:owner.id}});
  await db.user.update({where:{id:owner.id},data:{accountStatus:'banned',suspendedUntil:null}});
  review=null;
 }
 if(review)return review.hearing?.id;
 const start=new Date(),end=new Date(start.getTime()+30*60000);
 const hearing=await db.$transaction(async tx=>{
  const action=await tx.moderationAction.create({data:{userId:owner.id,campusId:campus.id,adminUserId:original.id,type:'ban',reason:'Fictional hearing demonstration',policy:'Unwanted contact',publicSummary:'Demo case: repeated invitations after a request to stop.',evidence:{reporterIds:[reporter.id],reports:[{reason:'Unwanted contact',detail:'Fictional evidence for testing the hearing workflow.',message:{content:'Please stop sending invitations.',createdAt:start.toISOString()}}]}}});
  const appeal=await tx.accountReview.create({data:{userId:owner.id,actionId:action.id,reviewerId:judge.id,status:'in_review',entries:{create:{kind:'submitted',body:'This is a fictional appeal. I would like to explain the context of the invitations in a moderated hearing.'}}}});
  const slot=await tx.hearingSlot.create({data:{campusId:campus.id,judgeId:judge.id,startsAt:start,endsAt:end}});
  const h=await tx.hearing.create({data:{reviewId:appeal.id,slotId:slot.id,judgeId:judge.id,participants:{create:[{userId:owner.id,role:'appellant',label:'Account holder',response:'accepted'},{userId:reporter.id,role:'reporter',label:'Reporting participant 1',response:'invited'}]}}});
  await tx.hearingMessage.create({data:{hearingId:h.id,label:'Afterclass',body:'Fictional demo hearing. SilverAspen is the account holder, CalmClover is the moderator, and VelvetWillow is the invited reporter. No real student or report is involved.'}});
  return h;
 });
 return hearing.id;
}
module.exports={seedReviewHearing};
if(require.main===module){
 const {PrismaClient}=require('@prisma/client');const db=new PrismaClient({datasourceUrl:url});
 seedReviewHearing(db,{reset:process.argv.includes('--reset')}).then(()=>console.log('Local demo hearing ready for the next 30 minutes. No production data changed.')).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());
}
