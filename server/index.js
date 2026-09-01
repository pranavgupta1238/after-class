require('dotenv').config?.();
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const { Server } = require('socket.io');
const { PrismaClient, RoomKind, MatchStatus, RevealStatus } = require('@prisma/client');
const campuses = require('./campuses');
const matchService = require('./match-service');
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

const names = {
  adjectives: ['Amber','Brisk','Clever','Daring','Gentle','Mossy','Quiet','Sunny','Velvet','Witty','Bright','Kind','Swift','Calm','Happy','Cosmic'],
  nouns: ['Acorn','Badger','Cedar','Comet','Clover','Heron','Mango','Otter','Pine','Robin','Sparrow','Willow','Fox','Maple','Moon','River']
};

app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());

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

function publicMessage(m) {
  return { id: m.id, content: m.content, isFiltered: m.isFiltered, createdAt: m.createdAt, sender: { username: m.senderAlias } };
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
  const campus = campuses.fromEmail(email);
  if (!campus) return res.status(400).json({ error: 'Use an email from a supported university.' });
  const maxOtpPerHour = process.env.NODE_ENV === 'production' ? 5 : 50;
  if (!await redis.limit('otp:send:' + email, maxOtpPerHour, 3600000)) return res.status(429).json({ error: 'Too many codes requested. Try again later.' });
  const code = String(crypto.randomInt(100000, 1000000));
  try { await deliverOtp(email, code); } catch (err) { return res.status(503).json({ error: err.message }); }
  // Store OTP hash + campus slug in Redis with 10-minute TTL
  await redis.setOtp(email, { codeHash: hashOtp(email, code), campusId: campus.id });
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
  if (!user) {
    const alias = await generateUsername();
    user = await prisma.user.create({
      data: {
        email,
        campusId: dbCampus.id,
        publicAlias: alias,
        gender: 'prefer_not_to_say',
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

app.post('/api/auth/logout', auth, async (req, res) => {
  await prisma.user.update({ where: { id: req.user.id }, data: { sessionVersion: (req.user.sessionVersion || 0) + 1 } });
  res.clearCookie('session', { path: '/' }).json({ ok: true });
});

app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

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
    res.json({ messages: messages.reverse().map(publicMessage) });
  } catch { res.status(503).json({ error: 'Campus chat is unavailable.' }); }
});

// ── Match requests ──────────────────────────────────────────────────────────

app.get('/api/match-requests', auth, async (req, res) => {
  try {
    const requests = await prisma.matchRequest.findMany({
      where: { campusId: req.user.campusId, status: 'open', expiresAt: { gt: new Date() } },
      include: { requester: true, applications: { where: { applicantId: req.user.id } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ requests: requests.map(r => matchService.publicRequest(r, req.user.id)) });
  } catch { res.status(503).json({ error: 'Matching is unavailable.' }); }
});

app.post('/api/match-requests', auth, async (req, res) => {
  if (!await redis.limit('request:' + req.user.id, 5, 86400000)) return res.status(429).json({ error: 'Daily plan limit reached.' });
  try {
    const { activity, location, scheduledAt, genderPreference, orientationPreference } = req.body;
    if (!activity || !location || !scheduledAt) return res.status(400).json({ error: 'Activity, location and time are required.' });
    const request = await matchService.createRequest(prisma, req.user, {
      activity: String(activity).slice(0, 100),
      location: String(location).slice(0, 120),
      scheduledAt,
      genderPreference,
      orientationPreference
    });
    res.status(201).json({ request });
  } catch { res.status(400).json({ error: 'Unable to create request.' }); }
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

app.post('/api/match-requests/:id/applications', auth, async (req, res) => {
  try {
    const application = await matchService.apply(prisma, req.user, req.params.id);
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
      return {
        id: m.id,
        status: m.status,
        roomId: m.roomId,
        scheduledAt: m.scheduledAt,
        activity: m.request.activity,
        location: m.request.location,
        other: publicUser(other),
        myReveal: myConsent?.status || 'pending',
        otherReveal: otherConsent?.status || 'pending',
        revealed
      };
    });
    res.json({ matches: result });
  } catch { res.status(503).json({ error: 'Matches unavailable.' }); }
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
    io.to('user:' + otherId).emit('reveal:requested', { matchId: match.id });
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

// ── Reports ─────────────────────────────────────────────────────────────────

app.post('/api/reports', auth, async (req, res) => {
  if (!await redis.limit('report:' + req.user.id, 10, 86400000)) return res.status(429).json({ error: 'Report limit reached.' });
  const { messageId, reason = 'inappropriate_content' } = req.body;
  if (!messageId) return res.status(400).json({ error: 'Message ID is required.' });
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message) return res.status(404).json({ error: 'Message not found.' });
  if (message.senderId === req.user.id) return res.status(400).json({ error: 'You cannot report your own message.' });
  await prisma.report.create({ data: { campusId: req.user.campusId, reporterId: req.user.id, reportedUserId: message.senderId, messageId: message.id, reason } });
  res.status(201).json({ ok: true });
});

app.get('/api/admin/reports', auth, async (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Admin access required.' });
  try {
    const reports = await prisma.report.findMany({
      where: { status: 'pending' },
      include: { reporter: true, reportedUser: true, message: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ reports });
  } catch { res.status(503).json({ error: 'Reports unavailable.' }); }
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

io.on('connection', socket => {
  const user = socket.user;
  socket.join('user:' + user.id);
  socket.join('campus:' + user.campus.slug);

  // Join a room — campus room (already joined above) or an authorized match room.
  socket.on('room:join', async room => {
    if (room === `campus:${user.campus.slug}`) { socket.join(room); return; }
    const match = await prisma.match.findFirst({
      where: { roomId: room, OR: [{ userOneId: user.id }, { userTwoId: user.id }], status: MatchStatus.active }
    });
    if (match) {
      socket.join(room);
      // Send last 50 messages as history for the private room
      const messages = await prisma.message.findMany({ where: { roomId: room, isDeleted: false }, orderBy: { createdAt: 'asc' }, take: 50 });
      socket.emit('room:history', messages.map(publicMessage));
    }
  });

  // Mark messages as read in a room
  socket.on('room:read', async ({ roomId }) => {
    if (!roomId) return;
    const match = await prisma.match.findFirst({
      where: { roomId, OR: [{ userOneId: user.id }, { userTwoId: user.id }], status: MatchStatus.active }
    });
    if (match) {
      socket.to(roomId).emit('room:read', { roomId, readerId: user.id });
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
  socket.on('campus:message', async ({ content }, ack = () => {}) => {
    if (!await redis.limit('chat:' + user.id, 20, 60000)) return ack({ error: 'Slow down — 20 messages per minute.' });
    if (!content?.trim()) return ack({ error: 'Message cannot be empty.' });
    try {
      const room = await campusRoom(user);
      const cleaned = clean(content);
      const message = await prisma.message.create({ data: { roomId: room.id, senderId: user.id, senderAlias: user.publicAlias, content: cleaned, isFiltered: cleaned !== content.trim() } });
      const payload = { ...publicMessage(message), status: 'delivered' };
      io.to('campus:' + user.campus.slug).emit('message:new', payload);
      ack({ ok: true, message: payload });
    } catch { ack({ error: 'Campus chat is unavailable.' }); }
  });

  // Private match-room message (persisted to Prisma, scoped to verified participants)
  socket.on('message:send', async ({ roomId, content }, ack = () => {}) => {
    if (!await redis.limit('chat:' + user.id, 20, 60000)) return ack({ error: 'Slow down — 20 messages per minute.' });
    if (!content?.trim()) return ack({ error: 'Message cannot be empty.' });
    const match = await prisma.match.findFirst({
      where: { roomId, OR: [{ userOneId: user.id }, { userTwoId: user.id }], status: MatchStatus.active }
    });
    if (!match) return ack({ error: 'Room unavailable.' });
    const cleaned = clean(content);
    const message = await prisma.message.create({ data: { roomId, senderId: user.id, senderAlias: user.publicAlias, content: cleaned, isFiltered: cleaned !== content.trim() } });
    
    // Check if peer is connected in the room
    const roomSockets = io.sockets.adapter.rooms.get(roomId);
    const peerOnline = roomSockets && roomSockets.size > 1;
    const payload = { ...publicMessage(message), status: peerOnline ? 'delivered' : 'sent' };
    
    io.to(roomId).emit('message:new', payload);
    ack({ ok: true, message: payload });
  });
});

// ── Static frontend ─────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'dist', 'index.html')));

server.listen(PORT, HOST, () => console.log(`Afterclass API listening on http://${HOST}:${PORT}`));
