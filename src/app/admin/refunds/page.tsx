import { desc, eq, or, sql } from "drizzle-orm";

import { AdminLoadError } from "@/components/admin/panel";
import { LeadStat, Overview, StatList } from "@/components/app/stat";
import { RollingNumber } from "@/components/app/rolling-number";
import { PageHeader } from "@/components/layout/page-header";
import { flattenParams, parsePageRequest, type RawSearchParams } from "@/lib/admin/params";
import { loadRefundSummary, type RefundSummary } from "@/lib/admin/refund-summary";
import { companyRefundRows, type CompanyRefundRow } from "@/lib/admin/company-refunds";
import { getDb, schema } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { listRefunds, type RefundListRow } from "@/lib/refunds/refunds-db";
import { RefundsTable } from "./refunds-table";

export const metadata = { title: "Refunds · Admin" };
export const dynamic = "force-dynamic";

/** Employer orders with money sent back: the stored label says so, or a processed refund is on the order. */
async function loadCompanyRefunds(): Promise<CompanyRefundRow[]> {
  const p = schema.employerPayments;
  const orders = await getDb()
    .select({ id: p.id, orderId: p.orderId, employerId: p.employerId, companyName: schema.employers.companyName, invoiceNumber: p.invoiceNumber, status: p.status, amountMinor: p.amountMinor, currency: p.currency, paidAt: p.paidAt, createdAt: p.createdAt, raw: p.raw })
    .from(p)
    .leftJoin(schema.employers, eq(schema.employers.id, p.employerId))
    .where(or(eq(p.status, "refunded"), eq(p.status, "partially_refunded"), sql`jsonb_typeof(${p.raw}->'refunds') = 'array'`))
    .orderBy(desc(p.createdAt))
    .limit(500);
  return companyRefundRows(orders);
}

const STATUSES = ["eligible", "review", "pending", "initiated", "refunded", "failed"];

export default async function AdminRefundsPage({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const params = flattenParams(await searchParams);
  const req = parsePageRequest(params);
  const status = STATUSES.includes(params.status ?? "") ? params.status : undefined;
  const reason = params.reason?.slice(0, 60) || undefined;

  let data: { rows: RefundListRow[]; total: number; company: CompanyRefundRow[]; summary: RefundSummary } | null = null;
  try {
    const [list, company, summary] = await Promise.all([listRefunds({ status, reason, limit: req.perPage, offset: req.offset }), loadCompanyRefunds(), loadRefundSummary()]);
    data = { ...list, company, summary };
  } catch (error) {
    console.error("[admin/refunds] load failed", error);
  }

  const s = data?.summary;
  const owed = data ? data.company.filter((r) => r.creditNoteNeeded) : [];
  return (
    <div className="space-y-8">
      <PageHeader title="Refunds" subtitle="Students who paid the activation fee and then received a college drive seat." />
      {data && s ? (
        <>
          <Overview
            lead={
              s.toSendCount > 0 ? (
                <LeadStat
                  tone="signal"
                  label="To send back"
                  value={<RollingNumber value={Math.round(s.toSendMinor / 100)} currency="INR" />}
                  note={`${s.toSendCount} ${s.toSendCount === 1 ? "refund is" : "refunds are"} ready or waiting for a check.`}
                  action={{ label: "See the ready ones", href: "/admin/refunds?status=eligible" }}
                />
              ) : (
                <LeadStat label="To send back" value="Nothing" note="No student is waiting on a refund. Run a scan after a college drive adds seats." />
              )
            }
            rest={
              <StatList
                items={[
                  { label: "Credit notes to issue", value: owed.length, hint: owed.length > 0 ? "Company refunds that carried GST" : "None outstanding", href: owed.length > 0 ? "#credit-notes" : undefined },
                  { label: "Sent back so far", value: formatMoney(s.refundedMinor, "INR", { zeroLabel: "₹0" }), hint: `${s.refundedCount} ${s.refundedCount === 1 ? "refund" : "refunds"}` },
                  { label: "With the gateway", value: s.inFlightCount, hint: "Started, waiting for confirmation" },
                  ...(s.failedCount > 0 ? [{ label: "Failed", value: s.failedCount, hint: "Needs another attempt", href: "/admin/refunds?status=failed" }] : []),
                ]}
              />
            }
          />
          <RefundsTable rows={data.rows} companyRows={data.company} total={data.total} page={req.page} perPage={req.perPage} params={params} statuses={STATUSES} anyRefunds={s.toSendCount + s.inFlightCount + s.refundedCount + s.failedCount > 0} />
        </>
      ) : (
        <AdminLoadError what="the refunds list" retryHref="/admin/refunds" />
      )}
    </div>
  );
}
