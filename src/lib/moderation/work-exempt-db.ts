import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { recordAdminAudit } from "@/lib/admin/audit";
import { SITE } from "@/lib/content/site";
import { getDb, schema } from "@/lib/db";
import { renderEmail } from "@/lib/emails";
import { standingEmails } from "@/lib/emails/standing";
import { hiredProposalSql } from "@/lib/employer-visibility";
import { hireIsRunning } from "@/lib/candidate-hold";
import { sendSmtpMail } from "@/lib/mailer";
import { decideWork, flagRunningHire, workPanelState, type AlertDeps, type RunningHire, type WorkDeps, type WorkTx } from "./work-exempt";

/** The database side of work-exempt.ts. */

/** The intern's paid hire that is still running or upcoming (lib/candidate-hold.ts decides "running"), newest first; null when none. */
export async function runningHireOf(internId: string, now: Date = new Date()): Promise<RunningHire | null> {
  const p = schema.proposals;
  const rows = await getDb()
    .select({ id: p.id, status: p.status, hiredAt: p.hiredAt, endedAt: p.endedAt, offerDetails: p.offerDetails, currency: p.currency, employerId: p.employerId, company: schema.employers.companyName })
    .from(p)
    .leftJoin(schema.employers, eq(schema.employers.id, p.employerId))
    .where(and(eq(p.internId, internId), hiredProposalSql()))
    .orderBy(desc(p.hiredAt))
    .limit(20);
  const hit = rows.find((r) => hireIsRunning(r, now));
  return hit ? { proposalId: hit.id, company: (hit.company ?? "").trim() || "their company" } : null;
}

export async function loadWorkPanel(internId: string) {
  const db = getDb();
  const [row] = await db
    .select({ frozenAt: schema.users.frozenAt, workExemptAt: schema.users.workExemptAt, workDecisionAt: schema.users.workDecisionAt })
    .from(schema.users)
    .where(eq(schema.users.id, internId))
    .limit(1);
  const frozen = Boolean(row?.frozenAt);
  const hire = frozen ? await runningHireOf(internId) : null;
  return workPanelState({ frozen, workExemptAt: row?.workExemptAt ?? null, workDecisionAt: row?.workDecisionAt ?? null, hire });
}

export const workDeps: WorkDeps = {
  now: () => new Date(),
  runningHire: (id) => runningHireOf(id),
  async transaction(internId, fn) {
    return getDb().transaction(async (tx) => {
      const [row] = await tx.select().from(schema.users).where(eq(schema.users.id, internId)).for("update").limit(1);
      if (!row) return null;
      const t: WorkTx = {
        state: { name: (row.firstName ?? "").trim(), frozen: Boolean(row.frozenAt), workExemptAt: row.workExemptAt, workDecisionAt: row.workDecisionAt, reviewNotifiedAt: row.workReviewNotifiedAt },
        async set(patch) {
          await tx.update(schema.users).set(patch).where(eq(schema.users.id, internId));
        },
        async audit(entry) {
          await recordAdminAudit(tx, { adminId: entry.adminId, action: entry.action, targetType: "user", targetId: internId, meta: entry.meta }, { strict: true });
        },
      };
      return fn(t);
    });
  },
  async closeAlert(internId) {
    await getDb().update(schema.contactMessages).set({ isRead: true }).where(and(eq(schema.contactMessages.queryType, "frozen_hire"), eq(schema.contactMessages.lastName, internId)));
  },
};

export function runDecideWork(input: Parameters<typeof decideWork>[1]) {
  return decideWork(workDeps, input);
}

export const alertDeps: AlertDeps = {
  runningHire: (id) => runningHireOf(id),
  async claim(internId) {
    const done = await getDb()
      .update(schema.users)
      .set({ workReviewNotifiedAt: new Date() })
      .where(and(eq(schema.users.id, internId), isNotNull(schema.users.frozenAt), isNull(schema.users.workReviewNotifiedAt)))
      .returning({ id: schema.users.id });
    return done.length > 0;
  },
  async alertAdmins({ internId, internName, company }) {
    const mail = standingEmails.adminFrozenHire({ internName, internId, company });
    // The admin inbox row (same pattern as the full-time-offer alert): unread = open, until an admin decides.
    await getDb().insert(schema.contactMessages).values({
      firstName: internName || "Intern",
      lastName: internId,
      email: SITE.adminEmail,
      queryType: "frozen_hire",
      subject: FROZEN_HIRE_TITLE,
      message: `${internName || "An intern"} is frozen and has a running internship with ${company}. Decide whether they may keep working: /admin/interns/${internId}`,
    });
    await sendSmtpMail({ to: process.env.ADMIN_ALERT_EMAIL ?? SITE.adminEmail, ...renderEmail(mail) });
  },
};

export const FROZEN_HIRE_TITLE = "Frozen intern has a running internship: decide";

/** Called by the standing service after an intern freeze (both an admin freeze and a second confirmed strike). */
export function flagFrozenInternHire(intern: { id: string; name: string }) {
  return flagRunningHire(alertDeps, intern);
}
