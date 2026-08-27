# Upstash Redis setup

Use this checklist when you are ready to connect Afterclass to Upstash Redis.

1. Go to [Upstash](https://upstash.com) and create a free account. GitHub login is convenient.
2. In the Upstash Console, open **Redis** and select **Create database**.
3. Choose these settings:

   - Name: `afterclass-redis`
   - Deployment: **Regional**
   - Primary region: **Mumbai (`ap-south-1`)**
   - Read regions: none
   - Plan: **Free**
   - TLS/SSL: enabled
   - Eviction: disabled for now

4. Create the database.
5. Open the database, select **Connect**, then select the **TCP** tab (not REST).
6. Copy the TLS connection URL. It begins with `rediss://default:...`.
7. In the private `.env` file at the project root, replace:

   ```env
   REDIS_URL=redis://localhost:6379
   ```

   with the exact Upstash TCP URL:

   ```env
   REDIS_URL=rediss://default:YOUR_UPSTASH_PASSWORD@YOUR_UPSTASH_ENDPOINT:6379
   ```

## Security

The Redis URL contains its password. Keep it only in `.env` and later in the Oracle VM environment. Never commit, paste into frontend code, or share the complete value in chat or screenshots.

## Verification

After adding the URL, restart the API and request `/api/health`. The response should report Redis as `PONG` instead of `LOCAL_FALLBACK`.
