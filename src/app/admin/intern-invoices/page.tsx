import type { Metadata } from "next";
import { desc, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/panel";
import { getInvoiceSeller } from "@/lib/invoice-seller";
import { AdminInvoicesView, type AdminInvoiceRow } from "@/components/admin/admin-invoices-view";

export const metadata: Metadata = {
  title: "Intern Invoices · Admin Ledger",
};

export default async function AdminInternInvoicesPage() {
  const db = getDb();

  const rawInvoices = await db
    .select({
      id: schema.internPayments.id,
      invoiceNumber: schema.internPayments.invoiceNumber,
      internId: schema.internPayments.internId,
      orderId: schema.internPayments.orderId,
      paymentId: schema.internPayments.paymentId,
      amountMinor: schema.internPayments.amountMinor,
      currency: schema.internPayments.currency,
      status: schema.internPayments.status,
      paidAt: schema.internPayments.paidAt,
      createdAt: schema.internPayments.createdAt,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      email: schema.users.email,
      pinCode: schema.internOnboarding.pinCode,
      state: schema.internOnboarding.state,
      raw: schema.internPayments.raw,
    })
    .from(schema.internPayments)
    .leftJoin(schema.users, eq(schema.users.id, schema.internPayments.internId))
    .leftJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.internPayments.internId))
    .orderBy(desc(schema.internPayments.createdAt));

  // Interns marked paid only by the profile flag (legacy/admin) have no
  // payment row; list them too so the ledger matches who is actually paid.
  const withRow = new Set(rawInvoices.filter((i) => i.status === "paid").map((i) => i.internId));
  const flagged = await db
    .select({
      internId: schema.internOnboarding.userId,
      payment: sql<Record<string, unknown> | null>`${schema.internOnboarding.extraData}->'payment'`,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      email: schema.users.email,
      pinCode: schema.internOnboarding.pinCode,
      state: schema.internOnboarding.state,
    })
    .from(schema.internOnboarding)
    .leftJoin(schema.users, eq(schema.users.id, schema.internOnboarding.userId))
    .where(sql`(${schema.internOnboarding.extraData}->'payment'->>'isPaid') = 'true'`);
  const flagRows: AdminInvoiceRow[] = flagged
    .filter((f) => !withRow.has(f.internId))
    .map((f) => {
      const p = f.payment ?? {};
      const name = `${f.firstName || ""} ${f.lastName || ""}`.trim() || "Candidate";
      const minor = Number(p.finalAmountMinor ?? p.amountMinor ?? 0);
      return {
        id: `flag-${f.internId}`,
        partyId: f.internId,
        partyName: name,
        partyEmail: f.email || "-",
        orderId: String(p.orderId ?? p.razorpayOrderId ?? "Marked paid"),
        paymentId: typeof p.paymentId === "string" ? p.paymentId : null,
        amountMinor: Number.isFinite(minor) ? minor : 0,
        currency: "INR",
        status: "paid",
        paidAt: typeof p.paidAt === "string" ? p.paidAt : null,
        createdAt: typeof p.paidAt === "string" ? p.paidAt : null,
        promoCode: typeof p.promoCode === "string" ? p.promoCode : null,
        flagOnly: true,
        buyer: { name, email: f.email, pincode: f.pinCode, state: f.state },
      };
    });

  const rows: AdminInvoiceRow[] = rawInvoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    partyId: inv.internId,
    partyName: `${inv.firstName || ""} ${inv.lastName || ""}`.trim() || "Candidate",
    partyEmail: inv.email || "-",
    promoCode: String((inv.raw as Record<string, unknown> | null)?.promoCode ?? "") || null,
    orderId: inv.orderId,
    paymentId: inv.paymentId,
    amountMinor: inv.amountMinor,
    currency: inv.currency || "INR",
    status: inv.status,
    paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
    createdAt: inv.createdAt ? inv.createdAt.toISOString() : null,
    buyer: {
      name: `${inv.firstName || ""} ${inv.lastName || ""}`.trim() || "Candidate",
      email: inv.email,
      pincode: inv.pinCode,
      state: inv.state,
    },
  }));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Intern Invoices"
        subtitle="Manage candidate account activation fees and platform verification payments."
      />

      <AdminInvoicesView kind="intern" rows={[...rows, ...flagRows]} seller={getInvoiceSeller()} />
    </div>
  );
}
