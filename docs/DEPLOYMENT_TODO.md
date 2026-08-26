# Deployment TODO — Afterclass / NIIT University

Last reviewed: 2026-08-26. Pricing and free-tier limits change; re-check them before enabling public access.

## Completed

- [x] Create local project repository and push `main` to GitHub.
- [x] Configure first campus: NIIT University (`@niituniversity.in`).
- [x] Add Docker, Docker Compose, Railway/Vercel manifests, environment template, and CI build check.
- [x] Create a repository-scoped GitHub deploy key; private half remains local and ignored.

## Stage 2 — external deployment setup

- [ ] Create a Supabase project for Afterclass.
  - [ ] Record project URL in private notes.
  - [ ] Copy the pooled Postgres URL into Railway as `DATABASE_URL`.
  - [ ] Choose the correct region before production use.
  - Free tier currently includes 500 MB database, but projects pause after one week of inactivity.
- [ ] Create a Railway project from the GitHub repository.
  - [ ] Deploy the API using `railway.toml` / `Dockerfile`.
  - [ ] Provision a Redis service.
  - [ ] Set a public API domain.
  - Free access is limited: the current plan has a trial credit and then a small monthly charge; do not assume it remains free.
- [ ] Create a Vercel project from the GitHub repository.
  - [ ] Deploy the Vite frontend using `vercel.json`.
  - [ ] Record the Vercel URL and set it as Railway `CLIENT_URL`.
  - The Hobby tier is currently free for an early/personal project; confirm its current terms before public use.
- [ ] Create a Resend account.
  - [ ] Verify a sending domain owned or authorized by the project.
  - [ ] Create a restricted API key and add it only to Railway as `RESEND_API_KEY`.
  - Free tier currently permits 3,000 emails/month and 100/day; sufficient for a small pilot only.
- [ ] Decide and purchase/configure the public domain, if needed.
  - [ ] Point frontend domain to Vercel.
  - [ ] Point API subdomain (for example `api.example.com`) to Railway.
  - [ ] Add the final web URL to Railway `CLIENT_URL`.

## Required production secrets

Store these in provider dashboards only—never in Git, issues, chat, screenshots, or client-side code.

- [ ] `JWT_SECRET`: unique, high-entropy value.
- [ ] `ADMIN_KEY`: separate high-entropy value.
- [ ] `DATABASE_URL`: Supabase pooled Postgres connection string.
- [ ] `REDIS_URL`: Railway Redis connection string.
- [ ] `RESEND_API_KEY`: restricted Resend API key.
- [ ] `CLIENT_URL`: exact production frontend URL.
- [ ] `NODE_ENV=production`.

## Deployment acceptance test

- [ ] GitHub push triggers Vercel and Railway deployments.
- [ ] Public frontend calls public API health endpoint successfully.
- [ ] API connects to Postgres and Redis successfully after Stage 4 adapters are implemented.
- [ ] Session cookies work over HTTPS and cross-origin requests obey the final CORS policy.
- [ ] Only `@niituniversity.in` emails can request an OTP.
- [ ] Resend delivers an OTP from the verified sender domain.

## Before public student launch

- [ ] Complete the remaining roadmap stages: production database, live chat, matching, alias rotation, moderation, and push notifications.
- [ ] Publish privacy policy, community guidelines, and moderation/escalation contacts.
- [ ] Obtain any required NIIT University authorization for student communications and use of the university email domain.
- [ ] Set monitoring, backups, incident response, and a cost alert/budget.
