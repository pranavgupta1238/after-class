const roles=['student','faculty'];
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
function email(value){const e=String(value||'').trim().toLowerCase();return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)&&e.length<=254?e:null;}
function domain(value){const d=String(value||'').trim().toLowerCase();if(d.length>253||!d.includes('.')||!d.split('.').every(x=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x)))fail('Enter exact email domains, without @, URLs or wildcards.');return d;}
function policyFor(campus){return campus.accessPolicy||{domains:[{domain:campus.emailDomain.toLowerCase(),role:'student'}],members:[]};}
function classify(campus,value){const e=email(value);if(!e)return 'unknown';const p=policyFor(campus),rule=p.domains.find(r=>r.domain===e.split('@')[1]);if(!rule)return 'unknown';return rule.role==='roster'?(p.members.find(m=>m.email===e)?.role||'unknown'):rule.role;}
function eligible(campus,role){return roles.includes(role)&&(campus.audience==='both'||campus.audience===(role==='student'?'students':'faculty'));}
function accessReason(user){if(user?.campus?.status&&user.campus.status!=='active')return user.campus.status==='retired'?'Afterclass is no longer available at your university.':'Afterclass access at your university is paused.';if(user?.campusEligible===false)return 'Your account is not eligible under your university’s current access policy. Contact Afterclass support.';return null;}
function normalize(input){
 const name=String(input.name||'').trim(),location=String(input.location||'').trim();if(!name||name.length>120||location.length>180)fail('Enter a university name (up to 120 characters) and location (up to 180).');
 if(!['active','paused','retired'].includes(input.status))fail('Choose an access status.');if(!['students','faculty','both'].includes(input.audience))fail('Choose students, faculty or both.');if(typeof input.enrollmentOpen!=='boolean')fail('Choose whether new registrations are open.');
 const p=input.accessPolicy;if(!p||!Array.isArray(p.domains)||!p.domains.length||p.domains.length>20||!Array.isArray(p.members)||p.members.length>200)fail('Add 1–20 domains and at most 200 roster entries.');
 const domains=p.domains.map(r=>{if(![...roles,'roster'].includes(r.role))fail('Choose a role for every domain.');return {domain:domain(r.domain),role:r.role};});
 if(new Set(domains.map(r=>r.domain)).size!==domains.length)fail('A domain can have only one role rule. Use a shared domain and roster when needed.');
 const members=p.members.map(m=>{const e=email(m.email);if(!e||!roles.includes(m.role))fail('Roster entries need a valid email and student or faculty role.');if(!domains.some(r=>r.role==='roster'&&r.domain===e.split('@')[1]))fail('Roster emails must belong to a configured shared domain.');return {email:e,role:m.role};});
 if(new Set(members.map(m=>m.email)).size!==members.length)fail('Remove duplicate roster emails.');
 return {name,location,status:input.status,audience:input.audience,enrollmentOpen:input.enrollmentOpen,accessPolicy:{domains,members}};
}
function assess(campus,users){let allowed=0,blocked=0,changed=0;for(const u of users){const role=classify(campus,u.email),ok=eligible(campus,role)&&campus.status==='active';ok?allowed++:blocked++;if(role!==u.campusRole||eligible(campus,role)!==u.campusEligible)changed++;}return {accounts:users.length,allowed,blocked,changed};}
async function admission(db,value){
 const e=email(value);if(!e)throw Object.assign(new Error('Enter a valid university email.'),{status:400});
 const campuses=await db.campus.findMany(),user=await db.user.findUnique({where:{email:e}});
 // Existing members can authenticate to read their own reviews or recover owner access.
 // Community access is separately enforced on every API request and socket event.
 if(user){const campus=campuses.find(c=>c.id===user.campusId);if(!campus)throw Object.assign(new Error('Your university account needs support review.'),{status:403});return {campus,role:classify(campus,e),user};}
 const matches=campuses.filter(c=>policyFor(c).domains.some(r=>r.domain===e.split('@')[1]));
 if(matches.length!==1)throw Object.assign(new Error('Use an email from a supported university.'),{status:403});
 const campus=matches[0],role=classify(campus,e);
 if(campus.status!=='active'||!eligible(campus,role))throw Object.assign(new Error('This email is not eligible under the university’s current access policy.'),{status:403});
 if(!campus.enrollmentOpen)throw Object.assign(new Error('New registrations at this university are closed.'),{status:403});
 return {campus,role,user};
}
module.exports={email,domain,policyFor,classify,eligible,accessReason,normalize,assess,admission};
