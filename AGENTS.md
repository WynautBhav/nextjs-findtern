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

