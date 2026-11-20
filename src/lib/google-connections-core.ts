/**
 * Pure rules for Findtern's two Google connection slots (no DB, no env reads at import).
 *
 *  - `calendar`: Meet links and Calendar events. Owner key = FINDTERN_GOOGLE_TOKEN_OWNER_ID (default "admin").
 *  - `drive`: storage for the redacted AI reports. Own owner key = FINDTERN_GOOGLE_DRIVE_TOKEN_OWNER_ID
 *    (default "admin:drive"). Until an admin wires a different Google account here, Drive uses the calendar
 *    connection, so nothing changes for today's single connection.
 *
 * Both slots live in `employer_google_tokens`, one row per owner key.
 */

export type GoogleSlot = "calendar" | "drive";

export const CALENDAR_OWNER_DEFAULT = "admin";
export const DRIVE_OWNER_DEFAULT = "admin:drive";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export type SlotEnv = Record<string, string | undefined>;

/** The `employer_google_tokens.employer_id` a slot is stored under. */
export function slotOwner(slot: GoogleSlot, env: SlotEnv = {}): string {
  if (slot === "drive") return env.FINDTERN_GOOGLE_DRIVE_TOKEN_OWNER_ID || DRIVE_OWNER_DEFAULT;
  return env.FINDTERN_GOOGLE_TOKEN_OWNER_ID || CALENDAR_OWNER_DEFAULT;
}

/** What a slot's consent screen asks for. Calendar keeps asking for both so one reconnect still covers Drive. */
export function slotScopes(slot: GoogleSlot): string[] {
  return slot === "drive" ? [DRIVE_FILE_SCOPE] : [CALENDAR_SCOPE, DRIVE_FILE_SCOPE];
}

export type TokenRow = { refreshToken: string | null; scope: string | null } | null | undefined;
export type PickedToken = { refreshToken: string; scope: string | null; source: "own" | "calendar-fallback" };

/** Which stored token a slot uses. Drive falls back to the calendar row; calendar never reads the Drive row. */
export function pickSlotToken(slot: GoogleSlot, ownRow: TokenRow, calendarRow: TokenRow): PickedToken | null {
  if (ownRow?.refreshToken) return { refreshToken: ownRow.refreshToken, scope: ownRow.scope ?? null, source: "own" };
  if (slot === "drive" && calendarRow?.refreshToken) {
    return { refreshToken: calendarRow.refreshToken, scope: calendarRow.scope ?? null, source: "calendar-fallback" };
  }
  return null;
}

/** Reads the slot out of the OAuth `state` (base64url JSON). Anything unreadable means `calendar`, the original flow. */
export function parseSlotState(raw: string | null | undefined): { slot: GoogleSlot; nonce?: string } {
  try {
    const s = JSON.parse(Buffer.from(raw ?? "", "base64url").toString()) as { role?: unknown; nonce?: unknown };
    return { slot: s.role === "drive" ? "drive" : "calendar", nonce: typeof s.nonce === "string" ? s.nonce : undefined };
  } catch {
    return { slot: "calendar" };
  }
}

/** `?slot=` from a request URL: only "drive" selects drive. */
export function slotFromParam(value: string | null | undefined): GoogleSlot {
  return value === "drive" ? "drive" : "calendar";
}
