# Deployment, maintenance and recovery

For the selected job-assignment setup, use the [one-click all-Render free deployment](RENDER_ONE_CLICK.md) (website, API, Postgres and Redis all on Render; the earlier [Vercel + Render variant](VERCEL_RENDER.md) remains documented as an alternative). This document covers the single-host Compose stack. Its local-volume backup script does not back up hosted Supabase storage.

This is a **single-host** reference deployment, not an HA design or proof of a completed rollout. Container builds and Compose validation are CI jobs; a cloud deployment, load test and restore drill must still be performed. Do not publish the development servers, SQLite database or local test database credentials.

## 1. Prepare the host and release

Use a maintained Linux host with Docker Engine and Compose v2, sufficient persistent disk, DNS and outbound HTTPS to the AI provider. Expose only TCP 80/443; restrict SSH to operators. No frontend, Django, Redis or PostgreSQL port is published by this manifest. Do not add public port mappings for troubleshooting.

1. Check out a reviewed, clean release commit. Back up the current release before changing it.
2. Point a real DNS hostname at the host. Caddy obtains HTTPS certificates; placeholder/example domains will not work.
3. Copy `deploy/.env.example` to `deploy/.env`, restrict it with `chmod 600 .env`, and fill values locally. Generate **separate** random secrets, for example `python -c 'import secrets; print(secrets.token_hex(32))'`. `POSTGRES_PASSWORD` must be URL-safe because it is embedded in a database URL. Never commit this file or send keys through the browser.
4. Choose AI attempt limits and set provider-side spending alerts/limits. An empty Gemini key permits intake but not diagnosis.
5. Check host capacity and costs. There is no free-tier guarantee. Record tested container image IDs/digests; pin these for a controlled rollout rather than assuming mutable image tags are reproducible.

From `deploy/`:

```bash
docker compose config --quiet
docker compose build --pull
# Database and cache first; application startup does NOT auto-run migrations.
docker compose up -d db redis
docker compose run --rm backend python manage.py check --deploy --fail-level WARNING
docker compose run --rm backend python manage.py migrate --noinput
docker compose up -d
docker compose ps
```

Do not run multiple migration jobs simultaneously. Existing case-insensitive duplicate email identities intentionally block the email migration; inspect and resolve these with the account owners rather than silently merging/deleting users. Database constraint migrations similarly require inconsistent legacy data to be reviewed.

`APP_ENV=production` enforces PostgreSQL, Redis, non-debug Django, an explicit host list and a long non-default secret. Compose configures the BFF's exact `APP_ORIGIN` and secure cookies. Production cookies use SameSite=Lax; mutation Origin and a custom header are checked. BFF/backend trust only gateway-controlled proxy headers. The internal database connection uses `DB_SSLMODE=disable` on the isolated Compose network; a managed/external database should use verified TLS instead.

### Post-deploy smoke checks

- Check `/health/live/` and `/health/ready/` over the public HTTPS hostname. Readiness checks database/cache, **not** AI availability or quality.
- Register a disposable test account, sign out/in, create a session and send deterministic intake answers. Verify the browser cannot read token cookies or receive JWT JSON.
- Upload a harmless supported image; verify an anonymous/different account cannot read its URL. `/media/...` must not be public.
- With an approved provider budget, perform one real diagnosis using a harmless fixture. Confirm useful schema-valid output and honest UI state. Test booking as a request, not an automatically confirmed appointment.
- Record version, image IDs, test time and results. Delete disposable data through the operator process, not ad-hoc broad SQL.

The stack has two Gunicorn workers with four threads each; this is a starting configuration, **not a measured capacity promise**. Profile provider latency, memory during uploads and database contention before increasing concurrency. Synchronous media/AI calls occupy request capacity. For higher load, a separately designed job queue and asynchronous UI may be necessary.

## 2. Private media and storage

The default `media` volume is mounted only into Django, under `/app/media`. Caddy/Next never serve that directory. Files are streamed through authenticated owner checks. Watch disk space and inode use: upload throttles do not create a total storage quota.

To use S3, pass `AWS_STORAGE_BUCKET_NAME` and an appropriate AWS region/credential source to **Django**, use an IAM role where available, enable S3 Block Public Access, least-privilege bucket access, encryption and versioning. The application still returns protected API URLs, not public object URLs. Keep object versions long enough to match your database recovery points. An S3 deployment requires a separate object backup/recovery procedure; the local-volume backup script below does not back up S3.

Enabling S3 does not copy existing files. Changing `DATABASE_URL` does not migrate SQLite records to PostgreSQL. For either move, stop writes, rehearse data transfer with an isolated copy, preserve foreign keys/file names, validate row/file counts and reset database sequences before cutover.

## 3. Logs, alerts and routine jobs

```bash
docker compose logs --since 30m backend frontend gateway
docker compose run --rm backend python manage.py cleanup           # dry run
docker compose run --rm backend python manage.py cleanup --apply   # reviewed deletion
docker compose run --rm backend python manage.py flushexpiredtokens
```

Schedule cleanup and expired-token removal daily after verifying the retention policy. Cleanup removes idempotency records older than 30 days, AI counters older than 90 days and uploads older than one day with no attached messages. It locks/rechecks media rows, skips active analyses and coordinates with chat attachment commits. Database deletion commits before file deletion; a storage deletion failure leaves an unreferenced blob, not a broken retained message. Investigate a failed command and its logged orphan filename, then remove that unreferenced blob through the storage operator process. Attached media/conversations are not automatically expired; define consent/deletion/retention policy before onboarding real customers.

Monitor and alert on:

- readiness failures, request 5xx/latency, 429 spikes and repeated provider failures;
- database connections, lock waits, volume capacity/inodes and backup age;
- `DailyAIUsage` attempts/token counts, provider billing and global-budget exhaustion;
- TLS renewal and host/container security updates.

Application logs contain generated request IDs, method/path/status and AI metadata, not request bodies, tokens or media. Do not enable verbose SDK/body logging in production. `DailyAIUsage` records provider-reported prompt/output tokens but does not compute spend or guarantee accounting of provider-internal tokens. No hosted alerting system is provisioned here; connect one and test that alerts reach an operator.

Use private network/VPN access for Django admin; the public gateway does not route `/admin/`. A shop operator can review booking records there. There is no dispatch, calendar capacity check or customer email workflow.

## 4. Backup

Backups contain sensitive customer data. Restrict access, encrypt off-host copies and protect encryption keys separately. A backup on the same disk is not disaster recovery.

`backup.sh` requires a maintenance window: it stops the API to keep the PostgreSQL dump and local-media archive consistent, then restarts it even if the script fails. The UI can show temporary service errors during that window.

```bash
cd deploy
./backup.sh
# Preserve the returned backups/<UTC timestamp>/ directory and its relative paths.
sha256sum -c backups/<UTC timestamp>/SHA256SUMS
```

The directory includes a custom-format PostgreSQL dump, media archive, checksums, release revision and container-image information. Confirm the release working tree is clean before treating its revision as a reproducible source reference. Copy the entire directory to encrypted off-host storage; record successful copy/checksum verification. Select a backup interval from an agreed RPO. RTO is **unknown until measured in a restore drill**.

For managed PostgreSQL/S3, use service-native encrypted snapshots/PITR and object versioning with a rehearsed consistency/recovery plan instead of assuming this local-volume script covers them.

## 5. Restore drill — isolated host only

**These commands replace application state. Use a fresh, isolated recovery host/project, not the live stack.** Use the same release commit and PostgreSQL major version as the backup first. Confirm sufficient disk, the backup's provenance and checksums, required secrets, and an operator-approved recovery point. Keep public traffic disabled until validation is complete.

1. Restore the original `backups/<timestamp>/` path under the recovery host's `deploy/` directory. Restore protected deployment configuration through your secret-management process.
2. Build/check out the matching release, then create fresh PostgreSQL/Redis/media volumes. Do not reuse a live database or media volume.
3. From `deploy/`, execute:

```bash
snapshot=backups/<timestamp>
sha256sum -c "$snapshot/SHA256SUMS"
docker compose build
docker compose up -d db redis
# Wait for DB/cache healthy in `docker compose ps` before restoring.
docker compose exec -T db pg_restore -U pitstop -d pitstop \
  --clean --if-exists --no-owner --exit-on-error < "$snapshot/database.dump"
docker compose run --rm --no-deps -T backend \
  tar -xzf - -C /app/media < "$snapshot/media.tar.gz"
docker compose run --rm backend python manage.py check --deploy --fail-level WARNING
docker compose run --rm backend python manage.py migrate --check
```

4. Start the application behind restricted access. Verify representative accounts, session/message/booking counts, media readability and owner isolation. Check missing-file errors and private storage permissions. Use an empty/isolated provider key until intentionally conducting the paid smoke test.
5. Record restore duration, restored timestamp, checksums and functional results; compare against the agreed RPO/RTO. Resolve failures and repeat. Only an explicitly approved cutover should change DNS/public traffic.

Restoring an older backup also restores old refresh-token blacklist state: a token revoked after the backup might become valid again. Plan forced reauthentication by rotating the restored Django signing secret where appropriate; this invalidates existing JWTs and Django sessions. Do not confuse restoring Redis counters with restoring the transactional daily AI budget rows in PostgreSQL.

For application rollback, prefer a compatible previous image with the current schema. Destructive/irreversible schema changes require the tested database+media recovery procedure, not a casual `migrate <old number>`. New data written after a recovery point can be lost; obtain approval before rollback.

## Release evidence still required

- Successful CI container build and rollout on the intended host/network.
- Measured restore drill and scheduled encrypted off-host backups.
- Load/soak and failure-injection tests at the intended capacity.
- Independent security/accessibility review and real-provider safety/accuracy evaluation.

Passing unit/browser tests or `check --deploy` does not establish these operational facts.
