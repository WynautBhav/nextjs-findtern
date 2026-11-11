import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { candidatePoolClauses } from "@/lib/employer-pool";
import { initialsOf } from "@/lib/employer-candidates";
import { draftFromRecord } from "@/lib/onboarding";

import type { Candidate } from "./skill-match";
export { studentsForSkill, type PublicStudent } from "./skill-match";

/** Newest-first cap on the pool scanned per request; shared so the card count and the dialog list agree. */
const POOL_LIMIT = 1000;

/** Real, scored, publicly listed candidates only. Throws if the DB is unreachable. */
export async function loadPublicStudents(): Promise<Candidate[]> {
  const rows = await getDb()
    .select({ user: schema.users, onboarding: schema.internOnboarding })
    .from(schema.internOnboarding)
    .innerJoin(schema.users, eq(schema.users.id, schema.internOnboarding.userId))
    .where(and(...candidatePoolClauses()))
    .orderBy(desc(schema.internOnboarding.updatedAt))
    .limit(POOL_LIMIT);

  return rows.flatMap(({ user, onboarding }) => {
      const extra = (onboarding.extraData ?? {}) as Record<string, unknown>;
      const score = typeof extra.findternScore === "number" ? Math.round(extra.findternScore * 10) / 10 : 0;
      if (score <= 0) return [];
      const draft = draftFromRecord(onboarding);
      const ratings = (extra.ratings ?? {}) as Record<string, unknown>;
      const real = (k: string) => (typeof ratings[k] === "number" && (ratings[k] as number) > 0 ? (ratings[k] as number) : undefined);
      const initials = initialsOf((user.firstName || "").trim(), (user.lastName || "").trim());
      return [
        {
          id: "",
          initials,
          shortName: `Candidate ${initials}`,
          score,
          band: score >= 8 ? "Latte" : score >= 6 ? "Cappuccino" : "Espresso",
          college: draft.academics?.institution ?? "",
          degree: [draft.academics?.degree, draft.academics?.branch].filter(Boolean).join(", "),
          city: onboarding.city || "",
          state: onboarding.state || "",
          category: typeof extra.category === "string" ? extra.category : undefined,
          skills: draft.skills ?? [],
          ratings: {
            coding: real("coding"),
            aptitude: real("aptitude"),
            communication: real("communication"),
            interview: real("interview"),
            domain: real("domain"),
          },
          available: extra.openToWork !== false,
        } satisfies Candidate,
      ];
  });
}
