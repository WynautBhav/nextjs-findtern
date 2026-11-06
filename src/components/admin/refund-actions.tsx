"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useConfirm } from "@/components/app/use-confirm";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { formatMoney } from "@/lib/format";

const input = "h-9 min-w-0 rounded-apple-sm border border-ink-200 bg-surface px-3 text-sm text-ink-900";

export type RefundActionRow = {
  internPaymentId: string;
  studentName: string;
  collegeName: string;
  amountMinor: number;
  /** What opening a refund would give: drives the actions before a refund row exists. */
  decision: "eligible" | "requires_review" | "none";
  refund: { id: string; status: string; amountMinor: number } | null;
};

async function call(url: string, method: "POST" | "PATCH", body: Record<string, unknown>): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const res = await csrfFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = ((await res.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: typeof data.error === "string" ? data.error : `Request failed (${res.status})` };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Network error. Check your connection and try again." };
  }
}

/**
 * The row's refund actions. Each action first opens (or reuses) the refund row, which the API makes idempotent,
 * so the table needs no separate "open" step. Money out always goes through a confirm that states the amount.
 */
export function RefundActions({ row }: { row: RefundActionRow }) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [mode, setMode] = useState<"idle" | "manual" | "reject">("idle");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status = row.refund && row.refund.status !== "rejected" ? row.refund.status : row.decision;
  const amount = formatMoney(row.refund?.amountMinor ?? row.amountMinor, "INR", { zeroLabel: false, decimals: 2 });

  async function refundId(): Promise<{ id: string; amountMinor: number; status: string } | null> {
    if (row.refund && row.refund.status !== "rejected") return { id: row.refund.id, amountMinor: row.refund.amountMinor, status: row.refund.status };
    const opened = await call("/api/admin/refunds", "POST", { internPaymentId: row.internPaymentId });
    if (!opened.ok) {
      setError(opened.error);
      return null;
    }
    return { id: String(opened.data.refundId), amountMinor: Number(opened.data.amountMinor), status: String(opened.data.status) };
  }

  async function run(label: string, fn: () => Promise<boolean>) {
    setBusy(label);
    setError(null);
    const done = await fn().catch(() => false);
    setBusy(null);
    if (done) {
      setMode("idle");
      setText("");
    }
    router.refresh();
  }

  const patch = async (id: string, body: Record<string, unknown>) => {
    const r = await call(`/api/admin/refunds/${encodeURIComponent(id)}`, "PATCH", body);
    if (!r.ok) setError(r.error);
    return r.ok;
  };

  async function initiate() {
    const ok = await ask({
      title: `Refund ${amount} to ${row.studentName}?`,
      body: `Razorpay sends ${amount} back to the card, UPI or bank account the student paid from, usually in 5-7 working days. This uses one of ${row.collegeName}'s paid seats.`,
      confirmLabel: `Refund ${amount}`,
      destructive: false,
    });
    if (!ok) return;
    await run("initiate", async () => {
      const r = await refundId();
      if (!r) return false;
      if (r.status !== "eligible" && r.status !== "failed") {
        setError("This refund changed since the page loaded. Check its status below.");
        return false;
      }
      // The amount the admin saw is the amount confirmed; the server refuses any other.
      return patch(r.id, { action: "initiate", confirmAmountMinor: row.refund?.amountMinor ?? row.amountMinor });
    });
  }

  const submitText = () =>
    run(mode, async () => {
      const r = await refundId();
      if (!r) return false;
      return patch(r.id, mode === "manual" ? { action: "mark_manual", reference: text.trim() } : { action: "reject", reason: text.trim() });
    });

  const btn = buttonClass({ variant: "outline", size: "sm" });
  const spinner = (label: string) => (busy === label ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null);
  const disabled = busy !== null;

  if (mode !== "idle") {
    const manual = mode === "manual";
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length >= 3) void submitText();
        }}
      >
        <input
          autoFocus
          aria-label={manual ? "Refund reference (UTR, bank or Razorpay reference)" : "Reason for rejecting"}
          className={`${input} w-56`}
          placeholder={manual ? "UTR / bank reference" : "Reason"}
          maxLength={manual ? 200 : 500}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" disabled={disabled || text.trim().length < 3} className={buttonClass({ variant: manual ? "primary" : "dark", size: "sm" })}>
          {spinner(mode)}
          {manual ? `Mark ${amount} refunded` : "Reject refund"}
        </button>
        <button type="button" disabled={disabled} onClick={() => { setMode("idle"); setText(""); setError(null); }} className={btn}>
          Cancel
        </button>
        {error ? <span role="alert" className="basis-full text-xs font-medium text-danger">{error}</span> : null}
      </form>
    );
  }

  const actions: React.ReactNode[] = [];
  if (status === "eligible" || status === "failed") {
    actions.push(
      <button key="initiate" type="button" disabled={disabled} onClick={initiate} className={buttonClass({ variant: "primary", size: "sm" })}>
        {spinner("initiate")}
        {status === "failed" ? `Retry ${amount}` : `Refund ${amount}`}
      </button>,
    );
  }
  if (status === "requires_review") {
    actions.push(
      <button key="manual" type="button" disabled={disabled} onClick={() => setMode("manual")} className={btn}>
        Mark refunded by hand
      </button>,
    );
  }
  if (status === "eligible" || status === "failed" || status === "requires_review") {
    actions.push(
      <button key="reject" type="button" disabled={disabled} onClick={() => setMode("reject")} className={btn}>
        Reject
      </button>,
    );
  }
  if (row.refund && (status === "pending" || status === "initiated" || status === "failed")) {
    const id = row.refund.id;
    actions.push(
      <button key="refresh" type="button" disabled={disabled} onClick={() => run("refresh", () => patch(id, { action: "refresh" }))} className={btn}>
        {spinner("refresh")}
        Refresh
      </button>,
    );
  }
  if (row.refund && status === "pending") {
    const id = row.refund.id;
    actions.push(
      <button
        key="cancel"
        type="button"
        disabled={disabled}
        onClick={async () => {
          const ok = await ask({
            title: "Cancel this refund?",
            body: "Only when Razorpay never received it: Findtern checks Razorpay first. The college gets its seat back and the refund can be started again later.",
            confirmLabel: "Cancel refund",
            cancelLabel: "Keep it",
          });
          if (ok) await run("cancel", () => patch(id, { action: "cancel" }));
        }}
        className={btn}
      >
        {spinner("cancel")}
        Cancel
      </button>,
    );
  }

  if (actions.length === 0) return <span className="text-sm text-text-subtle">-</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions}
      {error ? <span role="alert" className="basis-full text-xs font-medium text-danger">{error}</span> : null}
      {dialog}
    </div>
  );
}
