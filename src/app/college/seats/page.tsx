import { desc, eq } from "drizzle-orm";

import { EmptyScene, PageHead } from "@/components/app/primitives";
import { DataTable } from "@/components/app/data-table";
import { Section } from "@/components/app/stat";
import { CopyText } from "@/components/college/copy-text";
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
    <div className="space-y-8">
      <PageHead title="Seats" lede="Each seat waives one student's AI interview fee." />
      {seat && !hasDriveOrder ? (
        <Section title="Legacy seat code" hint="Read-only. Existing students keep using it.">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <code className="select-all break-all font-mono text-2xl font-semibold text-ink-900">{seat.code}</code>
            <CopyText text={seat.code} label="Copy code" />
          </div>
          <p className="nums mt-3 text-sm text-ink-700">
            {seat.used} used · {seat.cap ?? "unlimited"} total{seat.cap === null ? "" : ` · ${Math.max(0, seat.cap - seat.used)} left`}
          </p>
        </Section>
      ) : null}
      <Section title="Seat batches">
        <DataTable
          caption="Seat batches"
          rows={visible}
          rowKey={(b) => b.id}
          empty={
            <EmptyScene
              compact
              title="No seat batches"
              body="A batch appears here when your college buys seats, with its invoice once it is paid."
              who="Findtern - adds a batch when your college buys seats"
            />
          }
          columns={[
            {
              key: "batch",
              header: "Batch",
              primary: true,
              cell: (b) => (
                <>
                  <span className="block font-medium text-ink-900">{b.seats} seats</span>
                  {b.status === "pending" && seller.bank ? (
                    <span className="mt-1 block text-xs font-normal text-ink-700">
                      Pay {money(b.amountMinor)} to Findtern: {seller.bank.bankName}, a/c {seller.bank.accountNumber}, IFSC {seller.bank.ifsc}
                    </span>
                  ) : null}
                </>
              ),
            },
            { key: "date", header: "Date", cell: (b) => formatDate(b.paidAt ?? b.createdAt) },
            { key: "status", header: "Status", cell: (b) => (b.status === "paid" ? `Paid · Invoice ${b.invoiceNumber}` : "Awaiting payment") },
            { key: "amt", header: "Amount", align: "right", cell: (b) => <span className="money">{money(b.amountMinor)}</span> },
            {
              key: "inv",
              header: "Invoice",
              cell: (b) =>
                b.status === "paid" ? (
                  <InvoiceDownload html={taxInvoiceHtml(seatInvoiceInput(b, ctx.college, seller))} fileName={`Invoice-${b.invoiceNumber}.pdf`} />
                ) : (
                  "—"
                ),
            },
          ]}
        />
      </Section>
    </div>
  );
}
