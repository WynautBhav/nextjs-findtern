/**
 * The sidebar's collapsed/expanded choice, kept in a cookie so it survives a
 * reload and follows the reader across the intern, employer and admin consoles.
 *
 * This lives in a plain module on purpose. It cannot be exported from
 * `console-shell.tsx`: that file is `"use client"`, so a server layout that
 * imports the constant gets a client-reference proxy rather than the string,
 * the comparison is silently false, and the rail comes back expanded on every
 * load. Written and read from the same string, it behaves.
 */
export const RAIL_COOKIE = "ft_rail";

/**
 * Whether the Candidates filter column is hidden ("1") or shown, from lg up.
 * A plain module for the same reason as RAIL_COOKIE: the server page reads it
 * and the client toggle writes it, and both must see the same string.
 */
export const FILTER_PANEL_COOKIE = "ft_filters";
