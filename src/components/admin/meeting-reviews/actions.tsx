"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/client-fetch";
import { EVIDENCE_MAX, EVIDENCE_MIN, STRIKE_REASONS } from "@/lib/moderation/strikes";
import type { ReviewAction, ReviewParty, ReviewPartyType, ReviewState } from "@/lib/meetings/review-types";
import { cn } from "@/lib/utils";

const SUMMARY_CLAMP_CHARS = 320;

/** The Fireflies summary, clamped to a few lines with a Show more toggle when it is long. */
export function ClampedSummary({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const long = text.length > SUMMARY_CLAMP_CHARS;
  return (
    <div>
      <p id={id} className={cn("whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground", long && !open && "line-clamp-4")}>
        {text}
      </p>
      {long ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="mt-1 inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
        >
          {open ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

const COPY: Record<ReviewAction, { title: string; cta: string }> = {
  dismiss: { title: "Dismiss these flags", cta: "Dismiss" },
  warn: { title: "Warn", cta: "Confirm" },
  freeze: { title: "Freeze an account", cta: "Freeze account" },
};

const EFFECT_DONE = { warn: "Warning sent.", freeze: "Account frozen.", none: "Marked as reviewed." } as const;

const fieldClass = "mt-1.5 w-full border border-ink-300 bg-[color:var(--admin-panel)] px-3 text-base sm:text-sm";

/**
 * Dismiss / Warn / Freeze on one reviewed meeting. Nothing here is automatic: each button opens a confirm dialog that
 * needs an evidence note (and, for Warn and Freeze, who it is about and why). The server decides what Warn does: the
 * strike service warns a first violation and freezes a second, using `expectedViolations` to catch a stale page.
 */
export function MeetingReviewActions({
  transcriptId,
  state,
  employer,
  intern,
}: {
  transcriptId: string;
  state: ReviewState;
  employer: ReviewParty | null;
  intern: ReviewParty | null;
}) {
  const router = useRouter();
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [partyType, setPartyType] = useState<ReviewPartyType | "">("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [already, setAlready] = useState(false);
  const uid = useId();

  const parties = [employer, intern].filter((p): p is ReviewParty => p !== null);
  const party = parties.find((p) => p.type === partyType) ?? null;
  const needsParty = action === "warn" || action === "freeze";
  const trimmed = note.trim();
  const noteProblem =
    trimmed.length < EVIDENCE_MIN
      ? `Add a note of at least ${EVIDENCE_MIN} characters. Only admins see it.`
      : trimmed.length > EVIDENCE_MAX
        ? `The note can be at most ${EVIDENCE_MAX} characters.`
        : null;
  const partyProblem = needsParty && !party ? "Choose who this is about." : needsParty && action === "freeze" && party?.frozen ? "That account is already frozen." : null;
  const reasonProblem = needsParty && reason === "" ? "Choose a reason." : null;

  function open(a: ReviewAction) {
    setAction(a);
    setPartyType("");
    setReason("");
    setNote("");
    setTried(false);
    setError(null);
    setDone(null);
  }

  function close() {
    if (busy) return;
    setAction(null);
    if (already) {
      setAlready(false);
      router.refresh();
    }
  }

  async function confirm() {
    if (!action || busy) return;
    setTried(true);
    setError(null);
    if (partyProblem || reasonProblem || noteProblem) {
      document.getElementById(partyProblem ? `${uid}-party-${parties[0]?.type}` : reasonProblem ? `${uid}-reason` : `${uid}-note`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await csrfFetch(`/api/admin/meeting-reviews/${encodeURIComponent(transcriptId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          note: trimmed,
          ...(needsParty && party ? { party: party.type, reason, expectedViolations: party.violations } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: unknown; already?: boolean; effect?: keyof typeof EFFECT_DONE };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "That did not go through. Nothing was changed. Try again.");
      if (data.already) {
        // Stay in the dialog so the message is read: the card may leave this tab as soon as the page refreshes.
        setAlready(true);
        return;
      }
      setDone(EFFECT_DONE[data.effect ?? "none"] ?? "Done.");
      setAction(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not go through. Nothing was changed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const warnBody = !party
    ? "Choose who this is about. A first violation sends a warning the person must acknowledge; a second freezes the account."
    : party.violations >= 1
      ? "This person already has a violation on record, so this will freeze the account."
      : "This sends a warning the person must acknowledge.";
  const body: Record<ReviewAction, string> = {
    dismiss: "Marks the flags as reviewed. Nobody is told.",
    warn: warnBody,
    freeze: "Freezes the account now: login blocked, data kept.",
  };
  const actionable = state === "open";
  const btn = cn(buttonClass({ variant: "outline", size: "sm" }), ADMIN_PILL_SECONDARY, "min-h-11");

  return (
    <div>
      {actionable ? (
        <div className="flex flex-wrap gap-2 max-sm:grid max-sm:grid-cols-3">
          <button type="button" onClick={() => open("dismiss")} className={btn}>Dismiss</button>
          <button type="button" onClick={() => open("warn")} className={btn}>Warn</button>
          <button type="button" onClick={() => open("freeze")} className={cn(btn, "text-danger")}>Freeze</button>
        </div>
      ) : null}
      {done ? <p role="status" className="mt-2 text-sm text-foreground">{done}</p> : null}

      <Dialog open={action !== null} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent>
          {action ? (
            <>
              <DialogHeader>
                <DialogTitle>{COPY[action].title}</DialogTitle>
                <DialogDescription>{body[action]}</DialogDescription>
              </DialogHeader>
              {already ? (
                <p role="status" className="rounded-xl bg-[color:var(--admin-panel-2)] px-3.5 py-3 text-sm text-foreground">
                  Already done, nothing changed. Someone has already reviewed this meeting; the page will show the current state.
                </p>
              ) : (
              <div className="space-y-4">
                {needsParty ? (
                  <>
                    <fieldset aria-describedby={tried && partyProblem ? `${uid}-party-err` : undefined}>
                      <legend className="text-sm font-medium text-foreground">Who is this about?</legend>
                      <div className="mt-1.5 grid gap-2">
                        {parties.map((p) => {
                          const blocked = action === "freeze" && p.frozen;
                          return (
                            <label
                              key={p.type}
                              className={cn(
                                "flex min-h-11 items-start gap-3 rounded-xl border px-3 py-2.5 text-sm",
                                blocked ? "cursor-not-allowed border-ink-200 opacity-60" : "cursor-pointer border-ink-300 has-[:checked]:border-foreground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                              )}
                            >
                              <input
                                id={`${uid}-party-${p.type}`}
                                type="radio"
                                name={`${uid}-party`}
                                value={p.type}
                                checked={partyType === p.type}
                                disabled={blocked}
                                onChange={() => setPartyType(p.type)}
                                className="mt-0.5 size-4 shrink-0 accent-[color:var(--color-foreground,currentColor)]"
                              />
                              <span className="min-w-0">
                                <span className="block break-words font-medium text-foreground">
                                  {p.name} <span className="font-normal text-text-subtle">({p.type === "employer" ? "employer" : "intern"})</span>
                                </span>
                                <span className="block text-text-subtle">
                                  {blocked ? "Already frozen" : p.violations > 0 ? `${p.violations} violation${p.violations === 1 ? "" : "s"} on record` : "No violations on record"}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {tried && partyProblem ? <p id={`${uid}-party-err`} role="alert" className="mt-1.5 text-sm text-danger">{partyProblem}</p> : null}
                    </fieldset>
                    <div>
                      <label htmlFor={`${uid}-reason`} className="block text-sm font-medium text-foreground">Reason</label>
                      <select
                        id={`${uid}-reason`}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        aria-invalid={tried && reasonProblem ? true : undefined}
                        aria-describedby={tried && reasonProblem ? `${uid}-reason-err` : undefined}
                        className={cn(fieldClass, "h-11 rounded-full")}
                      >
                        <option value="">Choose a reason</option>
                        {Object.entries(STRIKE_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      {tried && reasonProblem ? <p id={`${uid}-reason-err`} role="alert" className="mt-1.5 text-sm text-danger">{reasonProblem}</p> : null}
                    </div>
                  </>
                ) : null}
                <div>
                  <label htmlFor={`${uid}-note`} className="block text-sm font-medium text-foreground">
                    Note <span className="font-normal text-text-subtle">(admin only, never shown to them)</span>
                  </label>
                  <textarea
                    id={`${uid}-note`}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={4}
                    maxLength={EVIDENCE_MAX}
                    aria-invalid={tried && noteProblem ? true : undefined}
                    aria-describedby={tried && noteProblem ? `${uid}-note-err` : undefined}
                    placeholder={action === "dismiss" ? "Why these flags need no action" : "What you saw or heard, and where"}
                    className={cn(fieldClass, "rounded-xl py-2")}
                  />
                  {tried && noteProblem ? <p id={`${uid}-note-err`} role="alert" className="mt-1.5 text-sm text-danger">{noteProblem}</p> : null}
                </div>
                <p role="alert" className="text-sm text-danger empty:hidden">{error}</p>
              </div>
              )}
              <DialogFooter>
                {already ? (
                  <button type="button" onClick={close} className={cn(buttonClass({ variant: "primary" }), "min-h-11")}>Close</button>
                ) : (
                  <>
                    <button type="button" onClick={close} disabled={busy} className={cn(buttonClass({ variant: "outline" }), "min-h-11")}>Cancel</button>
                    <button type="button" onClick={confirm} disabled={busy} className={cn(buttonClass({ variant: "primary" }), "min-h-11")}>
                      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                      {COPY[action].cta}
                    </button>
                  </>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
