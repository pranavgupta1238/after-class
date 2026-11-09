import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {ageOn,datingEligible,canConnect,publicProfile,profileInput}=require('../server/connection-policy');
const now=new Date('2026-11-09T12:00:00Z');
const profile={birthDate:'2003-01-01',datingEnabled:true,minAge:18,maxAge:30,datingIntent:'relationship'};
const man={id:'a',campusId:'campus',gender:'man',accountStatus:'active',isVerified:true,verificationStatus:'approved',connectionProfile:profile};
const woman={...man,id:'b',gender:'woman'};
test('dating excludes missing, invalid, future and underage birth dates at the 18th birthday boundary',()=>{
 for(const birthDate of [null,'invalid','2030-01-01','2008-11-10'])assert.equal(datingEligible(man,{...profile,birthDate},now),false);
 assert.equal(ageOn('2008-11-09',now),18);assert.equal(datingEligible(man,{...profile,birthDate:'2008-11-09'},now),true);
});
test('dating requires reciprocal intent, age preferences, opt-in and approved verification',()=>{
 assert.equal(canConnect(man,woman,'dating',now),true);
 for(const patch of [{datingEnabled:false},{minAge:25},{maxAge:20},{datingIntent:'getting_to_know'},{birthDate:null}])assert.equal(canConnect(man,{...woman,connectionProfile:{...profile,...patch}},'dating',now),false);
 assert.equal(canConnect({...man,connectionProfile:{...profile,minAge:25}},woman,'dating',now),false);
 assert.equal(canConnect(man,{...woman,isVerified:false},'dating',now),false);
 assert.equal(canConnect(man,{...woman,gender:'man'},'social',now),false);
 assert.equal(canConnect(man,woman,'unsupported',now),false);
});
test('public profiles never disclose birth date, email, private age preferences or verification evidence',()=>{
 const publicData=publicProfile({...woman,email:'private@example.test',connectionProfile:{...profile,bio:'Hi',interests:['Books']}},'dating');
 assert.equal(publicData.age,ageOn(profile.birthDate));for(const key of ['email','birthDate','minAge','maxAge','verificationPhoto'])assert.equal(key in publicData,false);
 assert.equal('age' in publicProfile(woman),false);
});
test('profile writes validate real dates, recorded birthdays, interests, prompt pairing and range types',()=>{
 for(const body of [{birthDate:'2000-02-30'},{birthDate:'3000-01-01'},{interests:['Unknown']},{bio:'x'.repeat(241)},{minAge:17},{minAge:'18'},{minAge:40,maxAge:20},{prompt:'Unknown',answer:'hi'},{answer:'hi'}])assert.throws(()=>profileInput(body,null,man));
 assert.throws(()=>profileInput({birthDate:'2002-01-01'},profile,man),/already recorded/);
 assert.throws(()=>profileInput({datingEnabled:true},null,man),/18 or older/);
 const data=profileInput({bio:' Hello ',interests:['Coffee','Coffee']},null,man);assert.equal(data.bio,'Hello');assert.deepEqual(data.interests,['Coffee']);
});
