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

/** The running-hire decision for a frozen intern (server: lib/moderation/work-exempt.ts workPanelState). Dates arrive as ISO strings. */
export type WorkState =
  | { kind: "none" }
  | { kind: "pending"; company: string }
  | { kind: "exempt"; company: string; since: string }
  | { kind: "kept_frozen"; company: string }
  | { kind: "lapsed" };

type WorkChoice = "grant" | "revoke" | "keep_frozen";

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
  work = { kind: "none" },
}: {
  subjectType: "intern" | "employer";
  subjectId: string;
  violations: number;
  frozen: boolean;
  frozenAt: string | null;
  pendingWarning: boolean;
  history: StandingRow[];
  canWrite: boolean;
  work?: WorkState;
}) {
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [choice, setChoice] = useState<WorkChoice | null>(null);
  const [workNote, setWorkNote] = useState("");
  const reasonId = useId();
  const noteId = useId();

  const nextFreezes = violations >= 1;
  const reasons = action === "unfreeze" ? UNFREEZE_REASONS : STRIKE_REASONS;
  const valid = reason !== "" && note.trim().length >= EVIDENCE_MIN && note.trim().length <= EVIDENCE_MAX;
  const base = subjectType === "intern" ? "interns" : "companies";

  const noteOk = workNote.trim().length >= 3 && workNote.trim().length <= 500;

  async function decide() {
    if (!choice || !noteOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch(`/api/admin/interns/${subjectId}/work-exempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: choice, note: workNote }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "That did not go through. Try again.");
      setDone(data.already ? "Already done: the page now shows the current state." : null);
      setChoice(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function openChoice(c: WorkChoice) {
    setChoice(c);
    setWorkNote("");
    setError(null);
  }

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
      ? { title: "Freeze this account (confirmed second violation)", body: "They can still sign in, but they only see the on-hold page and can do nothing else; offers and proposals are paused (not withdrawn), and they are emailed. Nothing is deleted and you can unfreeze later.", cta: "Freeze account" }
      : { title: "Send a warning (first confirmed violation)", body: "They are emailed and must acknowledge a notice the next time they use Findtern. Nothing else changes. A second confirmed violation freezes the account.", cta: "Send warning" },
    freeze: { title: "Freeze now (severe case)", body: "Skips the warning. Same effect as a second violation: they can sign in but do nothing else, offers and proposals are paused, they are emailed. Nothing is deleted and you can unfreeze later.", cta: "Freeze account" },
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

      {frozen && work.kind !== "none" ? (
        <div data-testid="work-decision" data-state={work.kind} className={cn("mt-4 rounded-xl border px-4 py-3.5 text-sm", work.kind === "pending" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-ink-200 bg-ink-50 text-ink-800")}>
          {work.kind === "pending" ? (
            <>
              <p className="font-semibold">Decide: this intern has a running internship with {work.company}.</p>
              <p className="mt-1">Until you decide they stay fully frozen. Their hire is not cancelled and payments carry on either way.</p>
            </>
          ) : null}
          {work.kind === "exempt" ? (
            <>
              <p className="font-semibold">Let keep working: running internship with {work.company}.</p>
              <p className="mt-1">Since {fmt(work.since)}. They can open only their timesheets, stipend view and notifications. It ends when you unfreeze them or the internship ends.</p>
            </>
          ) : null}
          {work.kind === "kept_frozen" ? (
            <>
              <p className="font-semibold">Kept fully frozen: running internship with {work.company}.</p>
              <p className="mt-1">They cannot open anything but the on-hold page. The hire is not cancelled and payments carry on.</p>
            </>
          ) : null}
          {work.kind === "lapsed" ? <p className="font-semibold">The running internship has ended, so the permission to keep working has ended with it.</p> : null}
          {canWrite && work.kind !== "lapsed" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {work.kind !== "exempt" ? <button type="button" onClick={() => openChoice("grant")} className={cn(buttonClass({ variant: work.kind === "pending" ? "primary" : "outline", size: "sm" }), "min-h-11")}>Let them keep working</button> : null}
              {work.kind === "exempt" ? <button type="button" onClick={() => openChoice("revoke")} className={cn(buttonClass({ variant: "outline", size: "sm" }), ADMIN_PILL_SECONDARY, "min-h-11")}>Take it back: keep fully frozen</button> : null}
              {work.kind === "pending" ? <button type="button" onClick={() => openChoice("keep_frozen")} className={cn(buttonClass({ variant: "outline", size: "sm" }), ADMIN_PILL_SECONDARY, "min-h-11")}>Keep fully frozen</button> : null}
            </div>
          ) : null}
        </div>
      ) : null}

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

      <Dialog open={choice !== null} onOpenChange={(o) => { if (!o && !busy) setChoice(null); }}>
        <DialogContent>
          {choice ? (
            <>
              <DialogHeader>
                <DialogTitle>{choice === "grant" ? "Let them keep working" : choice === "revoke" ? "Take it back: keep fully frozen" : "Keep fully frozen"}</DialogTitle>
                <DialogDescription>
                  {choice === "grant"
                    ? "They can open only their timesheets, stipend view and notifications while the internship runs. Nothing else: no offers, browsing, uploads or profile edits. Unfreezing ends it."
                    : "They can open only the on-hold page. The hire is not cancelled and payments carry on as they do today."}
                </DialogDescription>
              </DialogHeader>
              <label htmlFor={`${reasonId}-wn`} className="block text-sm font-medium text-foreground">
                Note <span className="font-normal text-text-subtle">(admin only, kept in the audit log)</span>
                <textarea id={`${reasonId}-wn`} value={workNote} onChange={(e) => setWorkNote(e.target.value)} rows={3} maxLength={500} className="mt-1.5 w-full rounded-xl border border-ink-300 bg-[color:var(--admin-panel)] px-3 py-2 text-base sm:text-sm" placeholder="Why" />
              </label>
              {!noteOk && !error ? <p className="text-sm text-text-subtle">Add a short note to continue.</p> : null}
              <p role="alert" className="text-sm text-danger empty:hidden">{error}</p>
              <DialogFooter>
                <button type="button" onClick={() => setChoice(null)} disabled={busy} className={cn(buttonClass({ variant: "outline" }), "min-h-11")}>Cancel</button>
                <button type="button" onClick={decide} disabled={!noteOk || busy} className={cn(buttonClass({ variant: "primary" }), "min-h-11")}>
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  {choice === "grant" ? "Let them keep working" : "Keep fully frozen"}
                </button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
