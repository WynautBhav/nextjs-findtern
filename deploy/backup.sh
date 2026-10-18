#!/usr/bin/env bash
# Back up the live database and the legacy uploads folder, then PROVE the
# backup restores: load it into a scratch database and compare row counts.
# Read-only on the live database. Run on the KVM:
#   DB=findtern PGUSER=postgres UPLOADS=/path/to/FindTern/uploads bash deploy/backup.sh
set -euo pipefail

DB="${DB:-findtern}"
PGUSER="${PGUSER:-postgres}"
UPLOADS="${UPLOADS:-}"
OUT="${OUT:-/root/findtern-backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TEST_DB="findtern_restore_test"
export PGUSER

mkdir -p "$OUT"
DUMP="$OUT/$DB-$STAMP.dump"

echo "1/4 dumping $DB → $DUMP"
pg_dump -Fc --no-owner "$DB" > "$DUMP"
pg_restore --list "$DUMP" > /dev/null
echo "    $(du -h "$DUMP" | cut -f1), $(pg_restore --list "$DUMP" | grep -c 'TABLE DATA') tables"

if [[ -n "$UPLOADS" ]]; then
  echo "2/4 archiving uploads → $OUT/uploads-$STAMP.tar.gz"
  tar -czf "$OUT/uploads-$STAMP.tar.gz" -C "$(dirname "$UPLOADS")" "$(basename "$UPLOADS")"
else
  echo "2/4 UPLOADS not set, skipping file archive"
fi

echo "3/4 test restore into $TEST_DB"
dropdb --if-exists "$TEST_DB"
createdb "$TEST_DB"
pg_restore --no-owner -d "$TEST_DB" "$DUMP"

echo "4/4 comparing row counts (live vs restored)"
counts() {
  psql -d "$1" -Atc "select string_agg(format('select %L, count(*) from %I', tablename, tablename), ' union all ') from pg_tables where schemaname='public'" \
    | psql -d "$1" -At | sort
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
  echo "Kept $TEST_DB for the rehearsal (drop it later with: dropdb $TEST_DB)"
else
  dropdb "$TEST_DB"
fi
