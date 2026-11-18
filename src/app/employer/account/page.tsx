import type { Metadata } from "next";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { PageHeader } from "@/components/layout/page-header";
import { CompanyProfileForm, type CompanyProfile } from "@/components/employer/company-profile-form";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { NotificationPrefs } from "@/components/notifications/notification-prefs";
import { missingProfileFields } from "@/lib/employer-onboarding";
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

  const profileStatus =
    missing.length === 0 ? (
      <span className="text-success">Complete</span>
    ) : (
      <span className="text-[#9a4a08]">{missing.every((m) => m.startsWith("Escalation")) ? "Escalation contact to add" : `${missing.length} to fill in`}</span>
    );

  return (
    <div className="pb-6 lg:pb-0">
      <PageHeader title="Company profile" subtitle="Candidates never see your contacts." />

      <div className="grid gap-x-14 gap-y-12 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <section aria-label="Company details" className="min-w-0">
          <CompanyProfileForm employerId={uid} profile={profile} hasLogo={Boolean(employer?.logoUrl)} />
        </section>

        <aside className="min-w-0 space-y-10 xl:sticky xl:top-24 xl:self-start">
          {/* Who you are on a proposal, said once, then the account's facts as a ruled list. */}
          <section aria-label="Your company">
            <p className="break-words font-display text-2xl font-semibold tracking-[-0.02em] text-ink-900">{profile.companyName || "Your company"}</p>
            <p className="mt-1 text-sm text-ink-700">
              {[profile.city, profile.country].filter(Boolean).join(", ") || "Location not set"}
              {profile.companySize ? ` · ${profile.companySize} people` : ""}
            </p>
            <p className="mt-1 text-sm text-ink-600">How you appear on proposals. Contacts stay private.</p>
            <dl className="mt-4 divide-y divide-ink-200 border-y border-ink-200">
              <div className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-sm text-ink-700">Timezone</dt>
                <dd className="text-sm font-medium text-ink-900">{timezoneForLocation(profile)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-sm text-ink-700">Member since</dt>
                <dd className="nums text-sm font-medium text-ink-900">{employer?.createdAt ? formatDate(employer.createdAt) : "-"}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-sm text-ink-700">Profile</dt>
                <dd className="text-sm font-medium">{profileStatus}</dd>
              </div>
            </dl>
          </section>

          <section id="notifications" className="scroll-mt-24" aria-labelledby="notifications-title">
            <h2 id="notifications-title" className="mb-3 border-b border-ink-200 pb-2 font-display text-lg font-semibold text-ink-900">
              Notifications
            </h2>
            <NotificationPrefs role="employer" initial={{ emailMessages: prefs?.emailMessages ?? true, pushMessages: prefs?.pushMessages ?? true }} />
          </section>

          <section id="security" className="scroll-mt-24" aria-labelledby="security-title">
            <h2 id="security-title" className="mb-3 border-b border-ink-200 pb-2 font-display text-lg font-semibold text-ink-900">
              Password
            </h2>
            <ChangePasswordForm endpoint={`/api/employer/${encodeURIComponent(uid)}/change-password`} />
          </section>
        </aside>
      </div>
    </div>
  );
}
