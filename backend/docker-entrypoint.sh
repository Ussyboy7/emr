#!/usr/bin/env bash
# Container entrypoint: fix ownership on volume mounts that may have been
# created by Docker (or by a prior root-run container) with an owner that
# differs from our app user, then drop privileges to `app` and exec the
# provided command.
#
# Why this exists: Docker named volumes and host bind-mounts don't honour
# image-time chown once real storage is attached. `collectstatic`, gunicorn
# log files, backups, and media uploads all fail with EACCES when the mount
# point is root-owned but the container runs as UID 1000. Fixing ownership
# at boot (as root) solves it without relying on the operator to chown things
# out-of-band after every deploy.

set -euo pipefail

# Only do the chown dance when we're actually starting as root. This keeps
# `docker run ... --user app` or local/dev scenarios working.
if [ "$(id -u)" = "0" ]; then
    for path in /app/logs /app/staticfiles /app/media /backups; do
        if [ -d "$path" ]; then
            chown -R app:app "$path" 2>/dev/null || true
        fi
    done
    exec gosu app "$@"
fi

exec "$@"
