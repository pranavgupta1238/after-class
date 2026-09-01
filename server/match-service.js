const { RoomKind, ApplicationStatus, MatchRequestStatus, MatchStatus, RevealStatus } = require('@prisma/client');

function publicRequest(request, userId) {
  const hasApplied = userId && request.applications?.some(a => a.applicantId === userId);
  return {
    id: request.id,
    activity: request.activity,
    location: request.location,
    scheduledAt: request.scheduledAt,
    status: request.status,
    host: { username: request.requester.publicAlias },
    hasApplied: Boolean(hasApplied)
  };
}

// Uses user.campusId (Prisma UUID) directly — no campus slug lookup needed.
async function createRequest(prisma, user, data) {
  return prisma.matchRequest.create({
    data: {
      campusId: user.campusId,
      requesterId: user.id,
      activity: data.activity,
      location: data.location,
      scheduledAt: new Date(data.scheduledAt),
      genderPreference: data.genderPreference || 'any',
      orientationPreference: data.orientationPreference || 'any',
      expiresAt: new Date(Date.now() + 48 * 3600e3)
    }
  });
}

async function apply(prisma, user, requestId) {
  const request = await prisma.matchRequest.findFirst({
    where: { id: requestId, campusId: user.campusId, status: MatchRequestStatus.open }
  });
  if (!request) throw new Error('This plan is no longer open.');
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
      include: { request: true }
    });
    if (!application || application.request.requesterId !== user.id) throw new Error('Application unavailable');
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
    await tx.matchRequest.update({ where: { id: application.requestId }, data: { status: MatchRequestStatus.matched } });
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
