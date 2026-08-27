# Oracle Cloud deployment

This deployment uses an Ubuntu VM, PM2, and Nginx. The Node process listens only on `127.0.0.1:3000` through Nginx; expose ports 80 and 443 in OCI's Security List or Network Security Group. Do not expose port 3000 publicly.

## Prepare the VM

Install Node.js 20, Git, Nginx, and PM2. Clone the GitHub repository, then create a private `.env` file from `.env.example`. Set `DATABASE_URL` to the Supabase pooled connection URL, `REDIS_URL` to the Upstash `rediss://` URL, Resend credentials, and long unique values for `JWT_SECRET`, `ADMIN_KEY`, and `HEALTH_SECRET`.

Run the database migration before starting the API:

```bash
npm ci
npm run build
npm run db:generate
npm run db:migrate
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Copy `deploy/nginx/afterclass.conf` to `/etc/nginx/sites-available/afterclass`, enable it, test the configuration, and reload Nginx. Add HTTPS with Certbot after assigning a domain name to the VM.

## Daily database health job

Create an external daily job that sends a GET request to `https://api.your-domain.example/health` with this request header:

```text
x-health-secret: <HEALTH_SECRET>
```

The endpoint runs `SELECT 1` through Prisma before returning `{ "status": "ok", "db": "connected" }`. Keep the secret only in the cron service and the VM environment. Do not put it in the URL, frontend, or repository.

## Deploy updates

```bash
git pull origin main
npm ci
npm run build
npm run db:generate
npm run db:migrate
pm2 reload afterclass-api --update-env
```
