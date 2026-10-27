import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { CALENDAR_TOKEN_OWNER, calendarConfig } from "@/lib/google";

/** Whether Findtern's own Google calendar is connected. null = couldn't check. */
export async function calendarConnected(): Promise<boolean | null> {
  try {
    const [token] = await getDb()
      .select({ refresh: schema.employerGoogleTokens.refreshToken })
      .from(schema.employerGoogleTokens)
      .where(eq(schema.employerGoogleTokens.employerId, CALENDAR_TOKEN_OWNER))
      .limit(1);
    return Boolean(token?.refresh);
  } catch (e) {
    console.error("[calendar] token check failed", e);
    return null;
  }
}

/**
 * Whether meeting links can't be made right now (QA-001): Google is
 * configured but nobody connected the calendar, or production has no Google
 * config at all. Interviews and campus-drive calls both depend on it. Dev
 * without Google uses a stand-in link, so it isn't flagged there.
 */
export async function calendarMissing(): Promise<boolean> {
  if (!calendarConfig()) return process.env.NODE_ENV === "production";
  return (await calendarConnected()) === false;
}
