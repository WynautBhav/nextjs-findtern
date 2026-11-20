import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { DetailRow, PageHead, SectionHead, Surface } from "@/components/app/primitives";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { CopyIdButton } from "@/components/intern/copy-id-button";
import { ActivityVisibilityToggle } from "@/components/intern/activity-visibility-toggle";
import { NotificationPrefs } from "@/components/notifications/notification-prefs";
import { CollegeForm } from "@/components/intern/college-form";
import { BankDetailsForm, type BankDetails } from "@/components/intern/bank-details-form";
import { InvoiceList } from "@/components/intern/invoice-list";
import { ContactDetailsForm } from "@/components/intern/contact-details-form";
import { NewTabLink } from "@/components/ui/new-tab-link";
import type { MyCollege } from "@/lib/college/membership";
import { formatDate } from "@/lib/format";
import type { ownInternInvoices } from "@/lib/intern-invoice";
import { SITE } from "@/lib/content/site";

const SECTIONS: [id: string, label: string][] = [
  ["details", "Your details"],
  ["bank", "Bank account"],
  ["college", "College"],
  ["privacy", "Privacy"],
  ["notifications", "Notifications"],
  ["invoices", "Invoices"],
  ["password", "Password"],
];

/** Props only: `page.tsx` reads the data, this draws it (so a fixture can render it too). */
export function SettingsView({
  uid,
  email,
  createdAt,
  contact,
  initialBank,
  college,
  activityVisible,
  prefs,
  invoices,
}: {
  uid: string;
  email: string;
  createdAt: Date | null;
  contact: React.ComponentProps<typeof ContactDetailsForm>["initial"];
  initialBank: BankDetails;
  college: MyCollege | null;
  activityVisible: boolean;
  prefs: { emailMessages: boolean; pushMessages: boolean };
  invoices: ReturnType<typeof ownInternInvoices>;
}) {
  return (
    <div>
      <PageHead title="Settings" />

      {/* One long page: jump links instead of a lede that lists the same sections. */}
      <nav aria-label="Settings sections" data-first-content className="-mt-2 mb-8">
        <ul className="flex flex-wrap gap-2">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="inline-flex h-11 items-center rounded-full px-4 text-sm font-medium text-ink-700 ring-1 ring-inset ring-ink-200 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-10">
          <section id="details" className="scroll-mt-24">
            <SectionHead title="Your details" hint="Your email is how you sign in, so it can't be changed here." />
            <Surface className="p-5 lg:p-6">
              <ContactDetailsForm userId={uid} initial={contact} />
            </Surface>
          </section>

          <section id="bank" className="scroll-mt-24">
            <SectionHead title="Bank account" hint="Your monthly stipend is paid into this account." />
            <BankDetailsForm initialBank={initialBank} />
          </section>

          <section id="college" className="scroll-mt-24">
            <SectionHead
              title="College"
              hint="Enter the code your college's placement cell gave you, so its placement team and virtual drives can find you. Your profile itself doesn't change."
            />
            <CollegeForm
              initial={college}
              vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
            />
          </section>

          <section id="privacy" className="scroll-mt-24">
            <SectionHead title="Privacy" hint="What employers can see about you while you browse." />
            <Surface className="p-5 lg:p-6">
              <ActivityVisibilityToggle initial={activityVisible} />
            </Surface>
          </section>

          <section id="notifications" className="scroll-mt-24">
            <SectionHead title="Notifications" hint="Choose which optional emails you get." />
            <Surface className="p-5 lg:p-6">
              <NotificationPrefs role="intern" initial={prefs} />
            </Surface>
          </section>

          <section id="invoices" className="scroll-mt-24">
            <SectionHead title="Invoices" hint="Tax invoices for your activation fee." />
            <Surface className="p-5 lg:p-6">
              <InvoiceList invoices={invoices} />
            </Surface>
          </section>

          <section id="password" className="scroll-mt-24">
            <SectionHead title="Password" hint="Used when you sign in with your email instead of Google." />
            <Surface className="p-5 lg:p-6">
              <ChangePasswordForm endpoint={`/api/users/${encodeURIComponent(uid)}/change-password`} />
            </Surface>
          </section>
        </div>

        <aside className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Surface as="section" aria-labelledby="account-head" className="p-5">
            <h2 id="account-head" className="text-base font-semibold tracking-[-0.01em] text-ink-900">
              Your account
            </h2>
            <dl className="mt-2 divide-y divide-ink-100">
              <div className="py-3">
                <dt className="text-sm text-text-subtle">Sign-in email</dt>
                <dd className="mt-1 break-all text-sm font-medium text-ink-900">{email}</dd>
              </div>
              {/* Support finds you by this; quote it when you write in (INT-31). */}
              <div className="py-3">
                <dt className="text-sm text-text-subtle">Findtern ID</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-x-3">
                  <span className="select-all break-all font-mono text-sm font-medium text-ink-900">{uid}</span>
                  <CopyIdButton id={uid} />
                </dd>
                <dd className="mt-1 text-pretty text-xs text-text-subtle">Your account&apos;s reference number. Quote it when you write to support so we can find you.</dd>
              </div>
              {createdAt ? (
                <DetailRow
                  label="Member since"
                  mono
                  value={formatDate(createdAt)}
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
            <p className="mt-2 text-pretty text-sm leading-relaxed text-text-subtle">
              Write to{" "}
              <a href={`mailto:${SITE.email}`} className="font-medium text-primary underline-offset-4 hover:underline touch:inline-flex touch:min-h-11 touch:items-center">
                {SITE.email}
              </a>{" "}
              with your Findtern ID. The team replies within one working day.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              <NewTabLink href="/faq#interns" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">
                Intern FAQ
              </NewTabLink>
              <NewTabLink href="/contact" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">
                Contact page
              </NewTabLink>
            </div>
          </Surface>
        </aside>
      </div>
    </div>
  );
}
