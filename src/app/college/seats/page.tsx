import { desc, eq } from "drizzle-orm";

import { EmptyScene, Pill, Surface } from "@/components/app/primitives";
import { ArcGauge, CollegeHero, HeroStat, HeroStats } from "@/components/college/kit";
import { InvoiceDownload } from "@/components/college/invoice-download";
import { seatInvoiceInput, seatInvoiceState } from "@/lib/college/seat-invoice";
import { requireCollegeContext } from "@/lib/college/scope";
import { getDb, schema } from "@/lib/db";
import { collegeHasDriveOrder } from "@/lib/drives/dashboard-db";
import { formatDate, formatMoney } from "@/lib/format";
import { taxInvoiceHtml } from "@/lib/invoice";
import { getInvoiceSeller } from "@/lib/invoice-seller";

export const dynamic = "force-dynamic";

/** Seats used against the seats paid for, and the college's seat batches with invoices. The shared code is retired and no longer shown. */
export default async function SeatsPage() {
  const ctx = await requireCollegeContext();
  const db = getDb();
  const [[seat], batches, hasDriveOrder] = await Promise.all([
    db
      .select({ used: schema.promoCodes.usedCount, cap: schema.promoCodes.maxUsages })
      .from(schema.promoCodes)
      .where(eq(schema.promoCodes.collegeId, ctx.college.id))
      .limit(1),
    db.select().from(schema.collegeSeatBatches).where(eq(schema.collegeSeatBatches.collegeId, ctx.college.id)).orderBy(desc(schema.collegeSeatBatches.createdAt)),
    collegeHasDriveOrder(ctx.college.id),
  ]);
  const seller = getInvoiceSeller();
  const money = (m: number) => formatMoney(m, "INR", { zeroLabel: false });
  const visible = batches.filter((b) => b.status !== "void");

  const paid = visible.filter((b) => b.status === "paid");
  const pending = visible.filter((b) => b.status === "pending");
  const seatsPaid = paid.reduce((n, b) => n + b.seats, 0);
  const showGauge = Boolean(seat && !hasDriveOrder);
  return (
    <div className="space-y-6">
      <CollegeHero title="Seats" lede="Each seat waives one student's AI interview fee.">
        <div className="mt-8 grid gap-x-12 gap-y-8 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end">
          {showGauge && seat && seat.cap !== null ? <ArcGauge used={seat.used} total={seat.cap} label="seats used" /> : null}
          <HeroStats cols={3} className="mt-0">
            <HeroStat lead={!showGauge} label="Seats paid for" value={seatsPaid.toLocaleString("en-IN")} hint={`${paid.length} paid ${paid.length === 1 ? "batch" : "batches"}`} />
            <HeroStat label="Paid to Findtern" value={money(paid.reduce((n, b) => n + b.amountMinor, 0))} hint="GST included" />
            <HeroStat label="Awaiting payment" value={pending.length ? money(pending.reduce((n, b) => n + b.amountMinor, 0)) : "—"} hint={pending.length ? `${pending.reduce((n, b) => n + b.seats, 0)} seats on hold` : "Nothing due"} />
          </HeroStats>
        </div>
      </CollegeHero>

      {visible.length === 0 ? (
        <Surface>
          <EmptyScene
            compact
            title="No seat batches"
            body="A batch appears here when your college buys seats, with its invoice once it is paid."
            who="Findtern - adds a batch when your college buys seats"
          />
        </Surface>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {visible.map((b, i) => (
            <li key={b.id} className="rise flex flex-col rounded-apple-xl border border-ink-200/80 bg-white" style={{ "--i": i } as React.CSSProperties}>
              <div className="flex items-start justify-between gap-4 p-5 sm:p-6">
                <div className="min-w-0">
                  <p className="nums text-[2rem] font-semibold leading-none tracking-[-0.03em] text-ink-900">{b.seats.toLocaleString("en-IN")}</p>
                  <p className="mt-1 text-sm text-text-subtle">seats</p>
                </div>
                <div className="text-right">
                  <Pill tone={b.status === "paid" ? "paid" : "waiting"}>{b.status === "paid" ? "Paid" : "Awaiting payment"}</Pill>
                  <p className="nums mt-2 text-lg font-semibold text-ink-900">{money(b.amountMinor)}</p>
                </div>
              </div>
              {/* The tear line of a receipt: what was bought above, the paperwork below. */}
              <div aria-hidden className="mx-5 border-t border-dashed border-ink-200 sm:mx-6" />
              <div className="flex flex-1 flex-wrap items-center justify-between gap-3 p-5 sm:p-6">
                <div className="min-w-0 text-sm text-ink-700">
                  <p className="nums">{formatDate(b.paidAt ?? b.createdAt)}{{ none: "", serial: ` · Invoice ${b.invoiceNumber}`, pending: " · Invoice pending", covered: " · Covered by your credit, no invoice" }[seatInvoiceState(b)]}</p>
                  {b.status === "pending" && seller.bank ? (
                    <p className="mt-1">Pay {money(b.amountMinor)} to Findtern: {seller.bank.bankName}, a/c {seller.bank.accountNumber}, IFSC {seller.bank.ifsc}</p>
                  ) : null}
                </div>
                {seatInvoiceState(b) === "serial" ? <InvoiceDownload html={taxInvoiceHtml(seatInvoiceInput(b, ctx.college, seller))} fileName={`Invoice-${b.invoiceNumber}.pdf`} /> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
