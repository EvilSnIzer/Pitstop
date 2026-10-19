# Pitstop hardening — delivery and verification

**Subsequent hosting changes:** see [HOSTING_VERIFICATION.md](HOSTING_VERIFICATION.md) for the latest hosting-adaptation tests (all-Render one-click Blueprint, and the earlier Vercel/Render variant). The PostgreSQL counts below belong to the earlier hardening run, not a new hosted rollout.

**Verified locally: 25 September 2026 (Asia/Calcutta).** This records actual checks performed, not a self-awarded production-readiness score.

## Re-verification on branch `arena/01a0d9ac-pitstop` (25 September 2026)

Run in a clean workspace with Python 3.11.2 and Node 22.22.3 (the newest interpreters
available there; the project targets Python 3.13 / Node 24, which is what CI runs), SQLite,
a process-local cache and a static `ffprobe` build on `PATH`.

| Check | Result |
|---|---|
| `ruff check .` / `black --check .` | Passed, after Black reformatted `chatbot/bot/gemini.py` (the previous commit left it unformatted) |
| `manage.py check`, `makemigrations --check --dry-run` | No issues; no migration drift |
| `spectacular --validate --fail-on-warn` | Passed; export byte-identical to `docs/openapi.yaml` (`diff` exit 0) |
| `pytest` | **98 passed, 2 skipped** |
| `pip check` / `pip-audit -r requirements.txt` | Clean / **no known vulnerabilities** |
| `npm run lint`, `npm run typecheck`, `npm run test:proxy` | Passed / passed / **11 passed** |
| `npm run build` (standalone) | Passed; `/`, `/login`, `/register` and all 14/13/13 referenced chunks return 200 |
| `npm audit --omit=dev --audit-level=high` | **0 vulnerabilities** |
| Remote CI ([`ci.yml`](.github/workflows/ci.yml), commit `c7f9aab`) | Backend SQLite **pass**, backend PostgreSQL 16 + Redis 7 **pass**, frontend **pass**, Chromium browser regressions **pass** |
| Live stack smoke test ([`scripts/smoke_test.py`](scripts/smoke_test.py)) | **18/18 checks passed** against the running Gunicorn + standalone Next.js servers |

Fixes this run produced: the missing `.github/workflows/ci.yml`; the `APP_ORIGIN` gap that
made every browser-initiated mutation return `403 csrf_failed` in the documented dev flow
and in CI; and CI's PostgreSQL service now matches the Blueprint's major version (16).

Still not established here: browser tests cannot run in this workspace (Playwright's
Chromium download is blocked, so CI covers them), and no container runtime is available
(`docker` and `podman` are absent), so the Dockerfiles and Compose stack remain unbuilt and
unexecuted. Everything listed under "Not established by this work" below still stands.

## Changes delivered

| Area | Implemented improvements |
|---|---|
| Code and dependencies | Approved Next 14 → 16.3.6 migration, React 19, Node 24 runtime, ESLint flat configuration, pinned production Python dependency graph, strict AI result schema |
| Authentication and privacy | HttpOnly cookie BFF, server-side refresh, CSRF header/origin checks, refresh revocation, password validation, case-insensitive unique email identity, private owner-only attachments |
| API and database | UUID idempotency for chat/diagnosis/booking; session leases, fenced atomic commits, PostgreSQL concurrency checks, uniqueness/check constraints, paginated history and server-side session filtering |
| Error handling | Corrupt media rejection, bounded provider retries/deadlines, explicit missing-provider/quota/configuration errors, retained drafts, recoverable authentication outages, transient refresh failures that preserve credentials |
| Frontend UX | Responsive Pitstop workspace, keyboard-managed drawers, pending messages, editable failed drafts, stable retry keys, correct pending-booking labels, shared query caching and stale-list race fix |
| AI efficiency | Deterministic expected-answer handling, no post-diagnosis classification, versioned media-analysis cache, upload deduplication, transactional daily user/global attempt budgets and token metadata |
| Deployment and operations | Non-root containers, PostgreSQL/Redis/Caddy Compose stack, health probes, production setting guards, cleanup command, maintenance-window backup script, restore/rollback runbook and expanded CI |

## Checks executed successfully

| Check | Result |
|---|---|
| Backend tests — PostgreSQL 17.11 | **80 passed** |
| Backend tests — SQLite | **78 passed, 2 skipped** (PostgreSQL-only concurrency tests) |
| Browser regressions — Chromium, standalone production Next build | **13 passed** |
| Session-list/filter/sign-out regression repeated independently | **5 consecutive passes** |
| BFF handler tests with controlled upstream HTTP server | **4 passed** |
| Frontend production build | Passed on **Node 24.21.0 / Next 16.3.6 / React 19.3.0** |
| TypeScript, ESLint, Ruff, Black | Passed; no lint warnings in final checks |
| Django system checks | Passed |
| Django production security settings check | `check --deploy --fail-level WARNING` passed |
| Migration drift | No changes detected |
| OpenAPI | Generated and validated with `--fail-on-warn` |
| Python dependency consistency | `pip check` passed |
| Python production dependency audit | `pip-audit -r requirements.txt`: **no known vulnerabilities found** |
| Frontend dependency audit | `npm audit`: **0 known vulnerabilities reported**, including development dependencies |
| Compose configuration | Validated with Compose **2.39.4**, using non-secret placeholder deployment values |
| Caddy configuration | Validated with Caddy **2.10.2** |
| Backup script syntax / diff whitespace | `bash -n` and `git diff --check` passed |

Audit results are a point-in-time advisory check, not a guarantee that software has no vulnerabilities. The Python checks used Python 3.13.14 and Django 5.2.17.

### Meaningful behaviors covered

- Simultaneous diagnosis requests do not both reach the mocked provider; competing budget reservations cannot both consume the final allowance on PostgreSQL.
- Stale provider workers cannot commit over a replacement lease; partial chat writes roll back.
- Retrying unchanged requests does not duplicate messages/bookings; changed bodies with reused keys are rejected.
- HTML disguised as audio, corrupt PNG checksums and over-duration WAV uploads are rejected. Genuine media can be served through cookie auth, but anonymous/other-owner access cannot.
- Invalid AI JSON/types/confidence fail cleanly; permanent provider rejection does not retry; transient retries remain bounded.
- Browser JS cannot read JWT cookies, refresh works server-side, failed sends preserve drafts/keys, navigation focus returns correctly, and auth outages provide a usable retry state.
- Cleanup preserves attached and actively analyzed files; dry-run does not delete them.

All backend provider calls were mocked/blocked. Browser diagnosis/booking fixtures do not establish live AI accuracy. The preview uses development backend settings; its auth throttle was restored to **10/minute** after browser testing. The temporary PostgreSQL test server was stopped.

## Not established by this work

1. **Container execution/cloud rollout:** Dockerfiles were written, standalone frontend execution was tested and Compose/Caddy configuration was validated. Docker images were not built/run in this workspace. **Update 25 September 2026:** `.github/workflows/ci.yml` now exists and a remote run was observed — all four jobs (backend SQLite, backend PostgreSQL+Redis, frontend, Chromium browser regressions) passed on pull request #4; see [DELIVERABLES.md](DELIVERABLES.md).
2. **Recovery and uptime:** No real backup/restore drill, failover exercise or measured RPO/RTO. The single-host stack is not highly available.
3. **Production capacity:** No sustained load/soak test, capacity guarantee or installed hosted alerting service. Redis-backed production throttling was configured, not load-tested here.
4. **Live Gemini quality:** No real-provider validation, diagnostic accuracy benchmark or calibrated confidence. No key was required or exposed for testing.
5. **Independent assurance:** No external penetration test, complete WCAG audit or legal/privacy retention review.

These remain release gates before calling the whole system a demonstrated **9–9.5/10 production service**. The code/configuration is substantially stronger than the reviewed MVP, but a numeric score cannot replace operational evidence.

## Where to continue

- [Project setup and API contract](README.md)
- [Deployment, maintenance, backup and recovery runbook](deploy/README.md)
- Backend: `backend/chatbot/`
- Frontend: `frontend/`
- CI: `.github/workflows/ci.yml`
