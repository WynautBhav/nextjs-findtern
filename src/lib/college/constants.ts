/**
 * Presence timing, shared by the server (scope.ts) and the student's
 * browser (college-live.tsx). Kept free of server imports so a client
 * component can read it.
 */

/** How often an open Findtern tab reports that the student is here. */
export const HEARTBEAT_MS = 30_000;
/** A student counts as online when their last heartbeat is this recent. */
export const ONLINE_WINDOW_MS = 75_000;
/** A call request lapses this long after its start time: past it the student can no longer accept it (meetings.ts). */
export const CALL_GRACE_MS = 10 * 60_000;
/** How long a drive call runs (meetings.ts books this slot on the calendar). */
export const MEETING_MINUTES = 20;
