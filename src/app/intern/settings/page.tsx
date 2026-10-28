import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowRight } from "lucide-react";

import { DetailRow, PageHead, SectionHead, Surface } from "@/components/app/primitives";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { BankDetailsForm, type BankDetails } from "@/components/intern/bank-details-form";
import { ContactDetailsForm } from "@/components/intern/contact-details-form";
import { requireRole } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { SITE } from "@/lib/content/site";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

/** Legacy deep links (`/settings?view=…`, INT-37) land on the matching section. */
const VIEW_ANCHOR: Record<string, string> = {
  "bank-details": "bank",
  bank: "bank",
  "change-password": "password",
  password: "password",
};

/**
 * Settings: contact details, stipend bank account, password, and the
 * account facts support asks for. A failed read shows the error state
 * (app/intern/error.tsx) rather than empty forms that would overwrite data.
 */
export default async function InternSettings({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const session = await requireRole("intern");
  const { view } = await searchParams;
  if (view && VIEW_ANCHOR[view]) redirect(`/intern/settings#${VIEW_ANCHOR[view]}`);

  const uid = session.uid;
  const db = getDb();
  const [row] = await db
    .select({ extra: schema.internOnboarding.extraData })
    .from(schema.internOnboarding)
    .where(eq(schema.internOnboarding.userId, uid))
    .limit(1);
  const extra = (row?.extra ?? {}) as Record<string, unknown>;
  const initialBank = (extra.bankDetails ?? extra.bank ?? {}) as BankDetails;

  const [user] = await db
    .select({
      f: schema.users.firstName,
      l: schema.users.lastName,
      cc: schema.users.countryCode,
      p: schema.users.phoneNumber,
      email: schema.users.email,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, uid))
    .limit(1);
  const contact = user
    ? { firstName: user.f, lastName: user.l, countryCode: user.cc, phoneNumber: user.p }
    : { firstName: "", lastName: "", countryCode: "+91", phoneNumber: "" };

  return (
    <div>
      <PageHead title="Settings" lede="Your contact details, where your stipend is paid, and your password." />

      <div className="grid gap-x-10 gap-y-10 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-10">
          <section id="details" className="scroll-mt-24">
            <SectionHead title="Your details" hint="Your email is how you sign in, so it can't be changed here." />
            <Surface className="p-5 sm:p-6">
              <ContactDetailsForm userId={uid} initial={contact} />
            </Surface>
          </section>

          <section id="bank" className="scroll-mt-24">
            <SectionHead title="Bank account" hint="Your monthly stipend is paid into this account." />
            <BankDetailsForm initialBank={initialBank} />
          </section>

          <section id="password" className="scroll-mt-24">
            <SectionHead title="Password" hint="Used when you sign in with your email instead of Google." />
            <Surface className="p-5 sm:p-6">
              <ChangePasswordForm endpoint={`/api/users/${encodeURIComponent(uid)}/change-password`} />
            </Surface>
          </section>
        </div>

        <aside className="space-y-4">
          <Surface as="section" aria-labelledby="account-head" className="p-5">
            <h2 id="account-head" className="text-base font-semibold tracking-[-0.01em] text-ink-900">
              Your account
            </h2>
            <dl className="mt-2 divide-y divide-ink-100">
              <div className="py-3">
                <dt className="text-sm text-ink-600">Sign-in email</dt>
                <dd className="mt-0.5 break-all text-sm font-medium text-ink-900">{user?.email ?? session.email}</dd>
              </div>
              {/* Support finds you by this; quote it when you write in (INT-31). */}
              <div className="py-3">
                <dt className="text-sm text-ink-600">Findtern ID</dt>
                <dd className="mt-0.5 break-all font-mono text-xs font-medium text-ink-900">{uid}</dd>
                <dd className="mt-1 text-xs text-ink-600">Your account&apos;s reference number. Quote it when you write to support so we can find you.</dd>
              </div>
              {user?.createdAt ? (
                <DetailRow
                  label="Member since"
                  mono
                  value={new Date(user.createdAt).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" })}
                />
              ) : null}
            </dl>
            <Link
              href="/intern/profile"
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              See your profile as employers do
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Surface>

          <Surface as="section" aria-labelledby="help-head" className="p-5">
            <h2 id="help-head" className="text-base font-semibold tracking-[-0.01em] text-ink-900">
              Need help?
            </h2>
            <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-600">
              Write to{" "}
              <a href={`mailto:${SITE.email}`} className="font-medium text-primary underline-offset-4 hover:underline">
                {SITE.email}
              </a>{" "}
              with your Findtern ID. The team replies within one working day.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              <Link href="/faq#interns" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">
                Intern FAQ
              </Link>
              <Link href="/contact" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">
                Contact page
              </Link>
            </div>
          </Surface>
        </aside>
      </div>
    </div>
  );
}
