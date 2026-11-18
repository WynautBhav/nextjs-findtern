"use client";

import Link from "next/link";
import { useState } from "react";
import { useProgressRouter } from "@/components/layout/navigation-progress";
import { Check, ClipboardCopy, Loader2, ScanSearch } from "lucide-react";

import { AgeCell, Ledger, Money, type LedgerColumn } from "@/components/admin/money/ledger";
import { RecordsLedger, type RecordColumn } from "@/components/admin/money/records-ledger";
import { StatusChip } from "@/components/admin/money/status-chip";
import { Section } from "@/components/app/stat";
import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/client-fetch";
import { formatDate, formatMoney } from "@/lib/format";
import type { CompanyRefundRow } from "@/lib/admin/company-refunds";
import type { RefundListRow } from "@/lib/refunds/refunds-db";

const REASON_LABEL: Record<string, string> = { drive_entitlement_after_payment: "Drive seat after payment", interview_consumed: "Interview already used" };

/** The facts an accountant needs to raise the credit note, as plain text. */
function creditNoteText(r: CompanyRefundRow): string {
  return [
    "Credit note for a refund to a company",
    `Company: ${r.company}`,
    `Original invoice: ${r.invoiceNumber ?? "none recorded"} (order ${r.orderId})`,
    `Refunded: ${formatMoney(r.amountMinor, r.currency)} on ${formatDate(r.at)}`,
    `GST inside the refund: ${formatMoney(r.gstMinor, r.currency)}`,
  ].join("\n");
}

function CopyDetails({ row }: { row: CompanyRefundRow }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass({ variant: "outline", size: "sm" })}
      onClick={async () => {
        await navigator.clipboard?.writeText(creditNoteText(row)).catch(() => null);
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
    >
      {done ? <Check className="size-4" aria-hidden /> : <ClipboardCopy className="size-4" aria-hidden />}
      {done ? "Copied" : "Copy details"}
    </button>
  );
}

export function RefundsTable(props: { rows: RefundListRow[]; companyRows: CompanyRefundRow[]; total: number; page: number; perPage: number; params: Record<string, string>; statuses: string[]; anyRefunds: boolean }) {
  const router = useProgressRouter();
  const [target, setTarget] = useState<RefundListRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function scan() {
    setScanning(true);
    setNotice(null);
    const res = await csrfFetch("/api/admin/refunds", { method: "POST" }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { created?: number; review?: number; error?: string } | null;
    setScanning(false);
    if (!res?.ok) return setNotice({ ok: false, text: data?.error ?? "Scan failed" });
    setNotice({ ok: true, text: `Scan done: ${data?.created ?? 0} new (${data?.review ?? 0} need review).` });
    router.refresh();
  }

  async function initiate(row: RefundListRow) {
    setBusy(row.id);
    setNotice(null);
    const res = await csrfFetch(`/api/admin/refunds/${encodeURIComponent(row.id)}/initiate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": `ui:${row.id}:${crypto.randomUUID()}` },
      body: JSON.stringify({ confirm: true, amountMinor: row.amountMinor }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    setBusy(null);
    setTarget(null);
    setNotice(res?.ok ? { ok: true, text: `Refund of ${formatMoney(row.amountMinor, "INR")} started for ${row.studentName}.` } : { ok: false, text: data?.error ?? "Refund failed" });
    router.refresh();
  }

  const pages = Math.max(1, Math.ceil(props.total / props.perPage));
  const who = (r: RefundListRow) => (
    <div className="min-w-0 max-w-72">
      <span className="block truncate font-medium text-ink-900">{r.studentName}</span>
      {r.studentEmail ? <span className="block truncate text-xs text-ink-600">{r.studentEmail}</span> : null}
    </div>
  );

  const owed = props.companyRows.filter((r) => r.creditNoteNeeded);
  const creditColumns: LedgerColumn<CompanyRefundRow>[] = [
    {
      key: "who",
      header: "Company",
      primary: true,
      cell: (r) => (
        <div className="min-w-0 max-w-72">
          <Link href={`/admin/companies/${r.employerId}`} className="block truncate font-medium text-ink-900 underline-offset-4 hover:underline">{r.company}</Link>
          <span className="nums block truncate text-xs text-ink-600">{r.invoiceNumber ?? r.orderId}</span>
        </div>
      ),
    },
    { key: "amt", header: "Refunded", align: "right", cell: (r) => (r.currency === "USD" ? <span className="font-semibold">{formatMoney(r.amountMinor, "USD", { zeroLabel: false })}</span> : <Money minor={r.amountMinor} className="font-semibold" />) },
    { key: "gst", header: "GST inside", align: "right", cell: (r) => <Money minor={r.gstMinor} /> },
    { key: "on", header: "Refunded on", cell: (r) => <span className="whitespace-nowrap">{formatDate(r.at)}</span> },
    { key: "age", header: "Waiting", align: "right", cell: (r) => <AgeCell from={r.at} /> },
    {
      key: "act",
      header: "Action",
      align: "right",
      cell: (r) => (
        <div className="flex flex-wrap justify-end gap-2">
          <CopyDetails row={r} />
          <Link href={`/admin/orders?q=${encodeURIComponent(r.orderId)}`} className={buttonClass({ variant: "outline", size: "sm" })}>Open order</Link>
        </div>
      ),
    },
  ];

  const columns: RecordColumn<RefundListRow>[] = [
    { key: "who", header: "Student", primary: true, cell: who },
    { key: "amt", header: "Amount", align: "right", cell: (r) => <Money minor={r.amountMinor} className="font-semibold" /> },
    { key: "reason", header: "Why", cell: (r) => <span className="text-ink-700">{(r.reason && REASON_LABEL[r.reason]) || r.reason || "–"}</span> },
    { key: "paid", header: "Paid", cell: (r) => <span className="whitespace-nowrap">{formatDate(r.paidAt)}</span> },
    { key: "status", header: "Status", cell: (r) => <StatusChip status={r.status} /> },
    {
      key: "act",
      header: "Action",
      align: "right",
      actions: true,
      cell: (r) =>
        r.status === "eligible" || r.status === "review" || r.status === "pending" ? (
          <button type="button" disabled={busy === r.id} className={buttonClass({ variant: r.status === "review" ? "outline" : "primary", size: "sm" })} onClick={() => setTarget(r)}>
            {r.status === "review" ? "Review" : `Refund ${formatMoney(r.amountMinor, "INR")}`}
          </button>
        ) : r.status === "initiated" ? (
          <span className="text-xs text-ink-600">Waiting for the gateway</span>
        ) : r.status === "failed" ? (
          <span className="text-xs text-ink-700">Run a scan to retry</span>
        ) : null,
    },
  ];

  return (
    <div className="space-y-10">
      <p role="status" aria-live="polite" className={notice ? `text-sm font-medium ${notice.ok ? "text-success" : "text-danger"}` : "sr-only"}>
        {notice?.text}
      </p>

      {owed.length > 0 ? (
        <section id="credit-notes" className="scroll-mt-20">
          <Section title="Credit notes to issue" hint="Refunds sent back to companies that carried GST. A credit note is owed for each; Findtern does not record the number yet, so copy the details to your accounts tool and open the order for the invoice.">
            <Ledger caption="Company refunds still needing a credit note" rows={owed} rowKey={(r) => r.key} columns={creditColumns} />
          </Section>
        </section>
      ) : null}

      <Section
        title="Student refunds"
        action={
          <button id="scan-refunds" type="button" onClick={scan} disabled={scanning} className={buttonClass({ variant: "outline", size: "sm" })}>
            {scanning ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <ScanSearch className="size-4" aria-hidden />}
            Scan for eligible students
          </button>
        }
      >
        <RecordsLedger
          basePath="/admin/refunds"
          params={props.params}
          page={props.page}
          pages={pages}
          total={props.total}
          perPage={props.perPage}
          rows={props.rows}
          rowKey={(r) => r.id}
          columns={columns}
          caption="Activation fee refunds"
          noun="refunds"
          filters={[
            { key: "status", label: "Status", options: props.statuses.map((s) => ({ value: s, label: s === "eligible" ? "Ready to refund" : s === "review" ? "Check first" : s[0].toUpperCase() + s.slice(1) })) },
            { key: "reason", label: "Reason", options: Object.entries(REASON_LABEL).map(([value, label]) => ({ value, label })) },
          ]}
          empty={
            props.anyRefunds
              ? { title: "No refunds here", body: "Nothing matches this view.", next: { label: "Show every refund", href: "/admin/refunds" } }
              : { title: "No refunds yet", body: "A student who paid the activation fee and then got a college drive seat is owed it back. Run a scan to find them.", next: { label: "Scan for eligible students", href: "#scan-refunds" } }
          }
        />
      </Section>

      <Dialog open={target !== null} onOpenChange={(o) => { if (!o && !busy) setTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund {target ? formatMoney(target.amountMinor, "INR") : ""}?</DialogTitle>
            <DialogDescription>
              {target?.status === "review" ? "This student has already used their interview. Check that a refund is still right. " : ""}
              You are refunding {target?.studentName} {target ? formatMoney(target.amountMinor, "INR") : ""} to the original payment method. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" disabled={busy !== null} className={buttonClass({ variant: "outline" })} onClick={() => setTarget(null)}>Cancel</button>
            <button type="button" disabled={busy !== null} className={buttonClass({ variant: "primary" })} onClick={() => target && initiate(target)}>
              {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              Confirm refund
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
