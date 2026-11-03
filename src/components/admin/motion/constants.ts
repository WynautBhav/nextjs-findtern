/**
 * The admin console's motion constants, one copy for every JS animation. They
 * mirror the CSS tokens in globals.css (`--ease-out-soft`, `--duration-admin-*`):
 * change them together. Durations are milliseconds; motion wants seconds, so
 * pass them through `seconds()`.
 *
 *   fast       120  hover, press, chip add and remove, the reduced-motion fade
 *   base       180  menus, the rail highlight, FLIP moves
 *   slow       260  dialog and sheet entry
 *   count      400  a figure ticking to a new value
 *   signature  600  the one move a page is allowed (a fill, a waterfall)
 */
export const ADMIN_EASE = [0.22, 1, 0.36, 1] as const;

export const ADMIN_DUR = { fast: 120, base: 180, slow: 260, count: 400, signature: 600 } as const;

export const seconds = (ms: number) => ms / 1000;
