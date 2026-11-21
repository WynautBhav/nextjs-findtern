import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { CalendarDays, HardDrive } from "lucide-react";

import { AdminLoadError, AdminPageHeader, Panel, PanelHeader } from "@/components/admin/panel";
import { StatusBadge } from "@/components/admin/status-badge";
import { ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { buttonClass } from "@/components/ui/button";
import { calendarConnected as checkCalendar, driveConnection as checkDrive, type DriveConnection } from "@/lib/calendar-status";
import { GoogleDriveResetButton } from "@/components/admin/google-drive-reset-button";
import { AdminPricingEditor, type EditablePlan } from "@/components/admin/admin-pricing-editor";
import { getSession } from "@/lib/auth";
import { canWrite } from "@/lib/admin/permissions";
import { getDb, schema } from "@/lib/db";
import Link from "next/link";
import { getEmployerSubscriptionConfig, getInternActivationFeeMinor, getPerHireFeeSetting, getSetting, getUpfrontDiscount } from "@/lib/platform-settings";
import type { UpfrontDiscount } from "@/lib/upfront-discount";
import type { SubscriptionConfig } from "@/lib/employer-subscription";
import type { PerHireFeeSetting } from "@/lib/per-hire-fee";
import { singleFeatured } from "@/lib/pricing-featured";
import { INTERN_STIPEND_KEY, parseStipendBands, type StipendBands } from "@/lib/pricing-config";

export const metadata: Metadata = {
  title: "Pricing & Fees | Admin",
  robots: { index: false, follow: false },
};

async function loadPricing(): Promise<{ plans: EditablePlan[]; activationFeeMinor: number; perHireFee: PerHireFeeSetting; stipendBands: StipendBands; subscription: SubscriptionConfig; upfrontDiscount: UpfrontDiscount } | null> {
  try {
    const [rows, activationFeeMinor, perHireFee, stipendRaw, subscription, upfrontDiscount] = await Promise.all([
      getDb()
        .select()
        .from(schema.pricingPlans)
        .where(eq(schema.pricingPlans.currency, "INR"))
        .orderBy(asc(schema.pricingPlans.sortOrder)),
      getInternActivationFeeMinor(),
      getPerHireFeeSetting(),
      getSetting(INTERN_STIPEND_KEY),
      getEmployerSubscriptionConfig(),
      getUpfrontDiscount(),
    ]);
    return {
      upfrontDiscount,
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

/** What the Google connect screens redirect back with (`?google=`). */
const GOOGLE_NOTICE: Record<string, { text: string; ok: boolean }> = {
  connected: { text: "Google Calendar is connected.", ok: true },
  drive_connected: { text: "Google Drive is connected. AI reports will be saved to that account.", ok: true },
  no_refresh_token: {
    text: "Google didn't give Findtern a lasting sign-in. Remove Findtern under that Google account's third-party access, then connect again.",
    ok: false,
  },
  failed: { text: "The Google connection didn't finish. Try again.", ok: false },
};

const DRIVE_COPY: Record<Exclude<DriveConnection, null>, { badge: string; tone: "success" | "warning"; text: string }> = {
  own: {
    badge: "Own Drive account",
    tone: "success",
    text: "AI report PDFs are saved to a Google account set up only for Drive. The calendar account is not affected.",
  },
  calendar: {
    badge: "Using the calendar account",
    tone: "success",
    text: "AI report PDFs are saved to the same Google account as the calendar. Change it any time to keep reports in another account.",
  },
  no_drive_access: {
    badge: "Needs Drive access",
    tone: "warning",
    text: "Connected, but Google wasn't allowed to use Drive. Connect again and keep the Drive box ticked.",
  },
  none: {
    badge: "Not connected",
    tone: "warning",
    text: "Not connected. AI reports can be checked but not saved until a Google account is connected for Drive.",
  },
};

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<{ google?: string | string[] }> }) {
  const [pricing, calendarConnected, drive, params] = await Promise.all([loadPricing(), checkCalendar(), checkDrive(), searchParams]);
  const googleParam = Array.isArray(params.google) ? params.google[0] : params.google;
  const notice = googleParam ? GOOGLE_NOTICE[googleParam] : undefined;
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

  const driveCopy = drive ? DRIVE_COPY[drive] : null;
  const driveCard = (
    <Panel>
      <PanelHeader
        title="Google Drive (AI report storage)"
        icon={HardDrive}
        description={driveCopy?.text ?? "Couldn't check the connection just now. Reload to try again."}
        action={
          <>
            {driveCopy ? <StatusBadge tone={driveCopy.tone} label={driveCopy.badge} /> : null}
            <a href="/api/admin/google/connect?slot=drive" className={buttonClass({ variant: "outline", size: "sm", className: ADMIN_PILL_SECONDARY })}>
              {drive === "none" ? "Connect Drive" : "Change Drive account"}
            </a>
            {drive === "own" ? <GoogleDriveResetButton /> : null}
          </>
        }
      />
    </Panel>
  );

  return (
    <div className="space-y-8">
      {notice ? (
        <p
          role="status"
          className={`rounded-[var(--radius-admin-card)] border border-[color:var(--admin-rule)] px-4 py-3 text-sm font-medium ${notice.ok ? "text-ink-800" : "text-danger"}`}
        >
          {notice.text}
        </p>
      ) : null}
      <AdminPageHeader
        title="Pricing and fees"
        subtitle="Prices are in rupees; USD is derived at ₹100 = $1. The Findtern Pro price is entered excluding GST: India pays 18% GST on top, USD buyers pay no GST. Changes save by themselves a moment after you stop typing and go live on the site as soon as they save."
      />
      {/* While disconnected it is the dashboard's top attention item, so it
          leads here too; once connected it sits at the end. */}
      {calendarConnected === false ? calendar : null}
      {pricing && !mayEdit ? (
        <p className="text-sm text-text-subtle">Editing prices needs the Accounts permission (transactions:write).</p>
      ) : pricing ? (
        <AdminPricingEditor plans={pricing.plans} activationFeeMinor={pricing.activationFeeMinor} perHireFee={pricing.perHireFee} stipendBands={pricing.stipendBands} subscription={pricing.subscription} mayEditSubscription={mayEditSubscription} upfrontDiscount={pricing.upfrontDiscount} />
      ) : (
        <Panel>
          <AdminLoadError what="the rate card" retryHref="/admin/settings" />
        </Panel>
      )}

      {pricing ? <HandEditedTexts /> : null}

      {calendarConnected === false ? null : calendar}
      {driveCard}
    </div>
  );
}
