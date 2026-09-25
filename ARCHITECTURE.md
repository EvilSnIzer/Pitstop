# Short architecture explanation

Pitstop is a monorepo with a **Next.js frontend** and a **Django REST backend**. Keeping both applications together lets API contracts, migrations and UI changes be reviewed and tested in one release, while each application remains independently deployable.

```text
Browser
  │ HTTPS, same-origin requests, HttpOnly cookies
  ▼
Next.js App Router + server-side API proxy (BFF)
  │ JWT added on the server; never exposed to browser JavaScript
  ▼
Django REST Framework
  ├── Deterministic intake state machine
  ├── Gemini wrapper: ambiguous classification, media analysis, final diagnosis
  ├── PostgreSQL: users, sessions, messages, diagnoses, bookings, AI budgets
  ├── Redis: shared request-throttling counters
  └── Private media storage: Postgres rows, disk volume or S3
```

1. **User interface:** Next.js, TypeScript, Tailwind and TanStack Query provide responsive conversations, attachments, history, error recovery and booking requests. The same-origin BFF manages secure cookies, refresh and CSRF checks.
2. **Business logic:** Django owns authentication, resource ownership, intake state and booking eligibility. A booking is allowed only after diagnosis and begins as pending, not confirmed.
3. **AI minimization:** A deterministic state machine and keyword/regex extraction handle ordinary intake. Gemini is reserved for ambiguous classification, media and final assessment. Validated outputs, timeouts, retry limits, media caching and daily attempt budgets control failures and cost.
4. **Consistency:** Session leases coordinate concurrent requests; short transactions fence commits. Idempotency keys make unchanged retries safe, while database constraints prevent duplicate diagnoses/bookings. External provider billing is not guaranteed exactly once across crashes.
5. **Assignment hosting:** one Render Blueprint (`render.yaml`) provisions the whole stack on Render's free plan: the Next.js frontend/BFF and the Django API as Docker web services, plus free Postgres and free Key Value (Redis), connected over Render's private network. The BFF resolves the API through a Blueprint `hostport` reference, and Django trusts those single-label private hostnames by rewriting them to its public hostname, keeping public host validation strict. Because free instances have ephemeral disks and cannot attach persistent volumes, uploaded media lives in Postgres rows (`MEDIA_STORAGE=database`) and is covered by a single `pg_dump`. Browser uploads stay same-origin through the BFF, so no CORS, upload tickets or signed-URL redirects are needed in this topology; the split Vercel + Render + Supabase + Upstash variant that uses all of them remains supported. Both configurations still require an actual account-owned deployment and smoke test, and free-plan limits (15-minute spin-down, 30-day free-Postgres expiry, 750 instance-hours/month) are documented in the deployment guide.
6. **Alternative deployment:** The reference Docker stack uses Caddy HTTPS ingress, standalone Next.js, Gunicorn, PostgreSQL and Redis, with persistent private media. SQLite and process-local cache are development-only alternatives. A production rollout and recovery drill remain separate operational steps.

For setup see [README](README.md), for endpoints see [API reference](docs/API_REFERENCE.md), and for operations see [the deployment runbook](deploy/README.md).
