# Deployment TODO — Afterclass / NIIT University

Last reviewed: 2026-11-10. Pricing and free-tier limits change; re-check them before enabling public access.

## Completed

- [x] Create local project repository and push `main` to GitHub.
- [x] Configure first campus: NIIT University (`@niituniversity.in`).
- [x] Add Docker, Docker Compose, Vercel manifests, Oracle/PM2 deployment configuration, environment template, and CI build check.
- [x] Create a repository-scoped GitHub deploy key; private half remains local and ignored.

## Stage 2 — external deployment setup (deferred)

> Deferred by founder decision on 2026-08-26. Complete this section before any public NIIT University launch; development continues locally on Stage 3.

- [ ] Create a Supabase project for Afterclass.
  - [ ] Record project URL in private notes.
  - [ ] Copy the pooled Postgres URL into the Oracle VM `.env` as `DATABASE_URL`.
  - [ ] Choose the correct region before production use.
  - Free tier currently includes 500 MB database, but projects pause after one week of inactivity.
- [ ] Provision an Oracle Cloud Always Free Ubuntu VM and deploy the API with PM2 and Nginx.
  - [ ] Follow `docs/ORACLE_DEPLOYMENT.md`.
  - [ ] Set a public API domain and HTTPS certificate.
- [ ] Create an Upstash Redis database and add its `rediss://` URL as `REDIS_URL` on the VM.
- [ ] Create a Vercel project from the GitHub repository.
  - [ ] Deploy the Vite frontend using `vercel.json`.
  - [ ] Record the Vercel URL and set it as the VM `CLIENT_URL`.
  - The Hobby tier is currently free for an early/personal project; confirm its current terms before public use.
- [ ] Create a Resend account.
  - [ ] Verify a sending domain owned or authorized by the project.
  - [ ] Create a restricted API key and add it only to the VM as `RESEND_API_KEY`.
  - Free tier currently permits 3,000 emails/month and 100/day; sufficient for a small pilot only.
- [ ] Decide and purchase/configure the public domain, if needed.
  - [ ] Point frontend domain to Vercel.
  - [ ] Point API subdomain (for example `api.example.com`) to Railway.
  - [ ] Add the final web URL to Railway `CLIENT_URL`.

## Required production secrets

Store these in provider dashboards only—never in Git, issues, chat, screenshots, or client-side code.

- [ ] `JWT_SECRET`: independent high-entropy value of at least 32 characters.
- [ ] `OTP_PEPPER`: independent high-entropy secret of at least 32 characters.
- [ ] `STAFF_ENCRYPTION_KEY`: independent high-entropy secret of at least 32 characters; protect its backup.
- [ ] `ADMIN_EMAILS`: initial owner accounts; enrol their authenticators. Legacy `ADMIN_KEY` is not an access mechanism.
- [ ] `DATABASE_URL`: Supabase pooled Postgres connection string.
- [ ] `REDIS_URL`: Upstash Redis TLS connection string.
- [ ] `RESEND_API_KEY`: restricted Resend API key.
- [ ] `RESEND_FROM`: verified Resend sender address.
- [ ] `HEALTH_SECRET`: secret for the protected dependency health endpoint.
- [ ] `CLIENT_URL`: exact production frontend URL.
- [ ] `NODE_ENV=production`.

## Deployment acceptance test

- [ ] GitHub push is pulled and deployed on the Oracle VM using PM2.
- [ ] Public frontend calls public API health endpoint successfully.
- [ ] API connects to Postgres and Redis successfully after Stage 4 adapters are implemented.
- [ ] Session cookies work over HTTPS and cross-origin requests obey the final CORS policy.
- [ ] Only `@niituniversity.in` emails can request an OTP.
- [ ] Resend delivers an OTP from the verified sender domain.

## Stage 6 — Match requests and private chat (completed)

- [x] Add Prisma transaction service for match-request creation, anonymous applications, and acceptance.
- [x] Create a private chat room, match record, and two reveal-consent records atomically on acceptance.
- [x] Add authenticated API routes for request creation, discovery, application, acceptance, cancellation, and completion.
- [x] Enforce campus, gender, and orientation compatibility server-side without exposing applicant identities.
- [x] Build live request discovery/create/application UI.
- [x] Build request-owner application queue UI that exposes counts, not applicant aliases.
- [x] Add private-room Socket.IO authorization, history, and message persistence.
- [x] Build mutual identity-reveal request/accept/decline UI; reveal names only after both consent records are accepted.
- [x] Add cancellation, outing-completion, no-show, and reputation workflows.
- [x] Add two-user integration tests for the full lifecycle and privacy boundaries.

## Stage 7 — Student Identity & Ephemeral Retention (completed)

- [x] Build procedural SVG Avatar Studio with 9-layer styling and accessories.
- [x] Implement live selfie submission with temporary private storage, reviewer approval and scheduled cleanup. This is not zero-storage or independent age verification.
- [x] Enforce 7-day campus chat and 14-day DM automated retention.
- [x] Add 24-hour disappearing messages toggle in private chats.

## Stage 8 — Campus Safety & Moderation (completed)

- [x] Build dedicated Admin Portal with real-time Incident Review Center.
- [x] Implement multi-tier role governance (Root Owners vs. Team Moderators).
- [x] Add disciplinary actions (timeouts, suspensions, formal warning emails via Resend).
- [x] Enforce self-lockout prevention and minimum owner requirement.

## Stage 9 — Web Push & operations tooling (implemented; launch gates open)

- [x] Add opt-in background Web Push, durable delivery queue, quiet hours and device removal.
- [x] Add in-app Web Audio chimes.
- [x] Configure mobile Progressive Web App (PWA) manifest and touch icons.
- [x] Provide branded loading and retry states for page reloads.
- [x] Provide VM, Nginx and PM2 deployment templates; a public deployment is still required.

## Before public student launch

- [x] Implement the core database, chat, matching and moderation workflows; production launch gates below remain open.
- [ ] Publish privacy policy, community guidelines, and moderation/escalation contacts.
- [ ] Obtain any required NIIT University authorization for student communications and use of the university email domain.
- [ ] Set monitoring, backups, incident response, and a cost alert/budget.

## Current rollout gates

- [x] Apply security/operations migration to local review and the configured main database.
- [x] Replace environment/file role mutations with durable staff grants and revocation.
- [x] Add staff authenticator sessions, one-use recovery, upload decoding and production configuration checks.
- [x] Add persistent incident observations, campus pilot checklist and availability ranking explanations.
- [ ] Enrol each real staff account, appoint an independent second reviewer and test recovery access.
- [ ] Configure separate production secrets, HTTPS and certificate-verified Redis. Startup refuses unsafe production values. Authentication/rate limiting fail closed when Redis is unavailable.
- [ ] Schedule the independent health probe and confirm alert delivery to a real on-call recipient.
- [x] Perform an encrypted main application-schema backup and isolated PostgreSQL restoration drill (10 November 2026).
- [ ] Rehearse production roles/login and representative evidence recovery, set recovery objectives and off-site backup/key custody.
- [ ] Recruit consenting hosts and run the first supported campus activity windows; interview participants and nonparticipants.
- [ ] Complete independent age assurance and safety review before enabling production dating. It is currently deliberately disabled.
- [ ] Replace remaining inline UI handlers before deploying a strict script CSP; current headers are a partial CSP, not comprehensive XSS prevention.
- [ ] Have an independent security review before broad public rollout. Passing automated checks is not a penetration test.

See `docs/ADMIN_ANALYTICS.md` for staff onboarding, incident handling and recovery procedures. The new controls use the existing database/Redis services; free-tier quotas still need monitoring. No paid vendor was enabled.

Notification, independent alert-runner and encrypted recovery commands: [Stage 9 operations guide](stage-9/README.md). Local Redis recovery is not a production Upstash repair.

The older provider checklist above is historical, not a deployed topology. Current hosting and monitor installation plan: [Local to public rollout](LOCAL_TO_PUBLIC.md). No public deployment exists yet; GitHub Pages is not the application host.
