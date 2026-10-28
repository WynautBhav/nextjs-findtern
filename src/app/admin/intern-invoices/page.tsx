import type { Metadata } from "next";
import { desc, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { getInvoiceSeller } from "@/lib/invoice-seller";
import { AdminInvoicesView, type AdminInvoiceRow } from "@/components/admin/admin-invoices-view";
import { discountLabel, paymentPromo } from "@/lib/admin/payment-promo";
import { flattenParams, type RawSearchParams } from "@/lib/admin/params";

export const metadata: Metadata = {
  title: "Intern Invoices · Admin Ledger",
};

async function loadInternInvoices(): Promise<AdminInvoiceRow[]> {
  const db = getDb();

  const rawInvoices = await db
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
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      email: schema.users.email,
      pinCode: schema.internOnboarding.pinCode,
      state: schema.internOnboarding.state,
      raw: schema.internPayments.raw,
      // Legacy keeps the code and discount on the onboarding row (ADM-02).
      onboardingPayment: sql<Record<string, unknown> | null>`${schema.internOnboarding.extraData}->'payment'`,
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
      const amountMinor = Number.isFinite(minor) ? minor : 0;
      const promo = paymentPromo(p, undefined, amountMinor);
      return {
        id: `flag-${f.internId}`,
        partyId: f.internId,
        partyName: name,
        partyEmail: f.email || "-",
        orderId: String(p.orderId ?? p.razorpayOrderId ?? "Marked paid"),
        paymentId: typeof p.paymentId === "string" ? p.paymentId : null,
        gateway: typeof p.gateway === "string" ? p.gateway : null,
        amountMinor,
        currency: "INR",
        status: "paid",
        paidAt: typeof p.paidAt === "string" ? p.paidAt : null,
        createdAt: typeof p.paidAt === "string" ? p.paidAt : null,
        promoCode: promo.code,
        discountMinor: promo.discountMinor,
        discountLabel: discountLabel(promo, amountMinor),
        flagOnly: true,
        buyer: { name, email: f.email, pincode: f.pinCode, state: f.state },
      };
    });

  const rows: AdminInvoiceRow[] = rawInvoices.map((inv) => {
    const name = `${inv.firstName || ""} ${inv.lastName || ""}`.trim() || "Candidate";
    const promo = paymentPromo(inv.raw, inv.onboardingPayment, inv.amountMinor);
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      partyId: inv.internId,
      partyName: name,
      partyEmail: inv.email || "-",
      promoCode: promo.code,
      discountMinor: promo.discountMinor,
      discountLabel: discountLabel(promo, inv.amountMinor),
      orderId: inv.orderId,
      paymentId: inv.paymentId,
      gateway: inv.gateway,
      amountMinor: inv.amountMinor,
      currency: inv.currency || "INR",
      status: inv.status,
      paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
      createdAt: inv.createdAt ? inv.createdAt.toISOString() : null,
      buyer: { name, email: inv.email, pincode: inv.pinCode, state: inv.state },
    };
  });

  return [...rows, ...flagRows];
}

export default async function AdminInternInvoicesPage({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const params = flattenParams(await searchParams);
  let rows: AdminInvoiceRow[] | null = null;
  try {
    rows = await loadInternInvoices();
  } catch (error) {
    console.error("[admin/intern-invoices] load failed", error);
  }

  return (
    <div>
      <AdminPageHeader
        title="Intern invoices"
      />
      {rows ? (
        <AdminInvoicesView kind="intern" rows={rows} seller={getInvoiceSeller()} params={params} basePath="/admin/intern-invoices" />
      ) : (
        <Panel>
          <AdminLoadError what="intern payments" retryHref="/admin/intern-invoices" />
        </Panel>
      )}
    </div>
  );
}
