import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { DRIVE_SCOPE, type GoogleTokens } from "@/lib/google";
import { pickSlotToken, slotOwner, type GoogleSlot, type PickedToken } from "@/lib/google-connections-core";

/**
 * DB side of the two Google connection slots (rules in google-connections-core.ts).
 * Both slots are rows of `employer_google_tokens`, keyed by owner.
 */

const owner = (slot: GoogleSlot) => slotOwner(slot, process.env);

async function readRow(slot: GoogleSlot) {
  const [row] = await getDb()
    .select({ refreshToken: schema.employerGoogleTokens.refreshToken, scope: schema.employerGoogleTokens.scope })
    .from(schema.employerGoogleTokens)
    .where(eq(schema.employerGoogleTokens.employerId, owner(slot)))
    .limit(1);
  return row ?? null;
}

/** The token a slot uses now (Drive falls back to the calendar connection), or null. Throws if the DB can't be read. */
export async function loadSlotToken(slot: GoogleSlot): Promise<PickedToken | null> {
  const own = await readRow(slot);
  const calendar = slot === "drive" && !own?.refreshToken ? await readRow("calendar") : null;
  return pickSlotToken(slot, own, calendar);
}

/** Stores what Google granted for a slot. Needs a refresh token (the caller checks). */
export async function saveSlotToken(slot: GoogleSlot, t: GoogleTokens & { refresh_token: string }, fallbackScope: string): Promise<void> {
  const values = {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    // What Google actually granted: the person can untick a box on the consent screen.
    scope: t.scope ?? fallbackScope,
    tokenType: "Bearer",
    expiryDate: new Date(Date.now() + t.expires_in * 1000),
    updatedAt: new Date(),
  };
  await getDb()
    .insert(schema.employerGoogleTokens)
    .values({ employerId: owner(slot), ...values })
    .onConflictDoUpdate({ target: schema.employerGoogleTokens.employerId, set: values });
}

/** Drops the Drive slot's own account so Drive uses the calendar connection again. Calendar is never touched. */
export async function clearSlotToken(slot: "drive"): Promise<void> {
  await getDb().delete(schema.employerGoogleTokens).where(eq(schema.employerGoogleTokens.employerId, owner(slot)));
}

export type SlotStatus = { connected: boolean; own: boolean; hasDriveScope: boolean };

/** Connection state for the settings page and uploads. null = couldn't check. Never exposes tokens or accounts. */
export async function slotStatus(slot: GoogleSlot): Promise<SlotStatus | null> {
  try {
    const t = await loadSlotToken(slot);
    return {
      connected: Boolean(t),
      own: t?.source === "own",
      hasDriveScope: String(t?.scope ?? "").split(/\s+/).includes(DRIVE_SCOPE),
    };
  } catch (e) {
    console.error(`[google:${slot}] token check failed`, e);
    return null;
  }
}
