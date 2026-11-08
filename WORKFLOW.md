# Workflow

Master is the only long-lived branch. Everything else is a short-lived branch in its own worktree, merged straight back and deleted.

## Rules

1. **One task = one branch = one worktree** at `~/wt/findtern/<slug>`.
2. **Branch names:** `feat/<slug>`, `fix/<slug>`, `ui/<slug>`, `chore/<slug>`. Lowercase, at most 4 words in the slug.
3. **Start from fresh `origin/master`.** Never continue in an old worktree or on an old branch.
4. **Lifetime:** at most 3 days or about 400 changed lines. Split anything bigger into tasks that each land on their own.
5. **Merge:** rebase on `origin/master`, then fast-forward only. No merge commits, no squash-of-a-week, no WIP commits on master.
6. **Gates** are the ones in `.github/workflows/ci.yml`, run before merging: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run test:security`, `npm run build`. Run `npm run e2e` (and the matching `test:e2e:*`) when the change touches a flow they cover. CI runs the full set again on the push.
7. **On merge, delete the branch and the worktree the same day.** `scripts/wt.sh done` does it.
8. **No force push, ever.** No `--no-verify`. If a push is rejected, fetch, rebase and rerun the gates.
9. **No stray probe scripts.** Throwaway `.mjs`/`.ts` checks go in `scratch/` (gitignored) and are deleted with the worktree. Never leave `.something.mjs` files in a worktree root.

## Migrations

- **Vercel runs `scripts/migrate.ts` on every build** (`vercel.json` buildCommand). A merge to master migrates whatever database Vercel points at. Treat each migration as a production change.
- Take **only the next number on master** (`drizzle/NNNN_<name>.sql`). Rebase first; if someone else landed that number, renumber.
- Every migration has a matching `drizzle/rollback/NNNN_<name>.down.sql`.
- Test the migration, the rollback, and a re-migrate on a **local scratch Postgres**. Assert the host is `localhost` before running anything. Never run against Neon, `.env.production`, or the staging workflows.
- `scripts/migrate.ts` records migrations by file name and makes statements idempotent. Two branches that both add the same table with different columns will silently skip one: do not carry a schema branch around, land it first.

## Helper

`scripts/wt.sh` wraps the rules above.

```
scripts/wt.sh new <slug> [feat|fix|ui|chore] [--no-install]   # fetch, worktree + branch from origin/master, npm ci
scripts/wt.sh done <slug> [--skip-build] [--dry-run]          # fetch, rebase, gates, y/N, ff-only push, remove worktree + branch
```

`done` stops on a dirty tree, a rebase conflict, a failed gate, or a new migration that is not the next number or has no rollback. It warns past 3 days or 400 lines. `--dry-run` prints what it would do and pushes nothing. `--skip-build` skips only `npm run build`.

Set `WT_ROOT` to use a different worktree folder. The gates run with the throwaway values from `ci.yml`, never your `.env.local`.
