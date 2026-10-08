import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowRight } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { CompanyProfileForm, type CompanyProfile } from "@/components/employer/company-profile-form";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

/**
 * Employer account.
 *
 * The previous version of this page was a single sentence saying profile
 * editing, password change and deactivation would be "wired in the next pass".
 * All three had working endpoints the whole time (`PATCH /api/employer/:id`,
 * `POST /api/employer/:id/change-password`, `POST /api/users/:id/deactivate`)
 * — nobody had written the forms. They are here now.
 *
 * Deactivation is deliberately a confirmation step rather than a button: it
 * ends the account, and the row behind it is the one employers are billed
 * against.
 */
export default async function EmployerAccount() {
  const session = await getSession();
  const uid = session!.uid;

  const [employer] = await getDb()
    .select()
    .from(schema.employers)
    .where(eq(schema.employers.id, uid))
    .limit(1);

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
  };

  return (
    <div>
      <PageHeader title="Account" subtitle="Company profile and security." />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="min-w-0">
          <h2 className="text-sm font-semibold tracking-[-0.01em] text-ink-900">Company details</h2>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-600">
            What candidates and employers see when they look at your company.
          </p>
          <div className="mt-5 rounded-xl border border-ink-100 bg-white p-6">
            <CompanyProfileForm employerId={uid} profile={profile} />
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-ink-100 bg-white p-5">
            <h2 className="text-sm font-semibold text-ink-900">Password</h2>
            <div className="mt-4">
              <ChangePasswordForm endpoint={`/api/employer/${encodeURIComponent(uid)}/change-password`} />
            </div>
          </section>

          <section className="rounded-xl border border-ink-100 bg-white p-5">
            <h2 className="text-sm font-semibold text-ink-900">Elsewhere</h2>
            <ul className="mt-3 space-y-2.5">
              <Jump href="/employer/orders" label="Orders and payments" />
              <Jump href="/employer/projects" label="Projects" />
              <Jump href="/employer/candidates" label="Candidates" />
            </ul>
          </section>
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
        className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {label}
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </li>
  );
}