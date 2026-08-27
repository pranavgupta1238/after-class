# Afterclass tech stack

This is the canonical technology and hosting reference for the project.

| Area | Choice | Purpose |
| --- | --- | --- |
| Frontend | Vite + vanilla JavaScript/CSS | Single-page web application |
| Frontend hosting | Vercel | Serves the web app over HTTPS |
| API | Node.js + Express | HTTP API, authentication, OTP flow, moderation, and health checks |
| Real-time | Socket.IO | Campus and private chat connections |
| Backend hosting | Oracle Cloud Always Free Ubuntu VM | Always-on Node.js host |
| Process manager | PM2 | Keeps the Node.js service running and restarts it after failure/reboot |
| Reverse proxy | Nginx | Terminates HTTPS and proxies HTTP/WebSocket traffic to the local API |
| Database | Supabase PostgreSQL | Persistent relational application data |
| ORM | Prisma | Schema, migrations, and database access |
| Redis | Upstash Redis | Shared rate limiting and future background-job queues |
| Email | Resend | University email verification codes |
| Authentication | JWT in HTTP-only cookies | 30-day authenticated browser sessions |
| Source control | GitHub | Repository and deployment source |
| Database keep-alive | Protected `/health` endpoint + external daily cron | Runs Prisma `SELECT 1` to create database activity |
| Local services | Docker Compose | Local PostgreSQL and Redis for development |

## Production traffic flow

```text
Browser → Vercel frontend → Nginx on Oracle VM → Express + Socket.IO
                                             ├→ Supabase PostgreSQL via Prisma
                                             ├→ Upstash Redis
                                             └→ Resend email API
```

## Required production environment variables

```text
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
CLIENT_URL=https://your-vercel-site.vercel.app
DATABASE_URL=postgresql://...
REDIS_URL=rediss://...
JWT_SECRET=...
OTP_PEPPER=...
ADMIN_KEY=...
HEALTH_SECRET=...
RESEND_API_KEY=re_...
RESEND_FROM=Afterclass <no-reply@your-domain.example>
```

Secrets belong only in the VM environment configuration or provider dashboards—never in Git, frontend code, or screenshots.
