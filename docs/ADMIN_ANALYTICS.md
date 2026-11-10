# College administration and business analytics

Open `/admin` as a signed-in administrator. Platform administrators start at a searchable college directory; each college has its own moderation workspace and analytics. Network analytics aggregates all registered colleges. College moderators enter only their own college.

## Access boundaries

- Accounts in `ADMIN_EMAILS` are platform administrators. Existing excluded-admin checks still apply.
- Dynamically granted moderators are restricted to their account's college. Only platform administrators can grant or revoke staff access.
- `/api/admin/*` requires a real authenticated administrator session. The legacy `x-admin-key` bypass is no longer accepted.
- `X-Afterclass-Campus` selects a college, or `campusId` is accepted for protected verification-image URLs. The server validates access; modifying the client does not grant another college's access.
- Report lists, report transcripts, verification queues/photos, staff lists and moderation actions are scoped. Switching colleges aborts outstanding UI requests and clears the previous workspace.
- Account-review decisions and hearing participation retain their existing college and independent-reviewer permissions. The overview shows their aggregate workload, but platform-wide analytics does not unlock evidence or permit bypassing reviewer independence.

## Metrics

`GET /api/admin/analytics?days=7|30|90` returns the selected college. Platform administrators can request `scope=all`. Responses are private/no-store.

| Metric | Definition |
| --- | --- |
| Registered accounts | Current accounts in the college, including restricted accounts. Not total college enrolment. |
| Verified share | Currently approved and verified accounts / registered accounts. |
| New accounts | Accounts created in the selected UTC period. |
| Participating accounts | Distinct users who sent a campus/private message, posted a plan, or applied to a plan during the period. Viewing pages and logging in do not count. |
| Returning participants | Current participants who also participated in the immediately preceding N-day window / current participants. This is not signup-cohort retention. |
| Plan-to-match rate | Plans created in the period with at least one match record / plans created in the period. Subsequent cancellation does not erase conversion. |
| Matches / confirmed / completed / cancelled | Matches created in the period, grouped by current recorded state. Confirmation requires both confirmations and excludes cancelled matches. Completion is a recorded status, not independently established attendance. |
| Past unmatched plans | Plans created in the period whose scheduled time passed without a match. |
| Open upcoming plans | Current open or pending-acceptance plans with future scheduled and expiry times. |
| New reports / reasons | Reports created during the period, grouped by reported reason. These are allegations, not findings. |
| Resolved reports | Records with `resolvedAt` in the period; includes resolved and dismissed cases. |
| Pending reports / reported accounts | Current pending or reviewing backlog and distinct subjects in that backlog. |
| Aged reports | Pending/reviewing reports created more than 48 hours ago. This is an attention threshold, not a promised response deadline. |
| Verification queue | Accounts with pending verification. |
| Account appeals | Account reviews not marked resolved. Excludes verification appeals. |
| Upcoming/live hearings | Scheduled/live hearings with a slot that has not ended. |

UTC periods include the incomplete current day. Snapshot totals and queues do not change with the period selector. Daily charts have an exact-values table; CSV exports include college aggregates and daily totals. Zero denominators display an em dash instead of a fabricated percentage.

No email addresses, message text, profile demographics, private feedback or hearing evidence are included in analytics/CSV. Aggregates are computed in PostgreSQL, with no paid analytics service. Deleted source records disappear from historical measurements; changing statuses can revise past-cohort outcomes. At larger scale, introduce durable privacy-conscious event records and daily rollups before using these figures for financial or retention reporting.

## Review and verification

Main: `http://localhost:3002/admin`. Isolated review: `http://127.0.0.1:3003/admin`, choose **CalmClover**. `npm run review` seeds NIIT University · Demo and fictional Lakeside College · Demo without changing Supabase. Existing fixtures are not overwritten.

- `npm test`
- `RUN_ADMIN_ANALYTICS_TESTS=1 node --test tests/admin-analytics.test.mjs` uses only the isolated PostgreSQL database on port 55432 and a temporary API on 3018.
- Browser checks cover college filtering/switching, real scoped moderation responses, 7/30/90-day periods, aggregate-only CSV, moderator navigation, stale responses and desktop/mobile layouts.

## Recommended next investments

1. **First successful meeting and retention funnel.** Instrument consent-aware signup, verified-account activation, first invitation, mutual confirmation, recorded completion and return activity. Show D7/D30 cohorts only when mature; distinguish observed actions from claimed attendance. [Retention definitions](https://www.amplitude.com/docs/analytics/charts/retention-analysis/retention-analysis-calculation).
2. **An administrator audit trail.** Record who viewed sensitive evidence, changed privileges, exported data, or made/reversed a decision. Keep restricted audit records separate from aggregate business analytics. [OWASP logging guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet).
3. **Reviewer assignment and escalation.** Ownership of reports, coverage by college, aging reminders, conflict checks, reassignment and a clear handover queue.
4. **Campus launch health.** Availability-to-invitation conversion, time to first match, repeated empty searches, referral attribution and genuine host activity. Validate with students before treating activity volume as success.
5. **Service health and cost controls.** API latency/errors, database and Redis quotas, mail delivery, failed verification submissions and threshold alerts to protect the free-tier budget.

Revenue, acquisition cost, lifetime value, visit funnels and true D7/D30 retention are currently explicitly unavailable. Do not substitute inferred or invented numbers.
