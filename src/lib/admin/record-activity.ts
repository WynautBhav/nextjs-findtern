import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import type { ActivityEntry } from "@/lib/admin/record-activity.types";
import {
  companyPaymentEntry,
  companySignupEntry,
  compact,
  documentEntry,
  hireEntry,
  internPaymentEntry,
  internSignupEntry,
  interviewEntry,
  mergeActivity,
  payoutEntry,
  projectEntry,
  proposalEntry,
  proposalOutcomeEntry,
  reviewEntry,
  timesheetEntries,
  type ActivityView,
} from "@/lib/admin/record-activity-pure";

export type { ActivityEntry, ActivityKind } from "@/lib/admin/record-activity.types";

/**
 * Read-only data behind the Activities timeline on the admin candidate and
 * company pages. Each source is its own bounded query (the latest few rows)
 * and runs in parallel; a source that fails logs and contributes nothing, so
 * the page never breaks and never shows a half-explained gap as an error.
 * Only the columns the timeline needs are selected: no password hashes,
 * tokens, bank details, or Aadhaar/PAN numbers.
 */

/** Rows read per source. */
const PER_SOURCE = 15;

async function source(name: string, run: () => Promise<ActivityEntry[]>): Promise<ActivityEntry[]> {
  try {
    return await run();
  } catch (err) {
    console.error(`[record-activity] ${name} failed`, err);
    return [];
  }
}

const userName = (first: string | null, last: string | null) => `${first ?? ""} ${last ?? ""}`.trim() || null;

/** Everything that happened to one candidate, newest first. */
export async function loadInternActivity(internId: string, limit = 30): Promise<ActivityEntry[]> {
  const db = getDb();
  const view: ActivityView = "intern";
  const [user] = await db
    .select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName, createdAt: schema.users.createdAt })
    .from(schema.users)
    .where(eq(schema.users.id, internId))
    .limit(1)
    .catch((err) => {
      console.error("[record-activity] candidate lookup failed", err);
      return [];
    });
  if (!user) return [];
  const internName = userName(user.firstName, user.lastName);
  const who = { internId, internName };
  const E = schema.employers;
  const P = schema.projects;

  const groups = await Promise.all([
    source("signup", async () => compact([internSignupEntry({ id: user.id, name: internName, createdAt: user.createdAt })])),

    source("proposals", async () => {
      const rows = await db
        .select({
          id: schema.proposals.id,
          status: schema.proposals.status,
          createdAt: schema.proposals.createdAt,
          updatedAt: schema.proposals.updatedAt,
          hiredAt: schema.proposals.hiredAt,
          employerId: schema.proposals.employerId,
          companyName: E.companyName,
          projectName: P.projectName,
        })
        .from(schema.proposals)
        .leftJoin(E, eq(E.id, schema.proposals.employerId))
        .leftJoin(P, eq(P.id, schema.proposals.projectId))
        .where(eq(schema.proposals.internId, internId))
        .orderBy(desc(schema.proposals.updatedAt))
        .limit(PER_SOURCE);
      return rows.flatMap((r) => {
        const row = { ...r, internId, internName };
        return compact([proposalEntry(row, view), proposalOutcomeEntry(row, view), hireEntry(row, view)]);
      });
    }),

    source("interviews", async () => {
      const rows = await db
        .select({
          id: schema.interviews.id,
          status: schema.interviews.status,
          createdAt: schema.interviews.createdAt,
          updatedAt: schema.interviews.updatedAt,
          employerId: schema.interviews.employerId,
          companyName: E.companyName,
          projectName: P.projectName,
        })
        .from(schema.interviews)
        .leftJoin(E, eq(E.id, schema.interviews.employerId))
        .leftJoin(P, eq(P.id, schema.interviews.projectId))
        .where(eq(schema.interviews.internId, internId))
        .orderBy(desc(schema.interviews.updatedAt))
        .limit(PER_SOURCE);
      return compact(rows.map((r) => interviewEntry({ ...r, internId, internName }, view)));
    }),

    source("timesheets", async () => {
      const rows = await db
        .select({
          id: schema.timesheets.id,
          periodStart: schema.timesheets.periodStart,
          periodEnd: schema.timesheets.periodEnd,
          submittedAt: schema.timesheets.submittedAt,
          approvedAt: schema.timesheets.approvedAt,
          rejectedAt: schema.timesheets.rejectedAt,
          employerId: schema.timesheets.employerId,
          companyName: E.companyName,
          projectName: P.projectName,
        })
        .from(schema.timesheets)
        .leftJoin(E, eq(E.id, schema.timesheets.employerId))
        .leftJoin(schema.proposals, eq(schema.proposals.id, schema.timesheets.proposalId))
        .leftJoin(P, eq(P.id, schema.proposals.projectId))
        .where(and(eq(schema.timesheets.internId, internId), isNotNull(schema.timesheets.submittedAt)))
        .orderBy(desc(schema.timesheets.submittedAt))
        .limit(PER_SOURCE);
      return rows.flatMap((r) => timesheetEntries({ ...r, internId, internName }, view));
    }),

    source("payouts", async () => {
      const rows = await db
        .select({
          id: schema.internPayouts.id,
          amountMinor: schema.internPayouts.amountMinor,
          currency: schema.internPayouts.currency,
          paidAt: schema.internPayouts.paidAt,
        })
        .from(schema.internPayouts)
        .where(and(eq(schema.internPayouts.internId, internId), eq(schema.internPayouts.status, "paid"), isNotNull(schema.internPayouts.paidAt)))
        .orderBy(desc(schema.internPayouts.paidAt))
        .limit(PER_SOURCE);
      return compact(rows.map((r) => payoutEntry({ ...r, invoiceNumber: null }, who)));
    }),

    source("payments", async () => {
      const rows = await db
        .select({
          id: schema.internPayments.id,
          amountMinor: schema.internPayments.amountMinor,
          currency: schema.internPayments.currency,
          invoiceNumber: schema.internPayments.invoiceNumber,
          paidAt: schema.internPayments.paidAt,
        })
        .from(schema.internPayments)
        .where(and(eq(schema.internPayments.internId, internId), eq(schema.internPayments.status, "paid"), isNotNull(schema.internPayments.paidAt)))
        .orderBy(desc(schema.internPayments.paidAt))
        .limit(PER_SOURCE);
      return compact(rows.map((r) => internPaymentEntry(r, who)));
    }),

    source("documents", async () => {
      // Only whether a file exists, never its name; the identity numbers are not read.
      const D = schema.internDocuments;
      const rows = await db
        .select({
          id: D.id,
          hasPhoto: sql<boolean>`${D.profilePhotoName} is not null`,
          hasVideo: sql<boolean>`${D.introVideoName} is not null`,
          hasIdentity: sql<boolean>`(${D.aadhaarImageName} is not null or ${D.panImageName} is not null)`,
          createdAt: D.createdAt,
          updatedAt: D.updatedAt,
        })
        .from(D)
        .where(eq(D.userId, internId))
        .orderBy(desc(D.updatedAt))
        .limit(1);
      return compact(rows.map((r) => documentEntry(r, who)));
    }),

    source("review", async () => {
      const O = schema.internOnboarding;
      const rows = await db
        .select({
          status: sql<string | null>`${O.extraData}->>'approvalStatus'`,
          approvedAt: sql<string | null>`${O.extraData}->>'approvedAt'`,
          approvedBy: sql<string | null>`${O.extraData}->>'approvedBy'`,
        })
        .from(O)
        .where(eq(O.userId, internId))
        .limit(1);
      return compact(rows.map((r) => reviewEntry({ ...r, internId, internName })));
    }),
  ]);

  return mergeActivity(groups, limit);
}

/** Everything that happened to one company, newest first. */
export async function loadCompanyActivity(companyId: string, limit = 30): Promise<ActivityEntry[]> {
  const db = getDb();
  const view: ActivityView = "company";
  const [company] = await db
    .select({ id: schema.employers.id, companyName: schema.employers.companyName, createdAt: schema.employers.createdAt })
    .from(schema.employers)
    .where(eq(schema.employers.id, companyId))
    .limit(1)
    .catch((err) => {
      console.error("[record-activity] company lookup failed", err);
      return [];
    });
  if (!company) return [];
  const companyName = company.companyName;
  const U = schema.users;
  const P = schema.projects;

  const groups = await Promise.all([
    source("signup", async () => compact([companySignupEntry({ id: company.id, companyName, createdAt: company.createdAt })])),

    source("projects", async () => {
      const rows = await db
        .select({ id: P.id, projectName: P.projectName, createdAt: P.createdAt })
        .from(P)
        .where(eq(P.employerId, companyId))
        .orderBy(desc(P.createdAt))
        .limit(PER_SOURCE);
      return compact(rows.map((r) => projectEntry({ ...r, employerId: companyId, companyName })));
    }),

    source("proposals", async () => {
      const rows = await db
        .select({
          id: schema.proposals.id,
          status: schema.proposals.status,
          createdAt: schema.proposals.createdAt,
          updatedAt: schema.proposals.updatedAt,
          hiredAt: schema.proposals.hiredAt,
          internId: schema.proposals.internId,
          firstName: U.firstName,
          lastName: U.lastName,
          projectName: P.projectName,
        })
        .from(schema.proposals)
        .leftJoin(U, eq(U.id, schema.proposals.internId))
        .leftJoin(P, eq(P.id, schema.proposals.projectId))
        .where(eq(schema.proposals.employerId, companyId))
        .orderBy(desc(schema.proposals.updatedAt))
        .limit(PER_SOURCE);
      return rows.flatMap((r) => {
        const row = { ...r, internName: userName(r.firstName, r.lastName), employerId: companyId, companyName };
        return compact([proposalEntry(row, view), proposalOutcomeEntry(row, view), hireEntry(row, view)]);
      });
    }),

    source("interviews", async () => {
      const rows = await db
        .select({
          id: schema.interviews.id,
          status: schema.interviews.status,
          createdAt: schema.interviews.createdAt,
          updatedAt: schema.interviews.updatedAt,
          internId: schema.interviews.internId,
          firstName: U.firstName,
          lastName: U.lastName,
          projectName: P.projectName,
        })
        .from(schema.interviews)
        .leftJoin(U, eq(U.id, schema.interviews.internId))
        .leftJoin(P, eq(P.id, schema.interviews.projectId))
        .where(eq(schema.interviews.employerId, companyId))
        .orderBy(desc(schema.interviews.updatedAt))
        .limit(PER_SOURCE);
      return compact(rows.map((r) => interviewEntry({ ...r, internName: userName(r.firstName, r.lastName), employerId: companyId, companyName }, view)));
    }),

    source("timesheets", async () => {
      const rows = await db
        .select({
          id: schema.timesheets.id,
          periodStart: schema.timesheets.periodStart,
          periodEnd: schema.timesheets.periodEnd,
          submittedAt: schema.timesheets.submittedAt,
          approvedAt: schema.timesheets.approvedAt,
          rejectedAt: schema.timesheets.rejectedAt,
          internId: schema.timesheets.internId,
          firstName: U.firstName,
          lastName: U.lastName,
          projectName: P.projectName,
        })
        .from(schema.timesheets)
        .leftJoin(U, eq(U.id, schema.timesheets.internId))
        .leftJoin(schema.proposals, eq(schema.proposals.id, schema.timesheets.proposalId))
        .leftJoin(P, eq(P.id, schema.proposals.projectId))
        .where(and(eq(schema.timesheets.employerId, companyId), isNotNull(schema.timesheets.submittedAt)))
        .orderBy(desc(schema.timesheets.submittedAt))
        .limit(PER_SOURCE);
      return rows.flatMap((r) => timesheetEntries({ ...r, internName: userName(r.firstName, r.lastName), employerId: companyId, companyName }, view));
    }),

    source("payments", async () => {
      const rows = await db
        .select({
          id: schema.employerPayments.id,
          amountMinor: schema.employerPayments.amountMinor,
          currency: schema.employerPayments.currency,
          invoiceNumber: schema.employerPayments.invoiceNumber,
          paidAt: schema.employerPayments.paidAt,
        })
        .from(schema.employerPayments)
        .where(and(eq(schema.employerPayments.employerId, companyId), eq(schema.employerPayments.status, "paid"), isNotNull(schema.employerPayments.paidAt)))
        .orderBy(desc(schema.employerPayments.paidAt))
        .limit(PER_SOURCE);
      return compact(rows.map((r) => companyPaymentEntry(r, { employerId: companyId, companyName })));
    }),
  ]);

  return mergeActivity(groups, limit);
}
