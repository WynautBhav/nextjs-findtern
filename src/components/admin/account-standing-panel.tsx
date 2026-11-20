"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PauseCircle, ShieldAlert, ShieldCheck } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buttonClass } from "@/components/ui/button";
import { ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import { EVIDENCE_MAX, EVIDENCE_MIN, STRIKE_REASONS, UNFREEZE_REASONS } from "@/lib/moderation/strikes";

export type StandingRow = {
  id: string;
  kind: string;
  reason: string;
  evidenceNote: string | null;
  adminName: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
};

type Action = "violation" | "freeze" | "unfreeze";

const KIND_LABEL: Record<string, string> = { warning: "Warning", freeze: "Frozen", unfreeze: "Unfrozen", revoked: "Revoked" };
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const reasonLabel = (code: string) => (STRIKE_REASONS as Record<string, string>)[code] ?? (UNFREEZE_REASONS as Record<string, string>)[code] ?? code;

/**
 * Admin: an account's standing at a glance, its strike history (evidence notes are admin-only and never shown to the person),
 * and Warn / Freeze / Unfreeze behind a confirm dialog that needs a reason and an evidence note. The server decides
 * (lib/moderation/strikes.ts): the first confirmed violation warns, the next freezes; nothing here deletes anything.
 */
export function AccountStandingPanel({
  subjectType,
  subjectId,
  violations,
  frozen,
  frozenAt,
  pendingWarning,
  history,
  canWrite,
}: {
  subjectType: "intern" | "employer";
  subjectId: string;
  violations: number;
  frozen: boolean;
  frozenAt: string | null;
  pendingWarning: boolean;
  history: StandingRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const reasonId = useId();
  const noteId = useId();

  const nextFreezes = violations >= 1;
  const reasons = action === "unfreeze" ? UNFREEZE_REASONS : STRIKE_REASONS;
  const valid = reason !== "" && note.trim().length >= EVIDENCE_MIN && note.trim().length <= EVIDENCE_MAX;
  const base = subjectType === "intern" ? "interns" : "companies";

  function open(a: Action) {
    setAction(a);
    setReason("");
    setNote("");
    setError(null);
  }

  async function confirm() {
    if (!action || !valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch(`/api/admin/${base}/${subjectId}/standing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason, evidenceNote: note, ...(action === "unfreeze" ? {} : { expectedViolations: violations }) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "That did not go through. Try again.");
      setDone(data.already ? "Already done: the account's standing had changed. The page now shows the current state." : null);
      setAction(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const chip = frozen
    ? { icon: PauseCircle, text: `Frozen${frozenAt ? ` since ${fmt(frozenAt)}` : ""}`, tone: "border-danger/30 bg-danger-soft text-danger" }
    : violations > 0
      ? { icon: ShieldAlert, text: pendingWarning ? "Warned, not yet acknowledged" : "Warned and acknowledged", tone: "border-amber-300 bg-amber-50 text-amber-900" }
      : { icon: ShieldCheck, text: "Good standing", tone: "border-brand-200 bg-brand-50 text-brand-800" };
  const Icon = chip.icon;

  const copy: Record<Action, { title: string; body: string; cta: string }> = {
    violation: nextFreezes
      ? { title: "Freeze this account (confirmed second violation)", body: "They cannot sign in, open tabs stop at the next request, offers and proposals are paused (not withdrawn), and they are emailed. Nothing is deleted and you can unfreeze later.", cta: "Freeze account" }
      : { title: "Send a warning (first confirmed violation)", body: "They are emailed and must acknowledge a notice the next time they use Findtern. Nothing else changes. A second confirmed violation freezes the account.", cta: "Send warning" },
    freeze: { title: "Freeze now (severe case)", body: "Skips the warning. Same effect as a second violation: no sign-in, offers and proposals paused, they are emailed. Nothing is deleted and you can unfreeze later.", cta: "Freeze account" },
    unfreeze: { title: "Unfreeze this account", body: "Access is restored, paused offers and proposals continue unless they already ran out, and they are emailed. The strike history stays.", cta: "Unfreeze" },
  };

  return (
    <section aria-labelledby={`${reasonId}-h`} className="rounded-2xl border border-ink-200 bg-[color:var(--admin-panel)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id={`${reasonId}-h`} className="text-base font-semibold text-ink-900">Account standing</h2>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium", chip.tone)}>
            <Icon className="size-4" aria-hidden />
            {chip.text}
          </span>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            {frozen ? (
              <button type="button" onClick={() => open("unfreeze")} className={cn(buttonClass({ variant: "outline", size: "sm" }), ADMIN_PILL_SECONDARY, "min-h-11")}>Unfreeze</button>
            ) : (
              <>
                <button type="button" onClick={() => open("violation")} className={cn(buttonClass({ variant: "outline", size: "sm" }), ADMIN_PILL_SECONDARY, "min-h-11")}>{nextFreezes ? "Freeze (2nd violation)" : "Warn"}</button>
                {!nextFreezes ? (
                  <button type="button" onClick={() => open("freeze")} className={cn(buttonClass({ variant: "outline", size: "sm" }), ADMIN_PILL_SECONDARY, "min-h-11 text-danger")}>Freeze now</button>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
      {done ? <p role="status" className="mt-3 text-sm text-ink-700">{done}</p> : null}

      <div className="mt-4">
        {history.length === 0 ? (
          <p className="text-sm text-text-subtle">No strikes on record. The first confirmed violation sends a warning; the second freezes the account. Strikes never expire.</p>
        ) : (
          <ol className="divide-y divide-ink-200 rounded-xl border border-ink-200">
            {history.map((h) => (
              <li key={h.id} className="px-3.5 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-semibold text-ink-900">{KIND_LABEL[h.kind] ?? h.kind}<span className="font-normal text-ink-700"> · {reasonLabel(h.reason)}</span></span>
                  <span className="text-text-subtle">{fmt(h.createdAt)}{h.adminName ? ` · by ${h.adminName}` : ""}</span>
                </div>
                {h.kind === "warning" ? <p className="mt-0.5 text-text-subtle">{h.acknowledgedAt ? `Acknowledged ${fmt(h.acknowledgedAt)}` : "Not acknowledged yet"}</p> : null}
                {h.evidenceNote ? <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-ink-50 px-3 py-2 text-ink-800"><span className="mr-1.5 text-xs font-semibold uppercase tracking-wide text-text-subtle">Admin only</span>{h.evidenceNote}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </div>

      <Dialog open={action !== null} onOpenChange={(o) => { if (!o && !busy) setAction(null); }}>
        <DialogContent>
          {action ? (
            <>
              <DialogHeader>
                <DialogTitle>{copy[action].title}</DialogTitle>
                <DialogDescription>{copy[action].body}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <label htmlFor={reasonId} className="block text-sm font-medium text-foreground">
                  Reason
                  <select id={reasonId} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1.5 h-11 w-full rounded-full border border-ink-300 bg-[color:var(--admin-panel)] px-3 text-base sm:text-sm">
                    <option value="">Choose a reason</option>
                    {Object.entries(reasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label htmlFor={noteId} className="block text-sm font-medium text-foreground">
                  Evidence note <span className="font-normal text-text-subtle">(admin only, never shown to them)</span>
                  <textarea id={noteId} value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={EVIDENCE_MAX} className="mt-1.5 w-full rounded-xl border border-ink-300 bg-[color:var(--admin-panel)] px-3 py-2 text-base sm:text-sm" placeholder="What happened, where you saw it" />
                </label>
                {!valid && !error ? <p className="text-sm text-text-subtle">Choose a reason and add an evidence note (at least {EVIDENCE_MIN} characters) to continue.</p> : null}
                <p role="alert" className="text-sm text-danger empty:hidden">{error}</p>
              </div>
              <DialogFooter>
                <button type="button" onClick={() => setAction(null)} disabled={busy} className={cn(buttonClass({ variant: "outline" }), "min-h-11")}>Cancel</button>
                <button type="button" onClick={confirm} disabled={!valid || busy} className={cn(buttonClass({ variant: "primary" }), "min-h-11")}>
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  {copy[action].cta}
                </button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
