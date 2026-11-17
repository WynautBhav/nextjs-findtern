import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { CalendarDays } from "lucide-react";

import { AdminLoadError, AdminPageHeader, Panel, PanelHeader } from "@/components/admin/panel";
import { StatusBadge } from "@/components/admin/status-badge";
import { ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { buttonClass } from "@/components/ui/button";
import { calendarConnected as checkCalendar } from "@/lib/calendar-status";
import { AdminPricingEditor, type EditablePlan } from "@/components/admin/admin-pricing-editor";
import { getSession } from "@/lib/auth";
import { canWrite } from "@/lib/admin/permissions";
import { getDb, schema } from "@/lib/db";
import Link from "next/link";
import { getEmployerSubscriptionConfig, getInternActivationFeeMinor, getPerHireFeeSetting, getSetting } from "@/lib/platform-settings";
import type { SubscriptionConfig } from "@/lib/employer-subscription";
import type { PerHireFeeSetting } from "@/lib/per-hire-fee";
import { singleFeatured } from "@/lib/pricing-featured";
import { INTERN_STIPEND_KEY, parseStipendBands, type StipendBands } from "@/lib/pricing-config";

export const metadata: Metadata = {
  title: "Pricing & Fees | Admin",
  robots: { index: false, follow: false },
};

async function loadPricing(): Promise<{ plans: EditablePlan[]; activationFeeMinor: number; perHireFee: PerHireFeeSetting; stipendBands: StipendBands; subscription: SubscriptionConfig } | null> {
  try {
    const [rows, activationFeeMinor, perHireFee, stipendRaw, subscription] = await Promise.all([
      getDb()
        .select()
        .from(schema.pricingPlans)
        .where(eq(schema.pricingPlans.currency, "INR"))
        .orderBy(asc(schema.pricingPlans.sortOrder)),
      getInternActivationFeeMinor(),
      getPerHireFeeSetting(),
      getSetting(INTERN_STIPEND_KEY),
      getEmployerSubscriptionConfig(),
    ]);
    return {
      activationFeeMinor,
      perHireFee,
      subscription,
      stipendBands: parseStipendBands(stipendRaw),
      // More than one row can be flagged (old writes, the seed, two saves at once): show the
      // most recently updated one as the choice, the way the next save will settle it.
      plans: singleFeatured(rows).map((r) => ({
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

/** Figures typed into copy rather than read from the settings above: a price change does not reach them. */
const HAND_EDITED: { what: string; where: string; href?: string }[] = [
  { what: "FAQ page copy", where: "Written in the site's code, so a developer changes it." },
  { what: "Intern terms (legal)", where: "Edited as a legal document.", href: "/admin/interns/terms" },
  { what: "Blog posts", where: "Edited in the CMS.", href: "/admin/cms?tab=blog" },
  { what: "CMS FAQ rows", where: "Edited in the CMS.", href: "/admin/cms?tab=faq" },
];

function HandEditedTexts() {
  return (
    <Panel>
      <PanelHeader
        title="Texts that still quote figures and must be edited by hand"
        description="Prices, stipends and fees saved above do not rewrite these. Check them after a change."
      />
      <ul className="divide-y divide-[color:var(--admin-rule)] px-5 pb-2 text-sm">
        {HAND_EDITED.map((t) => (
          <li key={t.what} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
            <span className="font-medium text-ink-800">{t.what}</span>
            {t.href ? (
              <Link href={t.href} className="text-brand-700 underline underline-offset-2">
                {t.where}
              </Link>
            ) : (
              <span className="text-text-subtle">{t.where}</span>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export default async function AdminSettingsPage() {
  const [pricing, calendarConnected] = await Promise.all([loadPricing(), checkCalendar()]);
  const permissions = (await getSession())?.permissions;
  const mayEdit = canWrite(permissions, "/api/admin/pricing");
  const mayEditSubscription = mayEdit && canWrite(permissions, "/api/admin/subscriptions");

  const calendar = (
      <Panel>
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
              <a href="/api/admin/google/connect" className={buttonClass({ variant: "outline", size: "sm", className: ADMIN_PILL_SECONDARY })}>
                {calendarConnected ? "Reconnect Google" : "Connect Google"}
              </a>
            </>
          }
        />
      </Panel>
  );

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Pricing and fees"
        subtitle="Prices are in rupees (the employer subscription included); USD is derived at ₹100 = $1. Changes save by themselves a moment after you stop typing and go live on the site as soon as they save."
      />
      {/* While disconnected it is the dashboard's top attention item, so it
          leads here too; once connected it sits at the end. */}
      {calendarConnected === false ? calendar : null}
      {pricing && !mayEdit ? (
        <p className="text-sm text-text-subtle">Editing prices needs the Edit website content permission.</p>
      ) : pricing ? (
        <AdminPricingEditor plans={pricing.plans} activationFeeMinor={pricing.activationFeeMinor} perHireFee={pricing.perHireFee} stipendBands={pricing.stipendBands} subscription={pricing.subscription} mayEditSubscription={mayEditSubscription} />
      ) : (
        <Panel>
          <AdminLoadError what="the rate card" retryHref="/admin/settings" />
        </Panel>
      )}

      {pricing ? <HandEditedTexts /> : null}

      {calendarConnected === false ? null : calendar}
    </div>
  );
}
