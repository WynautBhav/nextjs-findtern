---
name: impeccable-audit
description: [Impeccable/Evaluate] Run technical quality checks across accessibility, performance, theming, responsive design, and anti-patterns. Generates a scored report with P0-P3 severity ratings and actionable plan. Use when the user wants an accessibility check, performance audit, or technical quality review. Invoke as /audit or via the impeccable-audit skill.
argument-hint: "[area (feature, page, component...)]"
license: Apache 2.0
version: 4.5.2
allowed-tools:
  - Bash(npx impeccable *)
  - Bash(.opencode/skills/impeccable/scripts/impeccable *)
---

# Impeccable — audit

Focused entry point for Impeccable `audit` (Evaluate). Part of Impeccable 4.5.2.
The full router and engine live in `.opencode/skills/impeccable/`; this wrapper keeps each function separately invocable.

> Report only — scored P0-P3 technical report, does not fix. Web routes here; ios/android/adaptive route to audit.native.md.

## Workflow

1. Run `.opencode/skills/impeccable/scripts/impeccable context --target <path>` once per session (cwd = project root, pass the target file/route). It loads PRODUCT.md, DESIGN.md, the surface brief, and native guidance; follow its directives and do not rerun it. On Windows shells without `sh`, use `.opencode/skills/impeccable/scripts/impeccable.cmd`. If the launcher fails, say so in a separate message first, then read PRODUCT.md/DESIGN.md directly and continue.
2. Load the playbook `.opencode/skills/impeccable/reference/audit.md` and follow it exactly. On native platforms (ios/android/adaptive) load `.opencode/skills/impeccable/reference/audit.native.md` instead. Inspect the target plus at least one source of incumbent visual truth (tokens, theme, CSS, component, or asset) before editing.
3. Skip craft-floor (planning/review only).
4. Respect Findtern constraints: keep PRODUCT.md/DESIGN.md briefs authoritative; theme tokens live in `src/app/globals.css`; use `container-page` / `section-y` rhythm (no new rhythm classes); prefer Watermelon registry primitives.
5. Verify in bounded passes (desktop + mobile together on web; shipped device classes on native), batch all fixes, confirm with at most one more pass, then stop. Never repair drift as a side effect — report `CONTEXT_STALE`, act only when asked (except findings marked `auto`).
