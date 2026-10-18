---
name: impeccable-typeset
description: [Impeccable/Enhance] Improves typography by fixing font choices, hierarchy, sizing, weight, and readability so text feels intentional. Use when the user mentions fonts, type, readability, text hierarchy, sizing looks off, or wants more polished, intentional typography. Invoke as /typeset or via the impeccable-typeset skill.
argument-hint: "[target]"
license: Apache 2.0
version: 4.5.2
allowed-tools:
  - Bash(npx impeccable *)
  - Bash(.opencode/skills/impeccable/scripts/impeccable *)
---

# Impeccable — typeset

Focused entry point for Impeccable `typeset` (Enhance). Part of Impeccable 4.5.2.
The full router and engine live in `.opencode/skills/impeccable/`; this wrapper keeps each function separately invocable.

## Workflow

1. Run `.opencode/skills/impeccable/scripts/impeccable context --target <path>` once per session (cwd = project root, pass the target file/route). It loads PRODUCT.md, DESIGN.md, the surface brief, and native guidance; follow its directives and do not rerun it. On Windows shells without `sh`, use `.opencode/skills/impeccable/scripts/impeccable.cmd`. If the launcher fails, say so in a separate message first, then read PRODUCT.md/DESIGN.md directly and continue.
2. Load the playbook `.opencode/skills/impeccable/reference/typeset.md` and follow it exactly. Inspect the target plus at least one source of incumbent visual truth (tokens, theme, CSS, component, or asset) before editing.
3. After analysis is resolved, read `.opencode/skills/impeccable/reference/craft-floor.md` immediately before any UI edit (quality floor + absolute bans).
4. Respect Findtern constraints: keep PRODUCT.md/DESIGN.md briefs authoritative; theme tokens live in `src/app/globals.css`; use `container-page` / `section-y` rhythm (no new rhythm classes); prefer Watermelon registry primitives.
5. Verify in bounded passes (desktop + mobile together on web; shipped device classes on native), batch all fixes, confirm with at most one more pass, then stop. Never repair drift as a side effect — report `CONTEXT_STALE`, act only when asked (except findings marked `auto`).
