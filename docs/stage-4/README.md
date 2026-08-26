# Stage 4 — Database layer

## Delivered

- Canonical Postgres schema in `server/prisma/schema.prisma`.
- Reproducible initial SQL migration in `server/prisma/migrations/20260826000000_initial_schema`.
- Generated Prisma client and scripts: `npm run db:validate`, `npm run db:generate`, `npm run db:migrate`.
- Tenant-aware tables and indexes for NIIT University now and future campuses later.

## Migration procedure

1. Start the local database from the Stage 2 Docker Compose setup, or configure a Supabase `DATABASE_URL`.
2. Run `npm run db:migrate`.
3. Run a seed script that creates NIIT University and its campus chat room before enabling registration.

No production migration is run until a backed-up production database exists and Stage 2 credentials are connected.

## Required Stage 4 follow-up

- [ ] Add Prisma repository/service adapters and remove the temporary JSON store.
- [x] Add the NIIT campus + campus room seed.
- [x] Apply the migration to local Docker Postgres.
- [ ] Apply the migration to Supabase only after Stage 2 is resumed.
