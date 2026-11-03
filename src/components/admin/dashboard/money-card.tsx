import Link from "next/link";

import { TickCount } from "@/components/admin/triage/tick-count";
import { plural } from "@/components/admin/triage/format";
import type { MoneyStuck } from "@/lib/admin/dashboard-queues.types";

/**
 * The one dark feature card: money stuck on both sides and what came in. It is `--admin-deep` with
 * `--admin-deep-ink` text in both themes, no gradient. `payoutsHref` is null when this admin may not
 * open payouts, and then the button is not drawn.
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
      className="flex h-full flex-col rounded-[var(--radius-admin-card)] bg-[color:var(--admin-deep)] p-[var(--admin-pad-panel)] text-[color:var(--admin-deep-ink)]"
    >
      <h2 id="money-title" className="text-lg font-semibold leading-snug tracking-[-0.01em]">
        Money
      </h2>
      <dl className="mt-4 space-y-4">
        {lines.map((l) => (
          <div key={l.key}>
            <dt className="text-sm font-medium">{l.label}</dt>
            <dd data-testid={l.testId} className="nums mt-0.5 text-[2rem] font-semibold leading-none tracking-[-0.03em]">
              <TickCount value={l.value} kind="money" />
            </dd>
            <dd className="nums mt-1 text-sm">{l.caption}</dd>
          </div>
        ))}
      </dl>
      {payoutsHref ? (
        <Link
          href={payoutsHref}
          className="mt-6 inline-flex h-11 w-fit items-center justify-center rounded-full bg-[color:var(--admin-deep-ink)] px-5 text-base font-medium text-[color:var(--admin-deep)] outline-none transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--admin-deep-ink)] max-sm:w-full"
        >
          Open payouts
        </Link>
      ) : null}
    </section>
  );
}
