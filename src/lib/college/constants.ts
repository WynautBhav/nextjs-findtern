/**
 * Presence timing, shared by the server (scope.ts) and the student's
 * browser (college-live.tsx). Kept free of server imports so a client
 * component can read it.
 */

/** How often an open Findtern tab reports that the student is here. */
export const HEARTBEAT_MS = 30_000;
/** A student counts as online when their last heartbeat is this recent. */
export const ONLINE_WINDOW_MS = 75_000;
