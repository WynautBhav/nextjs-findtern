import { and, eq, inArray, notInArray, or } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";

const AI_EMAIL = "ai-interview@findtern.ai";
/** AI interview states that no longer hold the skills. */
const DONE = ["completed", "expired", "cancelled", "missed"];

/**
 * Whether an intern's skills are frozen.
 *
 * Legacy rule (onboarding.tsx:390-397, 4519): the interview is set on the
 * skills the intern picked, so once any admin rating exists, or an AI
 * interview is queued or scheduled, the skills step is read-only. Letting
 * them change afterwards would put unvetted skills next to a vetted score.
 */
export async function skillsLocked(
  db: ReturnType<typeof getDb>,
  internId: string,
  extraData: unknown,
): Promise<boolean> {
  const ratings = ((extraData ?? {}) as Record<string, unknown>).ratings as Record<string, unknown> | undefined;
  if (ratings && Object.values(ratings).some((v) => typeof v === "number" && v > 0)) return true;

  const aiEmployers = await db
    .select({ id: schema.employers.id })
    .from(schema.employers)
    .where(eq(schema.employers.companyEmail, AI_EMAIL));
  const aiIds = ["admin", ...aiEmployers.map((e) => e.id)];

  const [inFlight] = await db
    .select({ id: schema.interviews.id })
    .from(schema.interviews)
    .where(
      and(
        eq(schema.interviews.internId, internId),
        or(inArray(schema.interviews.employerId, aiIds)),
        notInArray(schema.interviews.status, DONE),
      ),
    )
    .limit(1);
  return Boolean(inFlight);
}

/** Same set of skills, ignoring order and case. */
export function sameSkills(a: string[], b: string[]): boolean {
  const norm = (list: string[]) => [...new Set(list.map((s) => s.trim().toLowerCase()).filter(Boolean))].sort().join("|");
  return norm(a) === norm(b);
}
