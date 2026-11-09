# Afterclass Review Centre

The Review Centre gives restricted accounts a private, free way to challenge an account decision, with written evidence and an optional scheduled, moderated hearing. This is a platform review, not a legal court or an automated judgment.

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

**Staffing:** a campus needs a second, uninvolved moderator to complete an appeal issued by the first. Only published moderator availability can be booked; the product does not invent appointment slots. Reporter participation is optional. Student responses use role labels rather than reporter names, email addresses, or account IDs. Staff must avoid identifying reporters in free-text explanations.

## Storage and operational limits

This release uses the existing PostgreSQL database and authentication. No paid service is added. Evidence accepts PNG, JPEG, and WebP files only, up to three images of 512 KiB each per submission. MIME type, file signature, size, and count are checked server-side. Evidence is stored in private JSON records and delivered only through authenticated case endpoints; there are no public upload URLs. Do not treat a file-signature check as proof that an image is genuine.

Cases allow at most 40 student submission/timeline entries before additional student submissions are stopped. Write operations have a per-account rate limit. The initial overview lists the most recent 50 decisions; the staff queue lists the most recent 100 cases. Add pagination before exceeding that operating scale.

Records are retained until explicitly removed through database administration. Before a broad public rollout, define an evidence-retention policy, deletion process, staffing coverage, and reviewer reassignment process. Database storage still counts toward the existing service quota.

## Deployment

The additive migrations are `20261109000200_account_review_centre` `20261110000100_private_hearings`, and `20261110000200_hearing_speaking_requests`. They add decision metadata, reviews, timeline entries, appointment slots, hearing participants, and transcripts. New tables enable row-level security and are accessed by the server's existing privileged Prisma connection, never a browser database client.

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

## Scheduled hearings

1. An eligible moderator opens **Hearings → Chair availability** and publishes one to eight consecutive 30-minute appointments. Dates are stored in UTC and displayed in each browser's timezone. Unbooked slots can be withdrawn.
2. The account holder opens their submitted case in the Review Centre and chooses **Schedule / open hearing**. Only slots from an uninvolved moderator on the same campus are shown. If the case already has a reviewer, only that reviewer's slots are eligible. Booking assigns the case to that moderator atomically.
3. Students associated with the original decision's reports receive a persistent **Hearings** invitation. The toolbar shows a pending-invitation count on sign-in and refreshes once a minute while the app is visible. There are no outgoing emails, SMS, or calendar invitations in this release. Invitees may accept, decline, or provide written evidence privately. They can withdraw from the live session at any time.
4. Participants open their appointment. The account holder must be present before the moderator starts. The moderator can open the session only during the reserved interval. Its timer ends at the published appointment end, so a late start has less than 30 minutes remaining.
5. The moderator has the central seat and controls who may speak: account holder, an accepted reporting participant, or moderator only. The moderator may speak throughout. Shared chat updates through authenticated server-sent events, with polling recovery. Participants can submit private statements and supporting images before and during the session.
6. The server closes submissions at the deadline even if a browser has an inaccurate clock. The moderator can close early. A missed appointment is cancelled without deciding the appeal; before a hearing has started, the account holder can book again. An explicit cancellation releases its slot. Once a hearing starts, that case cannot get a second hearing.
7. After closing, the moderator selects **Review evidence & decide**. Every decision needs an explanation. Restoration, a reduced suspension (including six months or a year where this shortens the original restriction), and upholding the existing decision use the existing account controls. Newer restrictions cannot be bypassed by an older case. A scheduled or live hearing must be closed or cancelled before a final decision.
8. Participants see the decision in their hearing room and can download the record visible to their own account. Images can be downloaded individually. Private evidence is never included in another student's transcript.

Reporting students are not required to attend or prove a case in a confrontation. Declining, being absent, or staying silent does not automatically restore or restrict an account. The moderator assesses the evidence and records the reasoning. Role labels reduce disclosure, but participants may infer identity from the underlying incident; invitation copy explains the shared conversation and asks participants not to disclose personal details.

## Hearing access and limits

All hearing routes use current session authentication, including for restricted accounts. Unrelated students, other-campus staff, and the original decision-maker cannot enter. Reviewer eligibility is checked on every request. No browser accesses the database directly. SSE sends invalidation signals only; content is fetched through the same authorization checks. Streams reconnect every two minutes to recheck authentication.

Shared chat does not accept attachments: supporting images are private to their sender and the assigned moderator. Each image submission permits up to three 512 KiB PNG, JPEG, or WebP files. A hearing allows 550 transcript messages; each person can attach images only within their first 12 private submissions. Hearing lists return the latest 100 appointments and availability lists the next 120 slots. These limits protect the existing database quota; monitor usage before increasing them.

The final decision explanation is visible to invited reporters as well as the account holder. Never include confidential evidence, real names, or contact details in that explanation. Original reports and the written appeal timeline are available only to the assigned moderator inside the hearing workspace.

To run hearing integration checks against the isolated local database:

```sh
RUN_HEARING_TESTS=1 node --test tests/hearings-integration.test.mjs
```

The test covers slot authorization, overlap, simultaneous booking, reporter invitations, campus and role isolation, optional attendance, private evidence, speaking turns, the server deadline, one hearing per decision, reasoned restriction reduction, cancellation, and rebooking. Test accounts and cases are removed after the run. No production user is banned or restored by these tests.

## Interactive demo on port 3003

Run `npm run review` to rebuild and start the isolated review app. It includes a fictional appeal with three roles:

- **SilverAspen**: restricted account holder. Open Hearings and enter the demo appointment.
- **CalmClover**: independent moderator. Open the same appointment and choose Open hearing once SilverAspen is present.
- **VelvetWillow**: invited reporting participant. Accept, decline, or contribute privately.

Use separate browser profiles/private windows for simultaneous sessions; ordinary tabs share the selected demo account. The appointment initially covers the next 30 minutes. `npm run review:hearing-reset` resets only this fictional appeal and starts a fresh 30-minute appointment. Refresh the demo after resetting. Real accounts and Supabase are never used by this command.

## Courtroom and speaking requests

The hearing room uses locally rendered, anonymous role illustrations: a central seated moderator and separate account-holder and reporting-participant stands. Profile avatars are deliberately not used, to avoid identifying a reporting student. The room shows recent presence and highlights the current speaking turn. It remains a private platform review, not a legal court.

During a live hearing, accepted participants who do not have the floor can choose **Objection** or **Request to speak**. Their character raises a hand and the moderator receives a request card with **Allow to speak** and **Not now**. Approval transfers the floor immediately; deferral leaves the current turn unchanged. Participants can withdraw their request. An objection never grants permission automatically, and the server enforces speaking permissions on every shared message.

Only one request per participant can be pending, with a 15-second interval between new requests. Duplicate approvals are rejected under a hearing row lock. Declining participation clears pending requests and returns the floor to the moderator if necessary. Requests stop when the hearing ends. Moderator approvals and deferrals are recorded in the transcript. The moderator can also invite any accepted participant through direct buttons instead of a dropdown.

The scene adapts to small screens and respects reduced-motion preferences. When multiple reporting participants accept, the scene displays the current speaker or a waiting requester; every accepted participant remains available in the moderator controls.
