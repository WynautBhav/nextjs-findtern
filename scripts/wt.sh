#!/usr/bin/env bash
# One task = one branch = one worktree. See WORKFLOW.md.
#
#   scripts/wt.sh new <slug> [feat|fix|ui|chore] [--no-install]
#   scripts/wt.sh done <slug> [--skip-build] [--dry-run]
#
# Env: WT_ROOT (default ~/wt/findtern), WT_REMOTE (origin), WT_BASE (master),
#      WT_GATES (override the gate command list; used to test this script).
set -euo pipefail

ROOT_DIR="${WT_ROOT:-$HOME/wt/findtern}"
REMOTE="${WT_REMOTE:-origin}"
BASE="${WT_BASE:-master}"
MAX_DAYS=3
MAX_LINES=400

die() { echo "wt: $*" >&2; exit 1; }
say() { echo "wt: $*"; }

main_repo() {
  local common
  common=$(git rev-parse --path-format=absolute --git-common-dir) || die "not inside a git repo"
  dirname "$common"
}

check_slug() {
  [[ "$1" =~ ^[a-z0-9]+(-[a-z0-9]+){0,3}$ ]] || die "slug '$1' must be lowercase words joined by '-', at most 4 words"
}

cmd_new() {
  local slug="${1:-}" type="feat" install=1
  [ -n "$slug" ] || die "usage: wt.sh new <slug> [feat|fix|ui|chore] [--no-install]"
  shift
  for a in "$@"; do
    case "$a" in
      feat|fix|ui|chore) type="$a" ;;
      --no-install) install=0 ;;
      *) die "unknown argument '$a'" ;;
    esac
  done
  check_slug "$slug"
  local repo path branch="$type/$slug"
  repo=$(main_repo)
  path="$ROOT_DIR/$slug"
  [ ! -e "$path" ] || die "$path already exists"
  git -C "$repo" show-ref --verify --quiet "refs/heads/$branch" && die "branch $branch already exists"
  git -C "$repo" fetch --prune "$REMOTE"
  mkdir -p "$ROOT_DIR"
  git -C "$repo" worktree add --no-track -b "$branch" "$path" "$REMOTE/$BASE"
  if [ "$install" = 1 ] && [ -f "$path/package-lock.json" ]; then
    (cd "$path" && npm ci --no-audit --no-fund)
  fi
  say "ready: cd $path   (branch $branch from $REMOTE/$BASE)"
  say "limits: $MAX_DAYS days or ~$MAX_LINES changed lines; finish with: scripts/wt.sh done $slug"
}

run_gates() {
  local skip_build="$1" dry="$2"
  local gates
  if [ -n "${WT_GATES:-}" ]; then
    gates="$WT_GATES"
  else
    gates="npx tsc --noEmit
npm run lint
npm test
npm run test:security"
    [ "$skip_build" = 1 ] || gates="$gates
npm run build"
  fi
  # Same throwaway values as .github/workflows/ci.yml; never a real database.
  export DATABASE_URL="postgresql://findtern:findtern_dev@localhost:5432/findtern"
  export SESSION_SECRET="ci-session-secret-0123456789-abcdefghijklmnop"
  export SIGNING_SECRET="ci-signing-secret-0123456789-abcdefghijklmnop"
  export NEXT_TELEMETRY_DISABLED=1 MAIL_MODE=log PAYMENTS_MODE=free SCHEDULERS=off
  local line
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    if [ "$dry" = 1 ]; then say "[dry-run] would run: $line"; continue; fi
    say "gate: $line"
    bash -c "$line" || die "gate failed: $line"
  done <<<"$gates"
}

check_migrations() {
  local wt="$1" f n max_master
  max_master=$(git -C "$wt" ls-tree --name-only "$REMOTE/$BASE" drizzle/ | sed -n 's|^drizzle/\([0-9]\{4\}\)_.*\.sql$|\1|p' | sort | tail -1)
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    n=$(basename "$f" | cut -c1-4)
    if [ -n "$max_master" ] && [ "$((10#$n))" -le "$((10#$max_master))" ]; then
      die "migration $f is not newer than master's latest ($max_master); renumber after rebasing"
    fi
    compgen -G "$wt/drizzle/rollback/${n}_*.down.sql" >/dev/null || die "migration $f has no drizzle/rollback/${n}_*.down.sql"
    say "WARNING: $f runs on every Vercel build (migrate-on-build). Test it and its rollback on a scratch DB, never Neon."
  done < <(git -C "$wt" diff --name-only --diff-filter=A "$REMOTE/$BASE"...HEAD -- 'drizzle/*.sql')
}

cmd_done() {
  local slug="${1:-}" skip_build=0 dry=0
  [ -n "$slug" ] || die "usage: wt.sh done <slug> [--skip-build] [--dry-run]"
  shift
  for a in "$@"; do
    case "$a" in
      --skip-build) skip_build=1 ;;
      --dry-run) dry=1 ;;
      *) die "unknown argument '$a'" ;;
    esac
  done
  check_slug "$slug"
  local repo path branch
  repo=$(main_repo)
  path="$ROOT_DIR/$slug"
  [ -d "$path" ] || die "no worktree at $path"
  branch=$(git -C "$path" symbolic-ref --short HEAD) || die "$path is on a detached HEAD"
  [ "$branch" != "$BASE" ] || die "refusing to finish $BASE"

  git -C "$path" fetch --prune "$REMOTE"
  [ -z "$(git -C "$path" status --porcelain --untracked-files=no)" ] || die "uncommitted changes in $path; commit or discard them"
  local untracked
  untracked=$(git -C "$path" ls-files --others --exclude-standard | wc -l)
  [ "$untracked" -eq 0 ] || say "WARNING: $untracked untracked file(s) in $path (stray probes?); they stay in the worktree and are lost when it is removed"

  local ahead
  ahead=$(git -C "$path" rev-list --count "$REMOTE/$BASE..HEAD")
  [ "$ahead" -gt 0 ] || die "$branch has no commits beyond $REMOTE/$BASE"

  # Size and age limits: warn loudly, the human decides whether to split.
  local lines first_ts age_days
  lines=$(git -C "$path" diff --numstat "$REMOTE/$BASE"...HEAD | awk '{a+=$1+$2} END{print a+0}')
  first_ts=$(git -C "$path" log --reverse --format=%ct "$REMOTE/$BASE..HEAD" | head -1)
  age_days=$(( ($(date +%s) - first_ts) / 86400 ))
  [ "$lines" -le "$MAX_LINES" ] || say "WARNING: $lines changed lines (limit ~$MAX_LINES); consider splitting"
  [ "$age_days" -le "$MAX_DAYS" ] || say "WARNING: first commit is $age_days days old (limit $MAX_DAYS)"

  if [ "$dry" = 1 ]; then
    say "[dry-run] would rebase $branch ($ahead commit(s), $lines lines) onto $REMOTE/$BASE"
    if ! git -C "$path" merge-tree --write-tree "$REMOTE/$BASE" HEAD >/dev/null 2>&1; then
      say "[dry-run] WARNING: rebase onto $REMOTE/$BASE would conflict"
    fi
  else
    say "rebasing $branch onto $REMOTE/$BASE"
    git -C "$path" rebase "$REMOTE/$BASE" || { git -C "$path" rebase --abort; die "rebase conflicted; resolve in $path, then rerun"; }
  fi

  check_migrations "$path"

  if [ "$dry" != 1 ] && [ ! -d "$path/node_modules" ] && [ -f "$path/package-lock.json" ] && [ -z "${WT_GATES:-}" ]; then
    (cd "$path" && npm ci --no-audit --no-fund)
  fi
  (cd "$path" && run_gates "$skip_build" "$dry")
  [ "$skip_build" = 0 ] || say "build skipped; e2e (npm run e2e) and the migrate/db:verify steps are left to CI or you"

  if [ "$dry" = 1 ]; then
    say "[dry-run] would ask y/N, then: git push $REMOTE HEAD:$BASE (no force), remove worktree $path, delete $branch"
    return 0
  fi

  local ans=""
  read -r -p "wt: push $branch ($ahead commit(s)) to $REMOTE/$BASE, ff-only? [y/N] " ans
  [ "$ans" = y ] || [ "$ans" = Y ] || die "not pushed; worktree and branch kept"
  git -C "$path" push "$REMOTE" "HEAD:refs/heads/$BASE" || die "push rejected (not a fast-forward?); rerun 'wt.sh done $slug'"

  git -C "$repo" fetch --prune "$REMOTE"
  git -C "$repo" merge-base --is-ancestor "$branch" "$REMOTE/$BASE" || die "$branch is not in $REMOTE/$BASE after push; leaving it"
  git -C "$repo" worktree remove "$path"
  git -C "$repo" branch -D "$branch" >/dev/null
  say "merged and removed: $path, branch $branch"
  # Keep the root checkout's master current when that is safe.
  if [ "$(git -C "$repo" symbolic-ref --short -q HEAD || true)" = "$BASE" ] &&
     [ -z "$(git -C "$repo" status --porcelain --untracked-files=no)" ]; then
    git -C "$repo" merge --ff-only "$REMOTE/$BASE" >/dev/null && say "root checkout $BASE fast-forwarded"
  else
    say "root checkout not on a clean $BASE; update it yourself"
  fi
}

case "${1:-}" in
  new) shift; cmd_new "$@" ;;
  done) shift; cmd_done "$@" ;;
  *) echo "usage: scripts/wt.sh new <slug> [feat|fix|ui|chore] [--no-install]"
     echo "       scripts/wt.sh done <slug> [--skip-build] [--dry-run]"
     exit 2 ;;
esac
