#!/usr/bin/env bash
set -euo pipefail
# Free Render has no pre-deploy job: one backend instance runs migrations before serving.
python manage.py migrate --noinput
exec gunicorn config.wsgi:application \
  --bind "0.0.0.0:${PORT:-10000}" --workers 1 --threads 2 --timeout 80 \
  --access-logfile - --error-logfile - \
  --access-logformat '%(m)s %(U)s %(s)s %(L)s'
