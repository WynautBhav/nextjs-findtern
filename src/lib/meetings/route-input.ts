import { z } from "zod";

const wall = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
/** The employer's times as typed ("2026-11-03T15:30"): `slots: [...]` or the older slot1..slot3 fields. The count (exactly three) is judged by the service. */
export const slotsBody = z
  .object({ slots: z.array(wall).max(10).optional(), slot1: wall.optional(), slot2: wall.optional(), slot3: wall.optional() })
  .transform((b) => (b.slots ?? [b.slot1, b.slot2, b.slot3]).filter((s): s is string => Boolean(s)));

/** The reason is optional (bug sheet 25 Nov); the service judges its length. */
export const cancelBody = z.object({ reason: z.string().trim().max(1000).optional().default("") });
