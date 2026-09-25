# All-Render one-click adaptation — local verification

**25 September 2026.** The selected deployment moved to **one Blueprint, everything on Render's free plan** (website, API, Postgres, Redis) — no Supabase, Upstash or Vercel account. Guide: [deploy/RENDER_ONE_CLICK.md](deploy/RENDER_ONE_CLICK.md).

## Implemented

- `render.yaml` rewritten: `pitstop-web` + `pitstop-api` free Docker web services, free Postgres 16 (`databases:`, `ipAllowList: []` = private network only) and free Key Value/Valkey (`type: keyvalue`, `persistenceMode: off`), with `DATABASE_URL` via `fromDatabase`, `REDIS_URL` via `fromService connectionString` and `API_PROXY_URL=http://$(API_HOSTPORT)` via `fromService hostport`; `DJANGO_SECRET_KEY` uses `generateValue: true`; only `GEMINI_API_KEY` remains an optional prompt.
- `MEDIA_STORAGE=database`: new `StoredObject` model + migration `0004` and `chatbot/storage.py` `DatabaseStorage` keep private uploads in Postgres rows, because free Render instances have ephemeral disks and cannot attach persistent volumes. Production-on-Render now rejects only `filesystem` storage (S3 remains supported); the owner-checked media endpoint streams database-stored bytes through the existing non-S3 branch.
- `TRUST_PRIVATE_NETWORK_HOST=1` + `config/middleware.py`: Render's private-network hostnames are dynamic single-label names (`<service>-<hash>`) that cannot be listed in `ALLOWED_HOSTS`; the middleware rewrites such hosts (which browsers cannot produce or resolve) to the service's public hostname. Dotted/unknown hosts remain rejected.
- BFF origin check falls back to `RENDER_EXTERNAL_HOSTNAME` when `APP_ORIGIN` is unset, so the frontend needs no build-time knowledge of its own URL; explicit `APP_ORIGIN` still wins (custom domains).
- `start-render.sh` stretches a short `DJANGO_SECRET_KEY` (Render's `generateValue: true` = base64-encoded 256-bit, 44 chars) to a 128-char SHA-512 hex key before migrations/Gunicorn start, so the generated secret satisfies Django's 50-character deploy-check heuristic (`security.W009`) and the app's production guard without weakening entropy; 50+ character manual secrets pass through unchanged.
- Supabase-specific defaults (`PGSSLROOTCERT`, `DATABASE_SCHEMA`, `DB_SSLMODE=verify-full`, `AWS_*`, `CORS_ALLOWED_ORIGINS`) removed from the Blueprint — same-origin BFF calls need no CORS or upload tickets; the split-provider variant keeps working via dashboard overrides documented in `deploy/VERCEL_RENDER.md`.
- `NEXT_TELEMETRY_DISABLED=1` in the frontend builder stage; `/login` (statically prerendered) is the frontend health-check path.

## Executed checks (sandbox, Python 3.11 / Node 22 substitutes for the pinned 3.13 / 24)

| Check | Result |
|---|---|
| New Render-path backend tests (`test_render_deploy.py`) | **9 passed**: storage save/open/size/delete roundtrip, no-URL guarantee, API upload persisted as a DB blob and streamed back byte-identical, dedupe to one blob, private-host trust matrix (single-label accepted when enabled, rejected when disabled, dotted unknown host rejected, public hostname accepted) |
| Full backend suite on SQLite | **97 passed, 2 skipped (PostgreSQL-only), 3 failed** — all 3 failures are the audio `ffprobe` validation tests returning 503 because the sandbox has no `ffprobe` binary; pre-existing environment limitation, unrelated to this change |
| `manage.py check`, `makemigrations --check`, `spectacular --validate --fail-on-warn` | Passed; migration `0004_storedobject` generated, no drift |
| Ruff / Black | Passed (line-length 100) |
| Frontend `npm run typecheck`, `npm run lint` | Passed |
| Frontend proxy tests | **11 passed**, including 2 new: Render-hostname origin fallback and fail-closed 503 when no origin is known |
| Production standalone frontend build (`npm run build`) | Passed; `/login` prerendered static, `.next/standalone` includes `public/` and `.next/static/` |
| Render-topology end-to-end simulation (real HTTP) | Passed: standalone BFF with `API_PROXY_URL=http://<single-label-host>:8000` (mapped via `/etc/hosts`, as Render's private DNS would) drove register → session → multipart PNG upload → byte-identical media download through Django with `TRUST_PRIVATE_NETWORK_HOST=1`, `MEDIA_STORAGE=database`; the blob landed as one `chatbot_storedobject` row with an empty filesystem media dir; `/health/live/` and `/health/ready/` returned 200; an unrelated dotted Host was still rejected with 400 |
| Production `manage.py check --deploy --fail-level WARNING` with Render-shaped env (generated 44-char secret stretched by `start-render.sh` logic, `DATABASE_URL`/`REDIS_URL` placeholders, `MEDIA_STORAGE=database`) | Passed with no warnings; production guard rejects `MEDIA_STORAGE=filesystem` on Render and invalid values |
| `render.yaml` field validation | Every field/enum checked against Render's published JSON Schema (`render.com/schema/render.yaml.json`, fetched 25 Sep 2026): `keyvalue` type with required `ipAllowList`, `free` plans for server/postgres/keyValue, `postgresMajorVersion: "16"`, `fromDatabase`/`fromService` `connectionString`/`hostport` properties, `generateValue`, `sync: false`, `dockerCommand`, `healthCheckPath`. Full programmatic schema validation was not run (schema fetched in chunks) |

## Still unverified

- An actual account-owned Render deploy: live Blueprint sync of this exact `render.yaml` (including `$(API_HOSTPORT)` interpolation at create time), free-plan Docker build times/memory, and the end-to-end smoke test in [the guide](deploy/RENDER_ONE_CLICK.md).
- Live Valkey-free ↔ Django `RedisCache` throttle behavior and the 30-day free-Postgres expiry/renewal path.
- Real cold-start timings for two chained free services.

---

# Earlier Vercel + Render adaptation — local verification

**25 September 2026, Asia/Calcutta.** Selected for a job-application assignment, with a $0 hosting budget.

## Implemented

- Provider-aware Next.js build: native Vercel output versus standalone local/Compose output.
- Explicit Vercel environment checks and a 90-second route-duration declaration.
- Authenticated upload-ticket endpoint, 120-second signing lifetime, account/MIME/size binding, cache-backed replay rejection and upload-only authentication scope.
- Direct browser-to-backend multipart uploads without exposing JWTs; original local same-origin upload fallback retained.
- Bounded multipart file parsing, normal content validation and owner checks remain in place.
- Owner-authorized 60-second object-storage read redirects, forwarded by the BFF instead of streaming large files through Vercel.
- Supabase-compatible storage endpoint/region/signature options; Render rejects missing persistent object storage in production.
- Optional private PostgreSQL schema, used as `pitstop` in the Render blueprint to avoid exposing Django tables through Supabase's public Data API.
- One explicitly free Render Docker service, startup migration script, single-worker/two-thread Gunicorn settings and production admin disabled by default.
- Cold-start guidance and retryable handling of a provider's HTML startup page.

## Executed checks

| Check | Result |
|---|---|
| Backend suite on SQLite | **89 passed; 2 PostgreSQL-only cases skipped** |
| Chromium browser suite against a production build | **14 passed**, including a real **5 MiB cross-origin upload** authenticated with a scoped ticket |
| BFF/client-transfer tests | **9 passed**, including production cookie flags and private-media redirects |
| Standalone frontend build | Passed |
| Vercel-mode native frontend build (`VERCEL=1`, non-secret placeholder URLs) | Passed |
| TypeScript / ESLint / Ruff / Black | Passed |
| OpenAPI generation and validation | Passed with `--fail-on-warn`; exported schema updated |
| Migration drift | No changes detected |
| Production Django settings check with Render-shaped placeholder configuration | Passed with `--deploy --fail-level WARNING` |
| Render Blueprint structure | Passed validation against Render's published JSON Schema |
| Vercel config | Instance accepted by published schema rules; full schema meta-validation was not asserted because the downloaded provider schema mixes draft constructs |
| Frontend production dependency audit | No known vulnerabilities reported |
| Python production dependency audit | No known vulnerabilities reported |
| Shell script syntax and diff whitespace | Passed |

The real cross-origin browser upload used two local HTTP origins and real Pillow validation. Tests checked that its large multipart request went directly to the backend rather than through the Next.js proxy. Object-storage read signing/redirects were mocked; no cloud bucket credentials were used. Production cookie flags/origin handling were tested with a controlled upstream HTTP server.

The previous hardening run's **80 PostgreSQL passes** are historical results in `VERIFICATION.md`; this adaptation's expanded suite was **not rerun against PostgreSQL** locally. The CI database matrix is configured but no remote CI run was observed.

## Still unverified

- Account-owned Vercel/Render deployment and actual public URLs.
- Render container execution/resource limits and platform ingress behavior.
- Live Supabase session-pooler TLS/private-schema configuration, bucket privacy and S3 upload/read/delete compatibility.
- Live Upstash TLS connectivity, quota behavior and replay-cache persistence.
- Real provider availability/accuracy and a complete deployed diagnosis-to-booking smoke test.
- Deployed cold-start timing, sustained load, backups and restore drill.

Do not treat a successful local build, JSON schema validation or a mocked storage redirect as proof of these hosted behaviors. Follow [the deployment guide](deploy/VERCEL_RENDER.md) and record actual URLs only after its smoke tests pass.
