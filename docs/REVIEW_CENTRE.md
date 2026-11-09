# Afterclass Review Centre

The first release gives restricted accounts a private, free way to challenge an account decision. It is a written review service, not a court, public hearing, or automated judgment.

## Student experience

Open **Trust & safety → Review Centre**, or `/reviews`. A student with a suspended or banned account can sign in using the normal university email code or Google OAuth flow and receives restricted access to this centre. Chat, plans, profiles, and other authenticated features remain unavailable while the restriction is active.

Each restriction has a guideline, an explanation suitable for the account holder, a date, and an end date where applicable. A student can submit one appeal for each decision, add context and private images, follow the case timeline, and read the reviewer's explanation. A resolved case can be reopened once for significant new evidence. Reopening does not restore access automatically.

Older restrictions without a decision record receive a stable appealable record. The interface explicitly says when an original explanation was not retained; it does not invent evidence.

## Moderator experience

Open **Moderation → Account reviews**. The queue is scoped to the moderator's campus. The original decision-maker, the account holder, and moderators who reported the account cannot access the review details or handle the appeal. An eligible moderator claims a case before responding. Concurrent claims cannot assign the same case to two moderators.

Available responses:

- Request more information from the account holder.
- Restore account access.
- Reduce the restriction to an earlier end date.
- Uphold the decision.

Every response requires an explanation visible to the account holder. The original reports and message snapshots remain staff-only. An older appeal cannot restore access over a newer restriction. A report is evidence for review, not an automatic finding or a vote.

**Staffing:** a campus needs a second, uninvolved moderator to complete an appeal issued by the first. No response deadline or scheduled appointment is promised in this release. Reporter participation is not required, reporter identity is excluded from student API responses, and there is no direct contact between the parties. Staff must also avoid identifying reporters in free-text explanations.

## Storage and operational limits

This release uses the existing PostgreSQL database and authentication. No paid service is added. Evidence accepts PNG, JPEG, and WebP files only, up to three images of 512 KiB each per submission. MIME type, file signature, size, and count are checked server-side. Evidence is stored in private JSON records and delivered only through authenticated case endpoints; there are no public upload URLs. Do not treat a file-signature check as proof that an image is genuine.

Cases allow at most 40 student submission/timeline entries before additional student submissions are stopped. Write operations have a per-account rate limit. The initial overview lists the most recent 50 decisions; the staff queue lists the most recent 100 cases. Add pagination before exceeding that operating scale.

Records are retained until explicitly removed through database administration. Before a broad public rollout, define an evidence-retention policy, deletion process, staffing coverage, and reviewer reassignment process. Database storage still counts toward the existing service quota.

## Deployment

The additive migration is `20261109000200_account_review_centre`. It adds decision metadata, account reviews, and timeline entries. New tables enable row-level security and are accessed by the server's existing privileged Prisma connection, never a browser database client.

Run:

```sh
npm run db:validate
npm run db:generate
npm run db:migrate
npm run build
```

Restart the Node server after applying the migration and building. Existing account restrictions, messages, and reports are preserved. The obsolete email-only `/api/auth/google-fast` endpoint now returns 410; verified Google OAuth and email OTP are the supported sign-in methods.

## Validation

`npm test` includes policy/privacy/file-validation checks. To run the real authenticated API lifecycle test against the isolated local review database on port 55432:

```sh
RUN_ACCOUNT_REVIEW_TESTS=1 node --test tests/account-review-integration.test.mjs
```

The integration test creates and removes its own campus and users. It covers restricted access, stale-session revocation, duplicate submissions, cross-account and cross-campus isolation, independent reviewer enforcement, concurrent claims, evidence requests, restoration, one-time reopening, and protection of newer restrictions.

## Later phase

Scheduled, optional moderator appointments need actual staffing, private attendance controls, cancellation handling, retention rules, and a safe process for any reporter contribution. Live hearings, calendar slots, calls, and automatic penalties are not part of this release.
