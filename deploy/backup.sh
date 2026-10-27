#!/usr/bin/env bash
# Back up the live database and the legacy uploads folder, then PROVE the
# backup restores: load it into a scratch database and compare row counts.
# Read-only on the live database. Run on the KVM (as root or as postgres):
#   DB=findtern UPLOADS=/path/to/FindTern/uploads bash deploy/backup.sh
#
# Postgres on the KVM uses peer authentication on the local socket, so
# "pg_dump -U postgres" run as root is refused (SYS-19). Every Postgres
# command therefore runs AS the OS user PGUSER (default postgres) through
# sudo, unless the script already runs as that user. The dump file itself is
# written by the calling shell, so it stays in OUT with the caller's owner.
set -euo pipefail

DB="${DB:-findtern}"
PGUSER="${PGUSER:-postgres}"
UPLOADS="${UPLOADS:-}"
OUT="${OUT:-/root/findtern-backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TEST_DB="findtern_restore_test"

# Run a Postgres client as the database's OS user (peer auth).
pg() {
  if [[ "$(id -un)" == "$PGUSER" ]]; then
    "$@"
  else
    sudo -n -u "$PGUSER" -- "$@"
  fi
}

mkdir -p "$OUT"
DUMP="$OUT/$DB-$STAMP.dump"

echo "1/4 dumping $DB → $DUMP"
pg pg_dump -Fc --no-owner "$DB" > "$DUMP"
pg_restore --list "$DUMP" > /dev/null
echo "    $(du -h "$DUMP" | cut -f1), $(pg_restore --list "$DUMP" | grep -c 'TABLE DATA') tables"

if [[ -n "$UPLOADS" ]]; then
  echo "2/4 archiving uploads → $OUT/uploads-$STAMP.tar.gz"
  tar -czf "$OUT/uploads-$STAMP.tar.gz" -C "$(dirname "$UPLOADS")" "$(basename "$UPLOADS")"
else
  echo "2/4 UPLOADS not set, skipping file archive"
fi

echo "3/4 test restore into $TEST_DB"
pg dropdb --if-exists "$TEST_DB"
pg createdb "$TEST_DB"
# Fed on stdin: the postgres user may not be able to read a root-owned file.
pg pg_restore --no-owner -d "$TEST_DB" < "$DUMP"

echo "4/4 comparing row counts (live vs restored)"
counts() {
  pg psql -d "$1" -Atc "select string_agg(format('select %L, count(*) from %I', tablename, tablename), ' union all ') from pg_tables where schemaname='public'" \
    | pg psql -d "$1" -At | sort
}
# The site stays live during the dump, so a few new rows (signups,
# notifications) are normal; a table with far fewer rows restored is not.
if diff <(counts "$DB") <(counts "$TEST_DB") > "$OUT/restore-diff-$STAMP.txt"; then
  echo "OK: every table matches. Backup: $DUMP"
else
  echo "Tables that differ (live vs restored), check they're only recent activity:"
  cat "$OUT/restore-diff-$STAMP.txt"
fi
# Keep the restored copy for the migration rehearsal unless told otherwise.
if [[ "${KEEP_TEST_DB:-1}" == "1" ]]; then
  echo "Kept $TEST_DB for the rehearsal (drop it later with: sudo -u $PGUSER dropdb $TEST_DB)"
else
  pg dropdb "$TEST_DB"
fi
