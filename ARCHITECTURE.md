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
  └── Private media storage: disk volume or S3
```

1. **User interface:** Next.js, TypeScript, Tailwind and TanStack Query provide responsive conversations, attachments, history, error recovery and booking requests. The same-origin BFF manages secure cookies, refresh and CSRF checks.
2. **Business logic:** Django owns authentication, resource ownership, intake state and booking eligibility. A booking is allowed only after diagnosis and begins as pending, not confirmed.
3. **AI minimization:** A deterministic state machine and keyword/regex extraction handle ordinary intake. Gemini is reserved for ambiguous classification, media and final assessment. Validated outputs, timeouts, retry limits, media caching and daily attempt budgets control failures and cost.
4. **Consistency:** Session leases coordinate concurrent requests; short transactions fence commits. Idempotency keys make unchanged retries safe, while database constraints prevent duplicate diagnoses/bookings. External provider billing is not guaranteed exactly once across crashes.
5. **Assignment hosting:** Vercel handles the frontend/BFF; Render Free runs Django. Large uploads go directly to Render with a 120-second upload-only ticket. Authenticated media reads can redirect to 60-second signed storage URLs so file bodies bypass Vercel. Supabase stores Django tables in a private `pitstop` schema and media in a private bucket; Upstash supplies Redis. This configuration still requires an actual account-owned deployment and smoke test.
6. **Alternative deployment:** The reference Docker stack uses Caddy HTTPS ingress, standalone Next.js, Gunicorn, PostgreSQL and Redis, with persistent private media. SQLite and process-local cache are development-only alternatives. A production rollout and recovery drill remain separate operational steps.

For setup see [README](README.md), for endpoints see [API reference](docs/API_REFERENCE.md), and for operations see [the deployment runbook](deploy/README.md).
