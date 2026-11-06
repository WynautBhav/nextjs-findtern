import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { CollegeSeatBatches } from "@/components/admin/college-seat-batches";
import { CollegeWalletPanel } from "@/components/admin/college-wallet-panel";
import { BillingForm } from "@/components/admin/college-partners-manager";
import { AdminPageHeader, Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { allows, canWrite } from "@/lib/admin/permissions";
import { maskTail } from "@/lib/admin/identity-mask";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { seatInvoiceInput } from "@/lib/college/seat-invoice";
import { taxInvoiceHtml } from "@/lib/invoice";
import { getInvoiceSeller } from "@/lib/invoice-seller";
import { walletLedger, walletSummary } from "@/lib/college/wallet-read";

export const dynamic = "force-dynamic";

export default async function AdminCollegePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perms = (await getSession())?.permissions;
  const db = getDb();
  const [college] = await db.select().from(schema.colleges).where(eq(schema.colleges.id, id)).limit(1);
  if (!college) notFound();
  const [batches, [promo], summary, ledger] = await Promise.all([
    db.select().from(schema.collegeSeatBatches).where(eq(schema.collegeSeatBatches.collegeId, id)).orderBy(desc(schema.collegeSeatBatches.createdAt)),
    db.select({ code: schema.promoCodes.code, maxUsages: schema.promoCodes.maxUsages, usedCount: schema.promoCodes.usedCount }).from(schema.promoCodes).where(eq(schema.promoCodes.collegeId, id)).limit(1),
    walletSummary(id),
    walletLedger(id),
  ]);
  const last4 = maskTail(college.bankAccountNumber).slice(-4);
  const bank = college.bankAccountNumber && college.bankIfsc ? { holder: college.bankAccountName ?? "", bankName: college.bankName ?? "", last4, ifsc: college.bankIfsc } : null;
  const seller = getInvoiceSeller();
  const rows = batches.map((b) => ({
    invoiceHtml: b.status === "paid" ? taxInvoiceHtml(seatInvoiceInput(b, college, seller)) : null,
    id: b.id, seats: b.seats, amountMinor: b.amountMinor, status: b.status, method: b.method, referenceId: b.referenceId, invoiceNumber: b.invoiceNumber, paidAt: b.paidAt?.toISOString() ?? null, createdAt: b.createdAt.toISOString(),
  }));
  const hasPaid = batches.some((b) => b.status === "paid");

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={college.name}
        subtitle={[college.code ? `Code ${college.code}` : null, college.isPartner ? "Partner" : "Not a partner", college.isActive ? "Active" : "Inactive"].filter(Boolean).join(" · ")}
        action={<Link href="/admin/colleges" className="text-sm font-medium underline underline-offset-4">All colleges</Link>}
      />
      <Panel>
        <PanelHeader title="Billing details" description="State and GSTIN print on the seat invoice and decide CGST + SGST or IGST." />
        <PanelBody>
          <BillingForm collegeId={id} state={college.state} gstin={college.gstin} canEdit={canWrite(perms, "/admin/colleges")} />
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="Seats" description={hasPaid ? undefined : "Awaiting first payment. The placement officer login and seat code are issued once the first batch is paid."} />
        <PanelBody>
          <CollegeSeatBatches collegeId={id} batches={rows} seat={promo ? { code: promo.code, cap: promo.maxUsages, used: promo.usedCount } : null} canMoney={allows(perms, ["transactions:write"])} />
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="Wallet" />
        <PanelBody>
          <CollegeWalletPanel collegeId={id} summary={summary} ledger={ledger} bank={bank} canMoney={allows(perms, ["transactions:write"])} />
        </PanelBody>
      </Panel>
    </div>
  );
}
