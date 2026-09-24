# Pitstop · AI Car Mechanic

A mobile-first car-care workspace with persisted conversations, image/audio/video attachments, deterministic intake, Gemini-assisted diagnosis, and mechanic booking requests. AI guidance is not a safety inspection; confidence is model-generated, not a calibrated probability. A pending booking is **not** a confirmed appointment.

## Handoff documents

- [Deliverable status and GitHub upload instructions](HANDOFF.md)
- [Short architecture explanation](ARCHITECTURE.md)
- [Selected Vercel + Render assignment deployment](deploy/VERCEL_RENDER.md)
- [API reference](docs/API_REFERENCE.md) and [OpenAPI schema](docs/openapi.yaml)

## Architecture

One monorepo, two independently runnable applications: API contracts, migrations, UI and tests change together without adding a monorepo framework.

```text
Browser → Next.js App Router + same-origin cookie BFF → Django REST API
                                                        ├─ PostgreSQL: application state + AI budgets
                                                        ├─ Redis: shared rate-limit counters
                                                        ├─ private disk volume / S3: attachments
                                                        └─ Gemini: classification, media, diagnosis
```

- **Frontend:** Next.js 16.3.6, React 19, TypeScript, Tailwind, TanStack Query; Node 24 LTS. The original Next 14 constraint was explicitly lifted to address dependency advisories.
- **Backend:** Django 5.2, DRF, SimpleJWT, drf-spectacular; Python 3.13, Pillow and ffprobe.
- **Development:** SQLite and in-process cache work without infrastructure. They do **not** provide the production concurrency/rate-limit guarantees.
- **Selected assignment hosting:** Vercel frontend + Render Free backend, using external PostgreSQL, Redis and private object storage. See [the deployment guide](deploy/VERCEL_RENDER.md). Configuration and local transfer tests are complete; hosted rollout is still pending account access.
- **Alternative self-hosting:** `deploy/` provides a single-host Docker Compose stack with PostgreSQL, Redis, Gunicorn, standalone Next.js and Caddy TLS. It is deployment configuration, not evidence of a live cloud deployment.

```text
backend/chatbot/bot/       deterministic state machine, extraction, versioned prompts, AI budgets
backend/chatbot/operations.py  session leases, fenced atomic commits, idempotent responses
backend/chatbot/media.py   content validation, private storage, cached media analysis
backend/chatbot/tests/     real API/database tests; provider always mocked
frontend/app/api/          same-origin server-side token transport
frontend/components/      responsive workspace, forms, messages, diagnosis and booking
frontend/tests/           browser regressions and proxy-handler tests
.github/workflows/        database matrix, build/browser checks, container build checks
```

## Local development

Install Python 3.13, Node 24 and ffmpeg (including `ffprobe`). On Debian/Ubuntu, `sudo apt-get install ffmpeg`. Do not run tests against a production database.

### Backend

```bash
cd backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py runserver 0.0.0.0:8000
```

Leave `GEMINI_API_KEY` empty for deterministic intake. Media analysis then produces an explanatory note; final diagnosis returns `ai_not_configured`. No synthetic diagnosis is substituted. To enable Gemini, configure the key in **backend-only** environment variables and restart the process. Do not put it in a frontend variable, source file or chat message.

Development API docs: `http://localhost:8000/api/docs/`; schema: `/api/schema/`. Admin is at `/admin/`, with a superuser created through `manage.py createsuperuser`.

### Frontend

```bash
cd frontend
npm ci
cp .env.example .env.local
npm run dev -- --hostname 0.0.0.0
```

Open `http://localhost:3000`. `API_PROXY_URL` is server-only, defaulting to `http://127.0.0.1:8000`. The browser always uses relative `/api/v1` URLs. `NEXT_PUBLIC_DIRECT_API_URL` optionally routes only attachment upload bytes directly to the backend using upload-only tickets; it is required for Vercel. `NEXT_PUBLIC_API_URL` and the former `X-Mechanic-Authorization` transport are no longer used.

For a local production build:

```bash
npm run build
HOSTNAME=0.0.0.0 PORT=3000 npm run start
```

The build stages static/public assets into the standalone server directory. `npm start` runs that server, not `next start`.

## Authentication and ownership

- The browser receives **HttpOnly**, host-only cookies scoped to `/api`, never JWT JSON or localStorage tokens. Access lasts 15 minutes; refresh tokens last 7 days.
- The BFF refreshes expired access once per request. Temporary refresh failure returns 503 without discarding credentials. Invalid refresh clears cookies. Logout clears cookies after server-side refresh revocation; a failed attempt preserves credentials for retry, and an already-issued access token remains valid until expiry.
- Production requires HTTPS, secure SameSite=Lax cookies and an exact `APP_ORIGIN`. Every mutation requires `X-Pitstop-Request: 1`; production also checks Origin. The BFF does not enable cross-origin credentialed calls. HTTPS development iframe previews use partitioned SameSite=None cookies.
- Registration applies Django password validators and canonical, database-unique email identity. Login is case-insensitive. Auth endpoints have their own throttle.
- Sessions, history, bookings and attachments are owner-scoped. Permanent/public storage URLs are never returned. When object storage is configured, an owner-checked media request redirects to a signed URL valid for 60 seconds; possession of that URL grants temporary read access. Neither `/media/` nor the local storage volume is publicly served.
- Only the trusted gateway may reach the frontend/backend containers. It overwrites the client-IP header. Exposing them directly would invalidate the proxy trust assumptions.

## API contract

Paths below refer to Django. Direct non-browser clients authenticate with `Authorization: Bearer <access>`. The browser calls the same paths through the BFF, except explicit refresh is blocked and handled internally. Direct login/registration return JWT pairs; BFF login/registration return only `{ "authenticated": true }`.

| Method | Path | Behavior |
|---|---|---|
| POST | `/api/v1/auth/register/` | email/password registration |
| POST | `/api/v1/auth/token/` | login using `username` (email) and `password` |
| POST | `/api/v1/auth/token/refresh/` | direct-client refresh; BFF-managed for browsers |
| GET | `/api/v1/auth/me/` | authenticated identity |
| POST | `/api/v1/auth/logout/` | refresh revocation; token possession required |
| GET, POST | `/api/v1/sessions/` | list own sessions / create with greeting |
| GET | `/api/v1/sessions/{id}/history/` | latest 50 messages, session, diagnosis, booking, older cursor |
| POST | `/api/v1/chat/` | `session_id`, `content` and/or `media_id` |
| POST | `/api/v1/upload/authorize/` | authenticated ticket for a declared `mime_type` and byte `size`; 120-second validity |
| POST | `/api/v1/upload/` | multipart `file`; returns protected relative URL and media ID |
| GET | `/api/v1/media/{id}/` | authenticated private file stream, or 302 to short-lived S3-compatible storage URL |
| POST | `/api/v1/diagnosis/` | `session_id`; requires completed intake; returns existing diagnosis on repeat |
| POST | `/api/v1/booking/` | `session_id`, future ISO `scheduled_at`; diagnosed, unbooked sessions only |
| GET | `/api/v1/booking/{id}/` | owner-only booking |
| GET | `/health/live/`, `/health/ready/` | public process and DB/cache health; not an AI-provider check |

List sessions with `?page=1&status=in_progress&search=...`. Search/filtering is server-side; activity ordering uses update time and ID. Retrieve earlier messages with `?before=<older_cursor>`; returned message batches remain chronological.

Chat, diagnosis and booking accept a UUID `Idempotency-Key`. The UI always supplies one and reuses it for unchanged retries. Successful replays return the stored response with `Idempotency-Replayed: true`; reusing a key with a changed payload returns 409. Keys are scoped to user and operation kind and retained 30 days when cleanup runs. Direct callers omitting the header get no retry replay guarantee.

A 120-second session lease prevents simultaneous mutations. Provider work runs outside database transactions; short final transactions lock and fence writes. PostgreSQL uniqueness/check constraints enforce one diagnosis and booking per session, valid statuses and confidence range. This does **not** promise exactly-once external billing across crashes or ambiguous network failures.

Expected failures use `{detail, code, request_id, errors?}`; BFF-originated errors have `detail` and `code`. Relevant codes include `session_busy`, `operation_expired`, `idempotency_conflict`, `invalid_media`, `intake_incomplete`, `ai_not_configured`, `ai_budget_exceeded`, `ai_unavailable` and `ai_invalid_response`. Preserve the same request key when retrying an unchanged mutation after a network failure. Do not blindly retry 400/401/403.

## Uploads and AI cost controls

**Validation:** JPEG/PNG/WebP still images up to 7 MiB and 16 megapixels; MP3/WAV/OGG/audio-WebM and MP4/video-WebM up to 15 MiB and 60 seconds. Pillow verifies image contents; ffprobe checks container, stream types and duration. Claimed MIME alone is insufficient. Storage names use UUIDs and safe extensions. On Vercel, JSON ticket requests remain cookie-authenticated through the BFF; uploads use `X-Upload-Token` directly against Render without cookies/JWTs. Account/MIME/size binding, signature/expiry checks and shared-cache replay checks precede normal file validation. This is format validation, not malware scanning or comprehensive media sanitization.

**Deterministic intake:** symptom, vehicle, year and onset are required. Keyword/regex extraction, expected year/onset replies, state transitions and post-diagnosis conversation do not call Gemini. Only ambiguous classification, relevant media and final assessment do.

**Provider controls:**

- Versioned prompts treat user/media content as untrusted. Diagnosis output is strict JSON with bounded strings and finite confidence in `[0,1]`; malformed output is rejected before persistence.
- SDK retries are disabled. The wrapper permits at most two retries, only for transient errors, with backoff; permanent provider errors do not retry.
- Each attempt has at most 12 seconds, each generation at most 40 seconds, and a chat/diagnosis AI context has a shared 60-second deadline. The BFF upstream deadline is 70 seconds.
- Daily UTC attempt reservations are transactional: default **100/user** and **2,000/global**, configurable in the backend. Retries count. Token usage is recorded when the provider supplies it. These are attempt budgets, **not dollar ceilings**; configure provider-side spend limits too.
- Media analysis is cached by media ID, model and prompt version. Same-owner sequential uploads are SHA-256 deduplicated. Concurrent identical uploads can still create separate rows; there is no global/user-crossing cache.
- Endpoint limits default to 20 AI requests/min/user, 30 uploads/hour/user, 120 general requests/min/user and 10 auth requests/min/IP. DRF cache throttles are approximate under races, not a substitute for edge abuse protection. Production requires shared Redis; transactional daily AI quotas provide the hard call reservation boundary on PostgreSQL.

The composer retains editable text/attachment on send failure, shows pending work, and disables duplicate submission while pending. History pagination, keyboard-managed mobile dialogs, status filtering and booking-state messaging are covered by browser regressions. Drafts are in-memory, not an offline/local-storage feature.

## Verification

```bash
cd backend
source .venv/bin/activate
ruff check . && black --check .
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py spectacular --validate --fail-on-warn --file /tmp/schema.yml
pytest
# Use a dedicated test PostgreSQL account allowed to create test databases:
DATABASE_URL=postgresql://USER:PASSWORD@HOST/pitstop pytest
pip-audit -r requirements.txt

cd ../frontend
npm run lint
npm run typecheck
npm run test:proxy
npm audit --omit=dev --audit-level=high
NEXT_PUBLIC_DIRECT_API_URL=http://127.0.0.1:8000 npm run build
npx playwright install --with-deps chromium
# Starts both servers; ports 8000/3000 must be free and local DB migrated:
PATH="../backend/.venv/bin:$PATH" CI=1 NEXT_PUBLIC_DIRECT_API_URL=http://127.0.0.1:8000 npm run test:e2e
```

Without `CI=1`, Playwright expects already-running servers; optional `PREVIEW_URL` changes the frontend URL. Use an empty provider key and a disposable local database. CI raises **only the test server's** auth limit because many accounts share one test IP; never copy that override into production.

The backend suite blocks provider HTTP calls. Browser tests exercise real cookie auth, refresh, private attachments, intake, failure recovery and navigation. The diagnosed-to-booking browser fixture is mocked; backend tests separately enforce the real booking contract with Gemini mocked. See [verification notes](VERIFICATION.md) for results and unverified claims.

## Deployment and limits

For the selected free assignment stack, follow [Vercel + Render](deploy/VERCEL_RENDER.md). For a private Docker host, follow [the deployment and recovery runbook](deploy/README.md). There is no free-tier assumption: compute, persistent PostgreSQL, Redis, media capacity, backups and Gemini can all cost money. A BFF carries upload bodies and waits for AI, so serverless body-size/execution limits must be checked before moving it to Vercel or another function host.

SQLite is a single-writer development option; changing `DATABASE_URL` creates/uses a different database and does **not** move existing data. Production settings reject SQLite and process-local cache. Local media volumes suit one host; multiple application hosts need private shared storage such as S3. Enabling S3 does not migrate existing files.

Outstanding release evidence includes container-host rollout, restore drill, load/soak tests, independent security/accessibility review and live Gemini accuracy/safety evaluation. Booking is an internal request record; there is no mechanic dispatch/calendar integration, password recovery or email verification workflow. These are not silently simulated. The Pitstop identity is a presentation brand; `frontend/public/garage.jpg` is AI-generated artwork.
