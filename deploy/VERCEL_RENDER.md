# Assignment deployment: Vercel + Render Free

**Selected target:** Vercel frontend, Render Free Django API, Supabase Free PostgreSQL/private storage, Upstash Free Redis. **Budget: $0 hosting. No live accounts/resources have been provisioned by this source package.** Use only free plans; do not enable paid upgrades or usage billing without approval. Check current eligibility/limits in each dashboard before confirming creation.

## What is already adapted

- `frontend/vercel.json` selects Next.js; Vercel builds no longer stage a standalone Docker server. Local/Compose builds still do.
- Normal browser API calls retain HttpOnly cookies, server-side JWT refresh and strict production Origin checking.
- With `NEXT_PUBLIC_DIRECT_API_URL` set, the browser requests an authenticated **120-second upload-only ticket**, then sends the actual multipart file directly to Render. The ticket binds account, MIME and byte size, is replay-checked in the shared cache, and cannot authenticate another endpoint. JWTs remain inaccessible to browser JavaScript.
- Django still validates real image/audio/video contents and enforces upload limits. Ticket minting uses the normal user throttle; the actual upload uses the upload throttle. Parsing also bounds total file bytes.
- With S3-compatible storage configured, the owner-checked media endpoint redirects to a **60-second signed storage URL**. Vercel forwards the redirect, not the large file body. Anyone possessing that signed URL can read it until expiry; do not share/log it. Replay protection for upload tickets depends on retaining their cache entries until expiry.
- `render.yaml` defines one free Docker web service, not a paid database. `start-render.sh` runs migrations before Gunicorn, with one worker/two threads as a modest starting configuration—not a proven capacity guarantee.
- Render uses an external private media bucket, not its ephemeral filesystem. Django admin routes are disabled by default in production. Public API docs remain available.

The transfer design addresses Vercel's 4.5 MB function payload ceiling without reducing the app's 7 MiB image / 15 MiB audio-video limits. Vercel route duration is configured to 90 seconds; its upstream timeout stays 70 seconds. Check the project's current function-duration/Fluid Compute settings. [1](https://vercel.com/docs/functions/limitations)

## 1. Publish the repository

Extract the **latest** `pitstop-vercel-render.zip` and publish the whole project, not only `frontend/`. Follow [HANDOFF.md](../HANDOFF.md). Keep `render.yaml` at repository root. Connect that repository to your hosting accounts through their normal GitHub authorization flow.

Never commit `.env`, database dumps, credentials or uploaded user files. Do not paste service keys into chat.

## 2. Create Supabase Free database and private storage

Create a Free project in an available region reasonably close to the backend. Save its database password in a password manager.

### Isolate Django tables from the Supabase Data API

In the project's SQL editor, run:

```sql
create schema if not exists pitstop;
revoke all on schema pitstop from public, anon, authenticated;
```

Keep `pitstop` **out of the Data API's exposed schemas**. The Render blueprint sets `DATABASE_SCHEMA=pitstop`, so Django creates its auth/application tables there instead of `public`. Do this **before the first migration**. Do not add policies granting anonymous access to Django tables or private attachments.

From **Connect**, copy the PostgreSQL **session-pooler** connection URI (not the HTTP Data API URL). Use session mode, normally port 5432—not the transaction pooler. Put it in Render's `DATABASE_URL`. URL-encode special characters in the password. The database account must be able to create tables in the new schema.

The blueprint uses `DB_SSLMODE=verify-full` with `PGSSLROOTCERT=/app/certs/supabase-prod-ca-2021.crt`. Supabase signs its database and pooler certificates with its own **Supabase Root 2021 CA**, which is not in the system trust store, so `PGSSLROOTCERT=system` would fail verification. The image therefore ships that public root (`backend/certs/`, the same file as **Database Settings → SSL Configuration → Download certificate**; SHA-256 fingerprint `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`). For a provider with publicly trusted certificates, set `PGSSLROOTCERT=system` instead. Do **not** disable certificate verification to make deployment pass. A real connection must be tested during startup.

### Storage

Create a **private** bucket, for example `pitstop-media`. Copy the endpoint, region, access-key ID and secret access key from Storage's S3 connection settings. Do not use the public/anon API key as an S3 secret. No Supabase key belongs in Vercel/browser environment variables.

The app uses the existing Django S3 storage backend with the configured endpoint, path-style addressing and Signature V4. Supabase S3 compatibility must be smoke-tested with actual upload/read/delete operations. Supabase does not support S3 object versioning, so the earlier AWS S3 versioning advice is not a backup strategy for this deployment. [Supabase S3 documentation](https://supabase.com/docs/guides/storage/s3/compatibility)

Supabase Free currently lists 500 MB database storage and 1 GB file storage; inactive projects can pause after one week and automatic backups are not included. Monitor usage and back up separately. [1](https://supabase.com/pricing)

## 3. Create Upstash Redis Free

Create a Free Redis database. Copy its **TLS Redis connection URI**, beginning with `rediss://`, into Render's `REDIS_URL`. Do not use the HTTPS REST URL or REST token in place of a Redis connection URI.

Keep the Free plan selected. Its published allowance is 256 MB and 500,000 commands/month. Shared Redis stores throttles and short-lived upload-ticket replay markers; daily AI budgets remain in PostgreSQL. [1](https://upstash.com/blog/upstash-vs-aws-elasticache-serverless-redis-pricing-and-performance-2026)

## 4. Deploy the backend on Render

Create a **Blueprint** from the repository's `render.yaml`. Confirm the web-service instance is **Free** before applying. The configuration uses `backend/` as its root and its existing Dockerfile, which installs ffmpeg and collects static assets.

Supply the fields marked `sync: false` through Render's protected environment settings:

| Variable | Value |
|---|---|
| `DJANGO_SECRET_KEY` | A locally generated random secret, at least 50 characters |
| `DATABASE_URL` | Supabase session-pooler PostgreSQL URI |
| `REDIS_URL` | Upstash TLS `rediss://` URI |
| `AWS_STORAGE_BUCKET_NAME` | Private Supabase bucket name |
| `AWS_S3_ENDPOINT_URL` | Exact S3 endpoint from Supabase's dashboard |
| `AWS_S3_REGION_NAME` | Exact region shown with those S3 settings |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Backend-only S3 credentials |
| `CORS_ALLOWED_ORIGINS` | Exact frontend origin, no trailing slash; update after Vercel assigns it |
| `GEMINI_API_KEY` | Backend-only provider key; leave empty until intentionally enabling AI |

Generate the Django secret **on your own machine**, for example:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Render's auto-generated Blueprint secret is not used because this app requires a 50+ character secret. The blueprint supplies production mode, private schema, TLS settings, checksum compatibility settings and conservative daily AI attempt budgets. `RENDER_EXTERNAL_HOSTNAME` is automatically added to Django's allowed hosts.

If the frontend URL is not assigned yet, use a temporary valid placeholder origin such as `https://frontend-not-configured.invalid` for CORS, then replace it after step 5. Normal BFF login calls are server-to-server; direct browser uploads will remain blocked until the real origin is configured.

After deployment, copy the **actual assigned** backend URL. Verify:

- `/health/live/` — process responds.
- `/health/ready/` — database and Redis respond.
- `/api/docs/` — interactive API documentation loads.
- `/admin/` — 404 in this production configuration.

Startup migrations are a single-instance free-demo compromise. Do not start parallel migration jobs or scale this service without moving migrations to a controlled deployment job.

## 5. Deploy the frontend on Vercel

Import the same repository and set:

- **Root Directory:** `frontend`
- **Framework:** Next.js
- **Node:** 24.x
- **Build command:** `npm run build`
- **Install command:** `npm ci`
- **Output directory:** leave the framework default; do not set `out` or `.next/standalone`.

Set these variables for the **Production** environment:

| Variable | Value |
|---|---|
| `APP_ENV` | `production` |
| `API_PROXY_URL` | Actual Render HTTPS origin, no `/api/v1` suffix or trailing slash |
| `NEXT_PUBLIC_DIRECT_API_URL` | The **same** Render HTTPS origin; intentionally public, never a secret |
| `APP_ORIGIN` | Exact final Vercel frontend origin, e.g. the assigned `https://…vercel.app` |
| `COOKIE_SECURE` | `1` |

The build intentionally fails if the three URL variables are missing or are not bare `https://` origins (a trailing slash or a path such as `/api/v1` is rejected). The error names each offending variable and the Vercel environment the build ran for; variables are scoped per environment, so a Preview build does not see Production-only values. Changing a variable does not affect existing deployments—redeploy afterwards. If your Vercel hostname is only assigned after creating the project, obtain it from **Settings → Domains**, fill the values, then redeploy. Do not disable Origin validation or use a wildcard. Avoid custom domains for this $0 handoff unless you already own one.

Do not put Django, Gemini, database, Redis or S3 secrets in Vercel's `NEXT_PUBLIC_*` variables. Do not distribute production credentials to arbitrary preview deployments: each permitted preview needs its own deliberate origin/cross-origin configuration. Use the stable production URL for reviewers.

Set Render's `CORS_ALLOWED_ORIGINS` to the final Vercel origin and redeploy/restart the backend as needed. Changes to `NEXT_PUBLIC_DIRECT_API_URL` require a new frontend build.

## 6. Final smoke test before sending the assignment

Use an incognito browser and a dedicated synthetic demo account:

1. Open the frontend after the backend has been idle. Check cold-start messaging and retry, not only a warm session.
2. Register/login, create a session, send intake answers and reload. Data must persist.
3. Upload a valid image **larger than 4.5 MB but below 7 MiB**. In browser Network tools, verify the small `/upload/authorize/` call goes to Vercel, while the multipart `/upload/` request goes to Render with `X-Upload-Token`, without JWT or cookie credentials.
4. Confirm the media GET is owner-authorized and redirects to a temporary private-storage URL. Anonymous and different-account API requests must not mint that URL. An unsigned storage URL must not be public.
5. Redeploy Render and confirm conversations **and attachments** survive. This proves external persistence rather than accidental local-disk storage.
6. With an approved free provider quota, run one real diagnosis and booking request. Clearly label the booking pending. No live Gemini validation has been done in this workspace.
7. Verify Swagger UI, provider quotas and the hosting dashboards' free-plan selections.
8. Confirm the production frontend opens without a Vercel-account login wall; do not submit a protected preview link. Share the stable frontend, direct backend API base and docs URL in the submission; include a short walkthrough video and privately shared demo credentials.

Render Free sleeps after inactivity and can take about a minute to wake; it provides a persistent address, not guaranteed immediate availability. Do not use a pinger to disguise this limitation. [1](https://render.com/docs/free)

## Operations and honest limits

- Render's public backend means private Compose-network assumptions do not apply. Django still requires JWTs/tickets and owner checks. Auth IP throttling follows Render's ingress chain; BFF requests can share Vercel egress-IP buckets. User-scoped AI quotas remain independent of IP. Configure/test edge abuse controls before real production use.
- Keep private S3 credentials server-side. A ticket cannot authenticate chat/history, but an intercepted unexpired upload ticket can authorize its narrowly scoped upload before it is used. TLS and non-logging are required.
- Free Render has no persistent media disk or always-on guarantee. Supabase/Upstash quota or pause conditions can make the API unavailable. No hosted SLA, backup automation or free-tier capacity claim is implied.
- The local-volume `backup.sh` is **not** a backup for this hosted Supabase stack. Back up the `pitstop` PostgreSQL schema and private bucket together through a tested operator procedure.
- A production-quality 9–9.5 rating and this free assignment demo are different goals. Local tests passing do not establish cloud rollout, live S3 compatibility, real-provider accuracy or measured restore capability.
