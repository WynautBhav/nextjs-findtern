import { eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { getInternActivationFeeMinor } from "@/lib/platform-settings";
import { computeReceivables } from "@/lib/admin/receivables";
import { meaningfulProfile, realEmployerId, realEmployers } from "@/lib/admin/scope";

export type MoneyFilter = "both" | "company" | "candidate";

export function moneyFilter(v: string | undefined): MoneyFilter {
  return v === "company" || v === "candidate" ? v : "both";
}

/** Loads and computes the money-in / money-out report (test employers excluded). */
export async function loadReceivables(
  range: { since: Date | null; until: Date | null },
  filter: { receivables: MoneyFilter; payables: MoneyFilter },
) {
  const db = getDb();
  const [employers, interns, onboarding, proposals, employerPayments, internPayments, payouts, feeMinor] = await Promise.all([
    db.select({ id: schema.employers.id, name: schema.employers.companyName }).from(schema.employers).where(realEmployers()),
    db
      .select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName })
      .from(schema.users)
      .where(eq(schema.users.role, "intern")),
    db
      .select({
        userId: schema.internOnboarding.userId,
        createdAt: schema.internOnboarding.createdAt,
        extraData: schema.internOnboarding.extraData,
        meaningful: meaningfulProfile(),
      })
      .from(schema.internOnboarding)
      .innerJoin(schema.users, eq(schema.users.id, schema.internOnboarding.userId))
      .where(eq(schema.users.role, "intern")),
    db
      .select({
        id: schema.proposals.id,
        employerId: schema.proposals.employerId,
        internId: schema.proposals.internId,
        status: schema.proposals.status,
        offerDetails: schema.proposals.offerDetails,
        currency: schema.proposals.currency,
      })
      .from(schema.proposals)
      .where(inArray(schema.proposals.status, ["accepted", "processing", "hired"])),
    db
      .select({
        id: schema.employerPayments.id,
        employerId: schema.employerPayments.employerId,
        orderId: schema.employerPayments.orderId,
        paymentId: schema.employerPayments.paymentId,
        status: schema.employerPayments.status,
        amountMinor: schema.employerPayments.amountMinor,
        currency: schema.employerPayments.currency,
        paidAt: schema.employerPayments.paidAt,
        createdAt: schema.employerPayments.createdAt,
        raw: schema.employerPayments.raw,
      })
      .from(schema.employerPayments)
      .where(realEmployerId(schema.employerPayments.employerId)),
    db
      .select({
        id: schema.internPayments.id,
        internId: schema.internPayments.internId,
        paymentId: schema.internPayments.paymentId,
        status: schema.internPayments.status,
        amountMinor: schema.internPayments.amountMinor,
        currency: schema.internPayments.currency,
        paidAt: schema.internPayments.paidAt,
        createdAt: schema.internPayments.createdAt,
      })
      .from(schema.internPayments),
    db.select().from(schema.internPayouts),
    getInternActivationFeeMinor(),
  ]);

  const employerName = new Map(employers.map((e) => [e.id, e.name]));
  const realIds = new Set(employers.map((e) => e.id));
  const internName = new Map(interns.map((u) => [u.id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || "Candidate"]));
  const scores = new Map<string, number>();
  const paidInterns = new Set(internPayments.filter((p) => p.status === "paid").map((p) => p.internId));
  const unpaidProfiles: { userId: string; createdAt: Date | null }[] = [];
  for (const o of onboarding) {
    const extra = (o.extraData ?? {}) as Record<string, unknown>;
    scores.set(o.userId, Number(extra.findternScore) || 0);
    const paid = ((extra.payment ?? {}) as Record<string, unknown>).isPaid === true || paidInterns.has(o.userId);
    // Legacy listed every unpaid onboarding row; only real profiles here.
    if (!paid && o.meaningful) unpaidProfiles.push({ userId: o.userId, createdAt: o.createdAt });
  }

  return computeReceivables(
    {
      ...range,
      employerName: (id) => employerName.get(id) ?? "Company",
      internName: (id) => internName.get(id) ?? "Candidate",
      scoreOf: (id) => scores.get(id) ?? 0,
      activationFeeMinor: feeMinor,
      proposals: proposals.filter((p) => realIds.has(p.employerId)),
      employerPayments,
      internPayments,
      unpaidProfiles,
      payouts,
    },
    filter,
  );
}
