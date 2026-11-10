async function checkHealth({prisma,redis,requiredRedis=process.env.NODE_ENV==='production'||!!process.env.REDIS_URL}) {
 const deadline=async(work)=>{let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),3000);timer.unref();})]);}finally{clearTimeout(timer);}};
 const [db,cache]=await Promise.allSettled([deadline(prisma.$queryRaw`SELECT 1`),deadline(redis.ping())]);
 const database=db.status==='fulfilled',redisOk=cache.status==='fulfilled'&&cache.value==='PONG';
 return {status:database&&(!requiredRedis||redisOk)?'ok':'degraded',database:database?'connected':'unavailable',redis:redisOk?'connected':requiredRedis?'unavailable':'not_configured',checkedAt:new Date()};
}
module.exports={checkHealth};
