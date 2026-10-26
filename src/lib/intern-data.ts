import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb, hasDb, schema } from "@/lib/db";
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
import { parseOffer } from "@/lib/offer";
import { isHiredProposal } from "@/lib/hire-status";

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

/** What an intern sees in place of a company name before the hire. */
export const HIDDEN_COMPANY = "Hidden company";

/** The synthetic employer that owns AI interview rows, and what it is called. */
export const AI_INTERVIEW_EMAIL = "ai-interview@findtern.ai";
export const AI_INTERVIEW_NAME = "AI Interview";

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
  const aiEmployerIds = new Set<string>();
  if (employerIds.length > 0) {
    const rows = await db
      .select({ id: schema.employers.id, companyName: schema.employers.companyName, email: schema.employers.companyEmail })
      .from(schema.employers)
      .where(inArray(schema.employers.id, employerIds));
    // Non-bypass masking (legacy routes.ts:14169): the company stays hidden
    // until it has hired this intern, or has sent a full-time offer (which
    // only follows a hire). Every intern screen reads names from here.
    const revealed = new Set(
      p
        .filter((x) => isHiredProposal(x) || parseOffer(x.offerDetails, x.currency).fullTime)
        .map((x) => x.employerId),
    );
    for (const row of rows) {
      // The AI interview is Findtern's own, not a company to keep hidden.
      if (row.email === AI_INTERVIEW_EMAIL) {
        aiEmployerIds.add(row.id);
        names[row.id] = AI_INTERVIEW_NAME;
        continue;
      }
      if (!row.companyName) continue;
      names[row.id] = revealed.has(row.id) ? row.companyName : HIDDEN_COMPANY;
    }
  }
  // Legacy AI interviews sit on the employer id "admin", which has no row.
  if (i.some((x) => x.employerId === "admin")) {
    aiEmployerIds.add("admin");
    names.admin = AI_INTERVIEW_NAME;
  }

  const source = { proposals: p, interviews: i, timesheets: t, payouts: r, names, aiEmployerIds };

  return {
    proposals: p,
    interviews: i,
    timesheets: t,
    payouts: r,
    onboarding: onboarding[0] ?? null,
    document: document[0] ?? null,
    names,
    /** Employer ids whose interviews are the AI interview, not a company round. */
    aiEmployerIds,
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
  if (unique.length === 0 || !hasDb()) return {};
  try {
    const db = getDb();
    const rows = await db
      .select({ id: schema.projects.id, projectName: schema.projects.projectName })
      .from(schema.projects)
      .where(inArray(schema.projects.id, unique));
    const out: Record<string, string> = {};
    for (const row of rows) out[row.id] = row.projectName;
    return out;
  } catch {
    return {};
  }
}

/**
 * Open roles with their company, for the opportunities screen.
 *
 * Degrades to an empty list without a database (prerender on hosts with no
 * DATABASE_URL, e.g. Vercel preview builds). The page already renders a
 * "no roles open" state, so an empty list is a complete answer, not an
 * error masquerading as one.
 */
export async function openProjects(limit = 60) {
  if (!hasDb()) return [];
  try {
    const db = getDb();
    return await db
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
  } catch {
    return [];
  }
}

export async function projectById(id: string) {
  if (!hasDb()) return null;
  try {
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
  } catch {
    return null;
  }
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
