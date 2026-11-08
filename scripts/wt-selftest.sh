#!/usr/bin/env bash
# Regression check for check_migrations in scripts/wt.sh. Uses a throwaway bare
# repo under $TMPDIR (never origin); `done --dry-run` pushes nothing.
#   bash scripts/wt-selftest.sh
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
T="$(mktemp -d "${TMPDIR:-/tmp}/wt-selftest.XXXXXX")"
trap 'rm -rf "$T"' EXIT
unset WT_GATES WT_ALLOW_CUSTOM_GATES
export WT_ROOT="$T/wt" GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

git init -q --bare -b master "$T/origin.git"
git clone -q "$T/origin.git" "$T/main" 2>/dev/null
cd "$T/main"
git checkout -q -b master
mkdir -p drizzle/rollback scripts
cp "$HERE/wt.sh" scripts/wt.sh
echo "select 1;" >drizzle/0001_a.sql
echo "select 1;" >drizzle/rollback/0001_a.down.sql
git add -A && git commit -q -m base && git push -q origin master

fail=0
# case <name> <expect pass|fail> <file...>   (each file is created in a branch off master)
run_case() {
  local name="$1" expect="$2"; shift 2
  git worktree add -q --no-track -b "t/$name" "$WT_ROOT/$name" origin/master
  (cd "$WT_ROOT/$name"; for f in "$@"; do mkdir -p "$(dirname "$f")"; echo "select 1;" >"$f"; done
   git add -A && git commit -q -m "$name")
  local out rc
  out=$(bash scripts/wt.sh done "$name" --dry-run 2>&1); rc=$?
  if { [ "$expect" = pass ] && [ $rc -eq 0 ]; } || { [ "$expect" = fail ] && [ $rc -ne 0 ]; }; then
    echo "ok   $name ($expect)"
  else
    echo "FAIL $name: expected $expect, rc=$rc"; echo "$out" | sed 's/^/     /'; fail=1
  fi
}

run_case rollback-only pass drizzle/rollback/0001_x.down.sql
run_case not-next fail drizzle/0001_dup.sql drizzle/rollback/0001_dup.down.sql
run_case next-with-rollback pass drizzle/0002_b.sql drizzle/rollback/0002_b.down.sql
run_case next-no-rollback fail drizzle/0002_c.sql
exit $fail
