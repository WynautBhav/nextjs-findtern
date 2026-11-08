import { z } from "zod";

/** Body of POST /api/intern/presence-visibility. Strict: no user id, no extra keys. */
export const visibilityBody = z.strictObject({
  showActivity: z.boolean({ error: "Choose on or off." }),
});
