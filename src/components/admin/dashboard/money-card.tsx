import Link from "next/link";

import { TickCount } from "@/components/admin/triage/tick-count";
import { cn } from "@/lib/utils";
import { plural } from "@/components/admin/triage/format";
import type { MoneyStuck } from "@/lib/admin/dashboard-queues.types";

/**
 * Money stuck on both sides and what came in: a white card with three figures (the hero tile is the
 * page's one filled card). `payoutsHref` is null when this admin may not open payouts, and then the
 * button is not drawn.
 */
export function MoneyCard({ money, payoutsHref }: { money: MoneyStuck; payoutsHref: string | null }) {
  const lines = [
    {
      key: "owed",
      label: "Owed by employers",
      value: money.owedByEmployersMinor,
      caption: `${money.employerOfferCount} accepted ${plural(money.employerOfferCount, "offer", "offers")}, unpaid`,
    },
    {
      key: "due",
      label: "Due to interns",
      value: money.dueToInternsMinor,
      caption: `${money.payoutCount} ${plural(money.payoutCount, "payout", "payouts")}, due now or within 3 days`,
    },
    {
      key: "collected",
      label: "Collected",
      value: money.collectedWeekMinor,
      caption: "last 7 days, India time",
      testId: "collected-week",
    },
  ];
  return (
    <section
      aria-labelledby="money-title"
      className="h-full rounded-[var(--radius-admin-card)] border border-[color:var(--admin-panel-edge)] bg-[color:var(--admin-panel)] p-[var(--admin-pad-panel)] shadow-[var(--admin-shadow)] xl:flex xl:flex-col"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="money-title" className="text-xl font-semibold leading-snug tracking-[-0.01em] text-foreground">
          Money
        </h2>
        {payoutsHref ? (
          <Link
            href={payoutsHref}
            className="inline-flex min-h-9 items-center justify-center rounded-full border border-ink-300 px-4 text-sm font-medium text-foreground outline-none transition-colors hover:border-ink-400 hover:bg-[color:var(--admin-panel-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Open payouts
          </Link>
        ) : null}
      </div>
      <dl className="mt-3 grid grid-cols-1 divide-y divide-[color:var(--admin-rule)] sm:grid-cols-3 sm:divide-x sm:divide-y-0 xl:my-auto">
        {lines.map((l) => (
          <div key={l.key} className="py-2 first:pt-0 last:pb-0 sm:px-4 sm:py-0 sm:first:pl-0 sm:last:pr-0">
            <dt className="text-sm font-medium text-text-subtle">{l.label}</dt>
            <dd data-testid={l.testId} className={cn("nums mt-0.5 text-[1.5rem] font-semibold leading-tight tracking-[-0.03em] sm:text-[1.75rem]", l.key === "owed" ? "text-brand-700" : "text-foreground")}>
              <TickCount value={l.value} kind="money" />
            </dd>
            <dd className="nums mt-0.5 text-xs leading-4 text-text-subtle">{l.caption}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
