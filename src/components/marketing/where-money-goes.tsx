import { formatMoney, formatRate } from "@/lib/format";
import type { CmsPlan } from "@/lib/content/types";

/**
 * Where the money goes.
 *
 * Every plan has exactly two numbers. The section before this one tried to
 * compare them with an agency fee and an in-house estimate, and the three
 * figures measured different things. This answers the question the rate
 * card actually raises: what does the per-hire charge pay for, and what does
 * the hourly rate pay for. Two columns, one amount each, plain lists with
 * hairline rules. Everything here is a published product term.
 */
export function WhereMoneyGoes({ plans, isIndia }: { plans: CmsPlan[]; isIndia: boolean }) {
  const currency = isIndia ? "INR" : "USD";
  const perHire = plans[0]?.perHireChargeMinor ?? 0;
  const hourly = plans.map((p) => p.priceHourlyMinor);
  const low = Math.min(...hourly);
  const high = Math.max(...hourly);

  return (
    <>
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-balance text-3xl font-semibold tracking-[-0.025em] text-white sm:text-4xl">
          Where the money goes
        </h2>
        <p className="mt-4 text-lg text-on-dark-subtle">
          Two numbers on every plan. This is what each one pays for.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-4xl gap-12 md:grid-cols-2 md:gap-0 md:divide-x md:divide-white/10">
        <Column
          title="The per-hire charge"
          amount={formatMoney(perHire, currency)}
          when="once, when you hire"
          items={[
            "Academic records and identity, verified before you see the profile",
            "A structured AI interview and an aptitude test; a coding test on technical tracks",
            "The Findtern Score and the skill report behind it",
            "The proposal, the contract and the engagement, managed end to end",
          ]}
          className="md:pr-12"
        />
        <Column
          title="The hourly rate"
          amount={`${formatRate(low, currency)} to ${formatRate(high, currency)}`}
          when="billed monthly, on approved hours"
          items={[
            "Goes to the intern as their stipend, paid out by Findtern",
            "Counts only the timesheet hours you approve each week",
            "Set by the score band, the same for every employer",
            "Ends with the engagement. The timesheet is the contract",
          ]}
          className="md:pl-12"
        />
      </div>

      <p className="mx-auto mt-10 max-w-4xl text-sm leading-relaxed text-on-dark-subtle">
        No other charges. {isIndia ? "Prices include GST. " : ""}If you later take an intern on
        full time, 8.33% of CTC applies at that point, not before.
      </p>
    </>
  );
}

function Column({
  title,
  amount,
  when,
  items,
  className,
}: {
  title: string;
  amount: string;
  when: string;
  items: string[];
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-sm text-on-dark-subtle">{title}</p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {/* One line in both columns, so the two lists start on the same row. */}
        <span className="whitespace-nowrap text-3xl font-semibold tabular-nums tracking-[-0.03em] text-white lg:text-4xl">{amount}</span>
        <span className="text-base text-on-dark-subtle">{when}</span>
      </p>
      <ul className="mt-7 divide-y divide-white/10 border-y border-white/10 text-[15px] leading-relaxed text-ink-200">
        {items.map((item) => (
          <li key={item} className="py-3.5">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
