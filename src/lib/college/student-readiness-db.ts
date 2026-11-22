import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { candidatePoolClauses } from "@/lib/employer-pool";
import { hireGateDecision } from "@/lib/hire-gate";
import { hasMarksheet, openStepOf, readinessFrom, type Readiness } from "./student-readiness";

/**
 * Can employers see these students (the employer pool query itself), can they be hired (the hire gate), and is a
 * marksheet on file. Reads whole onboarding rows here, on the server, and returns only the verdicts
 * (student-readiness.ts): no field of them leaves this function. Four queries whatever the number of students.
 */
export async function readinessForMany(ids: string[]): Promise<Map<string, Readiness>> {
  const out = new Map<string, Readiness>();
  if (ids.length === 0) return out;
  const db = getDb();
  const [users, rows, docs, pool] = await Promise.all([
    db.select({ id: schema.users.id, visibility: schema.users.profileVisibility, isActive: schema.users.isActive, frozenAt: schema.users.frozenAt }).from(schema.users).where(inArray(schema.users.id, ids)),
    db.select().from(schema.internOnboarding).where(inArray(schema.internOnboarding.userId, ids)).orderBy(desc(schema.internOnboarding.createdAt)),
    db
      .select({ userId: schema.internDocuments.userId, photo: schema.internDocuments.profilePhotoName, pan: schema.internDocuments.panImageName, aadhaar: schema.internDocuments.aadhaarImageName })
      .from(schema.internDocuments)
      .where(inArray(schema.internDocuments.userId, ids))
      .orderBy(desc(schema.internDocuments.createdAt)),
    db
      .select({ id: schema.users.id })
      .from(schema.users)
      .innerJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.users.id))
      .where(and(inArray(schema.users.id, ids), ...candidatePoolClauses())),
  ]);
  // Latest row wins, as on the admin page and in the hire gate (both lists are newest first).
  const rowOf = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (r.userId && !rowOf.has(r.userId)) rowOf.set(r.userId, r);
  const docOf = new Map<string, (typeof docs)[number]>();
  for (const d of docs) if (d.userId && !docOf.has(d.userId)) docOf.set(d.userId, d);
  const inPool = new Set(pool.map((p) => p.id));

  for (const u of users) {
    const row = rowOf.get(u.id);
    const doc = docOf.get(u.id);
    const extra = (row?.extraData ?? {}) as Record<string, unknown>;
    const ratings = (extra.ratings ?? {}) as Record<string, unknown>;
    const files = { hasPhoto: Boolean(doc?.photo), hasPanImage: Boolean(doc?.pan), hasAadhaarImage: Boolean(doc?.aadhaar) };
    const { submitted, openStep } = openStepOf(row, files);
    out.set(
      u.id,
      readinessFrom({
        inPool: inPool.has(u.id),
        profileVisibility: u.visibility,
        isActive: u.isActive,
        frozen: Boolean(u.frozenAt),
        openToWork: extra.openToWork !== false,
        hiddenByAdmin: extra.hiddenByAdmin === true,
        rejected: extra.approvalStatus === "Rejected",
        interviewed: Number(extra.findternScore) > 0 && Number(ratings.interview) > 0,
        hireable: hireGateDecision(row, files).ok,
        submitted,
        openStep,
        marksheet: hasMarksheet(extra),
      }),
    );
  }
  return out;
}
