# afterclass

An anonymous university social network with campus chat, small activity plans, mutual identity consent, reporting, moderation controls, and PWA support.

See [the canonical tech-stack reference](docs/TECH_STACK.md) for the agreed architecture and hosting services.
See [the Upstash setup guide](docs/UPSTASH_SETUP.md) when you are ready to enable managed Redis.

## Run locally

```bash
npm install
npm run build
npm start
```

For this workspace, open `http://localhost:3002`. Port 3001 was already occupied when the local server was started. To run it yourself, use `PORT=3002 npm start` (or choose any free port). NIIT University is the first configured campus. University admission is managed in Administration → Colleges → Access settings. Copy `.env.example` to `.env` before production use. The one-time code is returned only in development when no email provider is configured.

## Connection experience review

The main app includes expiring availability, richer alias profiles,
meeting confirmations and rescheduling, private feedback, blocking, report tracking,
verification appeals, and an optional dating mode. Normal sign-in and real campus data
remain on port 3002. Apply the included database migrations before starting the updated server.
The separate review environment below remains available with demo accounts on port 3003.

Start Docker Desktop, then run:

```bash
npm run review
```

Open **http://127.0.0.1:3003** and click **Enter as CalmClover** on the demo sign-in screen. Use the top bar to switch accounts afterward. Regular Google and email sign-in are disabled on this isolated server. This command
creates/starts `afterclass-review-db` on loopback port 55432, applies migrations only to
`afterclass_review`, seeds demo accounts, builds `dist-review`, and starts a separate server.
It overrides the app's database, Redis, email, cookie, and frontend API configuration; it
does not migrate Supabase or replace the regular `dist` build. The database persists when
the review server stops. Docker and installed npm dependencies are required.

Try these flows:

1. **Home:** share availability for 30, 60, or 120 minutes; open an available student's
   profile. Availability expires automatically and can be stopped early.
2. **Settings → Connections:** edit interests, bio, and a profile prompt. Enable dating
   with birth date, intent, and age preferences. **Discover → Dating** shows compatible
   dating invitations separately from campus plans.
3. **Inbox → Meeting details:** confirm the seeded coffee meeting, or suggest a new time
   and public place. Switch between **CalmClover** and **VelvetWillow** to respond, then
   confirm the accepted plan again. The completed walk has optional private feedback.
4. **Profile → Block account:** closes private connections and stops location sharing.
   **Trust & safety** contains blocked accounts, report status, and verification appeals.
5. **MossyHeron** has a declined verification and an appeal. **CalmClover → Moderation →
   Verification appeals** can reply. The student's appeal history shows that response.
   An invitation to resubmit does not grant verification automatically.

All one-to-one connections retain the verified man–woman eligibility rule. Dating also
requires both students to opt in, be at least 18 by their **self-declared birth date**, have
matching intent, and accept each other's age range. This does **not** verify legal age or
guarantee identity, gender, or safety; the existing student review process remains in place.
Birth dates are private and cannot be edited through the profile API after being recorded.
Before a public dating launch, establish age assurance and a moderator correction process.

Feedback is visible only to its author through these APIs and does not alter public trust
scores. Reports retain moderation status without revealing private moderator notes.
The new database tables have RLS enabled with no client policies; access goes through the
server's authenticated, owner/participant-scoped endpoints.

Validation:

```bash
npm test
# With the isolated review server running:
AFTERCLASS_INTEGRATION_URL=http://127.0.0.1:3003 node --test tests/connection-integration.test.mjs
```

The integration suite refuses other server URLs, creates disposable records in the local
review database, and checks eligibility, privacy, concurrent meeting changes, live blocking,
and campus-scoped appeal decisions. Stop the review server with Ctrl+C; optionally stop its
database with `docker stop afterclass-review-db`. Demo sessions are never enabled by the normal app.

## University administration

Sign in as a platform administrator, unlock the staff workspace with your authenticator,
and open **Administration → Colleges**. Campus moderators cannot change admission rules.

1. **Add university:** provide a name, permanent identifier, primary domain, and exact email rules.
   New universities start paused; a campus chat room is created automatically.
2. Choose **Students only**, **Faculty only**, or **Students and faculty**. Configure distinct
   student/faculty domains when the university confirms that they identify membership.
   Shared domains require an approved roster (`email, student` or `email, faculty`, one per line;
   maximum 200 entries). Subdomains are not implicitly trusted. Test an email before saving.
3. Review host and moderation coverage, then use **Access settings → Active** to launch.
4. **Close registrations** to stop new accounts while keeping existing eligible members active.
   **Pause** temporarily stops community access. **Retire** removes the university from service
   while preserving account, moderation and hearing records. Retired universities can be reactivated.
5. Preview the impact, type the current university name and enter a reason before applying changes.
   Policy changes are audited and protected against overwriting another administrator's edits.

Both OTP and Google sign-in enforce the stored rules, including a final check when creating the
session. Existing sessions are checked too. Policy changes disconnect campus sockets; affected
accounts lose availability and their open plans / active meetings are cancelled. Reactivation
never silently reopens cancelled plans. Existing members can still sign in to access their own account reviews; community APIs stay blocked. A platform
owner can still open administration to recover their own paused university.

Faculty membership does not grant staff permissions. Campus chat is shared by enabled member
groups; one-to-one matching remains within the same group. Faculty dating is disabled. Email
ownership verifies control of an address, not employment or current enrollment independently.
Institutional SSO, periodic re-verification and roster synchronization are future work.

NIIT remains students-only. `st.niituniversity.in` is its student domain. Previously enrolled
root-domain accounts are preserved as students in its explicit roster; new root-domain addresses
must be reviewed and added to that roster with the correct role. Confirm faculty rules with the
university before enabling faculty membership. No new university is activated by this migration.
`CAMPUSES_JSON` is no longer used. Domains reserved by another university cannot be reused,
including retired universities. Campus transfers require a separate reviewed process.

## Backend and launch readiness

Accounts, campus policies, messages, plans, reports and staff audit records persist in PostgreSQL
through Prisma. Redis provides OTP storage and rate limiting; Resend delivers sign-in emails.
Staff access uses explicit grants, MFA, expiring staff sessions and revocation.

Before public launch, configure and verify Redis and email delivery, independent uptime alerts,
backup restoration, and campus moderation coverage. Production dating remains disabled pending
independent age assurance and operational readiness. See the operational guides in `docs/`.

## Upstash Redis

Rate limits use Redis whenever `REDIS_URL` is set, with a local in-memory fallback for development. Create an Upstash Redis database and set `REDIS_URL` to its TLS connection string (`rediss://…`) in the backend host's environment. Do not expose this value to the browser. The health endpoint (`/api/health`) reports whether Redis is connected.
