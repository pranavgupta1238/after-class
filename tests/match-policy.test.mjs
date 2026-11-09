import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {canPair,eligibleForPairing,isOpenPlan}=require('../server/match-policy');
const {accept,apply}=require('../server/match-service');
const man={id:'a',campusId:'campus',gender:'man',isVerified:true,verificationStatus:'approved',accountStatus:'active'};
const woman={...man,id:'b',gender:'woman'};
test('pairing requires reciprocal man/woman accounts with approved verification',()=>{
 assert.equal(canPair(man,woman),true);assert.equal(canPair(woman,man),true);
 for(const gender of ['man','nonbinary','self_described','prefer_not_to_say',null])assert.equal(canPair(man,{...woman,gender}),false);
 for(const patch of [{isVerified:false},{verificationStatus:'pending'},{verificationStatus:'rejected'},{accountStatus:'banned'},{accountStatus:'suspended'},{suspendedUntil:new Date(Date.now()+60000)},{id:'a'},{campusId:'other'}])assert.equal(canPair(man,{...woman,...patch}),false);
 assert.equal(eligibleForPairing({...man,isVerified:false,isAdmin:true}),false);
});
test('past, closed, expired or invalid plans cannot create matches',()=>{
 const plan={status:'open',scheduledAt:new Date(Date.now()+60000),expiresAt:new Date(Date.now()+120000)};
 assert.equal(isOpenPlan(plan),true);
 for(const patch of [{status:'cancelled'},{status:'matched'},{scheduledAt:new Date(0)},{expiresAt:new Date(0)},{scheduledAt:'invalid'}])assert.equal(isOpenPlan({...plan,...patch}),false);
});
test('apply checks current server account state before creating interest',async()=>{
 let writes=0;
 const db={matchRequest:{findFirst:async()=>({requester:woman,status:'open',scheduledAt:new Date(Date.now()+60000),expiresAt:new Date(Date.now()+120000)})},user:{findUnique:async()=>({...man,isVerified:false})},matchApplication:{create:async()=>writes++}};
 await assert.rejects(()=>apply(db,man,'plan'),/verified accounts/);assert.equal(writes,0);
});
test('accept rechecks applicant verification before claiming a plan or creating a room',async()=>{
 let writes=0;
 const tx={$queryRaw:async()=>[],user:{findUnique:async({where})=>where.id==='a'?man:woman},userBlock:{findFirst:async()=>null},matchApplication:{findFirst:async()=>({applicantId:'b',request:{requesterId:man.id,requester:man,status:'open',scheduledAt:new Date(Date.now()+60000),expiresAt:new Date(Date.now()+120000)},applicant:{...woman,verificationStatus:'rejected'}})},matchRequest:{updateMany:async()=>{writes++;return {count:1}}},chatRoom:{create:async()=>writes++}};
 tx.user.findUnique=async({where})=>where.id==='a'?man:{...woman,verificationStatus:'rejected'};
 await assert.rejects(()=>accept({$transaction:fn=>fn(tx)},man,'application'),/verified accounts/);assert.equal(writes,0);
});
test('a lost atomic claim cannot create a second chat room',async()=>{
 let rooms=0;
 const tx={$queryRaw:async()=>[],user:{findUnique:async({where})=>where.id==='a'?man:woman},userBlock:{findFirst:async()=>null},matchApplication:{findFirst:async()=>({requestId:'p',applicantId:'b',applicantId:'b',request:{requesterId:man.id,requester:man,status:'open',scheduledAt:new Date(Date.now()+60000),expiresAt:new Date(Date.now()+120000)},applicant:woman})},matchRequest:{updateMany:async()=>({count:0})},chatRoom:{create:async()=>rooms++}};
 await assert.rejects(()=>accept({$transaction:fn=>fn(tx)},man,'application'),/already been matched/);assert.equal(rooms,0);
});
test('eligible acceptance creates a room, match and reciprocal consent',async()=>{
 const calls=[];
 const tx={$queryRaw:async()=>[],user:{findUnique:async({where})=>where.id==='a'?man:woman},userBlock:{findFirst:async()=>null},matchApplication:{findFirst:async()=>({id:'app',requestId:'p',applicantId:'b',request:{requesterId:man.id,requester:man,campusId:'campus',status:'open',scheduledAt:new Date(Date.now()+60000),expiresAt:new Date(Date.now()+120000)},applicant:woman}),update:async()=>calls.push('accepted'),updateMany:async()=>calls.push('waiting')},matchRequest:{updateMany:async()=>({count:1})},chatRoom:{create:async()=>({id:'room'})},match:{create:async({data})=>{assert.equal(data.userOneId,'a');assert.equal(data.userTwoId,'b');return {id:'match',...data};}},revealConsent:{createMany:async({data})=>{assert.deepEqual(data.map(d=>d.userId),['a','b']);calls.push('consent');}}};
 const result=await accept({$transaction:fn=>fn(tx)},man,'app');assert.equal(result.id,'match');assert.deepEqual(calls,['accepted','waiting','consent']);
});
