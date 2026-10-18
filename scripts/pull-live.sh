#!/usr/bin/env bash
# Copy the live database (and optionally the legacy uploads folder) from the
# KVM into a local Postgres database for testing. Read-only on the server.
#
#   LIVE_SSH=user@kvm-host            ssh target (required)
#   LIVE_DB=findtern                  database name on the server
#   LIVE_PG_USER=postgres             role pg_dump connects as on the server
#   LIVE_UPLOADS=/srv/findtern/uploads  legacy uploads dir (optional; skipped if unset)
#   LOCAL_DB_URL=postgresql://findtern:findtern_dev@localhost:5432/findtern_live
#
# Usage: npm run db:pull-live
set -euo pipefail

: "${LIVE_SSH:?set LIVE_SSH=user@host}"
LIVE_DB="${LIVE_DB:-findtern}"
LIVE_PG_USER="${LIVE_PG_USER:-postgres}"
LOCAL_DB_URL="${LOCAL_DB_URL:-postgresql://findtern:findtern_dev@localhost:5432/findtern_live}"

case "$LOCAL_DB_URL" in
  *@localhost*|*@127.0.0.1*) ;;
  *) echo "LOCAL_DB_URL must point at localhost" >&2; exit 1 ;;
esac

local_db="${LOCAL_DB_URL##*/}"
admin_url="${LOCAL_DB_URL%/*}/postgres"
dump="$(mktemp -t findtern-live.XXXXXX.dump)"
trap 'rm -f "$dump"' EXIT

echo "dumping $LIVE_DB from $LIVE_SSH …"
ssh "$LIVE_SSH" "pg_dump -U '$LIVE_PG_USER' -Fc --no-owner --no-privileges '$LIVE_DB'" > "$dump"

echo "recreating local database $local_db …"
psql "$admin_url" -v ON_ERROR_STOP=1 -q \
  -c "DROP DATABASE IF EXISTS \"$local_db\" WITH (FORCE)" \
  -c "CREATE DATABASE \"$local_db\""

echo "restoring …"
pg_restore --no-owner --no-privileges -d "$LOCAL_DB_URL" "$dump"

if [[ -n "${LIVE_UPLOADS:-}" ]]; then
  echo "syncing uploads → .legacy-uploads/ …"
  rsync -az --delete "$LIVE_SSH:${LIVE_UPLOADS%/}/" ./.legacy-uploads/
fi

echo "done. Next: DATABASE_URL=$LOCAL_DB_URL npm run db:migrate"
