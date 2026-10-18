---
name: impeccable-document
description: [Impeccable/Build] Generate a DESIGN.md file that captures the current visual design system. Auto-extracts colors, typography, spacing, radii, and component patterns from the codebase, then asks the user to confirm descriptive language for atmosphere and color character. Follows the Google Stitch DESIGN.md format so the file is tool-compatible. Use when you need a visual design spec an AI agent can follow to stay on-brand. Invoke as /document or via the impeccable-document skill.
argument-hint: ""
license: Apache 2.0
version: 4.5.2
allowed-tools:
  - Bash(npx impeccable *)
  - Bash(.opencode/skills/impeccable/scripts/impeccable *)
---

# Impeccable — document

Focused entry point for Impeccable `document` (Build). Part of Impeccable 4.5.2.
The full router and engine live in `.opencode/skills/impeccable/`; this wrapper keeps each function separately invocable.

> Planning/spec only — generates DESIGN.md from existing code. No UI edits.

## Workflow

1. Run `.opencode/skills/impeccable/scripts/impeccable context --target <path>` once per session (cwd = project root, pass the target file/route). It loads PRODUCT.md, DESIGN.md, the surface brief, and native guidance; follow its directives and do not rerun it. On Windows shells without `sh`, use `.opencode/skills/impeccable/scripts/impeccable.cmd`. If the launcher fails, say so in a separate message first, then read PRODUCT.md/DESIGN.md directly and continue.
2. Load the playbook `.opencode/skills/impeccable/reference/document.md` and follow it exactly. Inspect the target plus at least one source of incumbent visual truth (tokens, theme, CSS, component, or asset) before editing.
3. Skip craft-floor (planning/review only).
4. Respect Findtern constraints: keep PRODUCT.md/DESIGN.md briefs authoritative; theme tokens live in `src/app/globals.css`; use `container-page` / `section-y` rhythm (no new rhythm classes); prefer Watermelon registry primitives.
5. Verify in bounded passes (desktop + mobile together on web; shipped device classes on native), batch all fixes, confirm with at most one more pass, then stop. Never repair drift as a side effect — report `CONTEXT_STALE`, act only when asked (except findings marked `auto`).
