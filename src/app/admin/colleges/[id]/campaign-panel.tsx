"use client";

import { useCallback, useEffect, useState } from "react";

import { Pill, Surface, type Tone } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/client-fetch";

type Counts = { queued: number; sent: number; failed: number; dead: number; total: number; percentDone: number };
type Recipient = { id: string; email: string; status: string; attempts: number; lastError: string | null };
type Progress = { eligible: number; counts: Counts; recipients: Recipient[] };

const STATUS: Record<string, { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "waiting" },
  sending: { label: "Sending", tone: "waiting" },
  sent: { label: "Sent", tone: "paid" },
  failed: { label: "Failed: will retry", tone: "closed" },
  dead: { label: "Failed: gave up", tone: "closed" },
};

export function CampaignPanel({ orderIds, canWrite }: { orderIds: string[]; canWrite: boolean }) {
  const [orderId, setOrderId] = useState(orderIds[0] ?? "");
  const [data, setData] = useState<Progress | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    const r = await csrfFetch(`/api/admin/drive-orders/${orderId}/campaign`).catch(() => null);
    if (r?.ok) setData(await r.json());
  }, [orderId]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), 5000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  if (orderIds.length === 0) return null;
  const eligible = data?.eligible ?? 0;

  async function send() {
    setBusy(true);
    setMsg(null);
    const r = await csrfFetch(`/api/admin/drive-orders/${orderId}/campaign`, { method: "POST" }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    setConfirm(false);
    setMsg(r?.ok ? `Queued ${j.queued} email${j.queued === 1 ? "" : "s"}.` : (j?.error ?? "Could not send. Try again."));
    void load();
  }

  async function resend(id: string) {
    const r = await csrfFetch(`/api/admin/drive-orders/${orderId}/outbox/${id}/resend`, { method: "POST" }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setMsg(r?.ok ? "Resend queued." : (j?.error ?? "Could not resend."));
    void load();
  }

  return (
    <Surface className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Email codes</h2>
          <p className="text-sm text-ink-600">Each student gets a personal code at their college email address.</p>
        </div>
        <div className="flex items-center gap-2">
          {orderIds.length > 1 && (
            <select aria-label="Drive order" className="h-9 rounded-md border border-ink-200 bg-surface px-2 text-sm" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              {orderIds.map((id) => <option key={id} value={id}>Order {id.slice(0, 8)}</option>)}
            </select>
          )}
          {canWrite && <button type="button" className={buttonClass({})} disabled={busy || eligible === 0} onClick={() => setConfirm(true)}>{eligible ? `Send (${eligible})` : "Send"}</button>}
        </div>
      </div>
      {msg && <p role="status" className="text-sm">{msg}</p>}
      {data && data.counts.total > 0 && (
        <>
          <div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.counts.percentDone} aria-label="Email progress">
              <div className="h-full bg-brand-600" style={{ width: `${data.counts.percentDone}%` }} />
            </div>
            <p className="mt-1 text-sm text-ink-600">
              {data.counts.sent} sent, {data.counts.queued} queued, {data.counts.failed} failed, {data.counts.dead} gave up, of {data.counts.total}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr><th className="py-1 pr-3">Recipient</th><th className="pr-3">Status</th><th className="pr-3">Tries</th><th className="pr-3">Last error</th><th><span className="sr-only">Action</span></th></tr></thead>
              <tbody>
                {data.recipients.map((r) => {
                  const bad = r.status === "failed" || r.status === "dead";
                  const s = STATUS[r.status] ?? { label: r.status, tone: "neutral" as Tone };
                  return (
                    <tr key={r.id} className={bad ? "bg-danger-soft/40" : undefined}>
                      <td className="py-1 pr-3">{r.email}</td>
                      <td className="pr-3"><Pill tone={s.tone}>{s.label}</Pill></td>
                      <td className="pr-3">{r.attempts}</td>
                      <td className="pr-3">{r.lastError ?? ""}</td>
                      <td>{canWrite && ["sent", "failed", "dead"].includes(r.status) && <button type="button" className="text-sm font-medium underline underline-offset-4" onClick={() => void resend(r.id)}>Resend</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email codes now?</DialogTitle>
            <DialogDescription>
              This emails a personal code to {eligible} student{eligible === 1 ? "" : "s"}. Students who were already sent a code are skipped.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" className={buttonClass({ variant: "outline" })} onClick={() => setConfirm(false)}>Cancel</button>
            <button type="button" className={buttonClass({})} disabled={busy} onClick={() => void send()}>Send emails</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Surface>
  );
}
