// Schedule on an independent host. Exit codes can be consumed by any uptime runner.
// Never prints the URL, health secret, or response body.
(async()=>{
 const url=process.env.AFTERCLASS_HEALTH_URL,secret=process.env.HEALTH_SECRET;
 if(!url||!secret)throw new Error('Set AFTERCLASS_HEALTH_URL and HEALTH_SECRET.');
 const target=new URL(url);if(target.pathname!=='/health'||(!['localhost','127.0.0.1'].includes(target.hostname)&&target.protocol!=='https:'))throw new Error('Use HTTPS /health (HTTP allowed only on loopback).');
 const start=Date.now(),r=await fetch(target,{headers:{'x-health-secret':secret},signal:AbortSignal.timeout(10000),redirect:'error'});
 const data=await r.json();if(!r.ok||data.status!=='ok')throw new Error('Afterclass health check failed.');
 console.log(JSON.stringify({service:'afterclass',healthy:true,latencyMs:Date.now()-start,checkedAt:new Date().toISOString()}));
})().catch(error=>{console.error(JSON.stringify({service:'afterclass',healthy:false,error:error.message,checkedAt:new Date().toISOString()}));process.exitCode=1;});
