/**
 * The admin panel look: a white (dark: one step lifted) rounded card on the frame, no shadow.
 * The edge is transparent in the light theme and a 1px rule in the dark one, both from
 * `--admin-panel-edge`. Tokens only, so it flips with the admin theme.
 */
export const ADMIN_SURFACE =
  "rounded-[var(--radius-admin-card)] border border-[color:var(--admin-panel-edge)] bg-[color:var(--admin-panel)] shadow-[var(--admin-shadow)]";

/**
 * Rounded-md shapes for page and panel actions, applied to `ButtonLink` / `ButtonAnchor` via `className`
 * (no new button variants): `<ButtonLink variant="primary" className={ADMIN_PILL_PRIMARY}>`.
 * Primary is the filled brand button; secondary is a quiet outline button with a hover tone step.
 */
export const ADMIN_PILL_PRIMARY = "rounded-md px-5 shadow-none hover:shadow-none";
export const ADMIN_PILL_SECONDARY =
  "rounded-md border-ink-300 bg-transparent px-5 text-foreground shadow-none hover:border-ink-400 hover:bg-[color:var(--admin-panel-2)] hover:shadow-none";
