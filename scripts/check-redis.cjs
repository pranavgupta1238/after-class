// Validate a candidate before changing REDIS_URL. Never print its URL or error text.
const Redis = require('ioredis');
function validateCandidate(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'rediss:' || !url.password || url.search || url.hash)
    throw new Error('Use an authenticated TLS Redis URL without query options.');
  if (!url.hostname.endsWith('.upstash.io'))
    throw new Error('Expected an Upstash hostname.');
  return url;
}
async function check(raw) {
  validateCandidate(raw);
  const client = new Redis(raw, {lazyConnect:true, tls:{rejectUnauthorized:true},
    connectTimeout:5000, commandTimeout:5000, retryStrategy:()=>null, maxRetriesPerRequest:0});
  client.on('error',()=>{});
  try { await client.connect(); return (await client.ping()) === 'PONG'; }
  finally { client.disconnect(); }
}
if (require.main === module) check(process.env.CANDIDATE_REDIS_URL).then(ok=>{
  console.log(JSON.stringify({connected:ok,tlsVerified:ok,configurationChanged:false}));
  process.exitCode=ok?0:1;
}).catch(()=>{console.error('Redis validation failed. Check the current Upstash database URL, password and availability. Local configuration was not changed.');process.exitCode=1;});
module.exports={validateCandidate,check};
