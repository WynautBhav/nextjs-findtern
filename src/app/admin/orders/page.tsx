import type { Metadata } from "next";
import { desc, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { getInvoiceSeller } from "@/lib/invoice-seller";
import { orderProposalIds } from "@/lib/payments";
import { AdminInvoicesView, type AdminInvoiceRow } from "@/components/admin/admin-invoices-view";
import { discountLabel, paymentPromo } from "@/lib/admin/payment-promo";
import { flattenParams, type RawSearchParams } from "@/lib/admin/params";

export const metadata: Metadata = {
  title: "Employer Orders · Admin Ledger",
};

async function loadOrders(): Promise<AdminInvoiceRow[]> {
  const db = getDb();

  const rawOrders = await db
    .select({
      id: schema.employerPayments.id,
      invoiceNumber: schema.employerPayments.invoiceNumber,
      orderId: schema.employerPayments.orderId,
      paymentId: schema.employerPayments.paymentId,
      gateway: schema.employerPayments.gateway,
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
      raw: schema.employerPayments.raw,
    })
    .from(schema.employerPayments)
    .leftJoin(schema.employers, eq(schema.employers.id, schema.employerPayments.employerId))
    .orderBy(desc(schema.employerPayments.createdAt));

  // Which interns each order paid for (legacy showed them on every order).
  const proposalIds = Array.from(new Set(rawOrders.flatMap((o) => orderProposalIds(o.raw))));
  const internByProposal = new Map<string, string>();
  if (proposalIds.length > 0) {
    const named = await db
      .select({ id: schema.proposals.id, first: schema.users.firstName, last: schema.users.lastName })
      .from(schema.proposals)
      .leftJoin(schema.users, eq(schema.users.id, schema.proposals.internId))
      .where(inArray(schema.proposals.id, proposalIds));
    for (const p of named) internByProposal.set(p.id, `${p.first ?? ""} ${p.last ?? ""}`.trim() || "Candidate");
  }

  return rawOrders.map((o) => {
    // New-app promo objects and legacy order notes (ADM-02/13).
    const promo = paymentPromo(o.raw, undefined, o.amountMinor);
    return {
      id: o.id,
      invoiceNumber: o.invoiceNumber,
      orderId: o.orderId,
      paymentId: o.paymentId,
      gateway: o.gateway,
      amountMinor: o.amountMinor,
      currency: o.currency || "INR",
      status: o.status,
      paidAt: o.paidAt ? o.paidAt.toISOString() : null,
      createdAt: o.createdAt ? o.createdAt.toISOString() : null,
      partyId: o.employerId,
      interns: orderProposalIds(o.raw).map((id) => internByProposal.get(id) ?? "Candidate").join("; "),
      promoCode: promo.code,
      discountMinor: promo.discountMinor,
      discountLabel: discountLabel(promo, o.amountMinor),
      needsReview: Boolean((o.raw as { needsReview?: unknown } | null)?.needsReview),
      partyName: o.companyName || "Unknown employer",
      partyEmail: o.companyEmail || "-",
      buyer: {
        name: o.companyName || "Unknown employer",
        email: o.companyEmail,
        gstin: o.gstNumber,
        country: o.country,
        state: o.state,
        pincode: o.billingPincode,
      },
    };
  });
}

export default async function AdminOrdersPage({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const params = flattenParams(await searchParams);
  let rows: AdminInvoiceRow[] | null = null;
  try {
    rows = await loadOrders();
  } catch (error) {
    console.error("[admin/orders] load failed", error);
  }

  return (
    <div>
      <AdminPageHeader
        title="Orders"
        subtitle="Every employer checkout: who paid, for which interns, GST, discounts and the tax invoice."
      />
      {rows ? (
        <AdminInvoicesView kind="employer" rows={rows} seller={getInvoiceSeller()} params={params} basePath="/admin/orders" />
      ) : (
        <Panel>
          <AdminLoadError what="employer orders" retryHref="/admin/orders" />
        </Panel>
      )}
    </div>
  );
}
