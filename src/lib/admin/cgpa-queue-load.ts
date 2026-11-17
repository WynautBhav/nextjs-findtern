import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { readCgpaVerification } from "@/lib/cgpa-verification";
import { yearOfStudy } from "@/lib/cgpa-verification";
import { certificateFiles } from "@/lib/onboarding";
import { parseOffer } from "@/lib/offer";
import type { CgpaQueueRow } from "@/lib/admin/cgpa-queue";

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** The offers that count for a CGPA check: accepted and not yet over. */
const LIVE_STATUSES = ["accepted", "processing", "hired"];

/**
 * Every intern flagged for a CGPA check (pending, verified or incorrect), with what the admin needs to decide:
 * contact, college, proof files, and the accepted offers that are waiting. Read-only. Throws on a database error so
 * the page can show its error state instead of an empty queue.
 */
export async function loadCgpaQueue(): Promise<CgpaQueueRow[]> {
  const db = getDb();
  const flagged = await db
    .select({ userId: schema.internOnboarding.userId, extra: schema.internOnboarding.extraData })
    .from(schema.internOnboarding)
    .where(sql`${schema.internOnboarding.extraData}->'cgpaVerification'->>'status' in ('pending', 'verified', 'incorrect')`);
  if (flagged.length === 0) return [];
  const ids = flagged.map((f) => f.userId);

  const [users, proposals, members] = await Promise.all([
    db
      .select({ id: schema.users.id, first: schema.users.firstName, last: schema.users.lastName, email: schema.users.email, code: schema.users.countryCode, phone: schema.users.phoneNumber })
      .from(schema.users)
      .where(inArray(schema.users.id, ids)),
    db
      .select({
        id: schema.proposals.id,
        internId: schema.proposals.internId,
        status: schema.proposals.status,
        offer: schema.proposals.offerDetails,
        currency: schema.proposals.currency,
        company: schema.employers.companyName,
        project: schema.projects.projectName,
      })
      .from(schema.proposals)
      .leftJoin(schema.employers, eq(schema.employers.id, schema.proposals.employerId))
      .leftJoin(schema.projects, eq(schema.projects.id, schema.proposals.projectId))
      .where(and(inArray(schema.proposals.internId, ids), inArray(schema.proposals.status, LIVE_STATUSES))),
    db
      .select({ userId: schema.collegeMemberships.userId, year: schema.collegeMemberships.year })
      .from(schema.collegeMemberships)
      .where(inArray(schema.collegeMemberships.userId, ids)),
  ]);
  const userBy = new Map(users.map((u) => [u.id, u]));
  const collegeYear = new Map(members.map((m) => [m.userId, m.year ?? null]));

  return flagged.flatMap((f): CgpaQueueRow[] => {
    const user = userBy.get(f.userId);
    if (!user) return [];
    const v = readCgpaVerification(f.extra);
    if (v.status === "not_required") return [];
    const extra = isRecord(f.extra) ? f.extra : {};
    const academics = isRecord(extra.academics) ? extra.academics : {};
    const year = yearOfStudy({ startYear: str(academics.startYear), status: str(academics.status) }, collegeYear.get(f.userId) ?? null);
    const degree = str(academics.degree) || str(academics.level);
    const proofs = Object.entries(isRecord(academics.semesterProofUploads) ? academics.semesterProofUploads : {}).flatMap(([key, raw]) => {
      const docKey = isRecord(raw) ? str(raw.name) : "";
      return docKey ? [{ key, docKey }] : [];
    });
    const labels = new Map(certificateFiles({ semesterProofUploads: academics.semesterProofUploads }).map((c) => [c.name, c.label]));
    return [
      {
        internId: f.userId,
        name: `${user.first} ${user.last}`.trim() || "Unnamed",
        email: user.email,
        phone: user.phone ? `${user.code || "+91"} ${user.phone}` : "",
        college: str(academics.institution) || "College not stated",
        course: [degree, year ? `year ${year}` : ""].filter(Boolean).join(" · ") || "Course not stated",
        status: v.status,
        semester: v.semester,
        claimedScore: v.claimedScore,
        scoreType: v.scoreType,
        correctedScore: v.correctedScore ?? null,
        requestedAt: v.requestedAt ?? null,
        decidedAt: v.decidedAt ?? null,
        decidedBy: v.decidedBy ?? null,
        note: v.note ?? null,
        proofs: proofs.map((p) => ({ key: p.key, docKey: p.docKey, label: labels.get(p.docKey) ?? p.key })),
        proposals: proposals
          .filter((p) => p.internId === f.userId)
          .map((p) => {
            const offer = parseOffer(p.offer, p.currency);
            const acceptedAt = isRecord(p.offer) ? str(p.offer.acceptedAt) : "";
            return { id: p.id, company: p.company ?? "Company", project: p.project || offer.roleTitle || "Project", startDate: offer.startDate ? offer.startDate.slice(0, 10) : null, status: p.status, acceptedAt: acceptedAt || null };
          }),
      },
    ];
  });
}
