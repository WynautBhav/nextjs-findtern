import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import { type BankDetails } from "@/components/intern/bank-details-form";
import { requireRole } from "@/lib/auth";
import { membershipOf } from "@/lib/college/membership";
import { getDb, schema } from "@/lib/db";
import { ownInternInvoices } from "@/lib/intern-invoice";
import { getInvoiceSeller } from "@/lib/invoice-seller";
import { SettingsView } from "./settings-view";

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
  const [[row], [user], college, [presenceRow], [prefsRow], payments] = await Promise.all([
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
    // No row yet means never seen, which counts as visible (the default).
    db.select({ show: schema.userPresence.showActivity }).from(schema.userPresence).where(eq(schema.userPresence.userId, uid)).limit(1),
    db
      .select({ emailMessages: schema.notificationPrefs.emailMessages, pushMessages: schema.notificationPrefs.pushMessages })
      .from(schema.notificationPrefs)
      .where(eq(schema.notificationPrefs.userId, uid))
      .limit(1),
    // Ownership is the session's uid, never a URL id; paid and number-less rows are dropped (a ₹0 row only has a number when a code made it free) (also re-checked in ownInternInvoices).
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
          isNotNull(schema.internPayments.invoiceNumber),
        ),
      )
      .orderBy(desc(schema.internPayments.paidAt))
  ]);
  const invoices = ownInternInvoices(payments, uid, getInvoiceSeller());
  const extra = (row?.extra ?? {}) as Record<string, unknown>;
  // The full account number never leaves the server; the form gets its last 4.
  const { accountNumber, ...bankRest } = (extra.bankDetails ?? extra.bank ?? {}) as { accountNumber?: unknown } & BankDetails;
  const initialBank: BankDetails = { ...bankRest, accountLast4: String(accountNumber ?? "").replace(/\D/g, "").slice(-4) };

  const contact = user
    ? { firstName: user.f, lastName: user.l, countryCode: user.cc, phoneNumber: user.p }
    : { firstName: "", lastName: "", countryCode: "+91", phoneNumber: "" };

  return (
    <SettingsView
      uid={uid}
      email={user?.email ?? session.email}
      createdAt={user?.createdAt ?? null}
      contact={contact}
      initialBank={initialBank}
      college={college}
      activityVisible={presenceRow?.show ?? true}
      prefs={{ emailMessages: prefsRow?.emailMessages ?? true, pushMessages: prefsRow?.pushMessages ?? true }}
      invoices={invoices}
    />
  );
}
