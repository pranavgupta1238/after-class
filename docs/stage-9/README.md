# Stage 9 — Notifications and launch operations

Updated 2026-11-10. Implementation is available locally; this is not a production-launch certificate.

## Background notifications

Settings → Notifications → Manage notifications lets a signed-in account opt in, choose private messages and plan updates, set quiet hours with an IANA time zone, test delivery, or remove devices. Browser permission is requested only when the user enables delivery. The isolated review build never sends external push.

`server/notifications.js` sends Web Push through the browser's provider. Configure VAPID keys and a contact subject in the server environment. The private key must never enter a Vite variable. HTTPS is required outside localhost; browser and operating-system support varies. On iOS, Web Push requires an installed Home Screen web app.

Database triggers enqueue private-message, invitation, accepted-match and meeting-revision events in the same transaction as the event. The worker adds reminders for mutually confirmed meetings starting within 30 minutes. It claims batches with row locks, retries transient failures up to four attempts, removes expired endpoints and retains delivery history for 30 days. Delivery is at least once: a process crash after provider acceptance but before recording it can cause a retry; a stable notification tag replaces duplicates where the browser supports it.

Delivery rechecks current account/campus access, verification, session version, blocks, preferences and source state. Quiet hours defer work; expiry prevents late alerts. Generic notifications omit aliases, message text, evidence and locations. Already accepted notifications cannot be recalled from a device. Account sign-out tries to unsubscribe this browser; global session revocation suppresses queued deliveries.

The service worker handles `push` and `notificationclick`; clicks open the same-origin inbox. The former tab-only OS notifications are disabled to avoid duplicate alerts. In-app socket updates and sound remain separate. Provider acceptance is **not** evidence of device delivery or a person reading it.

## Action centre

Administration → Action centre shows scoped open/overdue/unassigned reports, pending appeals and verification tasks, operational incidents, device-delivery outcomes, and per-campus pilot preparation. College staff cannot request another college or the global scope. Only platform administrators see network incident/configuration summaries. Existing dashboard charts and case-assignment tools remain accessible.

## Health and external alerts

Use the protected `/health` endpoint with `x-health-secret`. It checks PostgreSQL and configured Redis concurrently with bounded waits, returning HTTP 503 when a required dependency is unavailable. `/api/health` is a legacy liveness route, not the readiness signal.

`scripts/health-probe.cjs` must run on an **independent machine** to detect failure of the application host. Configure its private env file with `AFTERCLASS_HEALTH_URL`, `HEALTH_SECRET`, `HEALTH_PROBE_STATE`, `RESEND_API_KEY`, `RESEND_FROM`, and `OPERATIONS_ALERT_EMAIL`.

```sh
node --env-file=/private/monitor.env scripts/health-probe.cjs --dry-run
node --env-file=/private/monitor.env scripts/health-probe.cjs --test-alert
node --env-file=/private/monitor.env scripts/health-probe.cjs
```

The state file deduplicates failure alerts, reminds after six hours, and sends one recovery notice after a reported outage. A test only confirms provider acceptance. Configure a scheduler at a suitable interval, protect the state/env files on a filesystem that enforces private permissions, and alert on failure of the monitor itself. No independent host or scheduler has been provisioned by this change. No keep-alive service is promised.

## Encrypted recovery drill

`scripts/recovery.cjs` uses Docker's PostgreSQL 17 tools by default (set `BACKUP_POSTGRES_IMAGE=postgres:16-alpine` for a PostgreSQL 16-only drill) and AES-256-GCM authenticated encryption. Use a direct/session-pooler URL in `BACKUP_DATABASE_URL`, not the transaction pooler. Supply a random 32-byte hexadecimal `BACKUP_ENCRYPTION_KEY` from a private env file. Keep a separate recoverable copy of that key; losing it makes the backup unusable.

```sh
node --env-file=/private/recovery.env scripts/recovery.cjs backup /private/backups/afterclass.acb
node --env-file=/private/recovery.env scripts/recovery.cjs drill /private/backups/afterclass.acb
```

Backup streams through encryption before reaching disk. Drill authenticates and decrypts to a private temporary directory, restores into a disposable Docker database with no network access, checks core table counts, saves an adjacent private `.drill.json`, then removes the container and plaintext. It never accepts a restore-target URL. Failed operations exit nonzero and must be investigated; do not overwrite a previous backup to retry.

This is a database/row-count check. Supabase roles/extensions may require a compatible recovery environment. Test permissions, login, staff grants, evidence uploads and application workflows separately. The script does not back up uploaded files, provider configuration or role definitions. Set retention, encrypted off-site storage, recovery time and acceptable data-loss objectives before launch. A successful demo restore does not prove production recovery.

## Remaining release gates

- A reachable production TLS Redis endpoint and separate production secrets.
- Public HTTPS deployment, independent scheduled monitoring, and confirmed on-call inbox delivery.
- A production-representative restore, private-upload recovery, and off-site key/backup custody.
- Named safety coverage, consenting campus hosts, public meeting venues and student feedback sessions.
- Independent age assurance and safety operations before production dating is enabled.

See `../DEPLOYMENT_TODO.md` and `../ADMIN_ANALYTICS.md` for rollout and staff procedures.
