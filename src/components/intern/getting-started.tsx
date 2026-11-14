import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { Pill, Surface } from "@/components/app/primitives";
import { Tile } from "@/components/app/tiles";
import { AiInterviewAction } from "@/components/intern/ai-interview-join-card";
import { buttonClass } from "@/components/ui/button";
import type { AiInterviewPhase } from "@/lib/ai-interview";
import { formatMoney } from "@/lib/format";
import { gettingStartedStage, showFee } from "@/lib/intern-stage";
import type { CompletionItem } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { completionWhy } from "./completion-why";

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
  collegeName = null,
  collegeAccount = null,
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
  /** A college that has paid for a batch: its code can waive the fee (shown on top, once the profile is complete). */
  collegeName?: string | null;
  /**
   * A college account (WP4): the fee is its college's. No price anywhere, no fee tile; the Activation stop and tile say
   * who pays. `unpaid` shows the promo card in place of the payment form, `paid` says the college paid.
   */
  collegeAccount?: { name: string; state: "unpaid" | "paid" } | null;
  aside?: React.ReactNode;
}) {
  const scored = aiPhase === "scored";
  const fee = formatMoney(feeMinor, "INR");
  const stage = gettingStartedStage({ profileComplete: completion.complete, activated, scored });
  // The price stays out of sight until the profile is complete (bug sheet 12 Nov, row 17).
  const feeVisible = showFee(stage) && !collegeAccount;
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
    {
      title: "Activation",
      status: collegeAccount ? (activated ? "Paid by your college" : "Your college pays") : activated ? "Paid" : feeVisible ? `${fee}, one-time` : "After your profile",
      unlocks: "Opens the AI interview",
      fill: activated ? 1 : 0,
    },
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
      {collegeName && !collegeAccount && stage === 1 && !activated ? <CollegeCodeNotice collegeName={collegeName} /> : null}
      {/* ── The current stage, opened. ── */}
      {stage === 0 ? (
        <Tile
          title="Next step: complete your profile"
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
        // The anchor "Go to activation" lands on; the wrapper keeps the tile's grid slot and height.
        <div id="activation" className="scroll-mt-24 xl:col-span-2 [&>section]:h-full">
          <Tile
            title={collegeAccount ? "Your college has paid" : "Activate your profile"}
            description={collegeAccount ? undefined : "Your profile is complete. Activation is the only payment you make on Findtern."}
          >
            {payment}
          </Tile>
        </div>
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
        {feeVisible ? <FeeTile fee={fee} activated={activated} /> : null}
        {collegeAccount?.state === "paid" && stage >= 1 ? <CollegePaidTile name={collegeAccount.name} /> : null}
        {aside}
      </div>
      {/* ── The journey: the screen's one brand tile. ── */}
      <Surface as="section" aria-labelledby="journey-title" className="p-5 lg:p-6 xl:col-span-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="journey-title" className="text-base font-semibold text-ink-900">
            Before employers can find you
          </h2>
          <p className="nums text-sm text-text-subtle">
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
                    state === "done" && "bg-brand-700 text-white",
                    state === "current" && "bg-accent-400 text-brand-950 ring-4 ring-accent-400/25",
                    state === "todo" && "text-text-subtle ring-1 ring-inset ring-ink-300",
                  )}
                >
                  {state === "done" ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                </span>
                <div className="min-w-0 pt-1 md:pt-0">
                  <h3 className="text-sm font-semibold text-ink-900">
                    {stop.title}
                    <span className="sr-only">
                      {state === "done" ? " (done)" : state === "current" ? " (current step)" : " (not started)"}
                    </span>
                  </h3>
                  <p className={cn("nums mt-0.5 text-sm", state === "current" ? "font-medium text-ink-900" : "text-text-subtle")}>
                    {stop.status}
                  </p>
                  <p className="mt-1 text-sm text-text-subtle">{stop.unlocks}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Surface>

    </div>
  );
}

/** A connector to the next stop: across on a desktop, down on a phone. */
function Connector({ fill }: { fill: number }) {
  return (
    <span
      aria-hidden
      className="absolute top-10 bottom-1 left-4 w-0.5 -translate-x-1/2 overflow-hidden rounded-full bg-ink-200 md:top-4 md:right-0 md:bottom-auto md:left-11 md:h-0.5 md:w-auto md:-translate-x-0 md:-translate-y-1/2"
    >
      <span
        className="block size-full origin-top-left bg-brand-700 transition-transform duration-300 max-md:scale-y-(--fill) md:scale-x-(--fill)"
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
    <ul className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {items.map((item) => (
        <li
          key={item.id}
          className={cn(
            "flex min-h-12 items-start gap-3 rounded-apple-sm px-3.5 py-3 text-sm",
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
            {completionWhy(item.id).label ?? item.label}
            {item.done ? null : <span className="block text-sm text-text-subtle">{completionWhy(item.id).why}</span>}
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
    >
      <p className="nums text-3xl font-medium leading-none tracking-[-0.03em] text-ink-900">
        {fee}
        <span className="ml-1.5 text-base font-normal tracking-normal text-text-subtle">one-time</span>
      </p>
      <ul className="mt-5 space-y-3 text-sm text-ink-700">
        {[
          "Your AI interview",
          "Your Findtern Score, the same report employers read",
          "Placed within 6 months of your AI interview, or the full fee back",
        ].map((line) => (
          <li key={line} className="flex gap-3">
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
      <Link
        href="/intern/guarantee"
        className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
      >
        How the 6-month guarantee works
      </Link>
    </Tile>
  );
}

/** A college account once the college's payment is recorded: who paid, no amount. */
function CollegePaidTile({ name }: { name: string }) {
  return (
    <Tile title="Activation" aside={<Pill tone="live">Paid</Pill>}>
      <p className="flex items-start gap-3 text-sm text-ink-700">
        <Check className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
        <span>
          Paid by <span className="font-medium text-ink-900">{name}</span>. Nothing is charged to you.
        </span>
      </p>
    </Tile>
  );
}

/** After the profile is built, before the fee: the college's code can cover it. First thing on the page. */
function CollegeCodeNotice({ collegeName }: { collegeName: string }) {
  return (
    <section
      aria-label="College code"
      className="flex flex-col gap-3 rounded-apple-sm border border-brand-200 bg-brand-50 px-4 py-3.5 text-sm text-brand-950 sm:flex-row sm:items-center sm:justify-between sm:gap-4 xl:col-span-3"
    >
      <div className="min-w-0">
        <p className="font-semibold">{collegeName} is on Findtern</p>
        <p className="mt-0.5 leading-relaxed text-pretty">
          Have your placement officer&apos;s code ready: it can waive the interview fee when you activate.
        </p>
      </div>
      <a href="#activation" className={buttonClass({ variant: "primary", className: "shrink-0 max-sm:w-full" })}>
        Go to activation
        <ArrowRight className="size-4" aria-hidden />
      </a>
    </section>
  );
}
