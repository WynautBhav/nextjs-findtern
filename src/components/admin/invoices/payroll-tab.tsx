import { Banknote } from "lucide-react";

import { AdminEmpty, Panel, PanelHeader } from "@/components/admin/panel";
import { StatusBadge } from "@/components/admin/status-badge";
import { PayrollInvoiceActions } from "@/components/admin/invoices/payroll-invoice-actions";
import { PrepareInvoiceDialog } from "@/components/admin/invoices/prepare-invoice-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { payrollCounts, type PayrollInvoiceDto, type PayrollPeriodDto, type PayrollPlacementDto } from "@/lib/admin/payroll-view";
import { formatDate, formatMoney } from "@/lib/format";
import { formatPeriod, type InvoiceWire } from "@/lib/invoice-premium";
import { MANUAL_INVOICE_STATUS_LABEL } from "@/lib/payroll-invoice-view";
import { cn } from "@/lib/utils";

const usd = (minor: number) => formatMoney(minor, "USD", { zeroLabel: false, decimals: 2 });
const hours = (h: number | null) => (h === null ? "-" : `${Number(h.toFixed(2))} h`);
const INVOICE_TONE = { due: "warning", paid: "success", void: "neutral" } as const;

/**
 * The Payroll tab: every hired USD full-time placement as one panel, a row per timesheet period with its approved
 * hours and the invoice issued for it. Server-rendered; only the buttons (prepare, view, mark paid, void) are client.
 */
export function PayrollTab({
  placements,
  wire,
  canWrite,
  today,
}: {
  placements: PayrollPlacementDto[];
  wire: InvoiceWire | undefined;
  canWrite: boolean;
  today: string;
}) {
  return (
    <div className="space-y-6">
      {wire ? null : (
        <p role="note" className="flex items-start gap-2.5 rounded-[var(--radius-admin-card)] bg-warning-soft px-5 py-4 text-sm leading-relaxed text-foreground">
          <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-warning" />
          <span>
            Wire details are not set (<code className="text-[0.8125rem]">INVOICE_SELLER_SWIFT</code> and the related settings); invoices will show no payment instructions.
          </span>
        </p>
      )}

      {placements.length === 0 ? (
        <Panel>
          <AdminEmpty
            icon={Banknote}
            title="No full-time hires abroad yet"
            body="A placement appears here once a company abroad (US dollars) has paid for a full-time hire. Findtern then runs the payroll and bills the company each month."
          />
        </Panel>
      ) : (
        placements.map((p) => <Placement key={p.proposalId} placement={p} canWrite={canWrite} today={today} />)
      )}
    </div>
  );
}

function Placement({ placement: p, canWrite, today }: { placement: PayrollPlacementDto; canWrite: boolean; today: string }) {
  const { toInvoice, due } = payrollCounts(p.periods);
  const facts: [string, string][] = [
    ["Joined", p.joining ? formatDate(p.joining) : "Date not set"],
    ["Salary", p.annualCtcMinor ? `${usd(Math.round(p.annualCtcMinor / 12))} a month` : "CTC not set"],
    ["Overtime", p.overtimeRateMinor ? `${usd(p.overtimeRateMinor)} an hour` : "Rate not set"],
  ];
  return (
    <Panel aria-labelledby={`pl-${p.proposalId}`}>
      <PanelHeader
        title={<span id={`pl-${p.proposalId}`}>{p.company}</span>}
        description={`${p.intern} · ${p.role}`}
        action={
          toInvoice + due > 0 ? (
            <span className="flex flex-wrap items-center gap-1.5">
              {toInvoice > 0 ? <StatusBadge tone="info" label={`${toInvoice} to invoice`} /> : null}
              {due > 0 ? <StatusBadge tone="warning" label={`${due} awaiting payment`} /> : null}
            </span>
          ) : null
        }
      />
      <dl className="flex flex-wrap gap-x-8 gap-y-1 px-[var(--admin-pad-panel)] pt-3 pb-4 text-sm">
        {facts.map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-2">
            <dt className="text-text-subtle">{k}</dt>
            <dd className="nums font-medium text-foreground">{v}</dd>
          </div>
        ))}
      </dl>

      {p.periods.length === 0 ? (
        <p className="border-t border-[color:var(--admin-rule)] px-[var(--admin-pad-panel)] py-6 text-sm text-text-subtle">
          No timesheets yet. The intern&apos;s first monthly sheet appears here once it is created.
        </p>
      ) : (
        <div data-stack className="border-t border-[color:var(--admin-rule)]">
          <Table className="lg:min-w-[64rem] lg:table-fixed">
            <caption className="sr-only">{`Timesheets and invoices for ${p.intern} at ${p.company}`}</caption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {[
                  ["Period", "lg:w-44"],
                  ["Timesheet", "lg:w-36"],
                  ["Days", "text-right lg:w-20"],
                  ["Regular", "text-right lg:w-24"],
                  ["Overtime", "text-right lg:w-24"],
                  ["Invoice", ""],
                  ["", "lg:w-[21rem]"],
                ].map(([h, c], i) => (
                  <TableHead
                    key={i}
                    scope="col"
                    className={cn("h-11 bg-transparent px-3 py-2.5 text-[0.8125rem] font-medium text-text-subtle first:pl-[var(--admin-pad-panel)] last:pr-[var(--admin-pad-panel)]", c)}
                  >
                    {h || <span className="sr-only">Actions</span>}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.periods.map((row) => (
                <PeriodRow key={row.start} placement={p} row={row} canWrite={canWrite} today={today} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}

const CELL = "px-3 py-3 text-sm text-foreground first:pl-[var(--admin-pad-panel)] last:pr-[var(--admin-pad-panel)]";

function PeriodRow({ placement: p, row, canWrite, today }: { placement: PayrollPlacementDto; row: PayrollPeriodDto; canWrite: boolean; today: string }) {
  const overtime = (row.overtimeHours ?? 0) > 0;
  return (
    <TableRow className="border-[color:var(--admin-rule)] hover:bg-[color:var(--admin-panel-2)]">
      <TableCell data-title="" className={cn(CELL, "nums whitespace-nowrap font-medium")}>
        {formatPeriod(row.start, row.end)}
      </TableCell>
      <TableCell data-label="Timesheet" className={CELL}>
        {row.sheetStatus ? <StatusBadge value={row.sheetStatus} /> : <span className="text-text-subtle">No sheet</span>}
      </TableCell>
      <TableCell data-label="Days" className={cn(CELL, "nums text-right")}>
        {row.presentDays ?? "-"}
      </TableCell>
      <TableCell data-label="Regular" className={cn(CELL, "nums text-right")}>
        {hours(row.regularHours)}
      </TableCell>
      <TableCell data-label="Overtime" className={cn(CELL, "nums text-right", overtime && "font-semibold")}>
        {hours(row.overtimeHours)}
      </TableCell>
      <TableCell data-label="Invoice" className={CELL}>
        <div className="min-w-0 max-lg:text-right">
          {row.invoice ? <InvoiceCell invoice={row.invoice} /> : <span className="text-text-subtle">{row.draft ? "Not invoiced" : "-"}</span>}
          {row.voided.map((v) => (
            <p key={v.id} className="nums mt-1 text-xs text-text-subtle">
              {v.number} · void
            </p>
          ))}
        </div>
      </TableCell>
      <TableCell className={cn(CELL, "lg:text-right")}>
        {row.invoice ? (
          <PayrollInvoiceActions invoice={row.invoice} canWrite={canWrite} today={today} />
        ) : row.draft && canWrite ? (
          <div className="flex lg:justify-end">
            <PrepareInvoiceDialog proposalId={p.proposalId} company={p.company} intern={p.intern} period={{ start: row.start, end: row.end }} draft={row.draft} today={today} />
          </div>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function InvoiceCell({ invoice }: { invoice: PayrollInvoiceDto }) {
  const when =
    invoice.status === "paid" && invoice.paidAt ? `Paid ${formatDate(invoice.paidAt)}` : `Issued ${formatDate(invoice.issuedAt)}${invoice.status === "due" ? ` · due ${formatDate(invoice.dueOn)}` : ""}`;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2 max-lg:justify-end">
        <span className="nums font-medium">{invoice.number}</span>
        <StatusBadge tone={INVOICE_TONE[invoice.status]} label={MANUAL_INVOICE_STATUS_LABEL[invoice.status]} />
      </div>
      <p className="nums mt-0.5 text-[0.8125rem] text-text-subtle">
        {usd(invoice.totalMinor)} · {when}
        {invoice.status === "paid" && invoice.wireReference ? ` · ref ${invoice.wireReference}` : ""}
      </p>
    </div>
  );
}
