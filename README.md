# afterclass

An anonymous university social network with campus chat, small activity plans, mutual identity consent, reporting, moderation controls, and PWA support.

## Run locally

```bash
npm install
npm run build
npm start
```

For this workspace, open `http://localhost:3002`. Port 3001 was already occupied when the local server was started. To run it yourself, use `PORT=3002 npm start` (or choose any free port). NIIT University is the first configured campus; only `@niituniversity.in` addresses can verify. Copy `.env.example` to `.env` before production use. The one-time code is returned only in development and logged by the server.

## Implemented backend

- HTTP-only 30-day JWT sessions and university-domain OTP verification
- Local persistent store at `server/data.json` (intentionally ignored by Git)
- Campus and match-room Socket.IO authentication, history, content sanitisation and message throttling
- Activity requests, applications, accept/match flow, and private rooms
- Mutual reveal request state, reporting and protected admin reports endpoint
- Per-account limits for OTP, messages, plans and reports

## Production adapters to complete before launch

The application is runnable locally, but live deployment must swap the local store/OTP development transport for Postgres/Prisma, Redis (for distributed limits and job queues), and Resend. Set a high-entropy `JWT_SECRET`, `ADMIN_KEY`, HTTPS, `secure` cookies, a real permitted university domain, and add a proper audited admin authentication flow. Do not operate the supplied fallback data store for a public campus launch.
