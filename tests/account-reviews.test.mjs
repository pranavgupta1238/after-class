import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),p=require('../server/review-policy');
test('review independence excludes the subject, decision-maker and reporting moderators',()=>{
 const a={userId:'subject',adminUserId:'original',evidence:{reporterIds:['reporter']}};
 for(const id of ['subject','original','reporter',null])assert.equal(p.independent(a,id),false);
 assert.equal(p.independent(a,'independent'),true);
});
test('student case serialization excludes internal evidence and staff or reporter identity',()=>{
 const action={id:'action',userId:'u',adminUserId:'secret',reason:'private',evidence:{reporterIds:['secret']} ,publicSummary:'Shared explanation'};
 const result=p.publicReview({id:'case',action,reviewerId:'secret',entries:[{id:'entry',kind:'submitted',body:'My statement',attachments:[],createdAt:new Date()}]});
 assert.equal(JSON.stringify(result).includes('secret'),false);assert.equal(JSON.stringify(result).includes('private'),false);
 assert.equal(result.action.summary,'Shared explanation');
});
test('evidence rejects active content, misleading image types, excess files and oversize data',()=>{
 assert.throws(()=>p.attachments([{data:'data:image/svg+xml;base64,PHN2Zz4='}]));
 assert.throws(()=>p.attachments([{data:'data:image/png;base64,'+Buffer.from('<script>bad</script>').toString('base64')}]));
 assert.throws(()=>p.attachments([{}, {}, {}, {}]));
 const data='data:image/png;base64,'+Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(512*1024)]).toString('base64');assert.throws(()=>p.attachments([{data}]));
 assert.throws(()=>p.hours(-1));assert.throws(()=>p.hours(1.5));assert.throws(()=>p.hours(8761));assert.equal(p.hours(24),24);
});
