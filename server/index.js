require('dotenv').config?.();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const { Server } = require('socket.io');
const { PrismaClient, RoomKind, MatchStatus, RevealStatus } = require('@prisma/client');
const campuses = require('./campuses');
const matchService = require('./match-service');
const { canPair } = require('./match-policy');
const adminReports = require('./admin-reports');
const redis = require('./redis');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true } });

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const SECRET = process.env.JWT_SECRET || 'local-development-secret-change-me';
const OTP_PEPPER = process.env.OTP_PEPPER || SECRET;

const prisma = new PrismaClient();
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const reactions = require('./reactions');
const { getCampusOnlineUserIds, canJoinIdentityRoom } = require('./presence');

const names = {
  adjectives: ['Amber','Brisk','Clever','Daring','Gentle','Mossy','Quiet','Sunny','Velvet','Witty','Bright','Kind','Swift','Calm','Happy','Cosmic'],
  nouns: ['Acorn','Badger','Cedar','Comet','Clover','Heron','Mango','Otter','Pine','Robin','Sparrow','Willow','Fox','Maple','Moon','River']
};

app.use((req, res, next) => {
  if (req.path === '/api/verify/selfie' || req.originalUrl?.startsWith('/api/verify/selfie')) {
    return express.json({ limit: '5mb' })(req, res, next);
  }
  return express.json({ limit: '64kb' })(req, res, next);
});
app.use(cookieParser());
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({ error: 'Photo is too large. Please retake the photo.' });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON request payload.' });
  }
  next(err);
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function generateUsername() {
  for (let n = 0; n < 100; n++) {
    const value = names.adjectives[Math.floor(Math.random() * names.adjectives.length)]
      + names.nouns[Math.floor(Math.random() * names.nouns.length)];
    const existing = await prisma.user.findFirst({ where: { publicAlias: value } });
    if (!existing) return value;
  }
  return 'Campus' + Date.now();
}

// Returns the safe public representation of a Prisma user.
// Expects user to be loaded with include: { campus: true }.
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.publicAlias,
    university: u.campus?.name || 'Unknown',
    campusId: u.campus?.slug || u.campusId,
    reputation: u.reputationScore,
    avatarConfig: u.avatarConfig || null,
    gender: u.gender,
    genderLocked: Boolean(u.genderLocked),
    isVerified: Boolean(u.isVerified),
    verificationStatus: u.verificationStatus || 'unverified',
    createdAt: u.createdAt
  };
}

function token(user) {
  return jwt.sign({ sub: user.id, sv: user.sessionVersion || 0 }, SECRET, { expiresIn: '30d', issuer: 'afterclass', audience: 'afterclass-web' });
}

function hashOtp(email, code) {
  return crypto.createHmac('sha256', OTP_PEPPER).update(`${email}:${code}`).digest('hex');
}

function accountUnavailable(user) {
  return !user || user.accountStatus === 'banned' || (user.suspendedUntil && new Date(user.suspendedUntil) > new Date());
}

function validHealthSecret(value) {
  const expected = process.env.HEALTH_SECRET;
  if (!expected || typeof value !== 'string') return false;
  const actual = Buffer.from(value), target = Buffer.from(expected);
  return actual.length === target.length && crypto.timingSafeEqual(actual, target);
}

async function deliverOtp(email, code) {
  if (!resend) return;
  const from = process.env.RESEND_FROM || 'Afterclass <onboarding@resend.dev>';
  const { data, error } = await resend.emails.send({
    from,
    to: [email],
    subject: 'Your Afterclass verification code',
    text: `Your Afterclass verification code is ${code}. It expires in 10 minutes.`,
    html: `<p>Your Afterclass verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`
  });
  if (error) {
    console.error('Resend delivery error:', error);
    throw new Error(error.message || 'Unable to send verification email.');
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function deliverWarningEmail(email, { alias, reason, campusName }) {
  if (!resend || !email) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[DEV WARNING EMAIL] To: ${email} | Student: ${alias} | Reason: ${reason}`);
    }
    return;
  }
  const from = process.env.RESEND_FROM || 'Afterclass <onboarding@resend.dev>';
  const subject = `[Important] Official Community Guidelines Warning - Afterclass (${campusName || 'Campus'})`;
  const text = `Hello ${alias},\n\nThe campus moderation team at ${campusName || 'your university'} has issued an official warning regarding your recent activity on Afterclass.\n\nReason / Guidance:\n"${reason}"\n\nCommunity Guidelines Reminder:\nAfterclass is built on mutual respect and student safety. Please keep interactions respectful and adhere to community guidelines. Repeated violations will result in automated account escalation: a 24-hour timeout, 7-day timeout, or permanent account ban.\n\n— Campus Moderation Team\nAfterclass`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e9e5; border-radius: 12px; background: #ffffff; color: #172421;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid #e5e9e5; padding-bottom: 16px;">
        <span style="font-size: 24px; color: #e05c3a;">✦</span>
        <span style="font-size: 20px; font-weight: 700; color: #172421;">afterclass</span>
        <span style="margin-left: auto; font-size: 11px; background: #fee2e2; color: #b91c1c; font-weight: 700; padding: 4px 8px; border-radius: 6px; letter-spacing: 0.5px;">OFFICIAL NOTICE</span>
      </div>

      <h2 style="font-size: 20px; font-weight: 700; color: #172421; margin: 0 0 12px;">Official Community Guidelines Warning</h2>

      <p style="font-size: 14px; line-height: 1.6; color: #374151; margin: 0 0 16px;">
        Hello <b>${escapeHtml(alias)}</b>,
      </p>

      <p style="font-size: 14px; line-height: 1.6; color: #374151; margin: 0 0 16px;">
        The campus moderation team at <b>${escapeHtml(campusName || 'your university')}</b> has issued an official warning regarding your recent activity on Afterclass.
      </p>

      <div style="background: #fff7ed; border-left: 4px solid #ea580c; border-radius: 0 8px 8px 0; padding: 14px 16px; margin: 18px 0;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #c2410c; margin-bottom: 6px;">Moderator Guidance / Reason</div>
        <div style="font-size: 14px; color: #172421; font-weight: 500; line-height: 1.5;">${escapeHtml(reason)}</div>
      </div>

      <div style="background: #f8faf8; border: 1px solid #e5e9e5; border-radius: 8px; padding: 14px 16px; margin: 20px 0;">
        <h4 style="margin: 0 0 6px; font-size: 13px; font-weight: 600; color: #172421;">Campus Standards & Safety Policy</h4>
        <p style="margin: 0; font-size: 12.5px; line-height: 1.5; color: #6b7280;">
          Afterclass is designed to be a safe, respectful space for university students. Please review our community guidelines and keep interactions courteous.
        </p>
        <p style="margin: 8px 0 0; font-size: 12px; color: #dc2626; font-weight: 600;">
          ⚠️ Escalation Policy: Repeated violations will result in temporary suspension (24-hour / 7-day timeout) or a permanent account ban.
        </p>
      </div>

      <div style="border-top: 1px solid #e5e9e5; padding-top: 16px; margin-top: 24px; font-size: 11.5px; color: #9ca3af; text-align: center;">
        This is an official administrative notice sent to your verified campus email (${escapeHtml(email)}).
      </div>
    </div>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: [email],
      subject,
      text,
      html
    });
    if (error) {
      console.error('[Warning Email Delivery Error]:', error);
    } else {
      console.info(`[Warning Email Sent] Delivered warning notice to ${email} (Message ID: ${data?.id})`);
    }
  } catch (err) {
    console.error('[Warning Email Delivery Exception]:', err);
  }
}

// Auth middleware — reads Prisma user with campus included on every request.
async function auth(req, res, next) {
  try {
    const raw = req.cookies.session || req.headers.authorization?.replace('Bearer ', '');
    const p = jwt.verify(raw, SECRET, { issuer: 'afterclass', audience: 'afterclass-web' });
    const user = await prisma.user.findUnique({ where: { id: p.sub }, include: { campus: true } });
    if (accountUnavailable(user) || p.sv !== (user.sessionVersion || 0)) return res.status(401).json({ error: 'Account unavailable' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Authentication required' });
  }
}

function addAdminToEnvFile(email) {
  try {
    const envPath = path.resolve(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf8');
      const envAdmins = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean);
      if (!envAdmins.includes(email)) {
        envAdmins.push(email);
        process.env.ADMIN_EMAILS = envAdmins.join(',');
        if (/^ADMIN_EMAILS=.*$/m.test(content)) {
          content = content.replace(/^ADMIN_EMAILS=.*$/m, `ADMIN_EMAILS="${process.env.ADMIN_EMAILS}"`);
        } else {
          content += `\nADMIN_EMAILS="${process.env.ADMIN_EMAILS}"\n`;
        }
        fs.writeFileSync(envPath, content, 'utf8');
      }
    }
  } catch (e) {
    console.error('Failed to update .env with new admin:', e);
  }
}

function removeAdminFromEnvFile(email) {
  try {
    const envPath = path.resolve(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf8');
      const envAdmins = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(e => e && e !== email);
      process.env.ADMIN_EMAILS = envAdmins.join(',');
      content = content.replace(/^ADMIN_EMAILS=.*$/m, `ADMIN_EMAILS="${process.env.ADMIN_EMAILS}"`);
      fs.writeFileSync(envPath, content, 'utf8');
    }
  } catch (e) {
    console.error('Failed to update .env:', e);
  }
}

async function isAdminUser(user) {
  if (!user || !user.email) return false;
  const email = user.email.toLowerCase().trim();

  const excludedAdmins = await redis.getExcludedAdminEmails();
  if (excludedAdmins.includes(email)) return false;

  const envAdminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  if (envAdminEmails.includes(email)) return true;

  const dynamicModerators = await redis.getModeratorEmails();
  return dynamicModerators.includes(email);
}

async function requireAdmin(req, res, next) {
  if (req.headers['x-admin-key'] && req.headers['x-admin-key'] === process.env.ADMIN_KEY) {
    return next();
  }
  return auth(req, res, async () => {
    const admin = await isAdminUser(req.user);
    if (!admin) {
      return res.status(403).json({ error: 'Access denied: Admin privileges required.' });
    }
    req.isAdmin = true;
    next();
  });
}

async function requireVerified(req, res, next) {
  return auth(req, res, async () => {
    if (req.user.isVerified || await isAdminUser(req.user)) {
      return next();
    }
    return res.status(403).json({ error: 'Identity verification required. Complete your live face check to proceed.' });
  });
}



function clean(content) {
  return content.trim().slice(0, 500).replace(/\b(fuck|shit|bitch|asshole)\b/gi, '****');
}

// Touches lastActiveAt and returns the campus chat room for the given user.
async function campusRoom(user) {
  await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
  const room = await prisma.chatRoom.findFirst({ where: { campusId: user.campusId, kind: RoomKind.campus } });
  if (!room) throw new Error('Campus room unavailable');
  return room;
}

function publicMessage(m, reactions = []) {
  return {
    id: m.id,
    content: m.content,
    isFiltered: m.isFiltered,
    isSystem: m.senderAlias === 'System',
    expiresAt: m.expiresAt || null,
    createdAt: m.createdAt,
    sender: { username: m.senderAlias },
    reactions: Array.isArray(reactions) ? reactions : []
  };
}

// ── Health ──────────────────────────────────────────────────────────────────

app.get('/api/health', async (req, res) => {
  try { res.json({ ok: true, service: 'afterclass', redis: await redis.ping() }); }
  catch { res.status(503).json({ ok: false, service: 'afterclass', redis: 'unavailable' }); }
});

app.get('/health', async (req, res) => {
  if (!validHealthSecret(req.get('x-health-secret'))) return res.status(401).json({ status: 'unauthorized' });
  try { await prisma.$queryRaw`SELECT 1`; res.json({ status: 'ok', db: 'connected' }); }
  catch { res.status(503).json({ status: 'unavailable', db: 'disconnected' }); }
});

// ── Auth ────────────────────────────────────────────────────────────────────

app.post('/api/auth/send-otp', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const gender = String(req.body.gender || '').trim();
  const campus = campuses.fromEmail(email);
  if (!campus) return res.status(400).json({ error: 'Use an email from a supported university.' });
  const maxOtpPerHour = process.env.NODE_ENV === 'production' ? 5 : 50;
  if (!await redis.limit('otp:send:' + email, maxOtpPerHour, 3600000)) return res.status(429).json({ error: 'Too many codes requested. Try again later.' });
  const code = String(crypto.randomInt(100000, 1000000));
  try { await deliverOtp(email, code); } catch (err) { return res.status(503).json({ error: err.message }); }
  // Store OTP hash + campus slug + gender in Redis with 10-minute TTL
  await redis.setOtp(email, { codeHash: hashOtp(email, code), campusId: campus.id, gender });
  const isDevWithoutResend = process.env.NODE_ENV !== 'production' && !process.env.RESEND_API_KEY;
  if (isDevWithoutResend) console.info(`[DEV OTP] ${email}: ${code}`);
  res.json({ ok: true, campus: campus.name, ...(isDevWithoutResend ? { developmentCode: code } : {}) });
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  if (!await redis.limit('otp:verify:' + email, 10, 600000)) return res.status(429).json({ error: 'Too many verification attempts. Request a new code.' });
  const otp = await redis.getOtp(email);
  if (!otp || otp.codeHash !== hashOtp(email, code)) return res.status(400).json({ error: 'That code is invalid or expired.' });
  await redis.delOtp(email);
  // Resolve campus UUID from the slug stored in the OTP
  const dbCampus = await prisma.campus.findUnique({ where: { slug: otp.campusId } });
  if (!dbCampus) return res.status(400).json({ error: 'Campus unavailable.' });
  let user = await prisma.user.findUnique({ where: { email }, include: { campus: true } });
  if (user && accountUnavailable(user)) return res.status(403).json({ error: 'This account is not available.' });
  
  const validGenders = ['woman', 'man', 'nonbinary', 'prefer_not_to_say'];
  const reqGender = String(req.body.gender || otp.gender || '');
  const userGender = validGenders.includes(reqGender) ? reqGender : 'prefer_not_to_say';

  if (!user) {
    const alias = await generateUsername();
    user = await prisma.user.create({
      data: {
        email,
        campusId: dbCampus.id,
        publicAlias: alias,
        gender: userGender,
        orientation: 'prefer_not_to_say',
        genderPreference: 'any',
        reputationScore: 100,
        accountStatus: 'active',
        sessionVersion: 0,
        noShowCount: 0,
        aliases: { create: { alias, rotationReason: 'initial' } }
      },
      include: { campus: true }
    });
  } else if (userGender !== 'prefer_not_to_say' && user.gender === 'prefer_not_to_say') {
    user = await prisma.user.update({ where: { id: user.id }, data: { gender: userGender }, include: { campus: true } });
  }
  res.cookie('session', token(user), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 2592000000, path: '/' });
  res.json({ user: publicUser(user) });
});

// ── Google OAuth 2.0 Endpoints ──────────────────────────────────────────

// 1. Google OAuth Initiation
app.get('/api/auth/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const host = req.get('host') || 'localhost:3002';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${protocol}://${host}/api/auth/google/callback`;

  // If Google OAuth credentials are not set yet, provide a friendly setup guide
  if (!clientId || !clientSecret || clientId.trim() === '' || clientSecret.trim() === '') {
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Setup Google OAuth - Afterclass</title>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background: #060908;
            color: #ecfdf5;
            font-family: 'Plus Jakarta Sans', sans-serif;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
          }
          .card {
            background: #0c1512;
            border: 1px solid rgba(16, 185, 129, 0.25);
            border-radius: 20px;
            max-width: 620px;
            width: 100%;
            padding: 36px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 35px rgba(16, 185, 129, 0.08);
          }
          .badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 5px 12px;
            border-radius: 999px;
            background: rgba(16, 185, 129, 0.12);
            color: #34d399;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 20px;
          }
          h1 {
            font-size: 24px;
            font-weight: 700;
            color: #fff;
            margin-bottom: 12px;
            letter-spacing: -0.02em;
          }
          p {
            color: #94a3b8;
            font-size: 14px;
            line-height: 1.6;
            margin-bottom: 20px;
          }
          ol {
            margin-left: 20px;
            margin-bottom: 24px;
            color: #cbd5e1;
            font-size: 14px;
            line-height: 1.8;
          }
          li { margin-bottom: 8px; }
          .code-box {
            background: #080d0b;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 10px;
            padding: 14px 16px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 13px;
            color: #34d399;
            overflow-x: auto;
            margin-bottom: 20px;
            word-break: break-all;
          }
          .actions {
            display: flex;
            gap: 12px;
            margin-top: 24px;
          }
          .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 12px 20px;
            border-radius: 10px;
            font-size: 14px;
            font-weight: 600;
            text-decoration: none;
            cursor: pointer;
            transition: all 0.2s;
          }
          .btn-primary {
            background: #10b981;
            color: #042f1f;
          }
          .btn-primary:hover {
            background: #34d399;
          }
          .btn-secondary {
            background: rgba(255, 255, 255, 0.06);
            color: #cbd5e1;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          .btn-secondary:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">✦ Google Cloud Setup Required</div>
          <h1>Connect Google OAuth</h1>
          <p>Real Google sign-in is enabled! To allow students to authenticate with their university Google Workspace accounts, add your Google Cloud OAuth Client credentials to your <code>.env</code> file.</p>
          
          <ol>
            <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" style="color:#34d399; text-decoration: underline;">Google Cloud Console &rarr; Credentials</a></li>
            <li>Click <strong>Create Credentials &rarr; OAuth Client ID</strong> (Application type: <strong>Web application</strong>)</li>
            <li>Add this to <strong>Authorized redirect URIs</strong>:</li>
          </ol>

          <div class="code-box">${redirectUri}</div>

          <p>Then copy your credentials into <code>.env</code>:</p>

          <div class="code-box">GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com<br>GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret<br>GOOGLE_REDIRECT_URI=${redirectUri}</div>

          <div class="actions">
            <a href="/" class="btn btn-secondary">&larr; Back to App</a>
            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" class="btn btn-primary">Open Google Cloud Console &rarr;</a>
          </div>
        </div>
      </body>
      </html>
    `);
  }

  // Google OAuth is configured — redirect to Google's consent dialog
  const gender = req.query.gender || 'prefer_not_to_say';
  const state = Buffer.from(JSON.stringify({ gender })).toString('base64url');

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId.trim());
  authUrl.searchParams.set('redirect_uri', redirectUri.trim());
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'select_account');
  authUrl.searchParams.set('state', state);

  res.redirect(authUrl.toString());
});

// 2. Google OAuth Callback
app.get('/api/auth/google/callback', async (req, res) => {
  const { code, state: stateParam, error } = req.query;

  if (error) {
    console.warn('Google OAuth error param:', error);
    return res.redirect(`/?auth_error=${encodeURIComponent('Google sign-in was canceled or access was denied.')}`);
  }
  if (!code) {
    return res.redirect(`/?auth_error=${encodeURIComponent('No authorization code provided by Google.')}`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const host = req.get('host') || 'localhost:3002';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${protocol}://${host}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    return res.redirect(`/?auth_error=${encodeURIComponent('Google OAuth is not configured on the server.')}`);
  }

  try {
    // 1. Exchange code for access tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        redirect_uri: redirectUri.trim(),
        grant_type: 'authorization_code'
      })
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('Google token exchange error:', errBody);
      return res.redirect(`/?auth_error=${encodeURIComponent('Could not exchange authorization code with Google.')}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return res.redirect(`/?auth_error=${encodeURIComponent('Failed to obtain Google access token.')}`);
    }

    // 2. Fetch user profile from Google
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!userRes.ok) {
      return res.redirect(`/?auth_error=${encodeURIComponent('Could not retrieve user info from Google.')}`);
    }

    const googleUser = await userRes.json();
    const email = String(googleUser.email || '').trim().toLowerCase();

    if (!email) {
      return res.redirect(`/?auth_error=${encodeURIComponent('No email address provided by your Google account.')}`);
    }

    // 3. Verify campus domain
    const campus = campuses.fromEmail(email);
    if (!campus) {
      const allowedDomains = campuses.campuses.map(c => '@' + c.domain).join(', ');
      return res.redirect(`/?auth_error=${encodeURIComponent(`Access denied: Only verified university accounts (${allowedDomains} or college subdomains) are allowed. (${email} is not registered)`)}`);
    }

    const dbCampus = await prisma.campus.findUnique({ where: { slug: campus.id } });
    if (!dbCampus) {
      return res.redirect(`/?auth_error=${encodeURIComponent('Campus service is currently unavailable.')}`);
    }

    // 4. Parse state for gender preference
    let preferredGender = 'prefer_not_to_say';
    if (stateParam) {
      try {
        const parsed = JSON.parse(Buffer.from(String(stateParam), 'base64url').toString('utf8'));
        const validGenders = ['woman', 'man', 'nonbinary', 'prefer_not_to_say'];
        if (validGenders.includes(parsed.gender)) {
          preferredGender = parsed.gender;
        }
      } catch {}
    }

    // 5. Look up or create student user
    let user = await prisma.user.findUnique({ where: { email }, include: { campus: true } });
    if (user && accountUnavailable(user)) {
      return res.redirect(`/?auth_error=${encodeURIComponent('This student account is suspended or unavailable.')}`);
    }

    if (!user) {
      const alias = await generateUsername();
      user = await prisma.user.create({
        data: {
          email,
          campusId: dbCampus.id,
          publicAlias: alias,
          gender: preferredGender,
          orientation: 'prefer_not_to_say',
          genderPreference: 'any',
          reputationScore: 100,
          accountStatus: 'active',
          sessionVersion: 0,
          noShowCount: 0,
          aliases: { create: { alias, rotationReason: 'initial' } }
        },
        include: { campus: true }
      });
    } else if (preferredGender !== 'prefer_not_to_say' && user.gender === 'prefer_not_to_say') {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { gender: preferredGender },
        include: { campus: true }
      });
    }

    // 6. Set session cookie and redirect to campus chat
    res.cookie('session', token(user), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 2592000000,
      path: '/'
    });

    res.redirect('/');
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    res.redirect(`/?auth_error=${encodeURIComponent('An unexpected error occurred during Google sign-in.')}`);
  }
});

// Fast Google Sign-In for verified student Google Workspace accounts
app.post('/api/auth/google-fast', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const campus = campuses.fromEmail(email);
  if (!campus) return res.status(400).json({ error: 'Please enter a valid university email address.' });
  const dbCampus = await prisma.campus.findUnique({ where: { slug: campus.id } });
  if (!dbCampus) return res.status(400).json({ error: 'Campus unavailable.' });

  let user = await prisma.user.findUnique({ where: { email }, include: { campus: true } });
  if (user && accountUnavailable(user)) return res.status(403).json({ error: 'This account is not available.' });

  const validGenders = ['woman', 'man', 'nonbinary', 'prefer_not_to_say'];
  const reqGender = String(req.body.gender || '');
  const userGender = validGenders.includes(reqGender) ? reqGender : 'prefer_not_to_say';

  if (!user) {
    const alias = await generateUsername();
    user = await prisma.user.create({
      data: {
        email,
        campusId: dbCampus.id,
        publicAlias: alias,
        gender: userGender,
        orientation: 'prefer_not_to_say',
        genderPreference: 'any',
        reputationScore: 100,
        accountStatus: 'active',
        sessionVersion: 0,
        noShowCount: 0,
        aliases: { create: { alias, rotationReason: 'initial' } }
      },
      include: { campus: true }
    });
  }
  res.cookie('session', token(user), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 2592000000, path: '/' });
  res.json({ user: publicUser(user) });
});

// Log out from current device only
app.post('/api/auth/logout', auth, (req, res) => {
  res.clearCookie('session', { path: '/' }).json({ ok: true });
});

// Log out from all devices globally
app.post('/api/auth/logout-all', auth, async (req, res) => {
  await prisma.user.update({ where: { id: req.user.id }, data: { sessionVersion: (req.user.sessionVersion || 0) + 1 } });
  res.clearCookie('session', { path: '/' }).json({ ok: true, revokedAll: true });
});

app.get('/api/me', auth, async (req, res) => {
  const p = publicUser(req.user);
  if (p) {
    p.email = req.user.email;
    p.isAdmin = await isAdminUser(req.user);
    try {
      const latestWarning = await prisma.moderationAction.findFirst({
        where: { userId: req.user.id, type: 'warning' },
        orderBy: { createdAt: 'desc' }
      });
      if (latestWarning) {
        p.latestWarning = {
          id: latestWarning.id,
          reason: latestWarning.reason,
          createdAt: latestWarning.createdAt
        };
      }
    } catch {}
  }
  res.json({ user: p });
});

app.patch('/api/users/avatar', auth, async (req, res) => {
  try {
    const { avatarConfig } = req.body;
    if (!avatarConfig || typeof avatarConfig !== 'object') {
      return res.status(400).json({ error: 'Invalid avatar configuration.' });
    }
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarConfig },
      include: { campus: true }
    });
    res.json({ user: publicUser(updated) });
  } catch {
    res.status(500).json({ error: 'Could not save avatar.' });
  }
});

// ── Campus chat history ─────────────────────────────────────────────────────

app.get('/api/messages', auth, async (req, res) => {
  try {
    const room = await campusRoom(req.user);
    const messages = await prisma.message.findMany({ where: { roomId: room.id, isDeleted: false }, orderBy: { createdAt: 'desc' }, take: 50 });
    const messageIds = messages.map(m => m.id);
    const reactionsMap = await reactions.getBatchReactions(messageIds, req.user?.id);
    res.json({ messages: messages.reverse().map(m => publicMessage(m, reactionsMap[m.id] || [])) });
  } catch { res.status(503).json({ error: 'Campus chat is unavailable.' }); }
});

// ── Campus group members ────────────────────────────────────────────────────

app.get('/api/campus/members', auth, async (req, res) => {
  try {
    const campusId = req.user.campusId;
    const dbMembers = await prisma.user.findMany({
      where: {
        campusId,
        accountStatus: { not: 'banned' }
      },
      select: {
        id: true,
        publicAlias: true,
        avatarConfig: true,
        accountStatus: true,
        suspendedUntil: true,
        createdAt: true,
        lastActiveAt: true
      },
      orderBy: { lastActiveAt: 'desc' }
    });

    const onlineUsers = getCampusOnlineUserIds(io, req.user.campus?.slug);
    const members = dbMembers.map(m => {
      const isOnline = onlineUsers.has(m.id);
      return {
        id: m.id,
        username: m.publicAlias,
        publicAlias: m.publicAlias,
        avatarConfig: m.avatarConfig,
        accountStatus: m.accountStatus,
        isTimedOut: Boolean(m.suspendedUntil && new Date(m.suspendedUntil) > new Date()),
        isOnline,
        joinedAt: m.createdAt,
        lastActiveAt: m.lastActiveAt,
        isMe: m.id === req.user.id
      };
    });

    // Sort: current user first, then online users, then by lastActiveAt
    members.sort((a, b) => {
      if (a.isMe) return -1;
      if (b.isMe) return 1;
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return new Date(b.lastActiveAt || 0) - new Date(a.lastActiveAt || 0);
    });

    const activeCount = members.filter(m => m.isOnline).length;

    res.json({
      campusName: req.user.campus?.name || 'Campus',
      totalCount: members.length,
      onlineCount: activeCount,
      activeOnlineMembers: activeCount,
      members
    });
  } catch (err) {
    console.error('[Campus Members Endpoint Error]:', err);
    res.status(500).json({ error: 'Failed to retrieve campus group members.' });
  }
});

// ── Match requests ──────────────────────────────────────────────────────────

app.get('/api/match-requests', auth, async (req, res) => {
  try {
    const requests = await prisma.matchRequest.findMany({
      where: { campusId: req.user.campusId, status: 'open', expiresAt: { gt: new Date() } },
      include: { requester: true, applications: { where: { applicantId: req.user.id } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ requests: requests.filter(r => r.requesterId === req.user.id || canPair(req.user, r.requester)).map(r => matchService.publicRequest(r, req.user.id)) });
  } catch { res.status(503).json({ error: 'Matching is unavailable.' }); }
});

app.post('/api/match-requests', requireVerified, async (req, res) => {
  if (!await redis.limit('request:' + req.user.id, 5, 86400000)) return res.status(429).json({ error: 'Daily plan limit reached.' });
  try {
    const { activity, location, scheduledAt, genderPreference, orientationPreference } = req.body;
    if (!activity || !location || !scheduledAt) return res.status(400).json({ error: 'Activity, location and time are required.' });
    
    const schedDate = new Date(scheduledAt);
    if (isNaN(schedDate.getTime()) || schedDate <= new Date()) {
      return res.status(400).json({ error: 'Plan scheduled time must be in the future.' });
    }

    const request = await matchService.createRequest(prisma, req.user, {
      activity: String(activity).slice(0, 100),
      location: String(location).slice(0, 120),
      scheduledAt: schedDate.toISOString(),
      genderPreference,
      orientationPreference
    });
    res.status(201).json({ request });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Unable to create request.' });
  }
});

// Fetch all plans created by current user
app.get('/api/match-requests/mine', auth, async (req, res) => {
  try {
    const plans = await prisma.matchRequest.findMany({
      where: { requesterId: req.user.id },
      include: { applications: { where: { status: 'pending' } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json({
      plans: plans.map(p => ({
        id: p.id,
        activity: p.activity,
        location: p.location,
        scheduledAt: p.scheduledAt,
        status: p.status,
        expiresAt: p.expiresAt,
        createdAt: p.createdAt,
        pendingApplicantsCount: p.applications.length
      }))
    });
  } catch { res.status(503).json({ error: 'Could not load your plans.' }); }
});

// Must be declared before /api/match-requests/:id to avoid route collision
app.get('/api/match-requests/mine/applications', auth, async (req, res) => {
  try {
    const applications = await prisma.matchApplication.findMany({
      where: { request: { requesterId: req.user.id }, status: 'pending' },
      include: { request: true }
    });
    res.json({ applications: applications.map(a => ({ id: a.id, requestId: a.requestId, activity: a.request.activity, interestCount: 1 })) });
  } catch { res.status(503).json({ error: 'Applications unavailable.' }); }
});

app.delete('/api/match-requests/:id', auth, async (req, res) => {
  try {
    const plan = await prisma.matchRequest.findFirst({
      where: { id: req.params.id, requesterId: req.user.id }
    });
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });
    await prisma.matchRequest.update({
      where: { id: plan.id },
      data: { status: 'cancelled', cancelledAt: new Date() }
    });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Could not close plan.' }); }
});

app.post('/api/match-requests/:id/applications', requireVerified, async (req, res) => {
  try {
    const application = await matchService.apply(prisma, req.user, req.params.id);
    const plan = await prisma.matchRequest.findUnique({ where: { id: req.params.id } });
    if (plan) {
      io.to('user:' + plan.requesterId).emit('application:new', {
        activity: plan.activity,
        applicantName: req.user.publicAlias
      });
    }
    res.status(201).json({ application: { id: application.id, status: application.status } });
  } catch (err) { res.status(400).json({ error: err.message || 'Request unavailable.' }); }
});

app.post('/api/applications/:id/accept', auth, async (req, res) => {
  try {
    const match = await matchService.accept(prisma, req.user, req.params.id);
    io.to('user:' + match.userTwoId).emit('match:accepted', { matchId: match.id });
    res.json({ match: { id: match.id, status: match.status } });
  } catch (err) { res.status(404).json({ error: err.message || 'Application unavailable.' }); }
});

// ── Matches ─────────────────────────────────────────────────────────────────

app.get('/api/matches', auth, async (req, res) => {
  try {
    const matches = await prisma.match.findMany({
      where: { OR: [{ userOneId: req.user.id }, { userTwoId: req.user.id }] },
      include: {
        request: true,
        revealConsents: true,
        userOne: { include: { campus: true } },
        userTwo: { include: { campus: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    const result = matches.map(m => {
      const other = m.userOneId === req.user.id ? m.userTwo : m.userOne;
      const myConsent = m.revealConsents.find(r => r.userId === req.user.id);
      const otherConsent = m.revealConsents.find(r => r.userId === other.id);
      const revealed = myConsent?.status === 'accepted' && otherConsent?.status === 'accepted';
      const otherInfo = publicUser(other);
      if (revealed && otherInfo) {
        otherInfo.revealName = other.revealName || (other.email ? other.email.split('@')[0] : other.publicAlias);
        otherInfo.email = other.email;
      }
      return {
        id: m.id,
        status: m.status,
        roomId: m.roomId,
        disappearingMode: m.disappearingMode || false,
        scheduledAt: m.scheduledAt,
        activity: m.request.activity,
        location: m.request.location,
        other: otherInfo,
        myReveal: myConsent?.status || 'pending',
        otherReveal: otherConsent?.status || 'pending',
        revealed
      };
    });
    res.json({ matches: result });
  } catch { res.status(503).json({ error: 'Matches unavailable.' }); }
});

app.post('/api/matches/:id/disappearing', auth, async (req, res) => {
  try {
    const match = await prisma.match.findFirst({
      where: { id: req.params.id, OR: [{ userOneId: req.user.id }, { userTwoId: req.user.id }], status: MatchStatus.active }
    });
    if (!match) return res.status(404).json({ error: 'Match not found.' });

    const newMode = !match.disappearingMode;
    await prisma.match.update({
      where: { id: match.id },
      data: { disappearingMode: newMode }
    });

    const sysContent = newMode
      ? `⏳ ${req.user.publicAlias} turned on 24-hour disappearing messages. New messages will vanish 24 hours after being sent.`
      : `⏳ ${req.user.publicAlias} turned off disappearing messages.`;

    const sysMsg = await prisma.message.create({
      data: {
        roomId: match.roomId,
        senderId: req.user.id,
        senderAlias: 'System',
        content: sysContent
      }
    });

    const payload = { ...publicMessage(sysMsg), isSystem: true, status: 'delivered' };
    io.to(match.roomId).emit('message:new', payload);
    io.to(match.roomId).emit('match:disappearing_changed', { matchId: match.id, disappearingMode: newMode });

    res.json({ ok: true, disappearingMode: newMode });
  } catch (err) {
    res.status(500).json({ error: 'Could not toggle disappearing messages.' });
  }
});

app.post('/api/matches/:id/reveal', auth, async (req, res) => {
  try {
    const match = await prisma.match.findFirst({
      where: { id: req.params.id, OR: [{ userOneId: req.user.id }, { userTwoId: req.user.id }] },
      include: { revealConsents: true }
    });
    if (!match) return res.status(404).json({ error: 'Match not found.' });
    await prisma.revealConsent.update({
      where: { matchId_userId: { matchId: match.id, userId: req.user.id } },
      data: { status: RevealStatus.accepted, respondedAt: new Date() }
    });
    const otherId = match.userOneId === req.user.id ? match.userTwoId : match.userOneId;
    const otherConsent = match.revealConsents.find(r => r.userId === otherId);
    const mutual = otherConsent?.status === 'accepted';
    if (mutual) {
      io.to('user:' + otherId).emit('reveal:mutual', { matchId: match.id });
    } else {
      io.to('user:' + otherId).emit('reveal:requested', { matchId: match.id });
    }
    res.json({ mutual });
  } catch { res.status(500).json({ error: 'Could not process reveal request.' }); }
});

app.post('/api/matches/:id/cancel', auth, async (req, res) => {
  try {
    const match = await prisma.match.findFirst({
      where: { id: req.params.id, OR: [{ userOneId: req.user.id }, { userTwoId: req.user.id }], status: MatchStatus.active }
    });
    if (!match) return res.status(404).json({ error: 'Match not found.' });
    await prisma.match.update({ where: { id: match.id }, data: { status: MatchStatus.cancelled } });
    const otherId = match.userOneId === req.user.id ? match.userTwoId : match.userOneId;
    io.to('user:' + otherId).emit('match:cancelled', { matchId: match.id });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Could not cancel match.' }); }
});

app.post('/api/matches/:id/complete', auth, async (req, res) => {
  try {
    const match = await prisma.match.findFirst({
      where: { id: req.params.id, OR: [{ userOneId: req.user.id }, { userTwoId: req.user.id }], status: MatchStatus.active }
    });
    if (!match) return res.status(404).json({ error: 'Match not found.' });
    await prisma.match.update({ where: { id: match.id }, data: { status: MatchStatus.completed, completedAt: new Date() } });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Could not complete match.' }); }
});

// ── Mutual Live Location Sharing Sessions ──────────────────────────────────
const activeLocationSessions = new Map();

function getLocationSession(matchId) {
  if (!activeLocationSessions.has(matchId)) {
    activeLocationSessions.set(matchId, {
      consents: new Set(),
      coords: new Map(),
      active: false
    });
  }
  return activeLocationSessions.get(matchId);
}

app.get('/api/matches/:id/location', auth, async (req, res) => {
  try {
    const match = await prisma.match.findFirst({
      where: { id: req.params.id, OR: [{ userOneId: req.user.id }, { userTwoId: req.user.id }], status: MatchStatus.active }
    });
    if (!match) return res.status(404).json({ error: 'Match not found.' });

    const session = getLocationSession(match.id);
    const otherId = match.userOneId === req.user.id ? match.userTwoId : match.userOneId;
    const myConsent = session.consents.has(req.user.id);
    const otherConsent = session.consents.has(otherId);
    const active = session.active && myConsent && otherConsent;

    res.json({
      myConsent,
      otherConsent,
      active,
      myCoords: session.coords.get(req.user.id) || null,
      otherCoords: active ? (session.coords.get(otherId) || null) : null
    });
  } catch (err) {
    res.status(500).json({ error: 'Location session unavailable.' });
  }
});

app.post('/api/matches/:id/location/consent', auth, async (req, res) => {
  try {
    const match = await prisma.match.findFirst({
      where: { id: req.params.id, OR: [{ userOneId: req.user.id }, { userTwoId: req.user.id }], status: MatchStatus.active }
    });
    if (!match) return res.status(404).json({ error: 'Match not found.' });

    const session = getLocationSession(match.id);
    const otherId = match.userOneId === req.user.id ? match.userTwoId : match.userOneId;
    session.consents.add(req.user.id);
    const mutual = session.consents.has(otherId);
    session.active = mutual;

    if (mutual) {
      io.to(match.roomId).emit('location:active', {
        matchId: match.id,
        roomId: match.roomId
      });
      const sysMsg = await prisma.message.create({
        data: {
          roomId: match.roomId,
          senderId: req.user.id,
          senderAlias: 'System',
          content: `📍 Live location sharing is now active. Both students can now track real-time campus distance on the interactive map.`
        }
      });
      io.to(match.roomId).emit('message:new', { ...publicMessage(sysMsg), isSystem: true, status: 'delivered' });
    } else {
      io.to('user:' + otherId).emit('location:requested', {
        matchId: match.id,
        requesterAlias: req.user.publicAlias
      });
      io.to(match.roomId).emit('location:consent_changed', {
        matchId: match.id,
        userId: req.user.id,
        consented: true,
        mutual: false
      });
    }

    res.json({ ok: true, mutual, myConsent: true, otherConsent: session.consents.has(otherId) });
  } catch (err) {
    console.error('location consent error:', err);
    res.status(500).json({ error: 'Could not process location consent.' });
  }
});

app.post('/api/matches/:id/location/stop', auth, async (req, res) => {
  try {
    const match = await prisma.match.findFirst({
      where: { id: req.params.id, OR: [{ userOneId: req.user.id }, { userTwoId: req.user.id }] }
    });
    if (!match) return res.status(404).json({ error: 'Match not found.' });

    const session = activeLocationSessions.get(match.id);
    if (session) {
      session.consents.delete(req.user.id);
      session.active = false;
      session.coords.clear();
    }

    io.to(match.roomId).emit('location:stopped', {
      matchId: match.id,
      stoppedBy: req.user.publicAlias
    });

    const sysMsg = await prisma.message.create({
      data: {
        roomId: match.roomId,
        senderId: req.user.id,
        senderAlias: 'System',
        content: `📍 ${req.user.publicAlias} stopped live location sharing.`
      }
    });
    io.to(match.roomId).emit('message:new', { ...publicMessage(sysMsg), isSystem: true, status: 'delivered' });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not stop location sharing.' });
  }
});

// ── Reports ─────────────────────────────────────────────────────────────────

app.post('/api/reports', auth, async (req, res) => {
  if (!await redis.limit('report:' + req.user.id, 10, 86400000)) return res.status(429).json({ error: 'Report limit reached.' });
  const { messageId, reason = 'inappropriate_content', detail } = req.body;
  if (!messageId) return res.status(400).json({ error: 'Message ID is required.' });
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message) return res.status(404).json({ error: 'Message not found.' });
  if (message.senderId === req.user.id) return res.status(400).json({ error: 'You cannot report your own message.' });
  await prisma.report.create({
    data: {
      campusId: req.user.campusId,
      reporterId: req.user.id,
      reportedUserId: message.senderId,
      messageId: message.id,
      reason,
      detail: detail ? String(detail).slice(0, 1000) : null
    }
  });
  res.status(201).json({ ok: true });
});

// ── Admin & Moderation Portal Endpoints ─────────────────────────────────────

app.get('/api/admin/reports', requireAdmin, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ reports: await adminReports.listReports(prisma) });
  } catch (err) {
    console.error('[Admin Reports Fetch Error]:', err);
    res.status(500).json({ error: 'Failed to retrieve incident reports.' });
  }
});

app.get('/api/admin/reports/:id/context', requireAdmin, async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid report ID.' });
  }
  try {
    res.set('Cache-Control', 'no-store');
    const context = await adminReports.reportContext(prisma, req.params.id);
    if (!context) return res.status(404).json({ error: 'Report not found.' });
    res.json(context);
  } catch (err) {
    console.error('[Admin Report Context Error]:', err);
    res.status(500).json({ error: 'Could not load conversation context.' });
  }
});

app.post('/api/admin/reports/:id/action', requireAdmin, async (req, res) => {
  const { action, hours = 24 } = req.body;
  const reportId = req.params.id;

  try {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: { message: true, reportedUser: true }
    });
    if (!report) return res.status(404).json({ error: 'Report not found.' });

    if (action === 'delete_message' && report.messageId) {
      await prisma.message.delete({ where: { id: report.messageId } }).catch(() => {});
      io.to('campus:' + report.campusId).emit('message:deleted', { messageId: report.messageId });
    } else if (action === 'timeout_user') {
      const until = new Date(Date.now() + hours * 3600000);
      await prisma.user.update({
        where: { id: report.reportedUserId },
        data: { suspendedUntil: until, sessionVersion: { increment: 1 } }
      });
      if (report.messageId) {
        await prisma.message.delete({ where: { id: report.messageId } }).catch(() => {});
        io.to('campus:' + report.campusId).emit('message:deleted', { messageId: report.messageId });
      }
    } else if (action === 'ban_user') {
      await prisma.user.update({
        where: { id: report.reportedUserId },
        data: { accountStatus: 'banned', sessionVersion: { increment: 1 } }
      });
      if (report.messageId) {
        await prisma.message.delete({ where: { id: report.messageId } }).catch(() => {});
        io.to('campus:' + report.campusId).emit('message:deleted', { messageId: report.messageId });
      }
    }

    const newStatus = action === 'dismiss' ? 'dismissed' : 'resolved';
    await prisma.report.update({
      where: { id: reportId },
      data: { status: newStatus, resolvedAt: new Date() }
    });

    res.json({ ok: true, action, status: newStatus });
  } catch (err) {
    console.error('[Admin Report Action Error]:', err);
    res.status(500).json({ error: 'Moderation action failed.' });
  }
});

app.post('/api/admin/users/:id/action', requireAdmin, async (req, res) => {
  const { action, hours = 24 } = req.body;
  const userId = req.params.id;

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { campus: true } });
    if (!user) return res.status(404).json({ error: 'Student not found.' });

    if (action === 'warn') {
      const reason = String(req.body.reason || 'Violation of campus community guidelines — please keep chat interactions respectful.').slice(0, 1000);
      await prisma.moderationAction.create({
        data: {
          campusId: user.campusId,
          userId: user.id,
          adminUserId: req.user.id,
          type: 'warning',
          reason
        }
      });
      await prisma.report.updateMany({
        where: { reportedUserId: userId, status: 'pending' },
        data: { status: 'resolved', resolvedAt: new Date() }
      });
      io.to('user:' + userId).emit('user:warned', {
        reason,
        createdAt: new Date().toISOString()
      });

      // Deliver official warning directly to student's university email (matching OTP delivery)
      if (user.email) {
        deliverWarningEmail(user.email, {
          alias: user.publicAlias || user.username || 'Student',
          reason,
          campusName: user.campus?.name
        }).catch(err => console.error('[Warning Email Delivery Error]:', err));
      }
    } else if (action === 'timeout') {
      const until = new Date(Date.now() + hours * 3600000);
      await prisma.user.update({
        where: { id: userId },
        data: { accountStatus: 'suspended', suspendedUntil: until, sessionVersion: { increment: 1 } }
      });
      await prisma.report.updateMany({
        where: { reportedUserId: userId, status: 'pending' },
        data: { status: 'resolved', resolvedAt: new Date() }
      });
    } else if (action === 'ban') {
      await prisma.user.update({
        where: { id: userId },
        data: { accountStatus: 'banned', sessionVersion: { increment: 1 } }
      });
      await prisma.report.updateMany({
        where: { reportedUserId: userId, status: 'pending' },
        data: { status: 'resolved', resolvedAt: new Date() }
      });
    } else if (action === 'unban') {
      await prisma.user.update({
        where: { id: userId },
        data: { accountStatus: 'active', suspendedUntil: null }
      });
    }

    res.json({ ok: true, action, userId });
  } catch (err) {
    console.error('[Admin User Action Error]:', err);
    res.status(500).json({ error: 'User moderation action failed.' });
  }
});

// Admin Team / Moderator Access Management
app.get('/api/admin/moderators', requireAdmin, async (req, res) => {
  const excludedAdmins = await redis.getExcludedAdminEmails();
  const envAdmins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(e => e && !excludedAdmins.includes(e));
  const dynamicModerators = await redis.getModeratorEmails();
  const teamModerators = dynamicModerators.filter(e => !excludedAdmins.includes(e));

  res.json({
    primaryAdmins: envAdmins,
    teamModerators: teamModerators.map(email => ({
      email,
      addedAt: new Date().toISOString()
    }))
  });
});

app.post('/api/admin/moderators', requireAdmin, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const role = String(req.body.role || 'moderator').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  await redis.removeExcludedAdminEmail(email);

  if (role === 'super_admin') {
    addAdminToEnvFile(email);
    await redis.removeModeratorEmail(email);
    return res.json({ ok: true, email, role: 'super_admin', message: `${email} is now a Permanent Primary Super Admin 👑` });
  }

  await redis.addModeratorEmail(email);
  res.json({ ok: true, email, role: 'moderator', message: `${email} added as Team Moderator 🛡️` });
});

app.delete('/api/admin/moderators/:email', requireAdmin, async (req, res) => {
  const email = String(req.params.email || '').trim().toLowerCase();

  if (req.user && req.user.email?.toLowerCase() === email) {
    return res.status(400).json({ error: 'You cannot remove your own administrative access to prevent accidental lockout.' });
  }

  const envAdminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  if (envAdminEmails.includes(email)) {
    if (envAdminEmails.length <= 1) {
      return res.status(400).json({ error: 'At least one Primary System Administrator must remain on the platform.' });
    }
    removeAdminFromEnvFile(email);
    await redis.removeModeratorEmail(email);
    return res.json({ ok: true, email, message: `Primary administrator ${email} removed successfully.` });
  }

  await redis.removeModeratorEmail(email);
  res.json({ ok: true, email });
});

// Legacy moderation routes fallback — now strictly protected by requireAdmin
app.get('/api/moderation/reports', requireAdmin, async (req, res) => {
  res.redirect('/api/admin/reports');
});
app.post('/api/moderation/reports/:id/action', requireAdmin, async (req, res) => {
  res.redirect(307, `/api/admin/reports/${req.params.id}/action`);
});

// ── Ephemeral Live Selfie Student Verification ─────────────────────────────

const VERIFICATION_DIR = path.resolve(__dirname, 'uploads/verifications');
if (!fs.existsSync(VERIFICATION_DIR)) {
  try { fs.mkdirSync(VERIFICATION_DIR, { recursive: true }); } catch (e) {}
}

function cleanupExpiredVerificationPhotos() {
  if (!fs.existsSync(VERIFICATION_DIR)) return;
  const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours
  const now = Date.now();
  fs.readdir(VERIFICATION_DIR, (err, files) => {
    if (err || !files) return;
    files.forEach(file => {
      const filePath = path.join(VERIFICATION_DIR, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
}
setInterval(cleanupExpiredVerificationPhotos, 6 * 3600 * 1000);
cleanupExpiredVerificationPhotos();

// 1. Submit live selfie verification (Student)
app.post('/api/verify/selfie', auth, async (req, res) => {
  try {
    const { imageBase64, gesture } = req.body;
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'Live selfie photo is required.' });
    }

    const match = imageBase64.match(/^data:image\/(webp|jpeg|png);base64,(.+)$/);
    const rawData = match ? match[2] : imageBase64;
    const ext = (match && match[1] === 'png') ? 'png' : (match && match[1] === 'jpeg' ? 'jpg' : 'webp');

    const buffer = Buffer.from(rawData, 'base64');
    if (buffer.length > 2 * 1024 * 1024) {
      return res.status(400).json({ error: 'Photo is too large. Please allow the camera tool to compress.' });
    }

    if (req.user.verificationPhoto) {
      const oldPath = path.join(VERIFICATION_DIR, req.user.verificationPhoto);
      if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {});
    }

    const filename = `verify_${req.user.id}_${Date.now()}.${ext}`;
    const filePath = path.join(VERIFICATION_DIR, filename);
    fs.writeFileSync(filePath, buffer);

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        verificationStatus: 'pending',
        verificationGesture: String(gesture || 'peace_sign').slice(0, 50),
        verificationPhoto: filename,
        verificationSubmittedAt: new Date()
      },
      include: { campus: true }
    });

    res.json({ ok: true, user: publicUser(updated) });
  } catch (err) {
    console.error('Selfie verification error:', err);
    res.status(500).json({ error: 'Could not submit verification selfie.' });
  }
});

// 2. Fetch pending student verifications (Admin only)
app.get('/api/admin/verifications', requireAdmin, async (req, res) => {
  try {
    const pendingUsers = await prisma.user.findMany({
      where: { verificationStatus: 'pending' },
      include: { campus: true },
      orderBy: { verificationSubmittedAt: 'asc' }
    });

    const list = pendingUsers.map(u => ({
      id: u.id,
      email: u.email,
      publicAlias: u.publicAlias,
      gender: u.gender,
      campusName: u.campus?.name || 'Campus',
      verificationGesture: u.verificationGesture || 'peace_sign',
      submittedAt: u.verificationSubmittedAt,
      hasPhoto: Boolean(u.verificationPhoto),
      photoUrl: u.verificationPhoto ? `/api/admin/verifications/photo/${u.verificationPhoto}` : null
    }));

    res.json({ count: list.length, verifications: list });
  } catch (err) {
    console.error('Error fetching admin verifications:', err);
    res.status(500).json({ error: 'Failed to retrieve verifications.' });
  }
});

// 3. Serve ephemeral verification photo (Admin only)
app.get('/api/admin/verifications/photo/:filename', requireAdmin, (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!filename.startsWith('verify_')) {
    return res.status(400).send('Invalid file requested.');
  }
  const filePath = path.join(VERIFICATION_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Verification photo not found or already deleted.');
  }
  res.sendFile(filePath);
});

// 4. Approve verification & lock gender (Admin only)
app.post('/api/admin/verifications/:id/approve', requireAdmin, async (req, res) => {
  try {
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { campus: true }
    });
    if (!target) return res.status(404).json({ error: 'Student not found.' });

    // Instantly delete selfie from disk!
    if (target.verificationPhoto) {
      const p = path.join(VERIFICATION_DIR, target.verificationPhoto);
      if (fs.existsSync(p)) fs.unlink(p, () => {});
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: {
        verificationStatus: 'approved',
        isVerified: true,
        genderLocked: true,
        verifiedAt: new Date(),
        verificationPhoto: null
      },
      include: { campus: true }
    });

    io.to('user:' + target.id).emit('user:verified', { isVerified: true });

    res.json({ ok: true, user: publicUser(updated) });
  } catch (err) {
    console.error('Error approving verification:', err);
    res.status(500).json({ error: 'Could not approve verification.' });
  }
});

// 5. Reject verification (Admin only)
app.post('/api/admin/verifications/:id/reject', requireAdmin, async (req, res) => {
  try {
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { campus: true }
    });
    if (!target) return res.status(404).json({ error: 'Student not found.' });

    // Instantly delete selfie from disk!
    if (target.verificationPhoto) {
      const p = path.join(VERIFICATION_DIR, target.verificationPhoto);
      if (fs.existsSync(p)) fs.unlink(p, () => {});
    }

    const updateData = {
      verificationStatus: 'rejected',
      isVerified: false,
      verificationPhoto: null
    };

    if (req.body.correctGender && ['man', 'woman', 'non_binary'].includes(req.body.correctGender)) {
      updateData.gender = req.body.correctGender;
      updateData.genderLocked = true;
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: updateData,
      include: { campus: true }
    });

    const reason = req.body.reason || 'Verification photo did not match the requested gesture.';
    io.to('user:' + target.id).emit('user:verification_rejected', { reason });

    res.json({ ok: true, user: publicUser(updated) });
  } catch (err) {
    console.error('Error rejecting verification:', err);
    res.status(500).json({ error: 'Could not reject verification.' });
  }
});

// 6. Instant Admin Self-Verification (Admin only)
app.post('/api/admin/self-verify', requireAdmin, async (req, res) => {
  try {
    const validGenders = ['woman', 'man', 'nonbinary', 'prefer_not_to_say'];
    const chosenGender = validGenders.includes(req.body.gender) ? req.body.gender : (req.user.gender || 'prefer_not_to_say');

    // Delete any pending photo
    if (req.user.verificationPhoto) {
      const p = path.join(VERIFICATION_DIR, req.user.verificationPhoto);
      if (fs.existsSync(p)) fs.unlink(p, () => {});
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        verificationStatus: 'approved',
        isVerified: true,
        gender: chosenGender,
        genderLocked: true,
        verifiedAt: new Date(),
        verificationPhoto: null
      },
      include: { campus: true }
    });

    res.json({ ok: true, user: publicUser(updated) });
  } catch (err) {
    console.error('Admin self-verification error:', err);
    res.status(500).json({ error: 'Could not self-verify admin account.' });
  }
});

// ── Socket.IO ───────────────────────────────────────────────────────────────

function socketCookie(socket, name) {
  const part = (socket.handshake.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : undefined;
}

io.use(async (socket, next) => {
  try {
    const raw = socket.handshake.auth.token || socketCookie(socket, 'session');
    const p = jwt.verify(raw, SECRET, { issuer: 'afterclass', audience: 'afterclass-web' });
    const user = await prisma.user.findUnique({ where: { id: p.sub }, include: { campus: true } });
    if (accountUnavailable(user) || p.sv !== (user.sessionVersion || 0)) throw new Error('Unauthorized');
    socket.user = user;
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

function getCampusPresenceCount(campusSlug) {
  return getCampusOnlineUserIds(io, campusSlug).size;
}

function broadcastCampusPresence(campusSlug) {
  if (!campusSlug) return;
  const count = getCampusPresenceCount(campusSlug);
  io.to('campus:' + campusSlug).emit('campus:presence', { onlineCount: count });
}

io.on('connection', socket => {
  const user = socket.user;
  socket.join('user:' + user.id);
  socket.join('campus:' + user.campus.slug);
  broadcastCampusPresence(user.campus.slug);

  socket.on('disconnect', () => {
    broadcastCampusPresence(user?.campus?.slug);
  });

  // Join a room — campus room (already joined above) or an authorized match room.
  socket.on('room:join', async room => {
    if (!room || typeof room !== 'string') return;
    if (room.startsWith('campus:') || room.startsWith('user:')) {
      if (canJoinIdentityRoom(user, room)) socket.join(room);
      return;
    }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(room);
    if (!isUuid) return;

    try {
      const match = await prisma.match.findFirst({
        where: { roomId: room, OR: [{ userOneId: user.id }, { userTwoId: user.id }], status: MatchStatus.active }
      });
      if (match) {
        socket.join(room);
        // Send last 50 active messages as history for the private room (filtering out expired 24h messages)
        const messages = await prisma.message.findMany({
          where: {
            roomId: room,
            isDeleted: false,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } }
            ]
          },
          orderBy: { createdAt: 'asc' },
          take: 50
        });
        socket.emit('room:history', messages.map(publicMessage));
      }
    } catch (err) {
      console.error('room:join error:', err);
    }
  });

  // Mark messages as read in a room
  socket.on('room:read', async ({ roomId }) => {
    if (!roomId || typeof roomId !== 'string') return;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomId);
    if (!isUuid) return;

    try {
      const match = await prisma.match.findFirst({
        where: { roomId, OR: [{ userOneId: user.id }, { userTwoId: user.id }], status: MatchStatus.active }
      });
      if (match) {
        socket.to(roomId).emit('room:read', { roomId, readerId: user.id });
      }
    } catch (err) {
      console.error('room:read error:', err);
    }
  });

  // Typing indicators
  socket.on('typing:start', ({ roomId }) => {
    const targetRoom = roomId || ('campus:' + user.campus.slug);
    socket.to(targetRoom).emit('typing:start', { roomId: targetRoom, username: user.publicAlias, userId: user.id });
  });

  socket.on('typing:stop', ({ roomId }) => {
    const targetRoom = roomId || ('campus:' + user.campus.slug);
    socket.to(targetRoom).emit('typing:stop', { roomId: targetRoom, userId: user.id });
  });

  // Campus-wide broadcast message (persisted to Prisma)
  socket.on('campus:message', async ({ content, replyTo }, ack = () => {}) => {
    if (!user.isVerified && !await isAdminUser(user)) {
      return ack({ error: 'Identity verification required. Complete your live face check to send messages.' });
    }
    if (!content?.trim()) return ack({ error: 'Message cannot be empty.' });
    try {
      const room = await campusRoom(user);
      const cleaned = clean(content);
      let finalContent = cleaned;
      if (replyTo && replyTo.sender && replyTo.text) {
        finalContent = JSON.stringify({
          text: cleaned,
          replyTo: {
            id: replyTo.id || '',
            sender: String(replyTo.sender).slice(0, 50),
            text: clean(String(replyTo.text)).slice(0, 150)
          }
        });
      }
      const message = await prisma.message.create({ data: { roomId: room.id, senderId: user.id, senderAlias: user.publicAlias, content: finalContent, isFiltered: cleaned !== content.trim() } });
      const payload = { ...publicMessage(message), status: 'delivered' };
      io.to('campus:' + user.campus.slug).emit('message:new', payload);
      ack({ ok: true, message: payload });
    } catch { ack({ error: 'Campus chat is unavailable.' }); }
  });

  // Private match-room message (persisted to Prisma, scoped to verified participants)
  socket.on('message:send', async ({ roomId, content }, ack = () => {}) => {
    if (!user.isVerified && !await isAdminUser(user)) {
      return ack({ error: 'Identity verification required. Complete your live face check to send messages.' });
    }
    if (!content?.trim()) return ack({ error: 'Message cannot be empty.' });
    const match = await prisma.match.findFirst({
      where: { roomId, OR: [{ userOneId: user.id }, { userTwoId: user.id }], status: MatchStatus.active }
    });
    if (!match) return ack({ error: 'Room unavailable.' });
    const cleaned = clean(content);
    const expiresAt = match.disappearingMode ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
    const message = await prisma.message.create({
      data: {
        roomId,
        senderId: user.id,
        senderAlias: user.publicAlias,
        content: cleaned,
        isFiltered: cleaned !== content.trim(),
        expiresAt
      }
    });
    
    // Check if peer is connected in the room
    const roomSockets = io.sockets.adapter.rooms.get(roomId);
    const peerOnline = roomSockets && roomSockets.size > 1;
    const payload = { ...publicMessage(message), status: peerOnline ? 'delivered' : 'sent' };
    
    io.to(roomId).emit('message:new', payload);
    ack({ ok: true, message: payload });
  });

  // Reaction toggle on a message (broadcasts updated tallies to room)
  socket.on('message:react', async ({ messageId, emoji, roomId }, ack = () => {}) => {
    if (!messageId || !emoji) return ack({ error: 'Missing parameters.' });
    if (!reactions.ALLOWED_EMOJIS.includes(emoji)) return ack({ error: 'Unsupported emoji reaction.' });

    try {
      const result = await reactions.toggleReaction(messageId, emoji, user.id);
      if (!result) return ack({ error: 'Could not process reaction.' });

      const targetRoom = roomId || ('campus:' + user.campus.slug);
      io.to(targetRoom).emit('message:reaction:update', {
        messageId,
        emoji,
        userId: user.id,
        userAlias: user.publicAlias,
        action: result.action,
        reactions: result.reactions
      });
      ack({ ok: true, ...result });
    } catch (err) {
      console.error('message:react error:', err);
      ack({ error: 'Failed to toggle reaction.' });
    }
  });

  // Live location update from a student (broadcast only if mutual session active)
  socket.on('location:update', async ({ matchId, coords }) => {
    const lat = typeof coords?.lat === 'number' ? coords.lat : (typeof coords?.latitude === 'number' ? coords.latitude : null);
    const lng = typeof coords?.lng === 'number' ? coords.lng : (typeof coords?.longitude === 'number' ? coords.longitude : null);
    if (!matchId || lat === null || lng === null) return;
    try {
      const match = await prisma.match.findFirst({
        where: { id: matchId, OR: [{ userOneId: user.id }, { userTwoId: user.id }], status: MatchStatus.active }
      });
      if (!match) return;

      const session = activeLocationSessions.get(match.id);
      if (!session || !session.active) return;

      const locationPayload = {
        userId: user.id,
        userAlias: user.publicAlias,
        lat,
        lng,
        latitude: lat,
        longitude: lng,
        accuracy: coords.accuracy || null,
        heading: coords.heading || null,
        speed: coords.speed || null,
        timestamp: coords.timestamp || Date.now()
      };

      session.coords.set(user.id, locationPayload);

      // Broadcast to matched partner in the room
      socket.to(match.roomId).emit('location:update', {
        matchId: match.id,
        roomId: match.roomId,
        ...locationPayload
      });
    } catch (err) {
      console.error('location:update error:', err);
    }
  });

  // Stop location sharing via socket
  socket.on('location:stop', async ({ matchId }) => {
    if (!matchId) return;
    try {
      const match = await prisma.match.findFirst({
        where: { id: matchId, OR: [{ userOneId: user.id }, { userTwoId: user.id }] }
      });
      if (!match) return;

      const session = activeLocationSessions.get(match.id);
      if (session) {
        session.consents.delete(user.id);
        session.active = false;
        session.coords.clear();
      }

      socket.to(match.roomId).emit('location:stopped', {
        matchId: match.id,
        stoppedBy: user.publicAlias
      });
    } catch (err) {
      console.error('location:stop error:', err);
    }
  });
});

// ── Automated Ephemeral Retention Cleanup (24h Disappearing / 7-Day Campus / 14-Day DMs) ─
async function runEphemeralChatCleanup() {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    // 1. Delete individual expired 24-hour messages (only if user explicitly sent as disappearing)
    const expiredDeleted = await prisma.message.deleteMany({
      where: {
        expiresAt: { not: null, lt: now }
      }
    });

    // 2. Campus chat messages are preserved; only purge if explicitly enabled in production
    let campusDeleted = { count: 0 };
    if (process.env.ENABLE_EPHEMERAL_CLEANUP === 'true') {
      campusDeleted = await prisma.message.deleteMany({
        where: {
          createdAt: { lt: sevenDaysAgo },
          room: { kind: RoomKind.campus }
        }
      });
    }

    // 3. Match messages older than 14 days if enabled
    let matchDeleted = { count: 0 };
    if (process.env.ENABLE_EPHEMERAL_CLEANUP === 'true') {
      matchDeleted = await prisma.message.deleteMany({
        where: {
          createdAt: { lt: fourteenDaysAgo },
          room: { kind: RoomKind.match }
        }
      });
    }

    if (expiredDeleted.count > 0 || campusDeleted.count > 0 || matchDeleted.count > 0) {
      console.log(`[Ephemeral Cleanup] Purged ${expiredDeleted.count} 24h messages, ${campusDeleted.count} campus messages (>7d), and ${matchDeleted.count} DMs (>14d).`);
    }
  } catch (err) {
    console.error('[Ephemeral Cleanup Error]:', err.message);
  }
}

// ── Static frontend ─────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'dist', 'index.html')));

// Run ephemeral cleanup on startup and hourly
setInterval(runEphemeralChatCleanup, 60 * 60 * 1000);
runEphemeralChatCleanup();

server.listen(PORT, HOST, () => console.log(`Afterclass API listening on http://${HOST}:${PORT}`));



