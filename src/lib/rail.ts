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
