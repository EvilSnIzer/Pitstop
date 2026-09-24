# Vercel + Render adaptation — local verification

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
