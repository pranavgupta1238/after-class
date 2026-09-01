const Redis = require('ioredis');

const rateFallback = new Map();
const otpFallback = new Map();
let client = null;

const OTP_PREFIX = 'afterclass:otp:';
const OTP_TTL_MS = 600000; // 10 minutes

function getClient() {
  if (!process.env.REDIS_URL) return null;
  if (!client) {
    client = new Redis(process.env.REDIS_URL, {
      tls: { rejectUnauthorized: false },
      maxRetriesPerRequest: 2,
      retryStrategy: times => Math.min(times * 50, 2000)
    });
    client.on('error', err => console.warn('[Redis Warning]', err.message));
  }
  return client;
}

function localLimit(key, max, windowMs) {
  const now = Date.now();
  const attempts = (rateFallback.get(key) || []).filter(ts => now - ts < windowMs);
  if (attempts.length >= max) return false;
  attempts.push(now);
  rateFallback.set(key, attempts);
  return true;
}

async function limit(key, max, windowMs) {
  try {
    const redis = getClient();
    if (!redis) return localLimit(key, max, windowMs);
    const count = await redis.eval(
      "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; return count",
      1,
      `afterclass:rate:${key}`,
      windowMs
    );
    return count <= max;
  } catch (err) {
    return localLimit(key, max, windowMs);
  }
}

// OTP helpers — store one-time codes in Upstash Redis with a 10-minute TTL.

async function setOtp(email, data) {
  try {
    const redis = getClient();
    if (!redis) {
      otpFallback.set(email, { ...data, expiresAt: Date.now() + OTP_TTL_MS });
      return;
    }
    await redis.set(OTP_PREFIX + email, JSON.stringify(data), 'PX', OTP_TTL_MS);
  } catch (err) {
    console.warn('[setOtp fallback]', err.message);
    otpFallback.set(email, { ...data, expiresAt: Date.now() + OTP_TTL_MS });
  }
}

async function getOtp(email) {
  try {
    const redis = getClient();
    if (!redis) {
      const entry = otpFallback.get(email);
      if (!entry || entry.expiresAt <= Date.now()) { otpFallback.delete(email); return null; }
      return entry;
    }
    const raw = await redis.get(OTP_PREFIX + email);
    if (raw) return JSON.parse(raw);
    const entry = otpFallback.get(email);
    if (!entry || entry.expiresAt <= Date.now()) { otpFallback.delete(email); return null; }
    return entry;
  } catch (err) {
    console.warn('[getOtp fallback]', err.message);
    const entry = otpFallback.get(email);
    if (!entry || entry.expiresAt <= Date.now()) { otpFallback.delete(email); return null; }
    return entry;
  }
}

async function delOtp(email) {
  try {
    otpFallback.delete(email);
    const redis = getClient();
    if (redis) await redis.del(OTP_PREFIX + email);
  } catch (err) {
    otpFallback.delete(email);
  }
}

async function ping() {
  try {
    const redis = getClient();
    return redis ? await redis.ping() : 'LOCAL_FALLBACK';
  } catch {
    return 'LOCAL_FALLBACK';
  }
}

module.exports = { limit, setOtp, getOtp, delOtp, ping };
