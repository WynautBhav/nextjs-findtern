import type { Metadata } from "next";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { DetailRow, SectionHead, Surface } from "@/components/app/primitives";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { PageHeader } from "@/components/layout/page-header";
import { CompanyProfileForm, type CompanyProfile } from "@/components/employer/company-profile-form";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { NotificationPrefs } from "@/components/notifications/notification-prefs";
import { missingProfileFields } from "@/lib/employer-onboarding";
import { HeroPanel } from "@/components/employer/kit/hero-panel";
import { formatDate } from "@/lib/format";
import { timezoneForLocation } from "@/lib/timezones";

export const metadata: Metadata = {
  title: "Company profile",
  robots: { index: false, follow: false },
};

/**
 * Company profile and security.
 *
 * The profile form on the left, the account's facts and the password on the
 * right. The sidebar's "Change password" lands on `#security`.
 */
export default async function EmployerAccount() {
  const session = await requireRole("employer");
  const uid = session.uid;

  let employer: typeof schema.employers.$inferSelect | undefined;
  let prefs: { emailMessages: boolean; pushMessages: boolean } | undefined;
  try {
    [employer] = await getDb().select().from(schema.employers).where(eq(schema.employers.id, uid)).limit(1);
    [prefs] = await getDb()
      .select({ emailMessages: schema.notificationPrefs.emailMessages, pushMessages: schema.notificationPrefs.pushMessages })
      .from(schema.notificationPrefs)
      .where(eq(schema.notificationPrefs.userId, uid))
      .limit(1);
  } catch (err) {
    console.error("Failed to load employer account:", err);
    return (
      <div>
        <PageHeader title="Company profile" />
        <LoadError what="your company profile" retryHref="/employer/account" email={SITE.adminEmail} />
      </div>
    );
  }

  const profile: CompanyProfile = {
    companyName: employer?.companyName ?? "",
    companyEmail: employer?.companyEmail ?? "",
    websiteUrl: employer?.websiteUrl ?? null,
    companySize: employer?.companySize ?? null,
    country: employer?.country ?? null,
    state: employer?.state ?? null,
    city: employer?.city ?? null,
    primaryContactName: employer?.primaryContactName ?? null,
    primaryContactRole: employer?.primaryContactRole ?? null,
    countryCode: employer?.countryCode ?? "+91",
    phoneNumber: employer?.phoneNumber ?? "",
    escalationContactName: employer?.escalationContactName ?? null,
    escalationContactRole: employer?.escalationContactRole ?? null,
    escalationContactEmail: employer?.escalationContactEmail ?? null,
    escalationContactCountryCode: employer?.escalationContactCountryCode ?? null,
    escalationContactPhone: employer?.escalationContactPhone ?? null,
    gstNumber: employer?.gstNumber ?? null,
    billingPincode: employer?.billingPincode ?? null,
  };
  const missing = employer ? missingProfileFields(employer) : [];

  return (
    <div>
      <PageHeader
        title="Company profile"
        subtitle="Candidates never see your contacts."
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Surface as="section" className="p-5 sm:p-8" aria-label="Company details">
          <CompanyProfileForm employerId={uid} profile={profile} hasLogo={Boolean(employer?.logoUrl)} />
        </Surface>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-24 xl:self-start">
          <HeroPanel className="p-6">
            <span aria-hidden className="grid size-14 place-items-center rounded-apple-lg bg-white/15 text-xl font-medium ring-1 ring-white/25">
              {(profile.companyName.trim()[0] ?? "C").toUpperCase()}
            </span>
            <p className="mt-4 break-words text-xl font-medium tracking-[-0.02em]">{profile.companyName || "Your company"}</p>
            <p className="mt-1 text-sm text-on-dark-subtle">
              {[profile.city, profile.country].filter(Boolean).join(", ") || "Location not set"}
              {profile.companySize ? ` · ${profile.companySize} people` : ""}
            </p>
            <p className="mt-4 text-xs text-on-dark-subtle">How you appear on proposals. Contacts stay private.</p>
          </HeroPanel>
          <Surface className="p-5">
            <SectionHead title="Account" />
            <dl className="divide-y divide-ink-100">
              <DetailRow label="Timezone" value={timezoneForLocation(profile)} />
              <DetailRow label="Member since" value={employer?.createdAt ? formatDate(employer.createdAt) : "-"} mono />
              <DetailRow
                label="Profile"
                value={
                  missing.length === 0 ? (
                    <span className="text-success">Complete</span>
                  ) : (
                    <span className="text-accent-700">
                      {missing.every((m) => m.startsWith("Escalation")) ? "Escalation contact to add" : `${missing.length} to fill in`}
                    </span>
                  )
                }
              />
            </dl>
          </Surface>

          <Surface as="section" id="notifications" className="scroll-mt-24 p-5" aria-labelledby="notifications-title">
            <h2 id="notifications-title" className="mb-4 text-base font-semibold text-ink-900">
              Notifications
            </h2>
            <NotificationPrefs role="employer" initial={{ emailMessages: prefs?.emailMessages ?? true, pushMessages: prefs?.pushMessages ?? true }} />
          </Surface>

          <Surface as="section" id="security" className="scroll-mt-24 p-5" aria-labelledby="security-title">
            <h2 id="security-title" className="mb-4 text-base font-semibold text-ink-900">
              Password
            </h2>
            <ChangePasswordForm endpoint={`/api/employer/${encodeURIComponent(uid)}/change-password`} />
          </Surface>

        </aside>
      </div>
    </div>
  );
}
