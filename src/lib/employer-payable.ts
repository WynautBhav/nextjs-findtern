/**
 * Payable checkout computation, shared by the checkout page (to render) and
 * the Razorpay order route (to price). The route never trusts a posted
 * amount: if the client could name the total, an employer could pay less by
 * editing the request. Both sides call this one function so the number on
 * screen and the number charged cannot drift apart.
 *
 * The payable set is *accepted* proposals — a cart row is an intention, an
 * accepted proposal is a commitment, and only the second is worth billing.
 */

import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { scoreOf } from "@/lib/employer-candidates";
import {
  durationMonths,
  normaliseCurrency,
  resolvePricing,
  type Currency,
} from "@/lib/employer-pricing";

export type OfferDetails = {
  roleTitle?: string;
  duration?: string;
  monthlyAmount?: number;
  totalPrice?: number;
  hourlyRate?: number;
  perHireCharge?: number;
  laptop?: string;
};

export const DURATION_LABEL: Record<string, string> = {
  "1m": "1 month",
  "2m": "2 months",
  "3m": "3 months",
  "6m": "6 months",
};

export type PayableLine = {
  id: string;
  internName: string;
  internId: string;
  projectName: string | null;
  roleTitle: string;
  durationLabel: string;
  months: number;
  monthly: number;
  internshipTotal: number;
  perHire: number;
  currency: Currency;
  source: "offer" | "band";
};

export type PayableCheckout = {
  lines: PayableLine[];
  /** Per-currency order total in MAJOR units (internship + per-hire). */
  totals: Map<Currency, number>;
  region: "IN" | null;
  defaultCurrency: Currency;
  hasPlans: boolean;
  prefill: { name?: string; email?: string; contact?: string };
};

export async function payableCheckout(employerId: string): Promise<PayableCheckout> {
  const db = getDb();

  const [employer] = await db
    .select({
      name: schema.employers.name,
      companyEmail: schema.employers.companyEmail,
      countryCode: schema.employers.countryCode,
      phoneNumber: schema.employers.phoneNumber,
    })
    .from(schema.employers)
    .where(eq(schema.employers.id, employerId))
    .limit(1);

  const region: "IN" | null = employer?.phoneNumber?.startsWith("91") ? "IN" : null;
  const defaultCurrency: Currency = region === "IN" ? "INR" : "USD";
  const prefill = {
    name: employer?.name,
    email: employer?.companyEmail,
    contact: employer ? `${employer.countryCode}${employer.phoneNumber}` : undefined,
  };

  let hasPlans = false;
  let plans: (typeof schema.pricingPlans.$inferSelect)[] = [];
  try {
    plans = await db
      .select()
      .from(schema.pricingPlans)
      .where(eq(schema.pricingPlans.isActive, true));
    hasPlans = plans.length > 0;
  } catch {
    // Not fatal: the score-band fallback in lib/score covers pricing.
  }

  const proposals = await db
    .select()
    .from(schema.proposals)
    .where(and(eq(schema.proposals.employerId, employerId), eq(schema.proposals.status, "accepted")))
    .orderBy(desc(schema.proposals.updatedAt));

  let lines: PayableLine[] = [];

  if (proposals.length > 0) {
    const internIds = Array.from(new Set(proposals.map((p) => p.internId)));
    const projectIds = Array.from(new Set(proposals.map((p) => p.projectId)));

    const userRows = await db
      .select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName })
      .from(schema.users)
      .where(inArray(schema.users.id, internIds));
    const namesById = new Map(
      userRows.map((row) => [row.id, `${row.firstName} ${row.lastName}`.trim()] as const),
    );

    const onboardingRows = await db
      .select()
      .from(schema.internOnboarding)
      .where(inArray(schema.internOnboarding.userId, internIds));
    const onboardingByUser = new Map(onboardingRows.map((row) => [row.userId, row]));

    const projectRows = await db
      .select({ id: schema.projects.id, projectName: schema.projects.projectName })
      .from(schema.projects)
      .where(and(eq(schema.projects.employerId, employerId), inArray(schema.projects.id, projectIds)));
    const projectsById = new Map(projectRows.map((row) => [row.id, row.projectName]));

    lines = proposals.map((proposal) => {
      const offer = (proposal.offerDetails ?? {}) as OfferDetails;
      const currency = normaliseCurrency(proposal.currency);
      const months = durationMonths(offer.duration);
      const band = resolvePricing(
        scoreOf(onboardingByUser.get(proposal.internId)),
        plans,
        currency,
        region,
      );

      const monthly =
        typeof offer.monthlyAmount === "number" && offer.monthlyAmount > 0
          ? offer.monthlyAmount
          : typeof offer.hourlyRate === "number"
            ? offer.hourlyRate * 120
            : 0;
      const perHire =
        typeof offer.perHireCharge === "number" ? offer.perHireCharge : band.perHireMinor / 100;
      const internshipTotal =
        typeof offer.totalPrice === "number" && offer.totalPrice > 0
          ? offer.totalPrice
          : monthly * months;

      return {
        id: proposal.id,
        internName: namesById.get(proposal.internId) ?? "Intern",
        internId: proposal.internId,
        projectName: projectsById.get(proposal.projectId) ?? null,
        roleTitle: offer.roleTitle || projectsById.get(proposal.projectId) || "Internship",
        durationLabel:
          DURATION_LABEL[offer.duration ?? ""] ?? `${months} month${months === 1 ? "" : "s"}`,
        months,
        monthly,
        internshipTotal,
        perHire,
        currency,
        source: typeof offer.totalPrice === "number" && offer.totalPrice > 0 ? "offer" : "band",
      };
    });
  }

  const totals = new Map<Currency, number>();
  for (const line of lines) {
    totals.set(line.currency, (totals.get(line.currency) ?? 0) + line.internshipTotal + line.perHire);
  }

  return { lines, totals, region, defaultCurrency, hasPlans, prefill };
}
