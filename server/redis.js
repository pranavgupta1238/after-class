const Redis = require('ioredis');

const fallback = new Map();
let client;
let redisDisabled = false;

function localLimit(key, max, windowMs) {
  const now = Date.now();
  const attempts = (fallback.get(key) || []).filter(timestamp => now - timestamp < windowMs);
  if (attempts.length >= max) return false;
  attempts.push(now);
  fallback.set(key, attempts);
  return true;
}

async function redisClient() {
  if (redisDisabled || !process.env.REDIS_URL) return null;
  if (!client) {
    client = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null
    });
    client.on('error', () => {});
  }
  if (client.status === 'wait') await client.connect();
  return client;
}

async function limit(key, max, windowMs) {
  try {
    const redis = await redisClient();
    if (!redis) return localLimit(key, max, windowMs);
    const count = await redis.eval(
      "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; return count",
      1,
      `afterclass:rate:${key}`,
      windowMs
    );
    return count <= max;
  } catch {
    redisDisabled = true;
    return localLimit(key, max, windowMs);
  }
}

async function ping() {
  const redis = await redisClient();
  return redis ? redis.ping() : 'LOCAL_FALLBACK';
}

module.exports = { limit, ping };
