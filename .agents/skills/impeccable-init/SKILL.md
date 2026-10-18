---
name: impeccable-init
description: [Impeccable/Build] Sets up a project for impeccable. Runs a multi-round discovery interview when context is missing and writes PRODUCT.md (strategic: users, brand, principles); offers DESIGN.md (visual: colors, typography, components) when code exists; pre-configures live mode; then recommends the best commands to run next. Every other command reads these files before doing work. Use once per project. Invoke as /init or via the impeccable-init skill.
argument-hint: ""
license: Apache 2.0
version: 4.5.2
allowed-tools:
  - Bash(npx impeccable *)
  - Bash(.opencode/skills/impeccable/scripts/impeccable *)
---

# Impeccable — init

Focused entry point for Impeccable `init` (Build). Part of Impeccable 4.5.2.
The full router and engine live in `.opencode/skills/impeccable/`; this wrapper keeps each function separately invocable.

> Run once per project. Multi-round discovery interview writing PRODUCT.md (and DESIGN.md when code exists), then recommends next commands.

## Workflow

1. Run `.opencode/skills/impeccable/scripts/impeccable context --target <path>` once per session (cwd = project root, pass the target file/route). It loads PRODUCT.md, DESIGN.md, the surface brief, and native guidance; follow its directives and do not rerun it. On Windows shells without `sh`, use `.opencode/skills/impeccable/scripts/impeccable.cmd`. If the launcher fails, say so in a separate message first, then read PRODUCT.md/DESIGN.md directly and continue.
2. Load the playbook `.opencode/skills/impeccable/reference/init.md` and follow it exactly. Inspect the target plus at least one source of incumbent visual truth (tokens, theme, CSS, component, or asset) before editing.
3. Skip craft-floor (planning/review only).
4. Respect Findtern constraints: keep PRODUCT.md/DESIGN.md briefs authoritative; theme tokens live in `src/app/globals.css`; use `container-page` / `section-y` rhythm (no new rhythm classes); prefer Watermelon registry primitives.
5. Verify in bounded passes (desktop + mobile together on web; shipped device classes on native), batch all fixes, confirm with at most one more pass, then stop. Never repair drift as a side effect — report `CONTEXT_STALE`, act only when asked (except findings marked `auto`).
