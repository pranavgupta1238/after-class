const POLICIES = ['Respectful communication','Harassment or threats','Identity or impersonation','Unwanted contact','Spam or misuse','Other community guideline'];
function fail(message,status=400){const error=new Error(message);error.status=status;throw error;}
function text(value,min=20,max=4000){if(typeof value!=='string'||value.trim().length<min||value.length>max)fail(`Please write between ${min} and ${max} characters.`);return value.trim();}
function attachments(input=[]){
 if(!Array.isArray(input)||input.length>3)fail('Add up to three images.');
 return input.map(file=>{
  if(!file||typeof file.data!=='string')fail('Invalid image.');
  const m=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(file.data);
  if(!m)fail('Use PNG, JPEG or WebP images.');
  const bytes=Buffer.from(m[2],'base64');
  if(bytes.length>512*1024||bytes.length<12)fail('Each image must be under 512 KB.');
  const valid=m[1]==='png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):m[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(!valid)fail('The image format is invalid.');
  return {name:String(file.name||'Evidence image').slice(0,120),data:file.data};
 });
}
function independent(action,reviewerId){return Boolean(reviewerId&&reviewerId!==action.userId&&reviewerId!==action.adminUserId&&!((action.evidence||{}).reporterIds||[]).includes(reviewerId));}
function publicAction(action){return {id:action.id,type:action.type,policy:action.policy||'Account restriction',summary:action.publicSummary||'This restriction predates the Review Centre. Ask for a review to request an explanation.',startsAt:action.startsAt,endsAt:action.endsAt,liftedAt:action.liftedAt};}
function publicReview(review){return {id:review.id,status:review.status,outcome:review.outcome,createdAt:review.createdAt,resolvedAt:review.resolvedAt,reopenedAt:review.reopenedAt,action:publicAction(review.action),entries:(review.entries||[]).map(({id,kind,body,attachments,createdAt})=>({id,kind,body,attachments,createdAt}))};}
function hours(value){if(!Number.isInteger(value)||value<1||value>8760)fail('Choose a duration between 1 hour and 1 year.');return value;}
module.exports={POLICIES,fail,text,attachments,independent,publicAction,publicReview,hours};
