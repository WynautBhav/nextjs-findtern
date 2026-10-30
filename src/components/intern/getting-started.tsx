import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { Tile } from "@/components/app/tiles";
import { AiInterviewAction } from "@/components/intern/ai-interview-join-card";
import { buttonClass } from "@/components/ui/button";
import type { AiInterviewPhase } from "@/lib/ai-interview";
import { formatMoney } from "@/lib/format";
import type { CompletionItem } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

type Completion = { items: CompletionItem[]; done: number; total: number; complete: boolean };
type StopState = "done" | "current" | "todo";

/**
 * Home before the profile is live: the bento for a new candidate.
 *
 * Profile, then the one-time activation, then the AI interview, in the order
 * the product requires (bug sheet 7, S1 r28). The dark tile is the journey
 * across all four stops, its connectors filled from real progress; the stage
 * the candidate is on opens below it, and the fee sits beside it with what it
 * covers and the guarantee (PRODUCT.md: the guarantee goes wherever the fee
 * does). `aside` is the page's own glanceable tiles, stacked under the fee.
 */
export function GettingStarted({
  completion,
  activated,
  feeMinor,
  payment,
  internId,
  aiPhase,
  aiLink,
  hidden = false,
  aside,
}: {
  completion: Completion;
  activated: boolean;
  feeMinor: number;
  /** The activation form, rendered while activation is the current stage. */
  payment: React.ReactNode;
  internId: string;
  aiPhase: AiInterviewPhase;
  aiLink: string | null;
  /** Open to work is off: the profile stays hidden even once it is live. */
  hidden?: boolean;
  aside?: React.ReactNode;
}) {
  const scored = aiPhase === "scored";
  const fee = formatMoney(feeMinor, "INR");
  // A candidate who has paid can always take the interview. Profile rules
  // tightened after some candidates paid (Aadhaar, PAN image, emergency
  // contact); they still owe those fields, but that must never hide the
  // interview they already paid for.
  const stage: 0 | 1 | 2 = activated && !scored ? 2 : !completion.complete ? 0 : !activated ? 1 : 2;
  const done = [completion.complete, activated, scored];
  const doneCount = done.filter(Boolean).length;
  const stateOf = (i: number): StopState => (i === stage ? "current" : done[i] ? "done" : "todo");

  const interviewStatus: Record<AiInterviewPhase, string> = {
    apply: "Ready to request",
    waiting: "Link on its way",
    ready: "Ready to start",
    completed: "Score being prepared",
    scored: "Scored",
  };
  const stops = [
    {
      title: "Profile",
      status: completion.complete ? "Complete" : `${completion.done} of ${completion.total} sections`,
      unlocks: "Opens activation",
      // The profile connector fills section by section, so progress shows before the stage is done.
      fill: completion.done / Math.max(1, completion.total),
    },
    { title: "Activation", status: activated ? "Paid" : `${fee}, one-time`, unlocks: "Opens the AI interview", fill: activated ? 1 : 0 },
    {
      title: "AI interview",
      status: activated || scored ? interviewStatus[aiPhase] : "After activation",
      unlocks: "Gives you a Findtern Score out of 10",
      fill: scored ? 1 : 0,
    },
    { title: "Visible to employers", status: hidden ? "Hidden by you" : "Not yet", unlocks: "Companies shortlist on your score", fill: 0 },
  ];

  const missing = completion.items.filter((i) => !i.done);
  const continueHref = missing[0]?.href ?? "/intern/onboarding";

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {/* ── The journey: the screen's one brand tile. ── */}
      <section
        aria-labelledby="journey-title"
        className="relative isolate overflow-hidden rounded-apple-xl bg-[linear-gradient(140deg,var(--color-brand-700)_0%,var(--color-brand-900)_60%,var(--color-brand-950)_100%)] p-5 text-white shadow-tile-brand motion-safe:animate-tile-in lg:p-6 xl:col-span-3" // taste-skill-ignore
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="journey-title" className="text-base font-medium">
            Before employers can find you
          </h2>
          <p className="nums text-sm text-white/80">
            {doneCount} of 3 steps done
          </p>
        </div>

        <ol className="mt-6 grid gap-0 md:grid-cols-4 md:gap-4">
          {stops.map((stop, i) => {
            const state = i === 3 ? "todo" : stateOf(i);
            return (
              <li
                key={stop.title}
                aria-current={state === "current" ? "step" : undefined}
                className="relative flex gap-3 pb-6 last:pb-0 md:flex-col md:pb-0"
              >
                {i < stops.length - 1 ? <Connector fill={stop.fill} /> : null}
                <span
                  aria-hidden
                  className={cn(
                    "nums relative grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold",
                    state === "done" && "bg-brand-300 text-brand-950",
                    state === "current" && "bg-accent-400 text-brand-950 ring-4 ring-accent-400/25",
                    state === "todo" && "text-white/80 ring-1 ring-inset ring-white/35",
                  )}
                >
                  {state === "done" ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                </span>
                <div className="min-w-0 pt-1 md:pt-0">
                  <h3 className="text-sm font-semibold">
                    {stop.title}
                    <span className="sr-only">
                      {state === "done" ? " (done)" : state === "current" ? " (current step)" : " (not started)"}
                    </span>
                  </h3>
                  <p className={cn("nums mt-0.5 text-sm", state === "current" ? "text-accent-300" : "text-white/80")}>
                    {stop.status}
                  </p>
                  <p className="mt-1 text-xs text-white/80">{stop.unlocks}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ── The current stage, opened. ── */}
      {stage === 0 ? (
        <Tile
          title="Complete your profile"
          description="Free to build. Employers see it only once your score is in."
          aside={
            <p className="nums whitespace-nowrap text-sm font-medium text-ink-700">
              {completion.done} of {completion.total}
            </p>
          }
          className="xl:col-span-2"
        >
          <Meter done={completion.done} total={completion.total} />
          <Checklist items={completion.items} className="mt-6" />
          <div className="mt-auto pt-6">
            <Link href={continueHref} className={buttonClass({ className: "max-sm:w-full" })}>
              {completion.done === 0 ? "Start your profile" : "Continue your profile"}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </Tile>
      ) : stage === 1 ? (
        <Tile
          title="Activate your profile"
          description="Your profile is complete. Activation is the only payment you make on Findtern."
          className="xl:col-span-2"
        >
          {payment}
        </Tile>
      ) : (
        <Tile title="Take the AI interview" description="It produces your Findtern Score, the number employers shortlist on." className="xl:col-span-2">
          <AiInterviewAction internId={internId} initialPhase={aiPhase} initialLink={aiLink} />
          {missing.length > 0 ? (
            <div className="mt-6 border-t border-ink-100 pt-5">
              <p className="text-sm font-medium text-ink-900">Your profile still needs</p>
              <Checklist items={missing} className="mt-3" />
              <Link href={continueHref} className={buttonClass({ variant: "outline", className: "mt-4 max-sm:w-full" })}>
                Finish your profile
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          ) : null}
        </Tile>
      )}

      <div className="grid min-w-0 content-start gap-4 md:grid-cols-2 md:[&>:last-child:nth-child(odd)]:col-span-2 xl:grid-cols-1 xl:[&>:last-child:nth-child(odd)]:col-span-1">
        <FeeTile fee={fee} activated={activated} />
        {aside}
      </div>
    </div>
  );
}

/** A connector to the next stop: across on a desktop, down on a phone. */
function Connector({ fill }: { fill: number }) {
  return (
    <span
      aria-hidden
      className="absolute top-10 bottom-1 left-4 w-0.5 -translate-x-1/2 overflow-hidden rounded-full bg-white/15 md:top-4 md:right-0 md:bottom-auto md:left-11 md:h-0.5 md:w-auto md:-translate-x-0 md:-translate-y-1/2"
    >
      <span
        className="block size-full origin-top-left bg-brand-300 transition-transform duration-500 max-md:scale-y-(--fill) md:scale-x-(--fill)"
        style={{ "--fill": Math.max(0, Math.min(1, fill)) } as React.CSSProperties}
      />
    </span>
  );
}

/** One segment per required section: the profile's progress at a glance. */
function Meter({ done, total }: { done: number; total: number }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-label="Profile sections complete"
      className="flex gap-1"
    >
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn("h-2 flex-1 rounded-full", i < done ? "bg-brand-700" : "bg-ink-100")} />
      ))}
    </div>
  );
}

/**
 * The required sections as a scannable checklist. Plain items, not links: the
 * onboarding form has no per-step address yet and resumes at the first open
 * step, so the one button below the list is the way in.
 */
function Checklist({ items, className }: { items: CompletionItem[]; className?: string }) {
  return (
    <ul className={cn("grid gap-2.5 sm:grid-cols-2", className)}>
      {items.map((item) => (
        <li
          key={item.id}
          className={cn(
            "flex min-h-12 items-center gap-2.5 rounded-apple-md px-3.5 py-2 text-sm",
            item.done ? "bg-brand-50 text-ink-700" : "bg-ink-50 text-ink-900",
          )}
        >
          {item.done ? (
            <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-700 text-white">
              <Check className="size-3" strokeWidth={3} />
            </span>
          ) : (
            <span aria-hidden className="size-5 shrink-0 rounded-full border-2 border-ink-300" />
          )}
          <span className="min-w-0">
            {item.label}
            <span className="sr-only">{item.done ? " (done)" : " (still needed)"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The fee, what it covers and the guarantee, in one place (PRODUCT.md commercial spine). */
function FeeTile({ fee, activated }: { fee: string; activated: boolean }) {
  return (
    <Tile
      title="Activation"
      aside={activated ? <Pill tone="live">Paid</Pill> : null}
      action={{ href: "/guaranteed-internship-program", label: "How the 18-month guarantee works" }}
    >
      <p className="nums text-3xl font-medium leading-none tracking-[-0.03em] text-ink-900">
        {fee}
        <span className="ml-1.5 text-base font-normal tracking-normal text-text-subtle">one-time</span>
      </p>
      <ul className="mt-5 space-y-3 text-sm text-ink-700">
        {[
          "Your AI interview",
          "Your Findtern Score, the same report employers read",
          "Placed within 18 months of your score, or the full fee back",
        ].map((line) => (
          <li key={line} className="flex gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
            {line}
          </li>
        ))}
      </ul>
      <p className="mt-5 border-t border-ink-100 pt-4 text-xs text-text-subtle">
        {activated
          ? "Paid. Nothing else is ever charged to you."
          : "No subscription. The fee pays for the assessment; it never buys a higher score."}
      </p>
    </Tile>
  );
}
