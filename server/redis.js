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
      // Permission/cache reads must not wait through repeated connection attempts.
      // Existing local fallbacks handle failed commands; reconnect in the background.
      connectTimeout: 1500,
      commandTimeout: 1200,
      maxRetriesPerRequest: 1,
      retryStrategy: times => Math.min(500 * 2 ** Math.min(times, 6), 30000)
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

// Read independent cached entries in one round trip (chat reaction history).
async function getOtpBatch(keys) {
  if (!keys.length) return [];
  let values = [];
  try {
    const connection = getClient();
    if (connection) values = await connection.mget(...keys.map(key => OTP_PREFIX + key));
  } catch {}
  return keys.map((key, index) => {
    if (values[index]) {
      try { return JSON.parse(values[index]); } catch {}
    }
    const entry = otpFallback.get(key);
    if (entry && entry.expiresAt > Date.now()) return entry;
    otpFallback.delete(key);
    return null;
  });
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

// Moderator emails helpers — allows dynamic moderator invites stored in Redis
const moderatorFallback = new Set();
const MODERATOR_KEY = 'afterclass:moderators';

const excludedAdminsFallback = new Set();
const EXCLUDED_ADMINS_KEY = 'afterclass:excluded_admins';

async function getModeratorEmails() {
  try {
    const redis = getClient();
    if (!redis) return Array.from(moderatorFallback);
    const members = await redis.smembers(MODERATOR_KEY);
    return members && members.length > 0 ? members : Array.from(moderatorFallback);
  } catch (err) {
    return Array.from(moderatorFallback);
  }
}

async function addModeratorEmail(email) {
  const norm = String(email || '').trim().toLowerCase();
  if (!norm) return;
  moderatorFallback.add(norm);
  await removeExcludedAdminEmail(norm);
  try {
    const redis = getClient();
    if (redis) await redis.sadd(MODERATOR_KEY, norm);
  } catch {}
}

async function removeModeratorEmail(email) {
  const norm = String(email || '').trim().toLowerCase();
  if (!norm) return;
  moderatorFallback.delete(norm);
  try {
    const redis = getClient();
    if (redis) await redis.srem(MODERATOR_KEY, norm);
  } catch {}
}

async function getExcludedAdminEmails() {
  try {
    const redis = getClient();
    if (!redis) return Array.from(excludedAdminsFallback);
    const members = await redis.smembers(EXCLUDED_ADMINS_KEY);
    return members && members.length > 0 ? members : Array.from(excludedAdminsFallback);
  } catch (err) {
    return Array.from(excludedAdminsFallback);
  }
}

async function addExcludedAdminEmail(email) {
  const norm = String(email || '').trim().toLowerCase();
  if (!norm) return;
  excludedAdminsFallback.add(norm);
  try {
    const redis = getClient();
    if (redis) await redis.sadd(EXCLUDED_ADMINS_KEY, norm);
  } catch {}
}

async function removeExcludedAdminEmail(email) {
  const norm = String(email || '').trim().toLowerCase();
  if (!norm) return;
  excludedAdminsFallback.delete(norm);
  try {
    const redis = getClient();
    if (redis) await redis.srem(EXCLUDED_ADMINS_KEY, norm);
  } catch {}
}

module.exports = {
  limit,
  setOtp,
  getOtp,
  getOtpBatch,
  delOtp,
  ping,
  getModeratorEmails,
  addModeratorEmail,
  removeModeratorEmail,
  getExcludedAdminEmails,
  addExcludedAdminEmail,
  removeExcludedAdminEmail
};
