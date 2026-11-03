import type { MoneyStuck } from "@/lib/admin/dashboard-queues.types";
import { ADMIN_SURFACE } from "@/components/admin/surface";
import { cn } from "@/lib/utils";
import { plural } from "./format";
import { TickCount } from "./tick-count";

/**
 * Money stuck on both sides of the ledger, and what came in, as three white tiles on the desk page:
 * label over a 32px figure over a caption that names its baseline and window. No icons, deltas or
 * sparklines. Two-up on a phone would cut the rupee figures, so they stack there.
 */
export function MoneyStrip({ money }: { money: MoneyStuck }) {
  const cells = [
    {
      key: "owed",
      label: "With employers",
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
    <dl className="grid grid-cols-1 gap-[var(--admin-gap)] sm:grid-cols-3">
      {cells.map((c) => (
        <div key={c.key} className={cn(ADMIN_SURFACE, "min-w-0 p-[var(--admin-pad-panel)]")}>
          <dt className="text-sm font-medium text-text-subtle">{c.label}</dt>
          <dd data-testid={c.testId} className="nums mt-2 text-[2rem] font-semibold leading-none tracking-[-0.03em] text-foreground">
            <TickCount value={c.value} kind="money" />
          </dd>
          <dd className="nums mt-2 text-sm text-text-subtle">{c.caption}</dd>
        </div>
      ))}
    </dl>
  );
}
