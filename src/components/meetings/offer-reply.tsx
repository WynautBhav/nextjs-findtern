"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { formatIstClock, formatIstDay, IST_ZONE } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CancelMeetingDialog } from "./cancel-meeting-dialog";
import { postMeeting, STALE_CODES } from "./meeting-api";
import { RescheduleRequestPanel } from "./intern-meeting-actions";

export type OfferSlot = { index: number; iso: string };

/**
 * An open offer, answered: the candidate chooses one of the company's three times, asks to reschedule (no times of their own) or
 * cancels. The employer sees it only for an offer the candidate made before this rule (pick one, or cancel; new times are offered
 * from the row's menu). `role` decides the words and where the times are read (intern in IST, employer in the project's zone).
 */
export function OfferReply({
  interviewId,
  slots,
  zone,
  role,
  canRequestReschedule = false,
  serverNow,
}: {
  interviewId: string;
  slots: OfferSlot[];
  zone: string;
  role: "employer" | "intern";
  /** The candidate may ask the company for new times. */
  canRequestReschedule?: boolean;
  /** ISO time on the server, so a time that has started is not offered on first render. */
  serverNow: string;
}) {
  const router = useRouter();
  const name = useId();
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const now = new Date(serverNow).getTime();
  const intern = role === "intern";
  const inIst = zone === IST_ZONE || zone === "Asia/Calcutta";

  async function confirm() {
    if (selected === null) return;
    setBusy(true);
    setError("");
    const r = await postMeeting(`/api/interviews/${encodeURIComponent(interviewId)}/select-slot`, { slot: selected });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      if (r.code && STALE_CODES.has(r.code)) router.refresh();
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <fieldset className="min-w-0">
        <legend className="w-full text-pretty text-sm text-ink-700">
          {intern || inIst ? "Choose one of these 3 times. Times are in India time (IST)." : `Choose one of these times. Times are in ${zone}, with the candidate's IST beside each.`}
        </legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {slots.map((slot) => {
            const passed = new Date(slot.iso).getTime() <= now;
            return (
              <label
                key={slot.index}
                className={cn(
                  "flex min-h-11 cursor-pointer items-start gap-3 rounded-apple-sm border border-ink-200/80 bg-surface-raised px-4 py-3 transition-colors duration-150",
                  "hover:border-brand-400 has-[:checked]:border-brand-700 has-[:checked]:bg-brand-50 has-[:checked]:ring-1 has-[:checked]:ring-inset has-[:checked]:ring-brand-700",
                  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600",
                  passed && "cursor-not-allowed opacity-60 hover:border-ink-200/80",
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={slot.index}
                  checked={selected === slot.index}
                  disabled={passed || busy}
                  onChange={() => setSelected(slot.index)}
                  className="mt-1 size-4 shrink-0 accent-brand-700"
                />
                <span className="min-w-0">
                  <span className="nums block text-sm text-ink-700">{formatIstDay(slot.iso, zone)}</span>
                  <span className="nums block text-base font-semibold text-ink-900">{passed ? "Passed" : formatIstClock(slot.iso, zone)}</span>
                  {!intern && !inIst && !passed ? <span className="nums block text-xs text-text-subtle">{formatIstClock(slot.iso)} for the candidate</span> : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={confirm} disabled={selected === null || busy} className={buttonClass({ size: "sm", className: "min-h-11" })}>
          {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          {intern ? "Confirm this time" : "Pick this time"}
        </button>
        {intern && canRequestReschedule ? (
          <button type="button" aria-expanded={asking} onClick={() => setAsking((v) => !v)} className={buttonClass({ variant: "outline", size: "sm", className: "h-auto min-h-11 whitespace-normal py-2 text-left leading-snug" })}>
            None of these work: ask to reschedule
          </button>
        ) : null}
        <button type="button" onClick={() => setCancelling(true)} className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}>
          Cancel
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {asking ? <RescheduleRequestPanel interviewId={interviewId} booked={false} onClose={() => setAsking(false)} /> : null}
      <CancelMeetingDialog interviewId={interviewId} open={cancelling} onOpenChange={setCancelling} other={intern ? "the company" : "the candidate"} />
    </div>
  );
}
