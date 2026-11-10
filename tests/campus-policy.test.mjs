import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),p=require('../server/campus-policy'),{canPair}=require('../server/match-policy'),{datingEligible}=require('../server/connection-policy');
const base={name:'Example University',location:'Campus',audience:'students',status:'active',enrollmentOpen:true,accessPolicy:{domains:[{domain:'students.example.edu',role:'student'},{domain:'example.edu',role:'faculty'},{domain:'shared.example.edu',role:'roster'}],members:[{email:'approved@shared.example.edu',role:'student'}]}};
test('exact institution domains and explicit roster prevent self-declared membership',()=>{
 const c=p.normalize(base);assert.equal(p.classify(c,'Student@STUDENTS.example.edu'),'student');assert.equal(p.classify(c,'faculty@example.edu'),'faculty');assert.equal(p.classify(c,'approved@shared.example.edu'),'student');
 for(const email of ['person@shared.example.edu','x@evil.students.example.edu','x@students.example.edu.evil.com','x@example.edu@students.example.edu'])assert.equal(p.classify(c,email),'unknown');
 assert.equal(p.eligible(c,'faculty'),false);assert.equal(p.eligible({...c,audience:'both'},'faculty'),true);assert.equal(p.eligible({...c,audience:'faculty'},'student'),false);
 for(const domains of [[{domain:'*.example.edu',role:'student'}],[{domain:'example.edu',role:'faculty'},{domain:'example.edu',role:'student'}]])assert.throws(()=>p.normalize({...base,accessPolicy:{domains,members:[]}}));
 assert.throws(()=>p.normalize({...base,accessPolicy:{...base.accessPolicy,members:[{email:'x@foreign.edu',role:'faculty'}]}}),/shared domain/);
});
test('closed or retired campuses deny new members but retain existing review access',async()=>{
 let c={...base,id:'campus',enrollmentOpen:false},user=null;const db={campus:{findMany:async()=>[c]},user:{findUnique:async()=>user}};
 await assert.rejects(()=>p.admission(db,'new@students.example.edu'),/closed/);user={campusId:'campus'};assert.equal((await p.admission(db,'new@students.example.edu')).role,'student');
 user={campusId:'other'};await assert.rejects(()=>p.admission(db,'new@students.example.edu'),/support review/);
 for(const status of ['paused','retired']){c={...c,status};user=null;await assert.rejects(()=>p.admission(db,'new@students.example.edu'),/not eligible/);user={campusId:'campus'};assert.equal((await p.admission(db,'new@students.example.edu')).user,user);assert.ok(p.accessReason({campus:c}));}
});
test('matching honours membership eligibility and separates student/faculty cohorts',()=>{
 const a={id:'a',campusId:'c',gender:'man',isVerified:true,verificationStatus:'approved',accountStatus:'active',campusRole:'student',campusEligible:true},b={...a,id:'b',gender:'woman'};
 assert.equal(canPair(a,b),true);assert.equal(canPair(a,{...b,campusEligible:false}),false);assert.equal(canPair(a,{...b,campusRole:'faculty'}),false);assert.equal(canPair({...a,campusRole:'faculty'},{...b,campusRole:'faculty'}),true);assert.equal(datingEligible({...a,campusRole:'faculty'},{datingEnabled:true,birthDate:'2000-01-01'}),false);
});
