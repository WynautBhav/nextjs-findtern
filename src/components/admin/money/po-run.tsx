import Link from "next/link";

import { RollingNumber } from "@/components/app/rolling-number";
import { LeadStat, Section } from "@/components/app/stat";
import { formatRunDate, istDayKey, type PayoutRun } from "@/lib/admin/payout-run";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Ledger, Money } from "./ledger";
import { leadOf, relative, scheduleRows, type ScheduleRow } from "./po-model";
import { PoFigures } from "./po-figures";

const inr = (minor: number) => formatMoney(minor, "INR", { zeroLabel: "₹0" });
const day = (iso: string, today: string) => formatRunDate(iso, today, { weekday: true }).replace(",", "");
const people = (n: number) => `${n.toLocaleString("en-IN")} ${n === 1 ? "intern" : "interns"}`;
/** The lead figure: digits roll in for whole rupees (RollingNumber rounds); paise stay exact through Money. */
const rupee = (minor: number) => (minor % 100 === 0 ? <RollingNumber value={minor / 100} currency="INR" /> : <Money minor={minor} />);

/**
 * The top of /admin/payouts: one statement (what goes out next, or what is already late), the three
 * separate money figures, and the next six weeks as a ruled schedule. Everything is read from `buildPayoutRun`
 * over the placement dues the page already loads; `run` is null when that read failed.
 */
export function PayoutRunLedger({ run, now, bonusPaidMinor, dueHref }: { run: PayoutRun | null; now: Date; bonusPaidMinor: number; dueHref: string }) {
  if (!run) {
    return (
      <section aria-labelledby="run-title">
        <h2 id="run-title" className="sr-only">Payout run</h2>
        <p role="alert" className="border-y border-ink-200 py-3 text-sm text-ink-900">
          Couldn&apos;t load the payout run. Nothing was changed; reload to try again. The lists below still work.
        </p>
      </section>
    );
  }
  const today = istDayKey(now);
  const lead = leadOf(run);

  return (
    <section aria-labelledby="run-title" className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
      <h2 id="run-title" className="sr-only">Payout run</h2>
      <div className="lg:col-start-1 lg:row-start-1">
        <Lead run={run} today={today} />
      </div>
      <div className="lg:col-start-1 lg:row-start-2">
        <div className="border-b-2 border-ink-800 pb-2">
          <h3 className="text-lg font-semibold text-ink-900">Where the money stands</h3>
          <p className="mt-0.5 text-sm text-ink-600">Three figures over different payouts. They do not add up to each other.</p>
        </div>
        <PoFigures
          className="border-t-0"
          items={[
            { label: "Billed to employers", hint: "Employer months covered on hired placements, at offer price. Not bank cash.", value: <Money minor={run.flow.receivedMinor} /> },
            {
              label: "Owed to interns",
              hint: "Stipend months not yet paid on hired placements, including months whose payout is already waiting. A payout not tied to a placement is not counted.",
              value: <Money minor={run.flow.dueMinor} />,
              tone: run.flow.dueMinor > 0 ? "signal" : "ink",
            },
            {
              label: "Paid to interns",
              hint: `Stipend payouts marked paid in the ledger below${bonusPaidMinor > 0 ? `. Completion bonuses (${inr(bonusPaidMinor)}) are counted apart` : ""}.`,
              value: <Money minor={run.flow.paidMinor} />,
            },
          ]}
        />
      </div>
      <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <Schedule run={run} today={today} dueHref={dueHref} hasLead={lead.kind !== "none"} />
      </div>
    </section>
  );
}

/** The statement. Overdue leads in signal colour; the next run is the second line. Otherwise the next run leads. */
function Lead({ run, today }: { run: PayoutRun; today: string }) {
  const lead = leadOf(run);
  if (lead.kind === "overdue") {
    const next = lead.next;
    return (
      <LeadStat
        label="Overdue: past the payout date"
        value={rupee(lead.amountMinor)}
        tone="signal"
        note={
          <>
            {lead.count === 1 ? `1 intern, ${relative(lead.oldestDate, today).toLowerCase()}` : `${people(lead.count)}, the oldest ${relative(lead.oldestDate, today).toLowerCase()}`}. One stipend month each, the oldest unpaid.{" "}
            {next ? (
              <>
                Separate from the next run, {day(next.date, today)} ({relative(next.date, today).toLowerCase()}): {inr(next.amountMinor)} for {people(next.count)}.
              </>
            ) : (
              "Nothing else is scheduled."
            )}
          </>
        }
      />
    );
  }
  if (lead.kind === "next") {
    return (
      <LeadStat
        label="Due on the next payout run"
        value={rupee(lead.amountMinor)}
        note={
          <>
            <span className="block font-display text-lg font-semibold text-ink-900">
              {day(lead.date, today)}, {relative(lead.date, today).toLowerCase()}
            </span>
            {people(lead.count)}, one stipend month each. Nothing is overdue.
          </>
        }
      />
    );
  }
  return <LeadStat label="Next payout run" value="None" tone="brand" note="No stipend month is scheduled. Dates appear here once an employer pays for a hire." />;
}

function Schedule({ run, today, dueHref, hasLead }: { run: PayoutRun; today: string; dueHref: string; hasLead: boolean }) {
  const { rows, maxMinor, horizon } = scheduleRows(run, today);
  const anything = rows.some((r) => r.count > 0);
  return (
    <Section
      title="Next six weeks"
      hint={maxMinor > 0 ? `Each placement shows its next unpaid stipend month only, so these rows add up to less than what is owed. Bars are against the busiest week, ${inr(maxMinor)}.` : `Payout dates from today to ${horizon}.`}
      action={
        <Link href={dueHref} className="font-semibold text-brand-800 underline decoration-brand-300 decoration-2 underline-offset-4 hover:decoration-brand-700">
          Dues by placement
        </Link>
      }
    >
      {!anything ? (
        <p className="py-3 text-sm text-ink-700">
          {hasLead ? "No payout date falls in the next six weeks." : "No payout dates yet."} They appear when an employer pays for a hire; <Link href={dueHref} className="font-medium text-ink-900 underline underline-offset-4">Dues by placement</Link> shows who is owed.
        </p>
      ) : (
        <>
        <ul aria-label="Payout dates in the next six weeks" className="border-t-2 border-ink-800 md:hidden">
          {rows.map((r) => (
            <li key={r.key} className="border-b border-ink-200 py-3">
              <div className="flex items-baseline justify-between gap-4">
                <span className={cn("min-w-0 font-medium text-ink-900", r.kind === "overdue" && "text-signal")}>
                  {r.label}
                  {r.sub ? <span className="nums block text-sm font-normal text-ink-600">{r.sub}</span> : null}
                </span>
                {r.count > 0 ? <Money minor={r.amountMinor} className="font-semibold" signal={r.kind === "overdue"} /> : <span className="text-sm text-ink-600">none</span>}
              </div>
              {r.count > 0 ? (
                <div className="mt-2 flex items-center gap-3 text-sm text-ink-700">
                  <span className="min-w-0 flex-1">
                    <Bar row={r} />
                  </span>
                  <span className="nums shrink-0">{people(r.count)}</span>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="max-md:hidden">
        <Ledger<ScheduleRow>
          caption="Payout dates in the next six weeks, with Overdue and Later as their own rows"
          rows={rows}
          rowKey={(r) => r.key}
          columns={[
            {
              key: "week",
              header: "Week",
              primary: true,
              cell: (r) => (
                <span className={cn(r.kind === "overdue" && "font-semibold text-signal")}>
                  {r.label}
                  {r.sub ? <span className="nums block text-sm font-normal text-ink-600">{r.sub}</span> : null}
                </span>
              ),
              className: "w-[28%]",
            },
            {
              key: "bar",
              header: maxMinor > 0 ? `Against busiest week` : "Bar",
              cell: (r) => <Bar row={r} />,
              className: "w-[34%] min-w-[9rem]",
            },
            { key: "who", header: "Interns", align: "right", cell: (r) => (r.count > 0 ? r.count.toLocaleString("en-IN") : <span className="text-ink-600">–<span className="sr-only"> none</span></span>) },
            {
              key: "amt",
              header: "Amount",
              align: "right",
              cell: (r) => (r.count > 0 ? <Money minor={r.amountMinor} className="font-semibold" signal={r.kind === "overdue"} /> : <span className="text-ink-600">–<span className="sr-only"> nothing due</span></span>),
            },
          ]}
        />
        </div>
        </>
      )}
    </Section>
  );
}

/** A bar at its true share of the busiest week; a week with nothing due says "none", an aggregate row says what it spans. */
function Bar({ row }: { row: ScheduleRow }) {
  if (row.share === null) return <span className="text-sm text-ink-600">{row.note}</span>;
  if (row.count === 0) return <span className="text-sm text-ink-600">none</span>;
  return (
    <span className="block h-2.5 w-full rounded-sm bg-ink-100" role="img" aria-label={`${Math.round(row.share * 100)} percent of the busiest week`}>
      <span className="block h-full rounded-sm bg-brand-700" style={{ width: `${Math.max(row.share * 100, 1.5)}%` }} />
    </span>
  );
}
