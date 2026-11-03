import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { ButtonLink } from "@/components/ui/button";
import { getInvoiceSeller } from "@/lib/invoice-seller";
import { orderProposalIds } from "@/lib/order-ids";
import { employerInvoices, needsLegacyNumber } from "@/lib/employer-invoice";
import { loadInvoiceHires } from "@/lib/employer-invoice-hires";
import { AdminInvoicesView, type AdminInvoiceRow } from "@/components/admin/admin-invoices-view";
import { discountLabel, paymentPromo } from "@/lib/admin/payment-promo";
import { flattenParams, type RawSearchParams } from "@/lib/admin/params";
import { isTestEmployer } from "@/lib/admin/scope";

export const metadata: Metadata = {
  title: "Employer Orders · Admin Ledger",
};

/** Rows plus the ids of test-employer orders: listed, but not revenue (lib/admin/revenue). */
async function loadOrders(): Promise<{ rows: AdminInvoiceRow[]; uncounted: Set<string> }> {
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
      city: schema.employers.city,
      state: schema.employers.state,
      billingPincode: schema.employers.billingPincode,
      raw: schema.employerPayments.raw,
    })
    .from(schema.employerPayments)
    .leftJoin(schema.employers, eq(schema.employers.id, schema.employerPayments.employerId))
    .orderBy(desc(schema.employerPayments.createdAt));

  // Which interns each order paid for (legacy showed them on every order); the loader the employer's page uses.
  const hires = await loadInvoiceHires(db, rawOrders);
  // The same batch builder the employer's Orders page calls, so number, lines and promo note match their copy.
  const legacyPaid = rawOrders.filter(needsLegacyNumber);
  const invoices = employerInvoices({
    payments: rawOrders.filter((o) => o.status === "paid" && o.amountMinor > 0),
    allPayments: rawOrders,
    legacyPaid,
    hires,
  });

  const uncounted = new Set(rawOrders.filter((o) => isTestEmployer({ id: o.employerId, companyEmail: o.companyEmail })).map((o) => o.id));
  const rows = rawOrders.map((o) => {
    // New-app promo objects and legacy order notes (ADM-02/13).
    const promo = paymentPromo(o.raw, undefined, o.amountMinor);
    const invoiced = o.status === "paid" && o.amountMinor > 0;
    const inv = invoiced ? (invoices.get(o.id) ?? null) : null;
    return {
      displayNumber: inv?.number ?? null,
      invoiceDescription: inv?.description,
      invoiceLines: inv?.lines,
      invoicePromo: inv ? inv.promo : undefined,
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
      interns: orderProposalIds(o.raw).map((id) => hires.get(id)?.who).filter(Boolean).join("; "),
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
        city: o.city,
        state: o.state,
        pincode: o.billingPincode,
      },
    };
  });
  return { rows, uncounted };
}

export default async function AdminOrdersPage({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const params = flattenParams(await searchParams);
  let rows: AdminInvoiceRow[] | null = null;
  let uncounted: Set<string> | undefined;
  try {
    ({ rows, uncounted } = await loadOrders());
  } catch (error) {
    console.error("[admin/orders] load failed", error);
  }

  return (
    <div>
      <AdminPageHeader
        title="Orders"
        subtitle="Every employer checkout, paid or not. Test employers are listed but never counted as revenue."
        action={
          <ButtonLink href="/admin/transactions" variant="outline" size="sm" className={ADMIN_PILL_SECONDARY}>
            Transactions
          </ButtonLink>
        }
      />
      {rows ? (
        <AdminInvoicesView kind="employer" rows={rows} seller={getInvoiceSeller()} params={params} basePath="/admin/orders" uncounted={uncounted} />
      ) : (
        <Panel>
          <AdminLoadError what="employer orders" retryHref="/admin/orders" />
        </Panel>
      )}
    </div>
  );
}
