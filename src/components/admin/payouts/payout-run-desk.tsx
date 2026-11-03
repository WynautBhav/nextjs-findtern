import { addDaysIso, formatRunDate, istDayKey, RUN_WEEKS, type PayoutRun, type RunWeek } from "@/lib/admin/payout-run";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const inr = (minor: number) => formatMoney(minor, "INR", { zeroLabel: "₹0" });
const inrShort = (minor: number) => formatMoney(minor, "INR", { short: true, zeroLabel: "₹0" });

const dayLong = (iso: string, today: string) => formatRunDate(iso, today, { weekday: true });
const dayShort = (iso: string, today: string) => formatRunDate(iso, today);
const people = (n: number) => `${n.toLocaleString("en-IN")} ${n === 1 ? "intern" : "interns"}`;

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
}

function relative(date: string, today: string): string {
  const n = daysBetween(today, date);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n > 1) return `In ${n} days`;
  return `${-n} ${n === -1 ? "day" : "days"} overdue`;
}

function weekLabel(w: RunWeek, today: string) {
  return `${dayShort(w.start, today)} to ${dayShort(w.end, today)}`;
}

/**
 * The payout run desk: when the next payout run is and how much it moves, the
 * next six weeks of payout dates, and where the money stands (billed to employers,
 * owed to interns, paid out). Every figure comes from `buildPayoutRun` over the
 * placement dues the page already loads. `run` is null when that read failed.
 */
export function PayoutRunDesk({ run, now }: { run: PayoutRun | null; now: Date }) {
  if (!run) {
    return (
      <section aria-labelledby="run-desk-title">
        <h2 id="run-desk-title" className="sr-only">Payout run</h2>
        <p role="alert" className="rounded-[var(--radius-admin-card)] bg-[color:var(--admin-panel)] p-4 text-sm text-foreground shadow-[var(--admin-shadow)]">
          Couldn&apos;t load the payout run. Nothing was changed; reload to try again. The lists below still work.
        </p>
      </section>
    );
  }
  const today = istDayKey(now);

  return (
    <section aria-labelledby="run-desk-title" className="space-y-4">
      <h2 id="run-desk-title" className="sr-only">Payout run</h2>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <Hero run={run} today={today} />
        <Flow run={run} />
      </div>
      <Timeline run={run} today={today} />
    </section>
  );
}

/* ── Hero: the next run, with paid out and still owed beside it ───────── */

function Hero({ run, today }: { run: PayoutRun; today: string }) {
  const next = run.next;
  // The next UPCOMING run (today or later); anything overdue is a separate amber line.
  const amount = next ? next.amountMinor : 0;
  const count = next ? next.count : 0;

  return (
    <article
      aria-labelledby="run-hero-title"
      className="relative flex min-w-0 flex-col justify-between gap-5 overflow-hidden rounded-[var(--radius-admin-card)] bg-[color:var(--admin-tile)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--admin-tile),white_16%)_0%,var(--admin-tile)_65%)] p-[var(--admin-pad-panel)] text-[color:var(--admin-tile-ink)] shadow-[0_14px_30px_-16px_rgb(14_96_73/0.7)]"
    >
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div className="min-w-0">
          <h3 id="run-hero-title" className="text-sm font-medium">Next payout run</h3>
          {next ? (
            <>
              <p className="nums mt-2 text-[2rem] font-semibold leading-none tracking-[-0.03em] sm:text-[2.5rem]">{dayLong(next.date, today)}</p>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold text-[color:var(--admin-tile-ink)]">
                  {relative(next.date, today)}
                </span>
              </p>
            </>
          ) : (
            <p className="mt-2 text-[1.5rem] font-semibold leading-tight">{run.overdue.count > 0 ? "Nothing upcoming" : "Nothing scheduled"}</p>
          )}
          {run.overdue.count > 0 ? (
            <p className="nums mt-2 inline-block rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">
              Overdue: {inr(run.overdue.amountMinor)} across {people(run.overdue.count)}
            </p>
          ) : null}
        </div>
        <Standing run={run} />
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wider">Due on the run</dt>
          <dd className="nums mt-1 text-[1.5rem] font-semibold leading-none tracking-[-0.02em] sm:text-[1.75rem]">{inr(amount)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wider">Interns to pay</dt>
          <dd className="nums mt-1 text-[1.5rem] font-semibold leading-none tracking-[-0.02em] sm:text-[1.75rem]">{count.toLocaleString("en-IN")}</dd>
        </div>
      </dl>
      {next ? <p className="text-xs">One stipend month per intern on that date.</p> : null}
    </article>
  );
}

/** The two ledger-side figures, side by side and never combined: they come from different sources. */
function Standing({ run }: { run: PayoutRun }) {
  return (
    <dl className="grid w-full shrink-0 grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-white/15 p-4 sm:w-auto sm:min-w-[15rem] sm:grid-cols-1">
      <div>
        <dt className="text-xs font-medium uppercase tracking-wider">Paid out (all time)</dt>
        <dd className="nums mt-1 text-[1.25rem] font-semibold leading-none tracking-[-0.02em] sm:text-[1.5rem]">{inr(run.flow.paidMinor)}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium uppercase tracking-wider">Still owed on placements</dt>
        <dd className="nums mt-1 text-[1.25rem] font-semibold leading-none tracking-[-0.02em] sm:text-[1.5rem]">{inr(run.flow.dueMinor)}</dd>
      </div>
    </dl>
  );
}

/* ── Timeline: the next six weeks of payout dates ───────────────────── */

function Timeline({ run, today }: { run: PayoutRun; today: string }) {
  const max = Math.max(run.maxWeekMinor, run.overdue.amountMinor, 1);
  const horizon = dayShort(addDaysIso(today, RUN_WEEKS * 7 - 1), today);

  return (
    <article aria-labelledby="run-timeline-title" className="min-w-0 rounded-[var(--radius-admin-card)] border border-[color:var(--admin-panel-edge)] bg-[color:var(--admin-panel)] p-[var(--admin-pad-panel)] shadow-[var(--admin-shadow)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 id="run-timeline-title" className="text-base font-semibold text-foreground">Payout dates, next six weeks</h3>
        <p className="text-xs text-text-subtle">Today to {horizon}</p>
      </div>
      <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">
        {run.overdue.count > 0 ? (
          <Slot
            label="Overdue"
            sub={`${run.overdue.days} ${run.overdue.days === 1 ? "date" : "dates"} passed`}
            amountMinor={run.overdue.amountMinor}
            count={run.overdue.count}
            max={max}
            tone="late"
          />
        ) : null}
        {run.weeks.map((w, i) => (
          <Slot key={w.start} label={i === 0 ? "This week" : weekLabel(w, today)} sub={i === 0 ? weekLabel(w, today) : undefined} amountMinor={w.amountMinor} count={w.count} max={max} tone="ok" />
        ))}
      </ol>
      {run.later.count > 0 ? (
        <p className="nums mt-3 text-xs text-text-subtle">
          Later: {inr(run.later.amountMinor)} for {people(run.later.count)}, after {horizon}.
        </p>
      ) : null}
    </article>
  );
}

function Slot({ label, sub, amountMinor, count, max, tone }: { label: string; sub?: string; amountMinor: number; count: number; max: number; tone: "ok" | "late" }) {
  const empty = count === 0;
  return (
    <li
      className={cn(
        "min-w-0 rounded-2xl px-3 py-2.5",
        tone === "late" ? "bg-warning-soft" : "bg-[color:var(--admin-panel-2)]",
        tone === "late" && "col-span-2 sm:col-span-4 lg:col-span-1",
      )}
    >
      <p className={cn("truncate text-xs font-semibold", tone === "late" ? "text-warning" : "text-text-subtle")}>{label}</p>
      {sub ? <p className="nums truncate text-xs text-text-subtle">{sub}</p> : null}
      <p className="nums mt-1.5 text-base font-semibold leading-none text-foreground" title={empty ? undefined : inr(amountMinor)}>
        {empty ? <span className="text-text-subtle">–<span className="sr-only"> nothing due</span></span> : inrShort(amountMinor)}
      </p>
      <p className="nums mt-1 text-xs text-text-subtle">{empty ? "\u00a0" : people(count)}</p>
      <span aria-hidden className="mt-2 block h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
        <span
          className={cn("payout-bar block h-full origin-left rounded-full", tone === "late" ? "bg-warning" : "bg-[color:var(--admin-tile)]")}
          style={{ transform: `scaleX(${empty ? 0 : Math.max(amountMinor / max, 0.04)})` }}
        />
      </span>
    </li>
  );
}

/* ── Where the money stands: three separate figures, not a sum ───────── */

function Flow({ run }: { run: PayoutRun }) {
  const steps = [
    { key: "billed", label: "Billed to employers", value: run.flow.receivedMinor, hint: "Employer months covered, at offer price. Not bank cash" },
    { key: "due", label: "Owed to interns", value: run.flow.dueMinor, hint: "Stipend months not yet paid", warn: run.flow.dueMinor > 0 },
    { key: "out", label: "Paid to interns", value: run.flow.paidMinor, hint: "All payouts marked paid, as in the ledger below", done: true },
  ];
  return (
    <article aria-labelledby="run-flow-title" className="flex min-w-0 flex-col rounded-[var(--radius-admin-card)] border border-[color:var(--admin-panel-edge)] bg-[color:var(--admin-panel)] p-[var(--admin-pad-panel)] shadow-[var(--admin-shadow)]">
      <h3 id="run-flow-title" className="text-base font-semibold text-foreground">Where the money stands</h3>
      <ul className="mt-3 flex flex-1 flex-col justify-between gap-2">
        {steps.map((s) => (
          <FlowStep key={s.key} step={s} />
        ))}
      </ul>
    </article>
  );
}

function FlowStep({ step }: { step: { key: string; label: string; value: number; hint: string; warn?: boolean; done?: boolean } }) {
  return (
    <li className={cn("flex min-w-0 items-center justify-between gap-3 rounded-2xl px-4 py-3", step.done ? "bg-[color:var(--admin-bar-tint)]" : "bg-[color:var(--admin-panel-2)]", step.warn && "ring-2 ring-accent-500/70")}>
      <div className="min-w-0">
        <p className={cn("text-xs font-semibold uppercase tracking-wider", step.done ? "text-brand-900" : "text-text-subtle")}>{step.label}</p>
        <p className={cn("mt-1 text-xs leading-4", step.done ? "text-brand-900" : "text-text-subtle")}>{step.hint}</p>
      </div>
      <p className="nums shrink-0 text-xl font-semibold leading-none tracking-[-0.02em] text-foreground sm:text-[1.5rem]">{inr(step.value)}</p>
    </li>
  );
}
