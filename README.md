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

For this workspace, open `http://localhost:3002`. Port 3001 was already occupied when the local server was started. To run it yourself, use `PORT=3002 npm start` (or choose any free port). NIIT University is the first configured campus; only `@niituniversity.in` addresses can verify. Copy `.env.example` to `.env` before production use. The one-time code is returned only in development and logged by the server.

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

## Implemented backend

- HTTP-only 30-day JWT sessions and university-domain OTP verification
- Temporary local account/OTP store at `server/data.json` (intentionally ignored by Git); campus chat messages and reports persist in local Postgres via Prisma.
- Campus and match-room Socket.IO authentication, history, content sanitisation and message throttling
- Activity requests, applications, accept/match flow, and private rooms
- Mutual reveal request state, reporting and protected admin reports endpoint
- Per-account limits for OTP, messages, plans and reports

## Production adapters to complete before launch

The application is runnable locally, but live deployment must swap the local store/OTP development transport for Postgres/Prisma, Redis (for distributed limits and job queues), and Resend. Set a high-entropy `JWT_SECRET`, `ADMIN_KEY`, HTTPS, `secure` cookies, a real permitted university domain, and add a proper audited admin authentication flow. Do not operate the supplied fallback data store for a public campus launch.

## Upstash Redis

Rate limits use Redis whenever `REDIS_URL` is set, with a local in-memory fallback for development. Create an Upstash Redis database and set `REDIS_URL` to its TLS connection string (`rediss://…`) in the backend host's environment. Do not expose this value to the browser. The health endpoint (`/api/health`) reports whether Redis is connected.
