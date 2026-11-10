import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
const require=createRequire(import.meta.url);
const {validateCandidate}=require('../scripts/check-redis.cjs');
const {restoreDrill}=require('../scripts/recovery.cjs');
const {runOnce}=require('../scripts/health-probe.cjs');

test('monitor persists outage deduplication and one recovery alert across runs',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'afterclass-monitor-test-'));
 const env={AFTERCLASS_HEALTH_URL:'https://afterclass.example/health',HEALTH_SECRET:'test',HEALTH_PROBE_STATE:path.join(dir,'state.json'),RESEND_API_KEY:'test',RESEND_FROM:'ops@example.com',OPERATIONS_ALERT_EMAIL:'test@example.com'};
 let healthy=false,providerOk=true;const subjects=[];
 const fetcher=async(url,options)=>{
  if(String(url).endsWith('/health'))return {ok:healthy,json:async()=>({status:healthy?'ok':'degraded'})};
  if(providerOk)subjects.push(JSON.parse(options.body).subject);
  return {ok:providerOk,status:503};
 };
 try{
  assert.equal((await runOnce(env,fetcher)).alertAccepted,true);
  assert.equal((await runOnce(env,fetcher)).alertAccepted,false);
  healthy=true;providerOk=false;
  await assert.rejects(()=>runOnce(env,fetcher),/rejected/);
  providerOk=true;assert.equal((await runOnce(env,fetcher)).alertAccepted,true);
  assert.equal((await runOnce(env,fetcher)).alertAccepted,false);
  assert.deepEqual(subjects,['Afterclass needs attention','Afterclass recovered']);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('candidate Redis validation requires authenticated Upstash TLS without disabling verification',()=>{
 assert.equal(validateCandidate('rediss://default:example@sample.upstash.io:6379').hostname,'sample.upstash.io');
 for(const value of ['redis://default:example@sample.upstash.io:6379','rediss://sample.upstash.io','rediss://default:x@sample.upstash.io.evil.invalid','rediss://default:x@sample.upstash.io?tls=false'])assert.throws(()=>validateCandidate(value));
});

test('tampered backup is rejected before Docker starts, and decrypted temporary files are cleaned',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'afterclass-backup-test-'));
 const before=new Set((await readdir(os.tmpdir())).filter(x=>x.startsWith('afterclass-restore-')));
 const previous=process.env.BACKUP_ENCRYPTION_KEY,oldPath=process.env.PATH;
 try{
  const key=crypto.randomBytes(32),iv=crypto.randomBytes(12),magic=Buffer.from('AFTERCLASS-BACKUP-1\n');
  process.env.BACKUP_ENCRYPTION_KEY=key.toString('hex');
  // No Docker can be launched in this test. Authentication must fail first.
  process.env.PATH=dir;
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(magic);
  const encrypted=Buffer.concat([cipher.update('private database contents'),cipher.final()]);
  encrypted[0]^=1;
  const file=path.join(dir,'corrupt.acb');await writeFile(file,Buffer.concat([magic,iv,encrypted,cipher.getAuthTag()]));
  await assert.rejects(()=>restoreDrill(file),/authenticat/i);
  const after=(await readdir(os.tmpdir())).filter(x=>x.startsWith('afterclass-restore-')&&!before.has(x));
  assert.deepEqual(after,[]);
 }finally{
  if(previous===undefined)delete process.env.BACKUP_ENCRYPTION_KEY;else process.env.BACKUP_ENCRYPTION_KEY=previous;
  process.env.PATH=oldPath;await rm(dir,{recursive:true,force:true});
 }
});
