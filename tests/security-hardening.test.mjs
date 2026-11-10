import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateProduction,protections,normalizeSelfie}=require('../server/security');
const {totp,encode}=require('../server/staff-security');
const {rankAvailable}=require('../server/availability-ranking');
const sharp=require('sharp');
test('production rejects insecure defaults and reused secrets',()=>{
 assert.throws(()=>validateProduction({NODE_ENV:'production'}),/JWT_SECRET/);
 const env={NODE_ENV:'production',JWT_SECRET:'a'.repeat(32),OTP_PEPPER:'b'.repeat(32),STAFF_ENCRYPTION_KEY:'c'.repeat(32),REDIS_URL:'rediss://localhost',CLIENT_URL:'https://example.invalid'};
 assert.doesNotThrow(()=>validateProduction(env));assert.throws(()=>validateProduction({...env,OTP_PEPPER:env.JWT_SECRET}),/independent/);assert.throws(()=>validateProduction({...env,AFTERCLASS_REVIEW:'1'}),/Review/);
});
test('TOTP follows RFC 6238 published SHA-1 vectors',()=>{
 const secret=encode(Buffer.from('12345678901234567890'));
 for(const [seconds,expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']])assert.equal(totp(secret,Math.floor(seconds/30),8),expected);
});
test('cross-site cookie writes are rejected; same-origin writes work',()=>{
 const call=(origin,site)=>{let status=200,next=false;protections({path:'/api/connections/availability',method:'POST',protocol:'http',headers:{cookie:'session=x'},get:k=>({'Origin':origin,'Sec-Fetch-Site':site,host:'localhost:3002'})[k]}, {set(){},status(s){status=s;return this;},json(){}},()=>next=true);return {status,next};};
 assert.deepEqual(call('https://hostile.invalid','cross-site'),{status:403,next:false});assert.deepEqual(call('http://localhost:3002','same-origin'),{status:200,next:true});
});
test('selfies must decode, strip metadata and become bounded WebP',async()=>{
 await assert.rejects(normalizeSelfie('data:image/svg+xml;base64,PHN2Zz4='));
 await assert.rejects(normalizeSelfie('data:image/png;base64,iVBORw0KGgoAAAAAAAAAAAAA'));
 const png=await sharp({create:{width:1600,height:800,channels:3,background:'#336699'}}).png().toBuffer();const output=await normalizeSelfie('data:image/png;base64,'+png.toString('base64'));const meta=await sharp(output).metadata();assert.equal(meta.format,'webp');assert.equal(meta.width,1280);assert.equal(meta.exif,undefined);
});
test('only one concurrent OTP redemption succeeds',async()=>{
 const redis=require('../server/redis');const email='atomic-test@invalid';await redis.setOtp(email,{codeHash:'correct'});
 assert.equal(await redis.consumeOtp(email,'wrong'),null);
 const results=await Promise.all(Array.from({length:10},()=>redis.consumeOtp(email,'correct')));assert.equal(results.filter(Boolean).length,1);
});
test('production rate limiting fails closed without Redis and dating remains gated',async()=>{
 const old=process.env.NODE_ENV;process.env.NODE_ENV='production';try{assert.equal(await require('../server/redis').limit('prod',10,1000),false);assert.equal(require('../server/connection-policy').datingEligible({isVerified:true},{datingEnabled:true,birthDate:'2000-01-01'}),false);}finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}
});
test('availability ranking explains shared activity and time, ignores expired accounts',()=>{
 const now=new Date('2026-11-10T10:00Z'),profile={availableUntil:'2026-11-10T11:00Z',availabilityActivity:'coffee',interests:['Books']};
 const users=[{id:'z',connectionProfile:{...profile,availabilityActivity:'move'}},{id:'a',connectionProfile:profile},{id:'x',connectionProfile:{...profile,availableUntil:'2026-11-10T09:00Z'}}];
 const results=rankAvailable({connectionProfile:profile},users,now);assert.deepEqual(results.map(x=>x.user.id),['a','z']);assert.equal(results[0].overlapMinutes,60);assert.deepEqual(results[0].sharedInterests,['Books']);assert.ok(results[0].reasons.includes('Same activity'));
});
