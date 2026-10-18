#!/usr/bin/env bash
# Build and (re)start the new app from the staging branch. Run on the KVM:
#   APP_DIR=/srv/findtern-next BRANCH=staging bash deploy/release.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/findtern-next}"
BRANCH="${BRANCH:-staging}"
cd "$APP_DIR"

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
npm ci
npm run build

# Additive schema changes only; safe to re-run. Node reads .env itself
# (shell `source` breaks on values like SMTP_FROM=Findtern <…>).
node --env-file=.env --experimental-strip-types scripts/migrate.ts

pm2 startOrReload deploy/ecosystem.config.cjs --env production
pm2 save
echo "released $(git rev-parse --short HEAD)"
