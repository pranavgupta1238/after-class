const { canPair, eligibleForPairing } = require('./match-policy');
const INTERESTS = ['Coffee', 'Books', 'Music', 'Films', 'Gaming', 'Fitness', 'Badminton', 'Walking', 'Art', 'Food', 'Photography', 'Technology'];
const PROMPTS = ['My ideal free afternoon', 'Something I could talk about for hours', 'A small thing that makes my day'];
const INTENTS = ['relationship', 'getting_to_know'];
function ageOn(date, now = new Date()) {
  if (!date) return null;
  const d = new Date(date);
  if (!Number.isFinite(d.getTime()) || d > now) return null;
  return now.getUTCFullYear() - d.getUTCFullYear() - (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate()) ? 1 : 0);
}
function datingEligible(user, profile, now = new Date()) {
  const age = ageOn(profile?.birthDate, now);
  return eligibleForPairing(user, now.getTime()) && profile?.datingEnabled === true && age >= 18 && age <= 100;
}
function canConnect(a, b, mode = 'social', now = new Date()) {
  if (!canPair(a, b, now.getTime())) return false;
  if (mode === 'social') return true;
  if (mode !== 'dating' || !datingEligible(a, a.connectionProfile, now) || !datingEligible(b, b.connectionProfile, now)) return false;
  const ap = a.connectionProfile, bp = b.connectionProfile;
  const aa = ageOn(ap.birthDate, now), ba = ageOn(bp.birthDate, now);
  return ap.datingIntent === bp.datingIntent && ba >= ap.minAge && ba <= ap.maxAge && aa >= bp.minAge && aa <= bp.maxAge;
}
function publicProfile(user, mode = 'social') {
  const p = user.connectionProfile;
  return { id: user.id, alias: user.publicAlias, isVerified: Boolean(user.isVerified), avatarConfig: user.avatarConfig,
    bio: p?.bio || '', interests: p?.interests || [], prompt: p?.prompt || '', answer: p?.answer || '',
    ...(mode === 'dating' ? { age: ageOn(p?.birthDate), intent: p?.datingIntent } : {}) };
}
function profileInput(body, current, user) {
  const text = (key, max) => { const value = body[key] ?? current?.[key] ?? ''; if (typeof value !== 'string' || value.length > max) throw new Error(`${key} is too long or invalid.`); return value.trim(); };
  const data = { bio: text('bio',240), prompt: text('prompt',100), answer: text('answer',200), interests: body.interests ?? current?.interests ?? [] };
  if (!Array.isArray(data.interests) || data.interests.length > 6 || data.interests.some(x=>!INTERESTS.includes(x))) throw new Error('Choose up to six interests.');
  data.interests = [...new Set(data.interests)];
  if (data.prompt && !PROMPTS.includes(data.prompt)) throw new Error('Choose a profile prompt.');
  if (Boolean(data.prompt) !== Boolean(data.answer)) throw new Error('Choose a prompt and add an answer, or leave both empty.');
  data.datingEnabled = body.datingEnabled ?? current?.datingEnabled ?? false;
  if (typeof data.datingEnabled !== 'boolean') throw new Error('Invalid dating preference.');
  data.datingIntent = body.datingIntent ?? current?.datingIntent ?? 'relationship';
  if (!INTENTS.includes(data.datingIntent)) throw new Error('Choose a dating intent.');
  data.minAge = body.minAge ?? current?.minAge ?? 18; data.maxAge = body.maxAge ?? current?.maxAge ?? 30;
  if (![data.minAge,data.maxAge].every(Number.isInteger) || data.minAge < 18 || data.maxAge > 100 || data.minAge > data.maxAge) throw new Error('Choose an age range from 18 to 100.');
  data.birthDate = current?.birthDate || null;
  if (body.birthDate) {
    if (typeof body.birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.birthDate)) throw new Error('Enter a valid birth date.');
    const d = new Date(body.birthDate+'T00:00:00Z');
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== body.birthDate || ageOn(d) === null || ageOn(d) > 100) throw new Error('Enter a valid birth date.');
    if (data.birthDate && new Date(data.birthDate).getTime() !== d.getTime()) throw new Error('Birth date is already recorded. Contact a moderator for a correction.');
    data.birthDate = d;
  }
  if (data.datingEnabled && !datingEligible(user, data)) throw new Error('Dating requires an approved student account and a birth date showing you are 18 or older.');
  return data;
}
async function blockedIds(db, id) {
  const rows = await db.userBlock.findMany({ where: { OR: [{ blockerId: id }, { blockedId: id }] }, select: { blockerId:true, blockedId:true } });
  return rows.map(b=>b.blockerId===id?b.blockedId:b.blockerId);
}
async function isBlocked(db, a, b) {
  return Boolean(await db.userBlock.findFirst({ where: { OR: [{blockerId:a,blockedId:b},{blockerId:b,blockedId:a}] } }));
}
async function assertConnection(db, a, b, mode) {
  if (await isBlocked(db,a.id,b.id)) throw new Error('This connection is unavailable.');
  if (mode === 'dating') {
    [a,b] = await Promise.all([a,b].map(async u=>({...u,connectionProfile:await db.connectionProfile.findUnique({where:{userId:u.id}})})));
  }
  if (!canConnect(a,b,mode||'social')) throw new Error('This connection does not meet both students’ eligibility or preferences.');
}
module.exports = { INTERESTS, PROMPTS, INTENTS, ageOn, datingEligible, canConnect, publicProfile, profileInput, blockedIds, isBlocked, assertConnection };
