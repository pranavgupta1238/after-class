const connectionPolicy = require('./connection-policy');
const { eligibleForPairing, assertPairing, isOpenPlan } = require('./match-policy');
const { RoomKind, ApplicationStatus, MatchRequestStatus, MatchStatus, RevealStatus } = require('@prisma/client');

function publicRequest(request, userId) {
  const hasApplied = userId && request.applications?.some(a => a.applicantId === userId);
  return {
    id: request.id,
    activity: request.activity,
    connectionMode: request.connectionMode || 'social',
    location: request.location,
    scheduledAt: request.scheduledAt,
    status: request.status,
    host: { id: request.requester.id, username: request.requester.publicAlias, isVerified: request.requester.isVerified },
    hasApplied: Boolean(hasApplied)
  };
}

// Uses user.campusId (Prisma UUID) directly — no campus slug lookup needed.
async function createRequest(prisma, user, data) {
  const currentUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!eligibleForPairing(currentUser)) throw new Error('Complete student verification and select man or woman before creating a one-to-one plan.');
  const mode=data.connectionMode || 'social';
  if (!['social','dating'].includes(mode)) throw new Error('Choose a valid connection mode.');
  if(mode==='dating') {
    const profile=await prisma.connectionProfile.findUnique({where:{userId:user.id}});
    if(!connectionPolicy.datingEligible(currentUser,profile)) throw new Error('Enable dating with eligible age and verification before creating a date.');
  }
  const schedTime = new Date(data.scheduledAt).getTime();
  const expiresAt = new Date(Math.max(Date.now() + 24 * 3600e3, schedTime + 2 * 3600e3));
  return prisma.matchRequest.create({
    data: {
      campusId: user.campusId,
      requesterId: user.id,
      activity: data.activity,
      connectionMode: mode,
      location: data.location,
      scheduledAt: new Date(data.scheduledAt),
      genderPreference: data.genderPreference || 'any',
      orientationPreference: data.orientationPreference || 'any',
      expiresAt
    }
  });
}

async function apply(prisma, user, requestId) {
  const request = await prisma.matchRequest.findFirst({
    where: { id: requestId, campusId: user.campusId, status: MatchRequestStatus.open },
    include: { requester: true }
  });
  if (!isOpenPlan(request)) throw new Error('This plan is no longer open.');
  const applicant = await prisma.user.findUnique({ where: { id: user.id } });
  assertPairing(request.requester, applicant);
  await connectionPolicy.assertConnection(prisma, request.requester, applicant, request.connectionMode);
  if (request.requesterId === user.id) throw new Error('You cannot apply to your own plan.');
  
  const existing = await prisma.matchApplication.findFirst({
    where: { requestId, applicantId: user.id }
  });
  if (existing) throw new Error('You have already expressed interest in this plan.');

  return prisma.matchApplication.create({ data: { requestId, applicantId: user.id } });
}

async function accept(prisma, user, applicationId) {
  return prisma.$transaction(async tx => {
    const application = await tx.matchApplication.findFirst({
      where: { id: applicationId, status: ApplicationStatus.pending },
      include: { request: { include: { requester: true } }, applicant: true }
    });
    if (!application || application.request.requesterId !== user.id) throw new Error('Application unavailable');
    if (!isOpenPlan(application.request)) throw new Error('This plan is no longer open.');
    // Lock both accounts so a concurrent block cannot slip between eligibility and match creation.
    for (const id of [user.id, application.applicantId].sort()) await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
    const host=await tx.user.findUnique({where:{id:user.id}});
    const applicant=await tx.user.findUnique({where:{id:application.applicantId}});
    assertPairing(host, applicant);
    await connectionPolicy.assertConnection(tx,host,applicant,application.request.connectionMode);
    // Claim atomically so two concurrent accepts cannot create duplicate matches.
    const claimed = await tx.matchRequest.updateMany({
      where: { id: application.requestId, status: MatchRequestStatus.open, scheduledAt: { gt: new Date() }, expiresAt: { gt: new Date() } },
      data: { status: MatchRequestStatus.matched }
    });
    if (claimed.count !== 1) throw new Error('This plan has already been matched or closed.');
    const room = await tx.chatRoom.create({ data: { campusId: application.request.campusId, kind: RoomKind.match } });
    const match = await tx.match.create({
      data: {
        requestId: application.requestId,
        userOneId: user.id,
        userTwoId: application.applicantId,
        roomId: room.id,
        scheduledAt: application.request.scheduledAt,
        status: MatchStatus.active
      }
    });
    await tx.matchApplication.update({ where: { id: application.id }, data: { status: ApplicationStatus.accepted } });
    await tx.matchApplication.updateMany({
      where: { requestId: application.requestId, id: { not: application.id }, status: ApplicationStatus.pending },
      data: { status: ApplicationStatus.waiting }
    });
    await tx.revealConsent.createMany({
      data: [
        { matchId: match.id, userId: user.id, status: RevealStatus.pending },
        { matchId: match.id, userId: application.applicantId, status: RevealStatus.pending }
      ]
    });
    return match;
  });
}

module.exports = { createRequest, apply, accept, publicRequest };
