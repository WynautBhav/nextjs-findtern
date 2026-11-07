import { desc, eq } from "drizzle-orm";

import { PageHead, Surface } from "@/components/app/primitives";
import { InvoiceDownload } from "@/components/college/invoice-download";
import { seatInvoiceInput } from "@/lib/college/seat-invoice";
import { requireCollegeContext } from "@/lib/college/scope";
import { getDb, schema } from "@/lib/db";
import { collegeHasDriveOrder } from "@/lib/drives/dashboard-db";
import { formatDate, formatMoney } from "@/lib/format";
import { taxInvoiceHtml } from "@/lib/invoice";
import { getInvoiceSeller } from "@/lib/invoice-seller";

export const dynamic = "force-dynamic";

/** The college's code, seats used / cap / left, and its seat batches with invoices. */
export default async function SeatsPage() {
  const ctx = await requireCollegeContext();
  const db = getDb();
  const [[seat], batches, hasDriveOrder] = await Promise.all([
    db
      .select({ code: schema.promoCodes.code, used: schema.promoCodes.usedCount, cap: schema.promoCodes.maxUsages })
      .from(schema.promoCodes)
      .where(eq(schema.promoCodes.collegeId, ctx.college.id))
      .limit(1),
    db.select().from(schema.collegeSeatBatches).where(eq(schema.collegeSeatBatches.collegeId, ctx.college.id)).orderBy(desc(schema.collegeSeatBatches.createdAt)),
    collegeHasDriveOrder(ctx.college.id),
  ]);
  const seller = getInvoiceSeller();
  const money = (m: number) => formatMoney(m, "INR", { zeroLabel: false });
  const visible = batches.filter((b) => b.status !== "void");

  return (
    <div className="space-y-6">
      <PageHead title="Seats" lede="Each seat waives one student's AI interview fee." />
      {seat && !hasDriveOrder ? (
        <Surface className="p-5">
          <p className="text-sm text-text-subtle">Legacy code (read-only). Existing students keep using it.</p>
          <code className="select-all font-mono text-xl font-semibold tracking-widest">{seat.code}</code>
          <p className="nums mt-1 text-sm text-text-subtle">
            {seat.used} used · {seat.cap ?? "unlimited"} total · {seat.cap === null ? "unlimited" : Math.max(0, seat.cap - seat.used)} left
          </p>
        </Surface>
      ) : null}
      <Surface className="divide-y divide-ink-200/80">
        {visible.length === 0 ? (
          <p className="p-5 text-sm text-text-subtle">No seat batches yet. Findtern adds them when your college buys seats.</p>
        ) : (
          visible.map((b) => (
            <div key={b.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-medium">{b.seats} seats · {money(b.amountMinor)}</p>
                <p className="text-sm text-text-subtle">{formatDate(b.paidAt ?? b.createdAt)} · {b.status === "paid" ? `Paid · Invoice ${b.invoiceNumber}` : "Awaiting payment"}</p>
                {b.status === "pending" && seller.bank ? (
                  <p className="mt-1 text-sm">Pay {money(b.amountMinor)} to Findtern: {seller.bank.bankName}, a/c {seller.bank.accountNumber}, IFSC {seller.bank.ifsc}</p>
                ) : null}
              </div>
              {b.status === "paid" ? (
                <InvoiceDownload
                  html={taxInvoiceHtml(seatInvoiceInput(b, ctx.college, seller))}
                  fileName={`Invoice-${b.invoiceNumber}.pdf`}
                />
              ) : null}
            </div>
          ))
        )}
      </Surface>
    </div>
  );
}
