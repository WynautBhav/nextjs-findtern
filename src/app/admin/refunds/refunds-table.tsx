"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { AdminEmpty } from "@/components/admin/panel";
import { StatusBadge } from "@/components/admin/status-badge";
import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/client-fetch";
import { formatDate, formatMoney } from "@/lib/format";
import type { RefundListRow } from "@/lib/refunds/refunds-db";

const select = "h-9 rounded-apple-sm border border-ink-200 bg-surface px-3 text-sm text-ink-900";

export function RefundsTable(props: { rows: RefundListRow[]; total: number; page: number; perPage: number; status: string; reason: string; statuses: string[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<RefundListRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const go = (next: Record<string, string>) => {
    const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v));
    router.push(`/admin/refunds${qs.size ? `?${qs}` : ""}`);
  };
  const filters = { status: props.status, reason: props.reason };

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

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 p-4">
        <select aria-label="Status" className={select} value={props.status} onChange={(e) => go({ ...filters, status: e.target.value })}>
          <option value="">All statuses</option>
          {props.statuses.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
        <select aria-label="Reason" className={select} value={props.reason} onChange={(e) => go({ ...filters, reason: e.target.value })}>
          <option value="">All reasons</option>
          <option value="drive_entitlement_after_payment">Drive seat after payment</option>
          <option value="interview_consumed">Interview already used</option>
        </select>
        <button type="button" onClick={scan} disabled={scanning} className={`${buttonClass({ variant: "outline", size: "sm" })} sm:ml-auto max-sm:w-full`}>
          {scanning ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          Scan for eligible students
        </button>
      </div>
      <p role="status" aria-live="polite" className={notice ? `px-4 pt-3 text-sm font-medium ${notice.ok ? "text-success" : "text-danger"}` : "sr-only"}>{notice?.text}</p>

      {props.rows.length === 0 ? (
        <AdminEmpty title="No refunds here" body="Run a scan to find students who paid before receiving a drive seat, or clear the filters." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-xs text-text-subtle">
              <tr><th className="p-3">Student</th><th className="p-3">Amount</th><th className="p-3">Paid</th><th className="p-3">Status</th><th className="p-3 text-right">Action</th></tr>
            </thead>
            <tbody>
              {props.rows.map((r) => {
                const actionable = r.status === "eligible" || r.status === "review" || r.status === "pending";
                return (
                  <tr key={r.id} className="border-t border-ink-200 align-middle">
                    <td className="p-3"><div className="font-medium">{r.studentName}</div><div className="text-xs text-text-subtle">{r.studentEmail}</div></td>
                    <td className="p-3 tabular-nums">{formatMoney(r.amountMinor, "INR")}</td>
                    <td className="p-3">{formatDate(r.paidAt)}</td>
                    <td className="p-3"><StatusBadge value={r.status} /></td>
                    <td className="p-3 text-right">
                      {actionable ? (
                        <button type="button" disabled={busy === r.id} className={buttonClass({ variant: r.status === "review" ? "outline" : "primary", size: "sm" })} onClick={() => setTarget(r)}>
                          {r.status === "review" ? "Review" : `Refund ${formatMoney(r.amountMinor, "INR")}`}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-ink-200 p-4 text-sm">
        <span>{props.total} refund{props.total === 1 ? "" : "s"}, page {props.page} of {pages}</span>
        <span className="flex gap-2">
          <button type="button" disabled={props.page <= 1} className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => go({ ...filters, page: String(props.page - 1) })}>Previous</button>
          <button type="button" disabled={props.page >= pages} className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => go({ ...filters, page: String(props.page + 1) })}>Next</button>
        </span>
      </div>

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
