# Pitstop — deliverables

Every item on the requested list, with its status, location and the evidence behind it.
Verified 25 September 2026.

| # | Requested deliverable | Status | Location |
|---|---|---|---|
| 1 | GitHub repository | **Delivered** | <https://github.com/EvilSnIzer/Pitstop> |
| 2 | Live frontend URL | **Delivered — live and verified** | <https://pitstop-pi-ochre.vercel.app> |
| 3 | Live backend API URL | **Live and verified** through the same origin; the Django service's own hostname is one field to paste in — see [Backend hostname](#3-live-backend-api-url) | <https://pitstop-pi-ochre.vercel.app/api/v1> |
| 4 | README with setup instructions | **Delivered** | [README.md](README.md) |
| 5 | API documentation | **Delivered** | [docs/API_REFERENCE.md](docs/API_REFERENCE.md), [docs/openapi.yaml](docs/openapi.yaml), live `/api/docs/` |
| 6 | Short architecture explanation | **Delivered** | [ARCHITECTURE.md](ARCHITECTURE.md) |

Supporting material: [handoff notes](HANDOFF.md), [deployment runbook](deploy/README.md),
[one-click Render guide](deploy/RENDER_ONE_CLICK.md), [verification history](VERIFICATION.md),
[CI workflow](.github/workflows/ci.yml), [live-stack smoke test](scripts/smoke_test.py).

---

## 1. GitHub repository

<https://github.com/EvilSnIzer/Pitstop> — public, default branch `main`, created 24 Sep 2026.

`main` is at `fa53fa4`. The live production deployment is built from Vercel's production
branch (normally `main`); I could not read the Vercel project settings from here, so treat
that one detail as unchecked.
[Pull request #4](https://github.com/EvilSnIzer/Pitstop/pull/4) (branch
`arena/01a0d9ac-pitstop`, tip `84e6c27`) adds this deliverables record, the CI workflow,
the `APP_ORIGIN` fix and the smoke test; all four CI jobs pass on it.

## 2. Live frontend URL

**<https://pitstop-pi-ochre.vercel.app>** — Next.js 16.3.6 on Vercel, production deployment.

Verified on 25 September 2026 over the public internet:

| Request | Result |
|---|---|
| `GET /` | 200 — page title `Pitstop — Your drive, understood`, workspace-loading state |
| `GET /login` | 200 — full sign-in page renders (form, registration link, hero image via `/_next/image`) |
| `GET /api/v1/auth/me` | 401 `{"detail":"Authentication credentials were not provided.","code":"not_authenticated","request_id":"3eec2d00-94dc-4bb2-805b-2e56f49b5dfe"}` |

That third line is the important one. The `request_id` field is added by Django's exception
handler, so the BFF reached a live Django process and returned its response — an unreachable
backend would have produced the BFF's own `503 upstream_unavailable`. Registration and other
mutations were **not** exercised from this workspace (no outbound HTTPS and no browser
here); run the [smoke test](#reproducing-the-verification) against the live URL to cover them.

A secondary demo runs as this session's workspace preview while the sandbox is alive:
<https://3000-i7d6wocviwvln48i3xhfx.e2b.app>. It is not permanent hosting.

## 3. Live backend API URL

The API is live and reachable now, same-origin, at:

**<https://pitstop-pi-ochre.vercel.app/api/v1>** — cookie-authenticated through the BFF,
which is what the browser uses. Endpoints, payloads, error codes and retry semantics are in
[docs/API_REFERENCE.md](docs/API_REFERENCE.md); the machine-readable schema is
[docs/openapi.yaml](docs/openapi.yaml).

**One field to fill in.** Direct bearer-token clients, Swagger UI (`/api/docs/`), the raw
schema (`/api/schema/`) and the health probes (`/health/live/`, `/health/ready/`) live on the
Django service itself, not behind the BFF. Its public hostname was provisioned outside this
workspace, so it is not recorded here:

```text
Live Django API URL:  ____________________   (e.g. https://pitstop-api-ab12.onrender.com)
```

Find it in the Render dashboard → the `pitstop-api` service → **Settings → Domains** (it is
also the value of the Vercel project's `NEXT_PUBLIC_DIRECT_API_URL`). Then confirm:

```bash
curl https://<that-host>/health/live/    # {"status": "ok"}
curl https://<that-host>/health/ready/   # {"status": "ready"}
open https://<that-host>/api/docs/       # Swagger UI
```

Until that hostname is published, use the session preview API, which exposes all of it:
<https://8000-i7d6wocviwvln48i3xhfx.e2b.app> (`/health/live/`, `/api/v1/`, `/api/docs/`,
`/api/schema/`). It stops answering when this session's sandbox stops.

## 4. README with setup instructions

[README.md](README.md) — prerequisites, backend and frontend setup, environment variables,
authentication model, API contract table, upload/AI cost controls, the full verification
command list, and deployment limits.

## 5. API documentation

- [docs/API_REFERENCE.md](docs/API_REFERENCE.md) — auth (direct bearer vs. browser cookies),
  every endpoint with request/response shapes, `curl` examples, upload limits and ticket
  flow, idempotency and concurrency rules, error-code table, throttle and budget defaults.
- [docs/openapi.yaml](docs/openapi.yaml) — machine-readable schema. Regenerated with
  `spectacular --validate --fail-on-warn` and **byte-identical** to the app's current export
  (`diff` exit code 0).
- Live Swagger UI: `/api/docs/` on the Django hostname above (or on the preview API).

## 6. Short architecture explanation

[ARCHITECTURE.md](ARCHITECTURE.md) — request path, the five responsibilities (UI, business
logic, AI minimisation, consistency, hosting) and the deployment topologies, with the
guarantees each one does and does not make.

---

## Verification evidence

Executed in a clean workspace on 25 September 2026 (Python 3.11.2 / Node 22.22.3 locally;
Python 3.13 / Node 24 in CI, which is what the project targets).

| Check | Result |
|---|---|
| `ruff check .` / `black --check .` | Passed (Black first reformatted `chatbot/bot/gemini.py`) |
| `manage.py check` / `makemigrations --check --dry-run` | No issues; no migration drift |
| `spectacular --validate --fail-on-warn` | Passed; export byte-identical to `docs/openapi.yaml` |
| `pytest` | **98 passed, 2 skipped** |
| `pip check` / `pip-audit -r requirements.txt` | Clean / **no known vulnerabilities** |
| `npm run lint` / `typecheck` / `test:proxy` | Passed / passed / **11 passed** |
| `npm run build` (standalone) | Passed; `/`, `/login`, `/register` and all 14/13/13 referenced chunks return 200 |
| `npm audit --omit=dev --audit-level=high` | **0 vulnerabilities** |
| CI on `84e6c27` | Backend SQLite **pass**, backend PostgreSQL 16 + Redis 7 **pass**, frontend **pass**, Chromium browser regressions **pass** |
| [scripts/smoke_test.py](scripts/smoke_test.py) against a running stack | **18/18 checks passed** |
| Live Vercel frontend | `/`, `/login`, `/api/v1/auth/me` verified as above |

### Reproducing the verification

```bash
# Local stack, from the repository root:
backend/.venv/bin/python scripts/smoke_test.py

# Against the live deployment (fills in the missing mutation coverage):
PITSTOP_FE_URL=https://pitstop-pi-ochre.vercel.app \
PITSTOP_ORIGIN=https://pitstop-pi-ochre.vercel.app \
PITSTOP_API_URL=https://pitstop-pi-ochre.vercel.app \
  backend/.venv/bin/python scripts/smoke_test.py
```

It exits non-zero on the first failed expectation, so it works as a post-deploy gate.
Point `PITSTOP_API_URL` at the Django hostname to also cover bearer auth and the health
endpoints directly.

---

## Known issues

1. **Vercel preview deployments fail; production succeeds.** The live production build
   works, but the three preview deployments for this branch all report `failure`.
   `next.config.mjs` throws when `VERCEL` is set without `API_PROXY_URL` and
   `NEXT_PUBLIC_DIRECT_API_URL` (`APP_ORIGIN` auto-derives from `VERCEL_URL`), and Vercel
   environment variables are enabled per environment. Reproduced locally:
   `VERCEL=1 npx next build --webpack` with no variables fails with
   *"Vercel requires API_PROXY_URL, APP_ORIGIN and NEXT_PUBLIC_DIRECT_API_URL"*; the same
   build succeeds when they are supplied. Most likely those two are enabled for Production
   only — enable them for Preview in Project Settings → Environment Variables and previews
   will build. The Vercel build log itself needs account access, so this is a diagnosis from
   reproduction, not a read log.
2. **No Gemini key is configured**, so media analysis adds an explanatory note and diagnosis
   returns `503 ai_not_configured` rather than inventing an assessment. Add a backend-only
   `GEMINI_API_KEY` to enable it.
3. **Not verifiable in this workspace:** the browser suite cannot run here (Playwright's
   Chromium download is blocked, so CI covers it), and there is no container runtime
   (`docker` and `podman` are absent), so the Dockerfiles and Compose stack remain unbuilt.
   `ffprobe` had to be supplied manually for local media validation.
4. **Booking is a request record**, not a confirmed appointment — no mechanic dispatch or
   calendar integration. AI confidence is model-generated, not a calibrated probability.
