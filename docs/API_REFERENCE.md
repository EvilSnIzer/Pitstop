# Pitstop API reference

## Documentation formats and base URLs

- **Machine-readable schema:** [openapi.yaml](openapi.yaml), exported from the current Django application and validated with warnings treated as errors.
- **Interactive Swagger UI:** `http://localhost:8000/api/docs/` after starting Django locally.
- **Runtime schema:** `http://localhost:8000/api/schema/`.
- **Direct local API base:** `http://localhost:8000/api/v1`.
- **Browser-facing local proxy:** `http://localhost:3000/api/v1`.
- **Permanent public API URL:** not deployed yet. Local URLs and temporary workspace previews are not permanent hosting.

The reference production gateway currently keeps Django's docs/admin private and sends application API traffic through the Next.js BFF. Publishing a separate bearer-auth API hostname requires configuring the gateway and allowed hosts as part of deployment; do not expose Gunicorn directly. The media endpoint supports a local binary response or an owner-authorized 302 redirect to an expiring private-storage read URL. The selected Render deployment publishes Django docs directly; its production admin routes are disabled.

## Authentication

### Direct Django clients

Register with `POST /auth/register/`:

```json
{"email":"driver@example.com","password":"<a strong, unique password>"}
```

Log in with `POST /auth/token/`:

```json
{"username":"driver@example.com","password":"<your password>"}
```

Direct registration/login return `access` and `refresh` JWTs; registration also includes the user email. Email identity is case-insensitive, and passwords are validated. Send `Authorization: Bearer <access>` for protected requests. Access tokens last 15 minutes; refresh tokens last 7 days.

Refresh with `POST /auth/token/refresh/` and `{"refresh":"<refresh token>"}`. Revoke a refresh token with `POST /auth/logout/` using the same body. Already-expired/revoked tokens are treated as successfully logged out. Logout does not invalidate a previously issued access token before its expiry.

### Browser application

The Next.js BFF uses HttpOnly cookies and returns only `{"authenticated":true}` on successful registration/login. Browser JavaScript never receives the JWT pair. It automatically refreshes access; explicit calls to `/auth/token/refresh/` through the BFF are blocked. Mutations require `X-Pitstop-Request: 1`; production also checks the exact configured Origin. Use the direct Django API for bearer-token integrations, not a browser proxy that intentionally ignores client-supplied Authorization.

## Endpoints

All paths in this table are relative to `/api/v1`. Application data is owner-scoped; an authenticated user cannot read another user's sessions, files or bookings.

| Method | Path | Request | Success |
|---|---|---|---|
| POST | `/auth/register/` | email, password | 201 token pair (direct API) |
| POST | `/auth/token/` | username/email, password | 200 token pair |
| POST | `/auth/token/refresh/` | refresh | 200 access token |
| GET | `/auth/me/` | — | 200 email |
| POST | `/auth/logout/` | refresh | 204 |
| POST | `/sessions/` | empty JSON object | 201 session with seeded greeting |
| GET | `/sessions/` | optional page/status/search query | 200 paginated session list |
| GET | `/sessions/{id}/history/` | optional before cursor | 200 history, session, diagnosis, booking |
| POST | `/upload/authorize/` | mime_type and size in bytes | 200 upload-only token, expires_in |
| POST | `/upload/` | multipart file | 201 media ID, private URL, MIME and size |
| GET | `/media/{id}/` | — | 200 protected stream or 302 signed private-storage URL |
| POST | `/chat/` | session_id; content and/or media_id | 200 assistant message and session |
| POST | `/diagnosis/` | session_id | 201 new / 200 existing diagnosis |
| POST | `/booking/` | session_id, scheduled_at | 201 pending booking |
| GET | `/booking/{id}/` | — | 200 booking |

Registration, login and refresh are necessarily public. Logout requires possession of the refresh token rather than a valid access token. `/health/live/` and `/health/ready/` are public outside `/api/v1`; readiness checks the database/cache, not Gemini availability.

### Sessions and history

```bash
# ACCESS_TOKEN is a token obtained locally; never commit it to source.
curl http://localhost:8000/api/v1/sessions/ \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' -d '{}'

curl 'http://localhost:8000/api/v1/sessions/?page=1&status=in_progress&search=12' \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Statuses are `in_progress`, `diagnosed` and `booked`. Session-list responses contain `count`, `next`, `previous` and `results`. Search/filtering is server-side. History returns the latest 50 messages plus `older_cursor`; request `/sessions/{id}/history/?before=<older_cursor>` to retrieve an earlier batch. Each returned batch is chronological.

### Chat and uploads

A chat request contains a session ID and text and/or an uploaded media ID:

```json
{"session_id":12,"content":"My 2019 Honda developed a knocking engine noise suddenly yesterday"}
```

Upload before sending a media-bearing message:

```bash
curl http://localhost:8000/api/v1/upload/ \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F 'file=@car.jpg;type=image/jpeg'
```

Use the returned `id` as `media_id` in `/chat/`. Upload metadata includes a protected relative `url`. When object storage is configured, an owner-authenticated GET redirects to a 60-second signed storage URL. This URL is a temporary read capability and must not be shared or logged. Direct clients must authenticate when retrieving that URL; browsers use BFF cookies.

Limits: JPEG/PNG/WebP still images up to 7 MiB and 16 megapixels; MP3/WAV/OGG/audio-WebM and MP4/video-WebM up to 15 MiB and 60 seconds. Pillow/ffprobe validate contents. Spoofed MIME types, corrupt images and invalid media are rejected. Private media responses use `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.

### Vercel direct-upload mode

An authenticated `POST /upload/authorize/` accepts `{"mime_type":"image/jpeg","size":5242880}` and returns `{"token":"<upload-only ticket>","expires_in":120}`. The browser obtains this through the cookie BFF, then uploads multipart data **directly to Render** with `X-Upload-Token: <ticket>` and no cookies/JWT. The token is usable only on `/upload/`, binds user/MIME/size, and is replay-checked in Redis. A retry obtains a new token. Tampered, expired, reused or inactive-account tickets are rejected; mismatched files return `400 upload_mismatch`. Actual MIME/size/duration validation still applies.

Django permits the configured frontend origin and upload header in CORS. Authentication/authorization do not depend on CORS alone. Normal direct JWT uploads remain supported, while local/Compose frontend uploads still use the BFF when `NEXT_PUBLIC_DIRECT_API_URL` is unset.

### Diagnosis and booking

Diagnosis requires all four intake slots: symptom, vehicle, year and onset. The session exposes `diagnosis_ready` as the server-owned eligibility flag.

```json
{"session_id":12}
```

`POST /diagnosis/` returns a persisted summary, recommended service and model confidence. Missing configuration returns a clear error rather than a fake assessment. Confidence is not a calibrated probability.

Booking requires a diagnosed, unbooked session and a future ISO-8601 timestamp:

```json
{"session_id":12,"scheduled_at":"<future timestamp with timezone, such as YYYY-MM-DDTHH:mm:ss+05:30>"}
```

The example timestamp is a placeholder: supply a real future timestamp. The response starts in `pending` status, and the session becomes `booked`. There is no mechanic dispatch or calendar-availability integration.

## Safe retries and concurrency

Supply a UUID `Idempotency-Key` on `/chat/`, `/diagnosis/` and `/booking/`. Reuse the same key only for an unchanged retry. Completed requests replay their stored response with `Idempotency-Replayed: true`; a changed body with the same key returns 409. Direct clients omitting the header have no retry-replay guarantee. Cleanup retains records for 30 days.

A session lease serializes mutations; competing work can return 409 `session_busy`. Final writes are transactional and reject superseded workers. Do not assume exactly-once external AI billing after network/process failures.

## Failures and limits

Expected Django errors follow this shape (fields vary by error):

```json
{
  "detail":"Please check the highlighted fields.",
  "code":"validation_error",
  "request_id":"<server-generated UUID>",
  "errors":{"password":["<validation message>"]}
}
```

BFF-originated errors include `detail` and `code`; upstream request IDs are forwarded when available.

| Status/code | Meaning / action |
|---|---|
| 400 `invalid_media`, `intake_incomplete`, validation errors | Fix the input; do not blindly retry |
| 401 | Authenticate/refresh; browser refresh is managed by the BFF |
| 403 `csrf_failed` | Browser mutation failed header/origin verification |
| 404 | Resource unavailable to this account, or route does not exist |
| 409 `session_busy`, `operation_expired` | Retry unchanged input/key after contention resolves |
| 409 `idempotency_conflict` | Key already belongs to a different body |
| 429 | Throttle or daily AI allowance exceeded; respect Retry-After when supplied |
| 502 `ai_invalid_response` | Provider returned invalid assessment; no diagnosis was saved |
| 503 `ai_not_configured`, `ai_configuration_error` | Owner must fix backend provider configuration |
| 503 `ai_unavailable`, `upstream_unavailable` | Transient service failure; preserve draft and retry deliberately |

Defaults: 20 AI-endpoint requests/minute/user, 30 uploads/hour/user, 120 general requests/minute/user and 10 auth requests/minute/IP. Transactional daily AI attempt budgets default to 100/user and 2,000/global; retries count. These are not dollar-spend guarantees. See [README](../README.md) for full timeouts, retention and cost-control limits.

## Regenerate the schema

From `backend/` with dependencies installed:

```bash
python manage.py spectacular --validate --fail-on-warn --file ../docs/openapi.yaml
```

The exported schema documents Django's direct API, not the BFF's deliberately different cookie-auth responses. Do not embed a real deployment credential into the schema or documentation.
