import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import {
  activeEngagement,
  buildThread,
  deriveMoney,
  deriveProofs,
  deriveReadiness,
  deriveStage,
  readinessFrom,
  toArray,
  type InterviewRow,
  type PayoutRow,
  type ProposalRow,
  type TimesheetRow,
} from "@/lib/journey";

/**
 * One read for every intern screen.
 *
 * Nine of the ten old screens each wrote their own `db.select()` wrapped in a
 * bare `catch {}`, which meant every screen could silently render an empty
 * state on a database failure and nobody would know. This does the work once,
 * in one place, where a failure is visible.
 *
 * `withNames` resolves company names in a second query rather than a join, so
 * the derivation in `journey.ts` stays free of database types and testable on
 * its own.
 */
export type InternData = ReturnType<typeof loadInternData>;

export async function loadInternData(uid: string) {
  const db = getDb();

  const [proposals, interviews, timesheets, payouts, onboarding, document] = await Promise.all([
    db.select().from(schema.proposals).where(eq(schema.proposals.internId, uid)).orderBy(desc(schema.proposals.createdAt)),
    db.select().from(schema.interviews).where(eq(schema.interviews.internId, uid)).orderBy(desc(schema.interviews.createdAt)),
    db.select().from(schema.timesheets).where(eq(schema.timesheets.internId, uid)).orderBy(desc(schema.timesheets.createdAt)),
    db.select().from(schema.internPayouts).where(eq(schema.internPayouts.internId, uid)).orderBy(desc(schema.internPayouts.createdAt)),
    db.select().from(schema.internOnboarding).where(eq(schema.internOnboarding.userId, uid)).limit(1),
    db.select().from(schema.internDocuments).where(eq(schema.internDocuments.userId, uid)).limit(1),
  ]);

  const p = proposals as ProposalRow[];
  const i = interviews as InterviewRow[];
  const t = timesheets as TimesheetRow[];
  const r = payouts as PayoutRow[];

  const employerIds = [...new Set([...p.map((x) => x.employerId), ...i.map((x) => x.employerId)])].filter(Boolean);
  const names: Record<string, string> = {};
  if (employerIds.length > 0) {
    const rows = await db
      .select({ id: schema.employers.id, companyName: schema.employers.companyName })
      .from(schema.employers)
      .where(inArray(schema.employers.id, employerIds));
    for (const row of rows) if (row.companyName) names[row.id] = row.companyName;
  }

  const source = { proposals: p, interviews: i, timesheets: t, payouts: r, names };

  return {
    proposals: p,
    interviews: i,
    timesheets: t,
    payouts: r,
    onboarding: onboarding[0] ?? null,
    document: document[0] ?? null,
    names,
    stage: deriveStage(p),
    engagement: activeEngagement(p),
    thread: buildThread(source),
    proofs: deriveProofs(source),
    readiness: readinessFrom(
      deriveReadiness(
        onboarding[0] as never,
        document[0] as never,
        p,
      ),
    ),
    money: deriveMoney(r),
  };
}

/** Names of the projects behind this candidate's proposals, resolved once. */
export async function projectNames(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};
  const db = getDb();
  const rows = await db
    .select({ id: schema.projects.id, projectName: schema.projects.projectName })
    .from(schema.projects)
    .where(inArray(schema.projects.id, unique));
  const out: Record<string, string> = {};
  for (const row of rows) out[row.id] = row.projectName;
  return out;
}

/** Open roles with their company, for the opportunities screen. */
export async function openProjects(limit = 60) {
  const db = getDb();
  return db
    .select({
      id: schema.projects.id,
      projectName: schema.projects.projectName,
      scopeOfWork: schema.projects.scopeOfWork,
      skills: schema.projects.skills,
      locationType: schema.projects.locationType,
      fullTimeOffer: schema.projects.fullTimeOffer,
      city: schema.projects.city,
      state: schema.projects.state,
      timezone: schema.projects.timezone,
      createdAt: schema.projects.createdAt,
      employerId: schema.projects.employerId,
      companyName: schema.employers.companyName,
    })
    .from(schema.projects)
    .innerJoin(schema.employers, eq(schema.projects.employerId, schema.employers.id))
    .where(and(eq(schema.projects.status, "active"), eq(schema.projects.employerId, schema.projects.employerId)))
    .orderBy(desc(schema.projects.createdAt))
    .limit(limit);
}

export async function projectById(id: string) {
  const db = getDb();
  const [row] = await db
    .select({
      id: schema.projects.id,
      projectName: schema.projects.projectName,
      scopeOfWork: schema.projects.scopeOfWork,
      skills: schema.projects.skills,
      locationType: schema.projects.locationType,
      fullTimeOffer: schema.projects.fullTimeOffer,
      city: schema.projects.city,
      state: schema.projects.state,
      timezone: schema.projects.timezone,
      createdAt: schema.projects.createdAt,
      employerId: schema.projects.employerId,
      companyName: schema.employers.companyName,
    })
    .from(schema.projects)
    .innerJoin(schema.employers, eq(schema.projects.employerId, schema.employers.id))
    .where(eq(schema.projects.id, id))
    .limit(1);
  return row ?? null;
}

export async function notificationsFor(uid: string, limit = 60) {
  const db = getDb();
  return db
    .select()
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.recipientType, "intern"),
        eq(schema.notifications.recipientId, uid),
      ),
    )
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);
}

export { toArray };
