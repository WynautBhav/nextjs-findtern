import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/panel";
import { getInvoiceSeller } from "@/lib/invoice-seller";
import { AdminInvoicesView, type AdminInvoiceRow } from "@/components/admin/admin-invoices-view";

export const metadata: Metadata = {
  title: "Employer Orders · Admin Ledger",
};

export default async function AdminOrdersPage() {
  const db = getDb();

  const rawOrders = await db
    .select({
      id: schema.employerPayments.id,
      orderId: schema.employerPayments.orderId,
      paymentId: schema.employerPayments.paymentId,
      amountMinor: schema.employerPayments.amountMinor,
      currency: schema.employerPayments.currency,
      status: schema.employerPayments.status,
      paidAt: schema.employerPayments.paidAt,
      createdAt: schema.employerPayments.createdAt,
      employerId: schema.employerPayments.employerId,
      companyName: schema.employers.companyName,
      companyEmail: schema.employers.companyEmail,
      gstNumber: schema.employers.gstNumber,
      country: schema.employers.country,
      state: schema.employers.state,
      billingPincode: schema.employers.billingPincode,
    })
    .from(schema.employerPayments)
    .leftJoin(schema.employers, eq(schema.employers.id, schema.employerPayments.employerId))
    .orderBy(desc(schema.employerPayments.createdAt));

  const rows: AdminInvoiceRow[] = rawOrders.map((o) => ({
    id: o.id,
    orderId: o.orderId,
    paymentId: o.paymentId,
    amountMinor: o.amountMinor,
    currency: o.currency || "INR",
    status: o.status,
    paidAt: o.paidAt ? o.paidAt.toISOString() : null,
    createdAt: o.createdAt ? o.createdAt.toISOString() : null,
    partyId: o.employerId,
    partyName: o.companyName || "Unknown employer",
    partyEmail: o.companyEmail || "-",
    buyer: {
      name: o.companyName || "Unknown Employer",
      email: o.companyEmail,
      gstin: o.gstNumber,
      country: o.country,
      state: o.state,
      pincode: o.billingPincode,
    },
  }));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Orders"
        subtitle="Manage employer checkout orders, settlement transactions and invoices."
      />

      <AdminInvoicesView kind="employer" rows={rows} seller={getInvoiceSeller()} />
    </div>
  );
}
