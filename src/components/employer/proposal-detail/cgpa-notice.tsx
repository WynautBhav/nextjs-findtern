import { Hourglass, Info, TimerOff } from "lucide-react";

import { CgpaSlaClock } from "@/components/app/cgpa-sla-clock";
import { CgpaAckButton } from "@/components/employer/proposal-actions";
import type { OfferState } from "@/components/employer/proposal-state";
import { formatIst } from "@/lib/format";

/**
 * What the employer reads on a proposal whose candidate has accepted but whose CGPA is not confirmed yet.
 * Two cases, both from the one `offerState` (`state.gate`): Findtern still checking (pending, or past its 48 h), and
 * a correction the employer has to confirm before payment opens. Nothing about the candidate beyond what the page
 * already shows, and no intern pay.
 */
export function CgpaNotice({ proposalId, state, canConfirm }: { proposalId: string; state: OfferState; canConfirm: boolean }) {
  const gate = state.gate;
  if (!gate) return null;

  if (gate.state === "incorrect_unacked") {
    return (
      <section aria-labelledby="cgpa-notice-h" className="mt-6 flex flex-col gap-4 rounded-2xl bg-info-soft px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Info className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
          <div className="min-w-0">
            <h2 id="cgpa-notice-h" className="nums text-base font-semibold text-ink-900">
              {gate.correctedFrom && gate.correctedTo ? `CGPA corrected from ${gate.correctedFrom} to ${gate.correctedTo}` : "CGPA corrected"}
            </h2>
            <p className="mt-1 max-w-prose text-pretty text-sm leading-relaxed text-ink-800">
              Findtern checked the candidate&apos;s CGPA and corrected it. Confirm to continue to payment, or withdraw the proposal.
            </p>
          </div>
        </div>
        {canConfirm ? <CgpaAckButton proposalId={proposalId} className="sm:w-60 sm:shrink-0" /> : null}
      </section>
    );
  }

  const overdue = gate.state === "overdue";
  return (
    <section aria-labelledby="cgpa-notice-h" className="mt-6 flex items-start gap-3 rounded-2xl bg-accent-100/60 px-5 py-4">
      <Hourglass className="mt-0.5 size-5 shrink-0 text-accent-700" aria-hidden />
      <div className="min-w-0">
        <h2 id="cgpa-notice-h" className="text-base font-semibold text-ink-900">
          Verifying CGPA
        </h2>
        <p className="mt-1 max-w-prose text-pretty text-sm leading-relaxed text-ink-800">{state.next}</p>
        {gate.dueBy ? (
          <p className="nums mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-ink-900">
            <span>
              {overdue ? "Was due by" : "Due by"} {formatIst(gate.dueBy)}
            </span>
            <CgpaSlaClock acceptedAt={gate.acceptedAt} />
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** An expired offer says why, above the "Send a new proposal" button, so the reader understands before acting. */
export function ExpiredNotice({ state }: { state: OfferState }) {
  if (!state.canSendNew) return null;
  return (
    <section aria-label="Why this offer expired" className="mt-6 flex items-start gap-3 rounded-2xl bg-ink-50 px-5 py-4">
      <TimerOff className="mt-0.5 size-5 shrink-0 text-ink-600" aria-hidden />
      <p className="max-w-prose text-pretty text-sm leading-relaxed text-ink-800">{state.next}</p>
    </section>
  );
}
