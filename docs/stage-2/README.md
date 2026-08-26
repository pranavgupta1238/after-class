# Stage 2 — Environment setup

## What is prepared in this repository

| Concern | Artifact | Local command |
|---|---|---|
| Web/API container | `Dockerfile` | `docker build -t afterclass .` |
| Postgres + Redis | `docker-compose.yml` | `docker compose up -d` |
| API deployment | `railway.toml` | Railway reads this automatically |
| Web deployment | `vercel.json` | `vercel` or Git integration |
| CI verification | `.github/workflows/verify.yml` | runs on GitHub |
| Secrets | `.env.example` | copy to `.env` locally |

## Required external setup

1. Create a private GitHub repository and push this project.
2. Create a Supabase project in the closest appropriate region. Copy its **pooled Postgres** connection URL into Railway as `DATABASE_URL`.
3. Create Railway services for this repository and Redis. Set `JWT_SECRET`, `ADMIN_KEY`, `DATABASE_URL`, `REDIS_URL`, `RESEND_API_KEY`, `CLIENT_URL`, and `NODE_ENV=production`.
4. Create a Vercel project for the client. Initially point `CLIENT_URL` at its Vercel URL.
5. Create a Resend sending domain before enabling real OTP email. Do not send OTP mail with an unverified domain.
6. Set production CORS/session cookie domain only after selecting the final app domain.

## Stage 2 acceptance test

Local services run with `docker compose up -d`, then:

```bash
npm ci
npm run build
PORT=3002 npm start
curl http://localhost:3002/api/health
```

Expected response is `{"ok":true,"service":"afterclass"}`. Once the Supabase adapter is added in Stage 4, this endpoint will additionally report a successful database dependency check. We must not claim that milestone until actual Supabase credentials are connected.

## Current limitation

The application still uses its deliberately temporary local JSON store. Stage 4 replaces that with Prisma/Postgres. Docker Postgres and Redis are provisioned now so the next stages have a stable environment.
