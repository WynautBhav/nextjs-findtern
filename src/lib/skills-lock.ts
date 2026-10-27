import { and, eq, inArray, notInArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { aiInviteHoldsSkills, DONE_STATUSES, hasAssessmentRating } from "@/lib/skills-lock-rules";

export { sameRatedSkills, sameSkills } from "@/lib/skills-lock-rules";

const AI_EMAIL = "ai-interview@findtern.ai";

/**
 * Whether an intern's skills are frozen.
 *
 * Legacy rule (onboarding.tsx:390-397, 520-563): the interview is set on the
 * skills the intern picked, so once an admin rating exists, or an AI
 * interview is still open, the skills step is read-only. Letting them change
 * afterwards would put unvetted skills next to a vetted score. A stale AI
 * invite (every slot passed) no longer holds the lock (see `aiInviteHoldsSkills`).
 */
export async function skillsLocked(
  db: ReturnType<typeof getDb>,
  internId: string,
  extraData: unknown,
  now: Date = new Date(),
): Promise<boolean> {
  if (hasAssessmentRating(extraData)) return true;

  const aiEmployers = await db
    .select({ id: schema.employers.id })
    .from(schema.employers)
    .where(eq(schema.employers.companyEmail, AI_EMAIL));
  const aiIds = ["admin", ...aiEmployers.map((e) => e.id)];

  const open = await db
    .select({
      status: schema.interviews.status,
      selectedSlot: schema.interviews.selectedSlot,
      slot1: schema.interviews.slot1,
      slot2: schema.interviews.slot2,
      slot3: schema.interviews.slot3,
    })
    .from(schema.interviews)
    .where(
      and(
        eq(schema.interviews.internId, internId),
        inArray(schema.interviews.employerId, aiIds),
        notInArray(schema.interviews.status, DONE_STATUSES),
      ),
    );
  return open.some((row) => aiInviteHoldsSkills(row, now));
}
