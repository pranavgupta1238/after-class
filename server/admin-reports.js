const { campusReportCoverage } = require('./report-coverage');

async function listReports(prisma, campusId) {
  const rawReports = await prisma.report.findMany({
    where: campusId ? {campusId} : {},
    include: {
      reporter: { select: { id: true, campusId: true, publicAlias: true, email: true, campus: { select: { name: true } } } },
      reportedUser: { select: { id: true, campusId: true, publicAlias: true, email: true, accountStatus: true, suspendedUntil: true, avatarConfig: true } },
      message: { select: { id: true, roomId: true, senderId: true, senderAlias: true, content: true, createdAt: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Full history, before any client filters. Count registered accounts, not campus enrollment.
  const campusIds = [...new Set(rawReports.map(r => r.reportedUser?.campusId).filter(Boolean))];
  const reportedUserIds = [...new Set(rawReports.map(r => r.reportedUserId).filter(Boolean))];
  const [campusCounts, warnings] = await Promise.all([
    campusIds.length ? prisma.user.groupBy({
      by: ['campusId'], where: { campusId: { in: campusIds } }, _count: { _all: true }
    }) : [],
    reportedUserIds.length ? prisma.moderationAction.findMany({
      where: { userId: { in: reportedUserIds }, type: 'warning' }, orderBy: { createdAt: 'desc' }
    }) : []
  ]);
  const coverageByUser = campusReportCoverage(rawReports,
    new Map(campusCounts.map(c => [c.campusId, c._count._all])));

  const warningsByUser = new Map();
  for (const w of warnings) {
    if (!warningsByUser.has(w.userId)) {
      warningsByUser.set(w.userId, []);
    }
    warningsByUser.get(w.userId).push({
      id: w.id,
      reason: w.reason,
      createdAt: w.createdAt
    });
  }

  const reports = rawReports.map(report => {
    const reported_message = report.message ? {
      id: report.message.id,
      senderId: report.message.senderId,
      senderName: report.message.senderAlias,
      content: report.message.content,
      createdAt: report.message.createdAt,
      isDeleted: false
    } : null;

    const userWarnings = report.reportedUser ? (warningsByUser.get(report.reportedUser.id) || []) : [];

    return {
      id: report.id,
      reason: report.reason,
      detail: report.detail,
      status: report.status,
      createdAt: report.createdAt,
      resolvedAt: report.resolvedAt,
      actionTaken: report.actionTaken,
      reporter: report.reporter ? {
        id: report.reporter.id,
        alias: report.reporter.publicAlias,
        publicAlias: report.reporter.publicAlias,
        email: report.reporter.email
      } : null,
      reportedUser: report.reportedUser ? {
        id: report.reportedUser.id,
        alias: report.reportedUser.publicAlias,
        publicAlias: report.reportedUser.publicAlias,
        email: report.reportedUser.email,
        status: report.reportedUser.accountStatus,
        accountStatus: report.reportedUser.accountStatus,
        reportCoverage: coverageByUser.get(report.reportedUser.id),
        suspendedUntil: report.reportedUser.suspendedUntil,
        avatarConfig: report.reportedUser.avatarConfig,
        warningCount: userWarnings.length,
        warnings: userWarnings
      } : null,
      message: reported_message,
      contextLoaded: false
    };
  });

  return reports;
}

async function reportContext(prisma, id, campusId) {
  const report = await prisma.report.findUnique({ where: { id }, include: { message: true } });
  if (!report || (campusId && report.campusId!==campusId)) return null;
  let before = [];
  let after = [];
  if (report.message && report.message.roomId) {
    [before, after] = await Promise.all([
      prisma.message.findMany({
        where: {
          roomId: report.message.roomId,
          createdAt: { lt: report.message.createdAt }
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, senderAlias: true, senderId: true, content: true, createdAt: true }
      }),
      prisma.message.findMany({
        where: {
          roomId: report.message.roomId,
          createdAt: { gt: report.message.createdAt }
        },
        orderBy: { createdAt: 'asc' },
        take: 5,
        select: { id: true, senderAlias: true, senderId: true, content: true, createdAt: true }
      })
    ]);
    before.reverse();
  }

  const context_before = before.map(m => ({
    id: m.id,
    senderId: m.senderId,
    senderName: m.senderAlias,
    content: m.content,
    createdAt: m.createdAt
  }));

  const reported_message = report.message ? {
    id: report.message.id,
    senderId: report.message.senderId,
    senderName: report.message.senderAlias,
    content: report.message.content,
    createdAt: report.message.createdAt,
    isDeleted: false
  } : null;

  const context_after = after.map(m => ({
    id: m.id,
    senderId: m.senderId,
    senderName: m.senderAlias,
    content: m.content,
    createdAt: m.createdAt
  }));

  const transcript = [
    ...context_before.map(m => ({ ...m, role: 'context_before' })),
    ...(reported_message ? [{ ...reported_message, role: 'reported_message' }] : []),
    ...context_after.map(m => ({ ...m, role: 'context_after' }))
  ];

  return { contextLoaded: true, message: reported_message, context: { roomId: report.message?.roomId, context_before, reported_message, context_after }, transcript };
}

module.exports = { listReports, reportContext };
