// Private moderation context, never a reputation or safety rating.
function campusReportCoverage(reports, campusPopulations) {
  const groups = new Map();
  for (const report of reports) {
    const target = report.reportedUser;
    if (!target?.id || !target.campusId) continue;
    if (!groups.has(target.id)) groups.set(target.id, {
      campusId: target.campusId, reporters: new Set(),
      outcomes: { pending: 0, reviewing: 0, resolved: 0, dismissed: 0 }
    });
    const group = groups.get(target.id);
    // Exclude cross-campus and self-reports from both numerator and outcomes.
    if (!report.reporter?.id || report.reporter.id === target.id ||
        report.reporter.campusId !== target.campusId || report.campusId !== target.campusId) continue;
    group.reporters.add(report.reporter.id);
    if (Object.hasOwn(group.outcomes, report.status)) group.outcomes[report.status]++;
  }
  return new Map([...groups].map(([id, group]) => {
    const registeredAccounts = campusPopulations.get(group.campusId);
    const denominator = Number.isInteger(registeredAccounts) && registeredAccounts > 0 ? registeredAccounts : null;
    const uniqueReporters = group.reporters.size;
    return [id, {
      uniqueReporters, registeredAccounts: denominator,
      percentage: denominator && uniqueReporters <= denominator ? uniqueReporters / denominator * 100 : null,
      outcomes: group.outcomes
    }];
  }));
}

module.exports = { campusReportCoverage };
