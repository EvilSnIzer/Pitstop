#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
umask 077
stamp=$(date -u +%Y%m%dT%H%M%SZ)
folder="backups/$stamp"
mkdir -p "$folder"
git rev-parse HEAD > "$folder/revision.txt"
docker compose images --format json > "$folder/images.json"
# Stop writes so the database dump and media archive describe the same app state.
docker compose stop backend
trap 'docker compose start backend' EXIT
docker compose exec -T db pg_dump -U pitstop -Fc pitstop > "$folder/database.dump"
docker compose run --rm --no-deps -T backend tar -C /app/media -czf - . > "$folder/media.tar.gz"
sha256sum "$folder/database.dump" "$folder/media.tar.gz" > "$folder/SHA256SUMS"
printf 'Backup created: %s\nCopy it to encrypted off-host storage and verify a restore.\n' "$folder"
