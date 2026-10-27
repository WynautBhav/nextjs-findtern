import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowRight, KeyRound } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { DetailRow, EmptyScene, SectionHead, Surface } from "@/components/app/primitives";
import { PageHeader } from "@/components/layout/page-header";
import { CompanyProfileForm, type CompanyProfile } from "@/components/employer/company-profile-form";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { missingCompanyFields } from "@/lib/employer-onboarding";
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
  try {
    [employer] = await getDb().select().from(schema.employers).where(eq(schema.employers.id, uid)).limit(1);
  } catch (err) {
    console.error("Failed to load employer account:", err);
    return (
      <div>
        <PageHeader title="Company profile" />
        <EmptyScene
          art
          title="Couldn't load your company profile"
          body="Something went wrong on our side. Nothing has changed - reload the page in a moment."
          who="Us - a connection issue"
        />
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
  const missing = employer ? missingCompanyFields(employer) : [];

  return (
    <div>
      <PageHeader
        title="Company profile"
        subtitle="Your company's details, who we contact, and how you sign in. Candidates never see your contacts."
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Surface as="section" className="p-5 sm:p-8" aria-label="Company details">
          <CompanyProfileForm employerId={uid} profile={profile} hasLogo={Boolean(employer?.logoUrl)} />
        </Surface>

        <aside className="min-w-0 space-y-4">
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
                    <span className="text-accent-700">{missing.length} to fill in</span>
                  )
                }
              />
            </dl>
          </Surface>

          <Surface as="section" id="security" className="scroll-mt-24 p-5" aria-labelledby="security-title">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-apple-sm bg-brand-50 text-brand-700">
                <KeyRound className="size-4" aria-hidden />
              </span>
              <h2 id="security-title" className="text-base font-semibold tracking-[-0.01em] text-ink-900">
                Password
              </h2>
            </div>
            <ChangePasswordForm endpoint={`/api/employer/${encodeURIComponent(uid)}/change-password`} />
          </Surface>

          <Surface className="p-5">
            <SectionHead title="Elsewhere" />
            <ul className="-mx-2">
              <Jump href="/employer/projects" label="Projects" />
              <Jump href="/employer/orders" label="Orders and invoices" />
              <Jump href="/employer/alerts" label="Alerts" />
            </ul>
          </Surface>
        </aside>
      </div>
    </div>
  );
}

function Jump({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="apple-spring group flex min-h-11 items-center justify-between rounded-apple-sm px-2 text-sm font-medium text-ink-800 hover:bg-ink-50 hover:text-brand-700"
      >
        {label}
        <ArrowRight className="size-4 text-ink-400 group-hover:text-brand-700" aria-hidden />
      </Link>
    </li>
  );
}
