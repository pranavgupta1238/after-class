// Account verification and declared gender are separate facts. No gender inference.
function eligibleForPairing(user, now = Date.now()) {
  return Boolean(user?.id && user.campusId && user.campusEligible !== false && (!user.campus || user.campus.status === 'active') && user.isVerified === true &&
    user.verificationStatus === 'approved' && user.accountStatus === 'active' &&
    (!user.suspendedUntil || new Date(user.suspendedUntil).getTime() <= now) &&
    ['man', 'woman'].includes(user.gender));
}
function canPair(a, b, now = Date.now()) {
  return eligibleForPairing(a, now) && eligibleForPairing(b, now) &&
    (a.campusRole || 'student') === (b.campusRole || 'student') && a.id !== b.id && a.campusId === b.campusId && a.gender !== b.gender;
}
function assertPairing(a, b) {
  if (!canPair(a, b)) throw new Error('One-to-one plans require two approved, verified accounts from the same campus and member group: one man and one woman.');
}
function isOpenPlan(plan, now = Date.now()) {
  return plan?.status === 'open' && new Date(plan.scheduledAt).getTime() > now && new Date(plan.expiresAt).getTime() > now;
}
module.exports = { eligibleForPairing, canPair, assertPairing, isOpenPlan };
