import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";

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
    })
    .from(schema.internPayments)
    .leftJoin(schema.users, eq(schema.users.id, schema.internPayments.internId))
    .leftJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.internPayments.internId))
    .orderBy(desc(schema.internPayments.createdAt));

  const rows: AdminInvoiceRow[] = rawInvoices.map((inv) => ({
    id: inv.id,
    partyId: inv.internId,
    partyName: `${inv.firstName || ""} ${inv.lastName || ""}`.trim() || "Candidate",
    partyEmail: inv.email || "-",
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

      <AdminInvoicesView kind="intern" rows={rows} seller={getInvoiceSeller()} />
    </div>
  );
}
