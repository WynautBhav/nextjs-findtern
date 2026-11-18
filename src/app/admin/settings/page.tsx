import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { LeadStat, Overview, Section, StatList } from "@/components/app/stat";
import { buttonClass } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
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
    <Section title="Texts that quote figures" hint="Prices, stipends and fees saved above do not rewrite these. Check them after a change.">
      <ul className="divide-y divide-ink-200 border-b border-ink-200 text-sm">
        {HAND_EDITED.map((t) => (
          <li key={t.what} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
            <span className="font-medium text-ink-900">{t.what}</span>
            {t.href ? (
              <Link href={t.href} className="inline-flex min-h-8 items-center text-brand-700 underline underline-offset-4 hover:text-brand-900">
                {t.where}
              </Link>
            ) : (
              <span className="text-ink-600">{t.where}</span>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default async function AdminSettingsPage() {
  const [pricing, calendarConnected] = await Promise.all([loadPricing(), checkCalendar()]);
  const permissions = (await getSession())?.permissions;
  const mayEdit = canWrite(permissions, "/api/admin/pricing");
  const mayEditSubscription = mayEdit && canWrite(permissions, "/api/admin/subscriptions");

  const calendar = (
    <Section
      title="Google Calendar"
      hint="Meet links for interviews"
      action={
        <a href="/api/admin/google/connect" className={buttonClass({ variant: "outline", size: "sm" })}>
          {calendarConnected ? "Reconnect Google" : "Connect Google"}
        </a>
      }
    >
      <p className="flex items-start gap-2 border-b border-ink-200 pb-3 text-sm text-ink-800">
        {calendarConnected === true ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        ) : (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden />
        )}
        <span>
          <span className="font-medium">{calendarConnected === null ? "Status unknown. " : calendarConnected ? "Connected. " : "Not connected. "}</span>
          {calendarConnected === null
            ? "Couldn't check the connection just now. Reload to try again."
            : calendarConnected
              ? "Interviews get a Meet link automatically when the candidate picks a slot."
              : "Meet links have to be added by hand until it is."}
        </span>
      </p>
    </Section>
  );

  const rate = pricing
    ? {
        featured: pricing.plans.find((p) => p.isFeatured)?.displayName ?? null,
        charged: pricing.plans.filter((p) => p.priceHourlyMinor > 0 || p.perHireChargeMinor > 0).length,
      }
    : null;

  return (
    <div className="space-y-10">
      <AdminPageHeader
        title="Pricing and fees"
        subtitle="Prices are in rupees, the employer subscription included; USD is derived at ₹100 = $1. Changes save a moment after you stop typing and go live on the site as soon as they save."
      />
      {/* While disconnected it is the dashboard's top attention item, so it
          leads here too; once connected it sits at the end. */}
      {calendarConnected === false ? calendar : null}

      {pricing ? (
        <Overview
          lead={
            <LeadStat
              label="Intern activation fee"
              value={formatMoney(pricing.activationFeeMinor, "INR", { zeroLabel: "Free" })}
              note="Charged once to a candidate for the AI interview and onboarding, GST included. Promo codes apply on top."
            />
          }
          rest={
            <StatList
              items={[
                { label: "Employer subscription", value: pricing.subscription.enabled ? formatMoney(pricing.subscription.priceInrMinor, "INR") : "Off", hint: pricing.subscription.enabled ? `${pricing.subscription.durationDays} days of access` : "Employers cannot buy it" },
                ...(rate?.featured ? [{ label: "Most popular plan", value: rate.featured }] : []),
                { label: "Cappuccino stipend", value: formatMoney(pricing.stipendBands.skilled ?? 0, "INR", { zeroLabel: "None" }), hint: "Per month, by Findtern Score 6 to 8" },
                { label: "Latte stipend", value: formatMoney(pricing.stipendBands.assured ?? 0, "INR", { zeroLabel: "None" }), hint: "Per month, by Findtern Score 8 to 10" },
              ]}
            />
          }
        />
      ) : null}

      {pricing && !mayEdit ? (
        <p className="text-sm text-ink-600">Editing prices needs the Edit website content permission.</p>
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
