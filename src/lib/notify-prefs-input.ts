import { z } from "zod";

/**
 * Body of POST /api/notifications/prefs. Strict: no user id (the row is always the session user's), no unknown
 * keys, at least one switch. Only the two optional-category switches exist; required mail has no switch to send.
 */
export const prefsBody = z
  .strictObject({
    emailMessages: z.boolean({ error: "Choose on or off." }).optional(),
    pushMessages: z.boolean({ error: "Choose on or off." }).optional(),
  })
  .refine((b) => b.emailMessages !== undefined || b.pushMessages !== undefined, { message: "Choose a setting to change." });

export type PrefsBody = z.infer<typeof prefsBody>;
