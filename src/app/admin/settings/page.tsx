import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { CalendarDays } from "lucide-react";

import { AdminLoadError, AdminPageHeader, Panel, PanelHeader } from "@/components/admin/panel";
import { StatusBadge } from "@/components/admin/status-badge";
import { buttonClass } from "@/components/ui/button";
import { CALENDAR_TOKEN_OWNER } from "@/lib/google";
import { AdminPricingEditor, type EditablePlan } from "@/components/admin/admin-pricing-editor";
import { getDb, schema } from "@/lib/db";
import { getInternActivationFeeMinor } from "@/lib/platform-settings";

export const metadata: Metadata = {
  title: "Pricing & Fees | Admin",
  robots: { index: false, follow: false },
};

async function loadPricing(): Promise<{ plans: EditablePlan[]; activationFeeMinor: number } | null> {
  try {
    const [rows, activationFeeMinor] = await Promise.all([
      getDb()
        .select()
        .from(schema.pricingPlans)
        .where(eq(schema.pricingPlans.currency, "INR"))
        .orderBy(asc(schema.pricingPlans.sortOrder)),
      getInternActivationFeeMinor(),
    ]);
    return {
      activationFeeMinor,
      plans: rows.map((r) => ({
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
      })),
    };
  } catch (e) {
    console.error("[admin/settings] pricing load failed", e);
    return null;
  }
}

/** null = couldn't check (shown as such, never as "not connected"). */
async function calendarState(): Promise<boolean | null> {
  try {
    const [token] = await getDb()
      .select({ refresh: schema.employerGoogleTokens.refreshToken })
      .from(schema.employerGoogleTokens)
      .where(eq(schema.employerGoogleTokens.employerId, CALENDAR_TOKEN_OWNER))
      .limit(1);
    return Boolean(token?.refresh);
  } catch (e) {
    console.error("[admin/settings] calendar token check failed", e);
    return null;
  }
}

export default async function AdminSettingsPage() {
  const [pricing, calendarConnected] = await Promise.all([loadPricing(), calendarState()]);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Pricing and fees"
        subtitle="The employer rate card and the intern activation fee. Prices are in rupees; USD is derived at ₹100 = $1. Changes go live on the next page load."
      />
      {pricing ? (
        <AdminPricingEditor plans={pricing.plans} activationFeeMinor={pricing.activationFeeMinor} />
      ) : (
        <Panel>
          <AdminLoadError what="the rate card" retryHref="/admin/settings" />
        </Panel>
      )}

      <Panel className="max-w-3xl">
        <PanelHeader
          title="Google Calendar (Meet links)"
          icon={CalendarDays}
          description={
            calendarConnected === null
              ? "Couldn't check the connection just now. Reload to try again."
              : calendarConnected
                ? "Connected. Interviews get a Meet link automatically when the candidate picks a slot."
                : "Not connected. Meet links have to be added by hand until it is."
          }
          action={
            <>
              {calendarConnected !== null ? (
                <StatusBadge
                  tone={calendarConnected ? "success" : "warning"}
                  label={calendarConnected ? "Connected" : "Not connected"}
                />
              ) : null}
              <a href="/api/admin/google/connect" className={buttonClass({ variant: "outline", size: "sm" })}>
                {calendarConnected ? "Reconnect Google" : "Connect Google"}
              </a>
            </>
          }
        />
      </Panel>
    </div>
  );
}
