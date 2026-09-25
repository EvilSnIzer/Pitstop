# Free assignment hosting

The selected setup is now **one-click, all on Render's free plan**: the Next.js website, the Django API, PostgreSQL and Redis (Key Value) are all created and wired by the root [`render.yaml`](../render.yaml) Blueprint — **no Supabase, no Upstash, no Vercel, no S3 bucket, one provider account, $0**.

Follow **[the one-click Render guide](RENDER_ONE_CLICK.md)**. It covers the deploy button, the single optional Gemini prompt, the post-deploy smoke test, free-plan limits (spin-down, 30-day free-Postgres expiry, 750 instance-hours/month) and backups — uploaded media is included in the database dump because `MEDIA_STORAGE=database` stores attachments as Postgres rows.

The source contains:

- `render.yaml`: four free resources — `pitstop-web` (Next.js Docker), `pitstop-api` (Django Docker), `pitstop-db` (Postgres 16, private-network-only) and `pitstop-redis` (Key Value, private-network-only) — with `DATABASE_URL`, `REDIS_URL` and the BFF→API private-network address injected from Blueprint references and `DJANGO_SECRET_KEY` auto-generated.
- `backend/start-render.sh`: single-instance startup migrations + modest Gunicorn settings for the free plan.
- `backend/chatbot/storage.py`: database-backed media storage so uploads survive Render's ephemeral filesystem without external object storage.
- `backend/config/middleware.py`: private-network host trust so the BFF can call the API internally while public host validation stays strict.
- Frontend BFF origin fallback to Render's injected `RENDER_EXTERNAL_HOSTNAME` — no build-time knowledge of the deployment URL required.

**Budget remains $0. No paid resources are authorized. No cloud resources or live URLs have been provisioned by this repository.** Free-plan availability/eligibility must be checked in your own account. There is no always-on guarantee: free web services sleep after 15 idle minutes and the free Postgres instance expires 30 days after creation — see the guide for the data-lifecycle steps.

The earlier **Vercel + Render + Supabase + Upstash** variant is still documented in [VERCEL_RENDER.md](VERCEL_RENDER.md) as an alternative, and the private single-host Compose stack lives in [README.md](README.md).
