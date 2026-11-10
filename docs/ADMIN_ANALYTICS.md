# College administration and business analytics

Open `/admin` as a signed-in administrator. Platform administrators start at the visual network dashboard. All colleges opens the searchable directory; each college has its own moderation workspace and analytics. Network analytics aggregates all registered colleges. College moderators enter only their own college.

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

## Dashboard and operations

The overview leads with an interactive activity chart, plan-conversion ring, workload bars, college comparisons, activation milestones, and a retention heatmap. Chart series can be toggled; exact daily values remain available. Activation & retention, Review queue, Audit history, and Services & budgets are separate tabs. Service information is platform-only.

### Activation and retention

- Activation uses accounts created in the selected 7/30/90-day window. Counts show distinct members reaching each milestone to date: posted/applied, matched, mutually confirmed, and recorded completion. Stages are independent; completion may exist without confirmation and is not independent proof of attendance.
- Authenticated visible page visits and user interactions call `/api/activity`. The database deduplicates to one row per account per UTC day. No page URL, message, demographic, device identifier, or anonymous browsing history is collected.
- D1/D7/D30 retention is **exact-day** return activity from signup, grouped by signup week over the last 90 days. Only signup dates after instrumentation began are included, and only fully elapsed return days enter the denominator. Current-day/ineligible observations display Waiting. Weekly cells can have different eligible denominators, exposed in their tooltips.
- Older signups are excluded rather than assigning invented historical activity. Deleting an account deletes its activity days and changes cohort counts. Activity is not an immutable financial metric.
- Existing participation metrics remain based on messages, plans and applications; they are deliberately separate from authenticated return-day retention.

### Audit history

Privileged `/api/admin/*` reads and mutations (except dashboard/operations polling reads), account-review administrator routes, and moderator hearing access/control are recorded. Hearing presence heartbeats/event streams are excluded. CSV exports require a successful audit request before download.

Attempts are persisted before the protected handler runs. Failure to record an attempt blocks that operation. Response status updates mark succeeded/rejected; a crash or failed completion write leaves Started, not a false success. Assignment changes also record old/new owner IDs transactionally. Privilege changes and verification-photo access identify the relevant account by ID. Records contain no email addresses, session credentials, private message text or evidence content. Account/campus foreign keys are cleared on deletion; portal users cannot edit the log. This is database-backed audit history, not an external tamper-proof archive. No prior events are backfilled. Authentication failures before administrator authorization are not captured by this audit table.

### Review ownership

The queue shows the oldest 100 open reports, with age, college, subject alias and owner. Same-college active staff can own reports. A reporter or reported account cannot be assigned to their own report. Assignment validates authorization on the server and locks the report; a stale expected owner returns 409 instead of overwriting a concurrent change. An owner does not gain extra evidence or hearing access. Reports older than 48 hours are visibly flagged for escalation; there are no automatic bans or external reminders.

### Service and budget signals

The platform-only panel exposes API sample count, 5xx rate, p95 duration, current database probe duration, Redis/fallback state and audit-outcome-write failures. The sample is the latest 15 minutes, capped at 10,000 completed requests on this process, excluding operations polling. Restarting clears the sample. Empty samples display unavailable, not a healthy zero. p95 >= 2 seconds and 5xx rate >= 5% show attention text.

Provider usage is **manual**, timestamped input from the actual provider console: used, limit, unit, measurement date. Only platform administrators can update it. One resource per provider (Supabase, Upstash, email, hosting) is supported. Values >= 80% of the recorded limit are flagged; snapshots older than 24 hours are stale. This is not live billing telemetry, a spend cap, or automatic notification delivery. No email deliverability measurements or provider integrations are claimed.

### Data and deployment

Migration `20261110000300_admin_operations` adds measurement configuration, activity days, audit events, report ownership and budget snapshots. RLS is enabled with no browser-facing policies. Apply migrations before starting the updated server; generate the Prisma client when deploying. Main uses only actual data. `scripts/review-analytics.cjs` adds clearly fictional historical activity only to the isolated database on 55432, so port 3003 can demonstrate mature cohorts without misleading main metrics. It is idempotent and refuses another database URL/name.

Validation: `RUN_ADMIN_OPERATIONS_TESTS=1 RUN_ADMIN_ANALYTICS_TESTS=1 RUN_ACCOUNT_REVIEW_TESTS=1 RUN_HEARING_TESTS=1 node --test tests/admin-operations.test.mjs tests/admin-analytics.test.mjs tests/account-review-integration.test.mjs tests/hearings-integration.test.mjs`.

Still unmeasured: anonymous visits, signup abandonment, referral attribution, revenue, acquisition cost and lifetime value. Next infrastructure upgrades are provider API ingestion, durable multi-server monitoring, audit export/retention policy, and external escalation notifications after delivery rules and recipients are configured.
