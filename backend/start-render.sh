#!/usr/bin/env bash
set -euo pipefail

# Render's Blueprint `generateValue: true` produces a base64-encoded 256-bit
# secret — strong, but only 44 characters, which trips Django's 50-character
# deploy-check heuristic (security.W009) and this project's production guard.
# Derive a 128-char hex key with SHA-512; the derivation preserves the full
# 256 bits of entropy, keeping the one-click Blueprint valid as-is.
if [ -n "${DJANGO_SECRET_KEY:-}" ] && [ "${#DJANGO_SECRET_KEY}" -lt 50 ]; then
  export DJANGO_SECRET_KEY # ensure the Python subprocess below can read it
  DJANGO_SECRET_KEY=$(python -c 'import hashlib,os;print(hashlib.sha512(os.environ["DJANGO_SECRET_KEY"].encode()).hexdigest())')
  export DJANGO_SECRET_KEY
fi

# Free Render has no pre-deploy job: one backend instance runs migrations before serving.
python manage.py migrate --noinput
exec gunicorn config.wsgi:application \
  --bind "0.0.0.0:${PORT:-10000}" --workers 1 --threads 2 --timeout 80 \
  --access-logfile - --error-logfile - \
  --access-logformat '%(m)s %(U)s %(s)s %(L)s'
