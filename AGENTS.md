<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Findtern project rules

- **Read `ARCHITECTURE.md` and `SPECS.md` before changing code.** They are the locked plan; `SPECS.md` replaces `DESIGN.md`.
- Mutating route handlers MUST start with `requireMutation({ req, roles, ownerId? })` from `src/lib/guards-mutation.ts`. No hand-rolled auth checks.
- Never port legacy defects from `/home/wynautbhav/FindTern`: plaintext passwords, unauthenticated `/uploads` static, `/api/interns` IDOR.
- Marketing pages read through `src/lib/content` accessors (async, DB-backed with TS fallback). Do not import `src/lib/content/*.ts` data files directly from pages.
- Theme tokens live in `src/app/globals.css`. App surfaces should use the same layout utilities as marketing (`container-page`, `section-y`). Do not invent new rhythm classes.
- UI primitives come from Watermelon registry (`@watermelon` in `components.json`). Install via `npx shadcn@latest add https://registry.watermelon.sh/r/<name>.json`.
- Verify with: `npx tsc --noEmit` → `npm run lint` → `npm test` → `npm run db:verify`.


## Agent workflow (plan, build, verify)

The main chat runs on Sonnet. For work that spans several files or areas, use named agents from `.gg/agents/` through the `subagent` tool (not `spawn_agent`, which only offers the built-in names and caps at 8):

1. **Plan:** call `opus-planner` (Opus, read-only). Spawn exactly one at the start. It returns a plan with file ownership per task, then ends.
2. **Build:** call `sonnet-builder` (Sonnet), at most **6 `subagent` calls in one reply**, all in the same turn so they run in parallel. Give each one its own files, a standalone brief and acceptance criteria. Never let two builders edit the same file. One builder owns each new `drizzle/` migration.
3. **Verify:** call `opus-reviewer` (Opus, read-only) on the integrated diff. It runs `npx tsc --noEmit`, `npm run lint` and `npm test`. Fix its findings before committing.

Skip the Opus steps for small, clear fixes. Review each builder's diff before the next wave.
