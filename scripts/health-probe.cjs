// Run outside the API host with persistent private state. No URLs, credentials or
// response bodies are logged. A dry run never contacts the email provider.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function probe(env,fetcher=fetch){
 const target=new URL(env.AFTERCLASS_HEALTH_URL);
 if(target.pathname!=='/health'||target.username||target.password||target.search||target.hash||(!['localhost','127.0.0.1'].includes(target.hostname)&&target.protocol!=='https:')||!['https:','http:'].includes(target.protocol))throw new Error('Use HTTPS /health, or HTTP on loopback.');
 if(!env.HEALTH_SECRET)throw new Error('HEALTH_SECRET is required.');
 const start=Date.now();
 try{const r=await fetcher(target,{headers:{'x-health-secret':env.HEALTH_SECRET},signal:AbortSignal.timeout(10000),redirect:'error'});const d=await r.json();return {healthy:r.ok&&d.status==='ok',latencyMs:Date.now()-start};}
 catch{return {healthy:false,latencyMs:Date.now()-start};}
}
async function notify(env,healthy,test=false,fetcher=fetch){
 if(!env.RESEND_API_KEY||!env.RESEND_FROM||!env.OPERATIONS_ALERT_EMAIL)throw new Error('Configure alert sender, recipient and email API key.');
 const subject=test?'Afterclass monitoring · delivery test':healthy?'Afterclass recovered':'Afterclass needs attention';
 const text=test?'This is a requested delivery test for Afterclass operational alerts. It confirms email-provider acceptance only; it does not confirm an independent monitor is scheduled.':healthy?'The protected Afterclass health check is passing again. Review the incident in the administration workspace.':'The protected Afterclass health check failed or could not be reached. Check the API, database and Redis. No user data is included in this alert.';
 const r=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:env.RESEND_FROM,to:[env.OPERATIONS_ALERT_EMAIL],subject,text}),signal:AbortSignal.timeout(10000),redirect:'error'});
 if(!r.ok)throw new Error('Alert provider rejected delivery (HTTP '+r.status+').');
 return {accepted:true};
}
function needsAlert(previous,result,now=Date.now()){
 return !result.healthy?previous?.notifiedHealthy!==false||now-(previous.notifiedAt||0)>=6*3600000:previous?.notifiedHealthy===false;
}
async function main(){
 const env=process.env;
 if(process.argv.includes('--test-alert')){await notify(env,true,true);console.log(JSON.stringify({alert:'test',providerAccepted:true}));return;}
 if(!env.AFTERCLASS_HEALTH_URL)throw new Error('AFTERCLASS_HEALTH_URL is required.');
 const result=await probe(env);
 if(process.argv.includes('--dry-run')){console.log(JSON.stringify({service:'afterclass',...result,alertSent:false}));process.exitCode=result.healthy?0:1;return;}
 if(!env.HEALTH_PROBE_STATE)throw new Error('HEALTH_PROBE_STATE must name a private persistent state file.');
 const file=path.resolve(env.HEALTH_PROBE_STATE),lock=file+'.lock',target=crypto.createHash('sha256').update(env.AFTERCLASS_HEALTH_URL).digest('hex');
 await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
 try{await fs.mkdir(lock,{mode:0o700});}catch(e){if(e.code==='EEXIST')throw new Error('Another probe is running. Remove a stale lock only after verifying its process has stopped.');throw e;}
 try{
  let previous={};try{previous=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error('Probe state is unreadable; refusing to reset alert history.');}
  if(previous.target!==target)previous={};
  let sent=false;if(needsAlert(previous,result)){await notify(env,result.healthy);sent=true;previous.notifiedAt=Date.now();previous.notifiedHealthy=result.healthy;}
  const temp=file+'.tmp';await fs.writeFile(temp,JSON.stringify({...previous,target,checkedAt:new Date().toISOString(),healthy:result.healthy}),{mode:0o600});await fs.rename(temp,file);
  console.log(JSON.stringify({service:'afterclass',...result,alertAccepted:sent,checkedAt:new Date().toISOString()}));process.exitCode=result.healthy?0:1;
 }finally{await fs.rmdir(lock);}
}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({healthy:false,error:e.message}));process.exitCode=2;});
module.exports={probe,notify,needsAlert};
