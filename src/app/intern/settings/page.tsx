import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gt, isNotNull, sql } from "drizzle-orm";
import { ArrowRight } from "lucide-react";

import { DetailRow, PageHead, SectionHead, Surface } from "@/components/app/primitives";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { CollegeForm } from "@/components/intern/college-form";
import { BankDetailsForm, type BankDetails } from "@/components/intern/bank-details-form";
import { InvoiceList } from "@/components/intern/invoice-list";
import { ContactDetailsForm } from "@/components/intern/contact-details-form";
import { requireRole } from "@/lib/auth";
import { membershipOf } from "@/lib/college/membership";
import { getDb, schema } from "@/lib/db";
import { formatDmy } from "@/lib/format";
import { ownInternInvoices } from "@/lib/intern-invoice";
import { getInvoiceSeller } from "@/lib/invoice-seller";
import { SITE } from "@/lib/content/site";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

/** Legacy deep links (`/settings?view=…`, INT-37) land on the matching section. */
const VIEW_ANCHOR: Record<string, string> = {
  "bank-details": "bank",
  bank: "bank",
  college: "college",
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
  const [[row], [user], college, payments] = await Promise.all([
    db
      .select({ extra: schema.internOnboarding.extraData })
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, uid))
      .limit(1),
    db
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
      .limit(1),
    membershipOf(uid),
    // Ownership is the session's uid, never a URL id; paid, ₹0 and number-less rows are dropped (also re-checked in ownInternInvoices).
    db
      .select({
        id: schema.internPayments.id,
        invoiceNumber: schema.internPayments.invoiceNumber,
        internId: schema.internPayments.internId,
        orderId: schema.internPayments.orderId,
        paymentId: schema.internPayments.paymentId,
        gateway: schema.internPayments.gateway,
        amountMinor: schema.internPayments.amountMinor,
        currency: schema.internPayments.currency,
        status: schema.internPayments.status,
        paidAt: schema.internPayments.paidAt,
        createdAt: schema.internPayments.createdAt,
        raw: schema.internPayments.raw,
        onboardingPayment: sql<Record<string, unknown> | null>`${schema.internOnboarding.extraData}->'payment'`,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        email: schema.users.email,
        pinCode: schema.internOnboarding.pinCode,
        state: schema.internOnboarding.state,
      })
      .from(schema.internPayments)
      .leftJoin(schema.users, eq(schema.users.id, schema.internPayments.internId))
      .leftJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.internPayments.internId))
      .where(
        and(
          eq(schema.internPayments.internId, uid),
          eq(schema.internPayments.status, "paid"),
          gt(schema.internPayments.amountMinor, 0),
          isNotNull(schema.internPayments.invoiceNumber),
        ),
      )
      .orderBy(desc(schema.internPayments.paidAt)),
  ]);
  const invoices = ownInternInvoices(payments, uid, getInvoiceSeller());
  const extra = (row?.extra ?? {}) as Record<string, unknown>;
  // The full account number never leaves the server; the form gets its last 4.
  const { accountNumber, ...bankRest } = (extra.bankDetails ?? extra.bank ?? {}) as { accountNumber?: unknown } & BankDetails;
  const initialBank: BankDetails = { ...bankRest, accountLast4: String(accountNumber ?? "").replace(/\D/g, "").slice(-4) };

  const institution = String((extra.academics as { institution?: unknown } | undefined)?.institution ?? extra.college ?? "");

  const contact = user
    ? { firstName: user.f, lastName: user.l, countryCode: user.cc, phoneNumber: user.p }
    : { firstName: "", lastName: "", countryCode: "+91", phoneNumber: "" };

  return (
    <div>
      <PageHead title="Settings" lede="Your contact details, where your stipend is paid, your college and your password." />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-8">
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
              hint="Join your college so its placement team and virtual drives can find you. Your profile itself doesn't change."
            />
            <CollegeForm
              initial={college}
              institution={institution}
              vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
            />
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
                <dd className="mt-1 break-all text-sm font-medium text-ink-900">{user?.email ?? session.email}</dd>
              </div>
              {/* Support finds you by this; quote it when you write in (INT-31). */}
              <div className="py-3">
                <dt className="text-sm text-text-subtle">Findtern ID</dt>
                <dd className="nums mt-1 select-all break-all text-sm font-medium text-ink-900">{uid}</dd>
                <dd className="mt-1 text-pretty text-xs text-text-subtle">Your account&apos;s reference number. Quote it when you write to support so we can find you.</dd>
              </div>
              {user?.createdAt ? (
                <DetailRow
                  label="Member since"
                  mono
                  value={formatDmy(user.createdAt)}
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
