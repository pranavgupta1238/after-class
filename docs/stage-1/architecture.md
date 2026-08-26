# Repository and service architecture

```text
/
  client/                  # React/Vite PWA (Stage 5+)
    src/components
    src/pages
    src/hooks
    src/socket
  server/                  # Express + Socket.IO API
    routes
    services
    middleware
    socket
    jobs                   # BullMQ: expiry, rotation, reminders
    prisma
  docs/stage-1             # this design contract
```

## Production services

| Concern | Service | Reason |
|---|---|---|
| Relational data | Postgres + Prisma | transactions and constraints |
| OTP / limits / queues | Redis + BullMQ | TTLs, distributed counters, delayed jobs |
| Email | Resend | NIIT OTP delivery |
| Web app | Vercel | client deployment |
| API / Socket server | Railway or equivalent | persistent Node process |
| Error and audit logs | provider + structured logs | safety incident investigation |

## Security boundaries

- API validates all authorization; UI is never trusted for tenancy, matching, or reveal logic.
- Sessions use httpOnly, secure production cookies and CSRF protection for mutating requests.
- Enforce input schemas, output DTOs, logs without emails/OTP/JWT, and least-privilege database credentials.
- All queries derive campus scope from session, not a path or client field.
