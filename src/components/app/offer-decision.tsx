"use client";

/**
 * Accept or decline an offer.
 *
 * This component was broken and has been rebuilt. It used a raw `fetch` with
 * no CSRF header, so pressing Accept returned 403 and did nothing, with no
 * error shown. The button was `text-xs` at `px-3 py-1.5`, below the 44 pixel
 * target used everywhere else, and the status next to it rendered the literal
 * database enum `interview_scheduled` to the person deciding their internship.
 *
 * ── Why declining is not a confirm dialog ──────────────────────────────
 *
 * Declining is reversible in the only way that matters here: nothing is
 * deleted, the offer stays in the thread with a plain explanation of what
 * happened, and a candidate can apply again in three months. A modal that says
 * "are you sure?" for a reversible, low consequence action is friction for
 * its own sake, and it trains people to click through modals.
 *
 * Accepting *is* a commitment, so accepting is where the confirmation belongs.
 * It states what is about to happen in one sentence, and it names the
 * alternative, and it does not use a countdown. If someone needs ten seconds
 * to read a sentence, a countdown is punishing them for reading.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, Check, Loader2, X } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { CountdownAgreement, FULL_TIME_ACCEPTANCE_TERMS } from "@/components/app/countdown-agreement";

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
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [confirming, setConfirming] = useState(false);
  const [fullTimeOpen, setFullTimeOpen] = useState(false);
  const [declineWarning, setDeclineWarning] = useState(false);
  // Declining past the free allowance ends the placement guarantee; it is
  // allowed, but only after the intern has seen that consequence.
  const lastFreeUsed = declinesUsed >= freeDeclines && !guaranteeEnded;
  const freeLeft = Math.max(0, freeDeclines - declinesUsed);
  const [agreed, setAgreed] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [, startTransition] = useTransition();

  async function decide(kind: "accepted" | "declined", opts: { fullTimeAgreed?: boolean; acknowledgeGuaranteeEnd?: boolean } = {}) {
    setBusy(kind === "accepted" ? "accept" : "decline");
    try {
      const res = await csrfFetch(`/api/proposals/${proposalId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // The API speaks "rejected"; "declined" is only this screen's wording.
        body: JSON.stringify({
          status: kind === "declined" ? "rejected" : kind,
          agreedToTerms: kind === "accepted" && (agreed || Boolean(opts.fullTimeAgreed)),
          agreedToFullTimeTerms: kind === "accepted" && Boolean(opts.fullTimeAgreed),
          acknowledgeGuaranteeEnd: kind === "declined" && Boolean(opts.acknowledgeGuaranteeEnd),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setOutcome({
          kind,
          error:
            body.error ??
            "That did not go through. Nothing has changed, so you can try again.",
        });
        setBusy(null);
        setConfirming(false);
        setFullTimeOpen(false);
        setDeclineWarning(false);
        return;
      }
      setOutcome({ kind });
      startTransition(() => router.refresh());
    } catch {
      setOutcome({
        kind,
        error: "You appear to be offline. Nothing was sent, and your offer is still open.",
      });
      setBusy(null);
      setConfirming(false);
    }
  }

  if (outcome && !outcome.error) {
    return (
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={
          outcome.kind === "accepted"
            ? "flex items-start gap-3 rounded-[20px] bg-success-soft px-4 py-4"
            : "flex items-start gap-3 rounded-[20px] bg-ink-100 px-4 py-4"
        }
        role="status"
      >
        <span
          className={
            outcome.kind === "accepted"
              ? "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success text-white"
              : "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ink-500 text-white"
          }
        >
          {outcome.kind === "accepted" ? (
            <Check className="size-3" strokeWidth={3.5} />
          ) : (
            <X className="size-3" strokeWidth={3.5} />
          )}
        </span>
        <div>
          <p className="text-sm font-semibold text-ink-900">
            {outcome.kind === "accepted"
              ? `You are doing ${roleTitle} at ${company}`
              : `Offer from ${company} declined`}
          </p>
          <p className="mt-1 text-pretty text-sm leading-relaxed text-ink-700">
            {outcome.kind === "accepted"
              ? startDate
                ? `Your timesheet and stipend start on ${startDate}. Your interview will be booked shortly and you will get the times to choose from.`
                : "Your timesheet and stipend start now. Your interview will be booked shortly and you will get the times to choose from."
              : "Nothing is lost and nothing was deleted. This stays in your thread so you remember what you turned down. You can apply again whenever you like."}
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <div>
      <AnimatePresence>
        {confirming ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="mb-4 rounded-[20px] border border-brand-200 bg-brand-50/70 p-5"
          >
            <p className="text-sm font-semibold text-ink-900">
              Accept {roleTitle} at {company}?
            </p>
            <p className="mt-1.5 text-pretty text-sm leading-relaxed text-ink-700">
              This tells {company} yes{startDate ? ` for a start on ${startDate}` : ""}. Once they complete the payment
              you&apos;re hired and your timesheets open. Your other open offers from {company} close.
            </p>
            <label className="mt-3 flex items-start gap-2.5 text-sm text-ink-700">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-brand-700"
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
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => decide("accepted")}
                disabled={busy !== null || !agreed}
                className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-primary px-5 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover disabled:opacity-55"
              >
                {busy === "accept" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Check className="size-4" aria-hidden />
                )}
                Yes, accept
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-ink-200 bg-white px-5 text-sm font-medium text-ink-700 hover:bg-ink-50"
              >
                Not yet
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {outcome?.error ? (
        <p
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-px size-4 shrink-0" aria-hidden />
          {outcome.error}
        </p>
      ) : null}

      {declineWarning ? (
        <div role="alertdialog" aria-label="Turning this down ends your guarantee" className="mb-4 rounded-[20px] border border-warning/40 bg-warning-soft p-5">
          <p className="text-sm font-semibold text-ink-900">This would be offer number {declinesUsed + 1} you turn down</p>
          <p className="mt-1.5 text-pretty text-sm leading-relaxed text-ink-700">
            The placement guarantee covers up to {freeDeclines} declined offers. Turning this one down ends the
            guarantee, so the fee is no longer refundable. You can still receive and accept offers.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => decide("declined", { acknowledgeGuaranteeEnd: true })}
              disabled={busy !== null}
              className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-ink-900 px-5 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-55"
            >
              {busy === "decline" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Turn it down anyway
            </button>
            <button
              type="button"
              onClick={() => setDeclineWarning(false)}
              className="apple-spring apple-pressable inline-flex min-h-11 items-center rounded-[10px] border border-ink-200 bg-white px-5 text-sm font-medium text-ink-700 hover:bg-ink-50"
            >
              Keep it open
            </button>
          </div>
        </div>
      ) : null}

      {fullTime ? (
        <CountdownAgreement
          open={fullTimeOpen}
          onOpenChange={setFullTimeOpen}
          title="Full-time offer acceptance"
          description="Before accepting this full-time employment offer, read and acknowledge the following terms."
          sections={FULL_TIME_ACCEPTANCE_TERMS}
          agreeLabel="I confirm that I have read, understood, and agreed to the above terms. I acknowledge that accepting this offer is a binding professional commitment."
          confirmLabel="Accept the offer"
          busy={busy === "accept"}
          onConfirm={() => decide("accepted", { fullTimeAgreed: true })}
        />
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => (fullTime ? setFullTimeOpen(true) : setConfirming(true))}
          disabled={busy !== null || confirming}
          className="apple-spring apple-pressable inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-primary px-5 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover disabled:opacity-55 sm:flex-none"
        >
          {busy === "accept" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Accept this offer
        </button>
        <button
          type="button"
          onClick={() => (lastFreeUsed ? setDeclineWarning(true) : decide("declined"))}
          disabled={busy !== null || confirming || declineWarning}
          className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-ink-200 bg-white px-5 text-sm font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50 disabled:opacity-55"
        >
          {busy === "decline" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Turn this down
        </button>
      </div>
      <p className="mt-3 text-sm text-ink-600">
        {guaranteeEnded
          ? "Turning it down is fine and nothing is deleted."
          : freeLeft > 0
            ? `Turning it down is fine and nothing is deleted. You can turn down ${freeLeft} more offer${freeLeft === 1 ? "" : "s"} and keep your guarantee.`
            : "You have turned down " + declinesUsed + " offers. Turning down another ends your placement guarantee."}
      </p>
    </div>
  );
}
