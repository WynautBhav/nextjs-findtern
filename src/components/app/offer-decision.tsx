"use client";

/**
 * Accept or turn down an offer, from the offer page or straight from the
 * offers list (INW-28). Both places get the same steps:
 *
 * - Accepting an internship: one dialog that says what happens next (the
 *   company pays, then logging hours opens) and the intern terms + NDA tick.
 * - Accepting a full-time offer: the legacy binding agreement with its 10 s
 *   read time (CountdownAgreement). Accepting it is the hire.
 * - Turning one down: a confirm dialog, because it is final (INW-12, legacy
 *   "This action can't be undone"). Past the free declines it also says the
 *   refund under the guarantee is lost (INW-25) and sends the acknowledgement
 *   the API asks for.
 *
 * It used a raw `fetch` once, with no CSRF header, so Accept returned 403
 * silently. Every call goes through `csrfFetch` and every failure says what
 * happened and that nothing changed.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Loader2, X } from "lucide-react";

import { CountdownAgreement, FULL_TIME_ACCEPTANCE_TERMS } from "@/components/app/countdown-agreement";
import { buttonClass } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/client-fetch";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Outcome = { kind: "accepted" | "declined"; error?: string };

export function OfferDecision({
  proposalId,
  roleTitle,
  company,
  startDate,
  fullTime = false,
  declinesUsed = 0,
  freeDeclines = 3,
  guaranteeEnded = false,
  layout = "rail",
}: {
  proposalId: string;
  roleTitle: string;
  company: string;
  startDate: string | null;
  /** Full-time offers need the binding acceptance agreement. */
  fullTime?: boolean;
  /** Offers this intern has already turned down. */
  declinesUsed?: number;
  freeDeclines?: number;
  guaranteeEnded?: boolean;
  /** "rail": the offer page's decision card. "row": a list card's footer. */
  layout?: "rail" | "row";
}) {
  const router = useRouter();
  const statusRef = useRef<HTMLDivElement>(null);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [, startTransition] = useTransition();

  const done = outcome && !outcome.error ? outcome : null;
  // The buttons that had focus are gone once the result shows, so focus lands on the result.
  useEffect(() => {
    if (done) statusRef.current?.focus();
  }, [done]);

  // Declining past the free allowance ends the refund under the guarantee;
  // it is allowed, but only after the intern has seen that consequence.
  const endsGuarantee = declinesUsed >= freeDeclines && !guaranteeEnded;
  const freeLeft = Math.max(0, freeDeclines - declinesUsed);
  const joining = startDate ? formatDate(startDate) : null;
  const rail = layout === "rail";

  async function decide(kind: "accepted" | "declined", opts: { fullTimeAgreed?: boolean } = {}) {
    setBusy(kind === "accepted" ? "accept" : "decline");
    const close = () => {
      setBusy(null);
      setAcceptOpen(false);
      setDeclineOpen(false);
    };
    try {
      const res = await csrfFetch(`/api/proposals/${proposalId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // The API speaks "rejected"; "declined" is only this screen's wording.
        body: JSON.stringify({
          status: kind === "declined" ? "rejected" : kind,
          agreedToTerms: kind === "accepted" && (agreed || Boolean(opts.fullTimeAgreed)),
          agreedToFullTimeTerms: kind === "accepted" && Boolean(opts.fullTimeAgreed),
          acknowledgeGuaranteeEnd: kind === "declined" && endsGuarantee,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setOutcome({ kind, error: body.error ?? "That did not go through. Nothing has changed, so you can try again." });
        close();
        return;
      }
      setOutcome({ kind });
      close();
      startTransition(() => router.refresh());
    } catch {
      setOutcome({ kind, error: "You appear to be offline. Nothing was sent, and your offer is still open." });
      close();
    }
  }

  const accepted = done?.kind === "accepted";
  // Always mounted, so the result is announced when it fills in; the CSS fade is the only motion.
  const status = (
    <div ref={statusRef} role="status" tabIndex={-1} className="outline-none">
      {done ? (
        <div
          className={cn(
            "flex items-start gap-3 rounded-apple-lg px-4 py-4 motion-safe:animate-tile-in",
            accepted ? "bg-success-soft" : "bg-ink-100",
          )}
        >
          <span
            className={cn(
              "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-white",
              accepted ? "bg-success" : "bg-ink-500",
            )}
          >
            {accepted ? <Check className="size-3" strokeWidth={3.5} aria-hidden /> : <X className="size-3" strokeWidth={3.5} aria-hidden />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-900">
              {accepted ? (fullTime ? "You're hired" : "Offer accepted") : "Offer turned down"}
            </p>
            <p className="mt-1 text-pretty text-sm leading-relaxed text-ink-700">
              {accepted
                ? fullTime
                  ? `Accepting this full-time offer makes you hired${joining ? `. Join on ${joining}` : ""}.`
                  : `${company} completes the payment next. Logging hours opens once they do${joining ? `, and you start on ${joining}` : ""}.`
                : "It stays in your offers as rejected. This can't be undone."}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div>
      {status}
      <div hidden={Boolean(done)}>
      {outcome?.error ? (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-apple-sm bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertCircle className="mt-px size-4 shrink-0" aria-hidden />
          {outcome.error}
        </p>
      ) : null}

      <div className={cn("flex gap-3", rail ? "flex-col" : "flex-wrap")}>
        <button
          type="button"
          onClick={() => setAcceptOpen(true)}
          disabled={busy !== null}
          className={buttonClass({
            variant: rail ? "accent" : "primary",
            size: "md",
            block: rail,
            className: cn("text-sm font-semibold", !rail && "flex-1 sm:flex-none"),
          })}
        >
          {busy === "accept" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
          {fullTime ? "Accept the job offer" : "Accept this offer"}
        </button>
        <button
          type="button"
          onClick={() => setDeclineOpen(true)}
          disabled={busy !== null}
          className={buttonClass({
            variant: "outline",
            size: "md",
            block: rail,
            className: cn("text-sm", !rail && "flex-1 sm:flex-none"),
          })}
        >
          {busy === "decline" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Turn it down
        </button>
      </div>

      {rail ? (
        <div className="mt-4 space-y-2 text-sm leading-relaxed text-ink-600">
          <p>
            <span className="font-medium text-ink-800">If you do nothing</span>, the offer stays open until the day before
            the joining date{joining ? ` (${joining})` : ""}. On the joining date it closes and is marked as rejected.
          </p>
          <p>
            {guaranteeEnded
              ? "Your placement guarantee has ended, so declines no longer affect a refund."
              : freeLeft > 0
                ? `You can turn down ${freeLeft} more offer${freeLeft === 1 ? "" : "s"} and keep your guarantee. Turn down more than ${freeDeclines} and you are no longer eligible for a refund.`
                : `You have turned down ${declinesUsed} offers. Turning down another means you are no longer eligible for a refund under the guarantee.`}
          </p>
        </div>
      ) : null}

      {/* ── Accept: internship ───────────────────────────────────── */}
      {!fullTime ? (
        <Dialog open={acceptOpen} onOpenChange={(open) => (busy ? null : setAcceptOpen(open))}>
          <DialogContent className="rounded-apple-xl p-6 sm:max-w-lg">
            <DialogHeader className="text-left">
              <DialogTitle className="text-lg font-semibold leading-snug tracking-[-0.015em] text-ink-900">
                Accept {roleTitle}?
              </DialogTitle>
              <DialogDescription className="text-pretty text-sm leading-relaxed text-ink-700">
                This tells {company === "The company" ? "the company" : company} yes{joining ? ` for a start on ${joining}` : ""}. They complete the payment next.
                You&apos;re hired, and logging hours opens, once they do. Your other open offers from this company close.
              </DialogDescription>
            </DialogHeader>
            <label className="flex cursor-pointer items-start gap-3 rounded-apple-lg border border-ink-200/80 bg-ink-50 p-4 text-sm text-ink-700">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-brand-700"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                I agree to the{" "}
                <a href="/intern-terms-and-conditions" target="_blank" className="font-medium text-brand-700 underline underline-offset-4">
                  intern terms
                </a>{" "}
                and the{" "}
                <a href="/intern-nda" target="_blank" className="font-medium text-brand-700 underline underline-offset-4">
                  non-disclosure agreement
                </a>
                .
              </span>
            </label>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setAcceptOpen(false)}
                disabled={busy !== null}
                className={buttonClass({ variant: "outline", size: "md", className: "text-sm" })}
              >
                Not yet
              </button>
              <button
                type="button"
                onClick={() => decide("accepted")}
                disabled={busy !== null || !agreed}
                className={buttonClass({ variant: "primary", size: "md", className: "text-sm font-semibold" })}
              >
                {busy === "accept" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
                Yes, accept
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <CountdownAgreement
          open={acceptOpen}
          onOpenChange={setAcceptOpen}
          title="Full-time offer acceptance"
          description="Accepting this full-time offer is the hire. Before you accept, read and acknowledge the following terms."
          sections={FULL_TIME_ACCEPTANCE_TERMS}
          agreeLabel="I confirm that I have read, understood, and agreed to the above terms. I acknowledge that accepting this offer is a binding professional commitment."
          confirmLabel="Accept the offer"
          busy={busy === "accept"}
          onConfirm={() => decide("accepted", { fullTimeAgreed: true })}
        />
      )}

      {/* ── Turn down ────────────────────────────────────────────── */}
      <Dialog open={declineOpen} onOpenChange={(open) => (busy ? null : setDeclineOpen(open))}>
        <DialogContent className="rounded-apple-xl p-6 sm:max-w-md" role="alertdialog">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-semibold leading-snug tracking-[-0.015em] text-ink-900">
              Turn down this offer?
            </DialogTitle>
            <DialogDescription className="text-pretty text-sm leading-relaxed text-ink-700">
              This action can&apos;t be undone. {roleTitle} will be marked as rejected and the company is told.
            </DialogDescription>
          </DialogHeader>
          {guaranteeEnded ? null : endsGuarantee ? (
            <p className="rounded-apple-lg border border-warning/40 bg-warning-soft p-4 text-pretty text-sm leading-relaxed text-ink-800">
              <span className="font-semibold">This would be offer number {declinesUsed + 1} you turn down.</span> The
              guarantee covers up to {freeDeclines} declined offers. Turn down more than {freeDeclines} and you are no
              longer eligible for a refund. You can still receive and accept offers.
            </p>
          ) : (
            <p className="text-pretty text-sm leading-relaxed text-ink-600">
              After this you can turn down {Math.max(0, freeLeft - 1)} more offer{freeLeft - 1 === 1 ? "" : "s"} and keep
              your guarantee. More than {freeDeclines} declined offers means no refund under the guarantee.
            </p>
          )}
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDeclineOpen(false)}
              disabled={busy !== null}
              className={buttonClass({ variant: "outline", size: "md", className: "text-sm" })}
            >
              Keep it open
            </button>
            <button
              type="button"
              onClick={() => decide("declined")}
              disabled={busy !== null}
              className={buttonClass({ variant: "dark", size: "md", className: "text-sm font-semibold" })}
            >
              {busy === "decline" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {endsGuarantee ? "Turn it down anyway" : "Yes, turn it down"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
