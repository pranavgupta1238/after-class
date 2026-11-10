// Fictional fixtures for the isolated local review database only.
async function seedReviewColleges(db){
 const campus=await db.campus.upsert({where:{slug:'review-lakeside'},create:{slug:'review-lakeside',name:'Lakeside College · Demo',emailDomain:'lakeside.review.invalid'},update:{}});
 const people=[];
 for(const [email,publicAlias,gender,verified] of [['lakeside-host','CedarSky','woman',true],['lakeside-student','OceanFinch','man',true],['lakeside-pending','MapleCloud','woman',false]])people.push(await db.user.upsert({where:{email:email+'@review.invalid'},create:{campusId:campus.id,email:email+'@review.invalid',publicAlias,gender,isVerified:verified,verificationStatus:verified?'approved':'pending'},update:{}}));
 if(!await db.matchRequest.count({where:{campusId:campus.id}}))await db.matchRequest.create({data:{campusId:campus.id,requesterId:people[0].id,activity:'An afternoon by the lake',location:'Campus lake pavilion',scheduledAt:new Date(Date.now()+86400000),expiresAt:new Date(Date.now()+2*86400000)}});
 if(!await db.report.count({where:{campusId:campus.id}}))await db.report.create({data:{campusId:campus.id,reporterId:people[0].id,reportedUserId:people[1].id,reason:'spam',detail:'Fictional review fixture: repeated invitations. Not a real incident.',createdAt:new Date(Date.now()-3*86400000)}});
}
module.exports={seedReviewColleges};
