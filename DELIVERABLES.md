# Pitstop deliverables

Status of each requested deliverable, with the evidence behind it. Everything marked
*verified* was executed on 25 September 2026 against commit `fa53fa4` plus the changes on
this branch.

| Requested deliverable | Status | Where |
|---|---|---|
| GitHub repository | **Delivered** — public repo, `main` is the default branch | <https://github.com/EvilSnIzer/Pitstop> |
| Live frontend URL | **Live session preview** (production standalone build). Permanent hosting not yet provisioned — see [Permanent hosting](#permanent-hosting) | <https://3000-i7d6wocviwvln48i3xhfx.e2b.app> |
| Live backend API URL | **Live session preview** (Gunicorn + WSGI, `DEBUG=0`, admin disabled) | <https://8000-i7d6wocviwvln48i3xhfx.e2b.app> |
| README with setup instructions | **Delivered** | [README.md](README.md) |
| API documentation | **Delivered** — reference, OpenAPI schema and live Swagger UI | [docs/API_REFERENCE.md](docs/API_REFERENCE.md), [docs/openapi.yaml](docs/openapi.yaml), `/api/docs/` on the API URL |
| Short architecture explanation | **Delivered** | [ARCHITECTURE.md](ARCHITECTURE.md) |

Supporting material: [deployment runbook](deploy/README.md), [one-click free deploy](deploy/RENDER_ONE_CLICK.md),
[verification history](VERIFICATION.md), [hosting adaptation notes](HOSTING_VERIFICATION.md),
[CI](.github/workflows/ci.yml).

## The two live URLs

Both are the real applications, not mocks: Next.js 16.3.6 serving the standalone
production build, and Django 5.2.17 under Gunicorn (2 workers × 4 threads, `DEBUG=0`,
`DJANGO_ADMIN_ENABLED=0`), connected by the same-origin BFF.

- Frontend: `https://3000-i7d6wocviwvln48i3xhfx.e2b.app` — register, log in, chat, attach
  media, run diagnosis, request a booking.
- Backend: `https://8000-i7d6wocviwvln48i3xhfx.e2b.app/health/live/` ·
  `/health/ready/` · `/api/schema/` · `/api/docs/` (Swagger UI) · `/api/v1/…` with
  `Authorization: Bearer <access>`.

These are **workspace preview hostnames tied to this working session**; they are not
permanent hosting and will stop answering when the session's sandbox stops. Treat them as
a working demonstration of the deployed artefacts, and use
[deploy/RENDER_ONE_CLICK.md](deploy/RENDER_ONE_CLICK.md) for URLs that outlive the session.

## Verification behind these URLs

Commands run in this workspace (Python 3.11.2 + Node 22.22.3 were the newest interpreters
available here; the project targets Python 3.13 / Node 24 and CI runs those):

| Check | Result |
|---|---|
| `ruff check .` / `black --check .` | Passed (`chatbot/bot/gemini.py` was reformatted by Black first — the previous commit left it unformatted) |
| `manage.py check` / `makemigrations --check --dry-run` | No issues; no migration drift |
| `manage.py spectacular --validate --fail-on-warn` | Passed, and the export is **byte-identical** to `docs/openapi.yaml` |
| `pytest` (SQLite, no Gemini key) | **98 passed, 2 skipped** |
| `pip check` / `pip-audit -r requirements.txt` | No broken requirements; **no known vulnerabilities** |
| `npm run lint` / `npm run typecheck` | Passed |
| `npm run test:proxy` | **11 passed** |
| `npm run build` (standalone) | Passed — 5 routes, `/api/[...path]` dynamic |
| `npm audit --omit=dev --audit-level=high` | **0 vulnerabilities** |
| End-to-end smoke test through the BFF and the direct API | **18/18 checks passed** |

Smoke test highlights (real HTTP, no mocks): registration returned `201
{"authenticated":true}` with `pitstop_access`/`pitstop_refresh` cookies carrying
`HttpOnly; Secure; SameSite=none; Partitioned`; a mutation without `X-Pitstop-Request`
returned `403 csrf_failed`; a session was created with its seeded greeting; a 5,548-byte
JPEG uploaded through the BFF and came back byte-identical from `/api/v1/media/{id}/`
while an anonymous request got `401`; one intake sentence filled all four slots
(`diagnosis_ready: true`); an unchanged retry with the same `Idempotency-Key` replayed with
`Idempotency-Replayed: true`; diagnosis with no provider key returned
`503 ai_not_configured` instead of inventing an assessment; `/health/live/` and
`/health/ready/` returned `200`; bearer authentication served `/auth/me/`, the session list
and history.

Two environment limits, stated plainly:

- **The browser regression suite cannot run in this workspace.** Playwright's Chromium
  download is blocked here, so `npm run test:e2e` was executed in CI instead — see below.
- **`ffprobe` had to be supplied manually.** The system package manager is unreachable, so a
  static `ffprobe` build was placed on `PATH` for the run above. Without it, audio
  validation returns `503` instead of `400` and three hardening tests fail (95 passed /
  3 failed); with it, all 98 pass. Image uploads only need Pillow.

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) — referenced by `README.md` and
`VERIFICATION.md` but absent from the repository until this change — runs on pushes to
`main`, on pull requests and on demand. On [pull request #4](https://github.com/EvilSnIzer/Pitstop/pull/4)
(run 36172644519) every job passed:

| Job | Result |
|---|---|
| Backend (Python 3.13, SQLite) | **pass** in 2m 5s |
| Backend (Python 3.13, PostgreSQL 17 + Redis 7) | **pass** in 1m 28s |
| Frontend (Node 24) — lint, typecheck, proxy tests, standalone build, audit | **pass** in 46s |
| Browser regressions (Chromium) — 14 specs across `auth.spec.ts` and `workspace.spec.ts` | **pass** in 2m 0s |

The first CI run of the browser job failed, and the failure was real: Playwright's server
was started without `APP_ORIGIN`, and the BFF rejects any mutation whose `Origin` it does
not recognise, so every UI-driven request returned `403 csrf_failed`. The same gap affected
the documented `npm run dev` flow. `playwright.config.ts` now starts the server with
`APP_ORIGIN` set to the browser's base URL, and `frontend/.env.example` sets
`APP_ORIGIN=http://localhost:3000`; matching origins reach the API while
`http://evil.example` is still rejected.

## Permanent hosting

No cloud account, credential or paid resource was available in this session, so no permanent
hostname has been provisioned by this work. Two things are true about the account this
repository already lives in:

- **The existing Vercel Git integration currently fails.** Deploying this branch produced a
  failed deployment (check `Vercel`: *"Deployment has failed"*). The cause is reproducible
  locally: `next.config.mjs` throws when `VERCEL` is set without `API_PROXY_URL`,
  `APP_ORIGIN` and `NEXT_PUBLIC_DIRECT_API_URL`, and running `VERCEL=1 npx next build`
  with no variables fails with exactly *"Vercel requires API_PROXY_URL, APP_ORIGIN and
  NEXT_PUBLIC_DIRECT_API_URL"*. The same build succeeds when those three are provided, so
  setting them in Vercel → Project Settings → Environment Variables and redeploying is what
  unblocks it. `API_PROXY_URL` must point at a deployed Django API, which does not exist
  yet — the Vercel route therefore needs the API deployed first.
- **The one-click path has no such dependency.** The repository is deployment-ready:

1. Click **Deploy to Render** in [README.md](README.md) (or follow
   [deploy/RENDER_ONE_CLICK.md](deploy/RENDER_ONE_CLICK.md)) — the root
   [`render.yaml`](render.yaml) Blueprint provisions the website, the API, PostgreSQL and
   Redis on Render's free plan and wires them over the private network.
2. Record the two resulting `onrender.com` hostnames here, replacing the preview URLs above,
   after smoke-testing HTTPS, auth, ownership, persistence and `/health/ready/`.
3. Free-plan limits still apply: 15-minute idle spin-down, ~1 minute cold start, free
   Postgres expires after 30 days, 750 instance-hours per workspace-month.

Add a backend-only `GEMINI_API_KEY` to the API service to enable real diagnosis; until then
intake is deterministic and diagnosis reports `ai_not_configured` by design.
