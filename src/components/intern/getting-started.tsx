import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { Surface } from "@/components/app/primitives";
import { AiInterviewAction } from "@/components/intern/ai-interview-join-card";
import { buttonClass } from "@/components/ui/button";
import type { AiInterviewPhase } from "@/lib/ai-interview";
import { formatMoney } from "@/lib/format";
import type { CompletionItem } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

/**
 * The first thing a new candidate sees on Home: three steps, in the order the
 * product requires them (profile, then the one-time activation, then the AI
 * interview). Bug sheet 7, S1 r28: "first you need to complete the profile and
 * do the payment things".
 *
 * Only the current step carries an action. Done steps collapse to a line, and
 * later steps say what they are without offering a button that would fail.
 * The payment form (ActivationCard) is passed in by the page; the interview
 * step owns its own apply / wait / join states.
 */
export function GettingStarted({
  completion,
  activated,
  feeMinor,
  payment,
  internId,
  aiPhase,
  aiLink,
}: {
  completion: { items: CompletionItem[]; done: number; total: number; complete: boolean };
  activated: boolean;
  feeMinor: number;
  /** The activation form, rendered under step 2 while it is current. */
  payment: React.ReactNode;
  internId: string;
  aiPhase: AiInterviewPhase;
  aiLink: string | null;
}) {
  const scored = aiPhase === "scored";
  const steps = [
    { id: "profile", done: completion.complete },
    { id: "payment", done: activated },
    { id: "interview", done: scored },
  ] as const;
  const current = steps.findIndex((s) => !s.done);
  // A candidate who has paid can always take the interview. Profile rules
  // tightened after some candidates paid (Aadhaar, PAN image, emergency
  // contact); they still owe those fields, but that must never hide the
  // interview they already paid for.
  const interviewOpen = activated && !scored;
  const doneCount = steps.filter((s) => s.done).length;
  const missing = completion.items.filter((i) => !i.done);
  const continueHref = missing[0]?.href ?? "/intern/onboarding";
  const pct = completion.total ? Math.round((completion.done / completion.total) * 100) : 0;

  function state(i: number): "done" | "current" | "todo" {
    if (steps[i].done) return "done";
    if (i === 2 && interviewOpen) return "current";
    return i === current ? "current" : "todo";
  }

  return (
    <Surface as="section" aria-labelledby="getting-started" className="p-6 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="getting-started" className="text-lg font-semibold tracking-[-0.015em] text-ink-900">
          Before employers can find you
        </h2>
        <p className="nums text-sm font-medium text-ink-600">
          {doneCount} of {steps.length} done
        </p>
      </div>

      <ol className="mt-6 space-y-6">
        <Step n={1} state={state(0)} title="Complete your profile">
          {completion.complete ? (
            <p className="text-sm text-ink-600">Every required section is filled in.</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div
                  className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={completion.total}
                  aria-valuenow={completion.done}
                  aria-label="Profile sections complete"
                >
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                </div>
                <span className="nums shrink-0 text-sm font-medium text-ink-700">
                  {completion.done} of {completion.total}
                </span>
              </div>
              {missing.length > 0 ? (
                <p className="mt-2.5 text-pretty text-sm leading-relaxed text-ink-600">
                  Still needed: {missing.map((m) => m.label).join(" · ")}.
                </p>
              ) : null}
              {current === 0 ? (
                <Link href={continueHref} className={buttonClass({ className: "mt-4" })}>
                  {completion.done === 0 ? "Start your profile" : "Continue your profile"}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              ) : null}
            </>
          )}
        </Step>

        <Step n={2} state={state(1)} title={`Pay the one-time activation, ${formatMoney(feeMinor, "INR")}`}>
          {activated ? (
            <p className="text-sm text-ink-600">Paid. Nothing else is ever charged to you.</p>
          ) : current === 1 ? (
            payment
          ) : (
            <p className="text-sm text-ink-600">
              Opens once your profile is complete. It covers the AI interview and your Findtern Score.
            </p>
          )}
        </Step>

        <Step n={3} state={state(2)} title="Take the AI interview">
          {interviewOpen || scored ? (
            <AiInterviewAction internId={internId} initialPhase={aiPhase} initialLink={aiLink} />
          ) : (
            <p className="text-sm text-ink-600">
              It produces your Findtern Score, the number employers shortlist on.
            </p>
          )}
        </Step>
      </ol>
    </Surface>
  );
}

function Step({
  n,
  state,
  title,
  children,
}: {
  n: number;
  state: "done" | "current" | "todo";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3.5" aria-current={state === "current" ? "step" : undefined}>
      <span
        aria-hidden
        className={cn(
          "nums mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold",
          state === "done" && "bg-brand-600 text-white",
          state === "current" && "bg-accent-400 text-brand-950",
          state === "todo" && "border border-ink-200 bg-white text-ink-500",
        )}
      >
        {state === "done" ? <Check className="size-4" strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <h3
          className={cn(
            "text-base font-semibold tracking-[-0.01em]",
            state === "todo" ? "text-ink-600" : "text-ink-900",
          )}
        >
          {title}
          <span className="sr-only">
            {state === "done" ? " (done)" : state === "current" ? " (current step)" : " (not started)"}
          </span>
        </h3>
        <div className="mt-2">{children}</div>
      </div>
    </li>
  );
}
