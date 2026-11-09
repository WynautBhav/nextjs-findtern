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
import { OfferCountdown } from "@/components/app/offer-countdown";
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
import { addDays } from "@/lib/offer";
import { cn } from "@/lib/utils";

type Outcome = { kind: "accepted" | "declined"; error?: string };

export function OfferDecision({
  proposalId,
  roleTitle,
  company,
  startDate,
  joiningDate,
  fullTime = false,
  declinesUsed = 0,
  freeDeclines = 3,
  guaranteeEnded = false,
  bonusLabel = null,
  acceptBlocked = null,
  layout = "rail",
  aside,
}: {
  proposalId: string;
  roleTitle: string;
  company: string;
  /** Raw start date: the offer closes when this day begins in India. */
  startDate: string | null;
  /** The IST day the first shift starts (YYYY-MM-DD), for all joining wording. Defaults to `startDate`. */
  joiningDate?: string | null;
  /** Full-time offers need the binding acceptance agreement. */
  fullTime?: boolean;
  /** Offers this intern has already turned down. */
  declinesUsed?: number;
  freeDeclines?: number;
  guaranteeEnded?: boolean;
  /** e.g. "+ ₹2,500 completion bonus when you finish", worked out on the server; null when none is promised. */
  bonusLabel?: string | null;
  /** Why this offer can't be accepted right now (Findtern took its listing down). Accept is disabled and says why; turning it down stays open. */
  acceptBlocked?: string | null;
  /** "rail": the offer page's decision card. "row": a list card's footer. */
  layout?: "rail" | "row";
  /** Row layout only: a quiet link that sits after the two buttons (and beside "Turn it down" on a phone). */
  aside?: React.ReactNode;
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
  // A full-time conversion offer never counts as a miss (guarantee.ts).
  const endsGuarantee = !fullTime && declinesUsed >= freeDeclines && !guaranteeEnded;
  const freeLeft = Math.max(0, freeDeclines - declinesUsed);
  const joiningDay = joiningDate === undefined ? startDate : joiningDate;
  const joining = joiningDay ? formatDate(joiningDay) : null;
  // The offer closes when the start date begins in India, so the last day to answer is the day before it.
  const answerBy = startDate && /^\d{4}-\d{2}-\d{2}/.test(startDate) ? formatDate(addDays(startDate.slice(0, 10), -1)) : null;
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

      <div className={cn("flex gap-3", rail ? "flex-col max-lg:sticky max-lg:bottom-[4.5rem] max-lg:z-10 max-lg:-mx-5 max-lg:border-t max-lg:border-ink-200/80 max-lg:bg-white max-lg:px-5 max-lg:py-3" : "flex-wrap")}>
        {acceptBlocked ? (
          <p id={`accept-blocked-${proposalId}`} className="flex w-full basis-full items-start gap-2 rounded-apple-sm bg-warning-soft px-4 py-3 text-sm text-ink-800">
            <AlertCircle className="mt-px size-4 shrink-0" aria-hidden />
            {acceptBlocked}
          </p>
        ) : null}
        <button
          type="button"
          // aria-disabled, not disabled: the button stays in the Tab order so a keyboard or screen-reader
          // user reaches it and hears the reason (aria-describedby). The click is ignored instead.
          onClick={() => {
            if (!acceptBlocked) setAcceptOpen(true);
          }}
          disabled={busy !== null}
          aria-disabled={acceptBlocked ? true : undefined}
          aria-describedby={acceptBlocked ? `accept-blocked-${proposalId}` : undefined}
          className={buttonClass({
            variant: "primary",
            size: "md",
            block: rail,
            className: cn(
              "text-sm font-semibold",
              !rail && "flex-1 max-sm:basis-full sm:flex-none",
              acceptBlocked && "cursor-not-allowed opacity-55 hover:bg-primary hover:shadow-sm active:scale-100",
            ),
          })}
        >
          {busy === "accept" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Check className="size-4" aria-hidden />}
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
          {busy === "decline" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          Turn it down
        </button>
        {rail ? null : aside}
      </div>

      {rail ? (
        <div className="mt-4 space-y-2 text-sm leading-relaxed text-ink-600">
          <OfferCountdown startDate={startDate} />
          {answerBy ? (
            <p>
              <span className="font-medium text-ink-800">If you do nothing</span>, the offer closes after {answerBy} and is
              marked as rejected. Answer by {answerBy}.
            </p>
          ) : null}
          <p>
            {guaranteeEnded
              ? "Your placement guarantee has ended, so declines no longer affect a refund."
              : fullTime
                ? "Turning down a full-time offer does not count against your placement guarantee."
                : freeLeft > 0
                ? `You can miss ${freeLeft} more offer${freeLeft === 1 ? "" : "s"} and keep your guarantee. Turning an offer down or letting it lapse unanswered both count. Miss more than ${freeDeclines} and you are no longer eligible for a refund.`
                : `You have turned down or let lapse ${declinesUsed} offers. Turning down or letting another lapse means you are no longer eligible for a refund under the guarantee.`}
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
                You&apos;re hired, and logging hours opens, once they do. Your other open offers, from any company, close when you accept: it&apos;s one internship at a time.
                {bonusLabel ? ` ${bonusLabel.replace(/^\+\s*/, "You also get ")}.` : ""}
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
                {busy === "accept" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Check className="size-4" aria-hidden />}
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
          {guaranteeEnded ? null : fullTime ? (
            <p className="text-pretty text-sm leading-relaxed text-ink-600">
              Turning down a full-time offer does not count against your placement guarantee.
            </p>
          ) : endsGuarantee ? (
            <p className="rounded-apple-lg border border-warning/40 bg-warning-soft p-4 text-pretty text-sm leading-relaxed text-ink-800">
              <span className="font-semibold">This would be offer number {declinesUsed + 1} you miss.</span> The
              guarantee covers up to {freeDeclines} declined or lapsed offers. Miss more than {freeDeclines} and you are no
              longer eligible for a refund. You can still receive and accept offers.
            </p>
          ) : (
            <p className="text-pretty text-sm leading-relaxed text-ink-600">
              After this you can turn down {Math.max(0, freeLeft - 1)} more offer{freeLeft - 1 === 1 ? "" : "s"} and keep
              your guarantee. More than {freeDeclines} declined or lapsed offers means no refund under the guarantee.
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
              {busy === "decline" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              {endsGuarantee ? "Turn it down anyway" : "Yes, turn it down"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
