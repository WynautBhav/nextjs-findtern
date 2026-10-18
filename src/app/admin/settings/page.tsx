import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";

import { AdminPageHeader } from "@/components/admin/panel";
import { CALENDAR_TOKEN_OWNER } from "@/lib/google";
import { AdminPricingEditor, type EditablePlan } from "@/components/admin/admin-pricing-editor";
import { getDb, schema } from "@/lib/db";
import { getInternActivationFeeMinor } from "@/lib/platform-settings";

export const metadata: Metadata = {
  title: "Pricing & Fees | Admin",
  robots: { index: false, follow: false },
};

export default async function AdminSettingsPage() {
  const db = getDb();
  const [rows, activationFeeMinor] = await Promise.all([
    db
      .select()
      .from(schema.pricingPlans)
      .where(eq(schema.pricingPlans.currency, "INR"))
      .orderBy(asc(schema.pricingPlans.sortOrder)),
    getInternActivationFeeMinor(),
  ]);

  const plans: EditablePlan[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    displayName: r.displayName,
    priceHourlyMinor: r.priceHourlyMinor,
    perHireChargeMinor: r.perHireChargeMinor,
    compareAtHourlyMinor: r.compareAtHourlyMinor,
    compareAtPerHireMinor: r.compareAtPerHireMinor,
    internshipDuration: r.internshipDuration ?? "",
    features: r.features ?? [],
    featureList: r.featureList ?? [],
    isFeatured: r.isFeatured,
    isActive: r.isActive,
  }));

  let calendarConnected = false;
  try {
    const [token] = await getDb()
      .select({ refresh: schema.employerGoogleTokens.refreshToken })
      .from(schema.employerGoogleTokens)
      .where(eq(schema.employerGoogleTokens.employerId, CALENDAR_TOKEN_OWNER))
      .limit(1);
    calendarConnected = Boolean(token?.refresh);
  } catch {}

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Pricing & Fees"
        subtitle="The employer rate card and the intern activation fee. Prices are in rupees; USD is derived at ₹100 = $1. Changes go live on the next page load."
      />
      <AdminPricingEditor plans={plans} activationFeeMinor={activationFeeMinor} />

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-ink-100 bg-white p-6">
          <h2 className="text-sm font-semibold text-ink-900">Google Calendar (Meet links)</h2>
          <p className="mt-1 text-xs text-text-subtle">
            {calendarConnected
              ? "Connected. Interviews get a Meet link automatically when the candidate picks a slot."
              : "Not connected. Meet links have to be added by hand until it is."}
          </p>
          <a
            href="/api/admin/google/connect"
            className="mt-4 inline-flex min-h-10 items-center rounded-[10px] border border-ink-200 px-3.5 text-xs font-semibold text-ink-800 hover:bg-ink-50"
          >
            {calendarConnected ? "Reconnect Google" : "Connect Google"}
          </a>
        </div>
      </section>
    </div>
  );
}
