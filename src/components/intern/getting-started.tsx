import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { Surface } from "@/components/app/primitives";
import { formatMoney } from "@/lib/format";
import type { CompletionItem } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

/**
 * The first thing a new candidate sees on Home: three steps, in the order the
 * product requires them (PRODUCT.md, "Payment → profile live → AI interview").
 *
 * Only the current step carries an action. Done steps collapse to a line, and
 * later steps say what they are without offering a button that would fail -
 * the payment slot (the existing ActivationCard) is passed in by the page and
 * shown only on the step it belongs to.
 */
export function GettingStarted({
  completion,
  activated,
  scored,
  feeMinor,
  action,
}: {
  completion: { items: CompletionItem[]; done: number; total: number; complete: boolean };
  activated: boolean;
  scored: boolean;
  feeMinor: number;
  /** Rendered under the current step when that step is payment or the interview. */
  action: React.ReactNode;
}) {
  const steps = [
    { id: "profile", done: completion.complete },
    { id: "payment", done: activated },
    { id: "interview", done: scored },
  ] as const;
  const current = steps.findIndex((s) => !s.done);
  // A candidate who has paid can always request the interview. Profile rules
  // tightened after some candidates paid (Aadhaar, PAN image, emergency
  // contact); they still owe those fields, but that must never hide the
  // interview they already paid for.
  const interviewOpen = activated && !scored;
  const doneCount = steps.filter((s) => s.done).length;
  const missing = completion.items.filter((i) => !i.done);
  // The button goes where the first missing item is filled in.
  const continueHref = missing[0]?.href ?? "/intern/onboarding";
  const pct = completion.total ? Math.round((completion.done / completion.total) * 100) : 0;

  return (
    <Surface as="section" aria-labelledby="getting-started" className="p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="getting-started" className="text-base font-semibold tracking-[-0.01em] text-ink-900">
          Before employers can find you
        </h2>
        <p className="text-sm font-medium tabular-nums text-ink-600">
          {doneCount} of {steps.length} done
        </p>
      </div>

      <ol className="mt-5 space-y-5">
        <Step n={1} state={state(0)} title="Complete your profile">
          {completion.complete ? (
            <p className="text-sm text-ink-600">Every required section is filled in.</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={completion.total}
                  aria-valuenow={completion.done}
                  aria-label="Profile sections complete"
                >
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                </div>
                <span className="shrink-0 text-xs font-medium tabular-nums text-ink-600">
                  {completion.done} of {completion.total} sections
                </span>
              </div>
              {missing.length > 0 ? (
                <p className="mt-2 text-pretty text-sm text-ink-600">
                  Still needed: {missing.map((m) => m.label).join(" · ")}.
                </p>
              ) : null}
              {current === 0 ? (
                <Link
                  href={continueHref}
                  className="apple-spring apple-pressable mt-4 inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-primary px-5 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover"
                >
                  {completion.done === 0
                    ? "Start your profile"
                    : missing[0]?.id === "bank"
                      ? "Add bank details"
                      : "Continue your profile"}
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
            <div className="mt-1">{action}</div>
          ) : (
            <p className="text-sm text-ink-600">
              Opens once your profile is complete. It covers the AI interview and your Findtern Score.
            </p>
          )}
        </Step>

        <Step n={3} state={state(2)} title="Take the AI interview">
          {scored ? (
            <p className="text-sm text-ink-600">Done. Your Findtern Score is on your record.</p>
          ) : interviewOpen ? (
            <div className="mt-1">{action}</div>
          ) : (
            <p className="text-sm text-ink-600">
              It produces your Findtern Score, the number employers shortlist on.
            </p>
          )}
        </Step>
      </ol>
    </Surface>
  );

  function state(i: number): "done" | "current" | "todo" {
    if (steps[i].done) return "done";
    if (i === 2 && interviewOpen) return "current";
    return i === current ? "current" : "todo";
  }
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
    <li className="flex gap-3" aria-current={state === "current" ? "step" : undefined}>
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold",
          state === "done" && "bg-brand-600 text-white",
          state === "current" && "border-2 border-brand-600 text-brand-700",
          state === "todo" && "border-2 border-ink-200 text-ink-600",
        )}
      >
        {state === "done" ? <Check className="size-3.5" strokeWidth={3.5} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <h3
          className={cn(
            "text-[15px] font-semibold tracking-[-0.01em]",
            state === "todo" ? "text-ink-600" : "text-ink-900",
          )}
        >
          {title}
          <span className="sr-only">
            {state === "done" ? " (done)" : state === "current" ? " (current step)" : " (not started)"}
          </span>
        </h3>
        <div className="mt-1.5">{children}</div>
      </div>
    </li>
  );
}
