import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Figures, the way a ledger reads them: ONE lead figure at display size, and the rest as a quiet
 * ruled list beside or beneath it. Never a row of equal tiles.
 *
 *   <LeadStat label="Waiting on you" value={<RollingNumber value={45} />} note="oldest is 30 days old" action={{label:"Work the queue", href}} />
 *   <StatList items={[{label:"Candidates", value:"0"}, ...]} />
 *   <Overview lead={<LeadStat .../>} rest={<StatList .../>} />
 */

export function LeadStat({
  label,
  value,
  note,
  action,
  tone = "ink",
  className,
}: {
  label: string;
  value: React.ReactNode;
  /** One sentence that says what the number means or what to do about it. */
  note?: React.ReactNode;
  action?: { label: string; href: string };
  /** `signal` for money owed or something overdue; `brand` for good news. */
  tone?: "ink" | "brand" | "signal";
  className?: string;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <p className="text-sm font-medium text-ink-600">{label}</p>
      <p className={cn("nums mt-1 font-display text-[2.75rem] font-semibold leading-none tracking-[-0.03em]", tone === "brand" ? "text-brand-700" : tone === "signal" ? "text-signal" : "text-ink-900")}>{value}</p>
      {note ? <p className="mt-3 max-w-sm text-pretty text-sm text-ink-700">{note}</p> : null}
      {action ? (
        <Link href={action.href} className="group mt-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-brand-800 underline decoration-brand-300 decoration-2 underline-offset-4 hover:decoration-brand-700">
          {action.label}
          <ArrowRight className="size-4 transition-transform duration-[var(--motion-fast)] group-hover:translate-x-0.5" aria-hidden />
        </Link>
      ) : null}
    </section>
  );
}

export type StatItem = { label: string; value: React.ReactNode; hint?: string; href?: string };

/** Secondary figures: label and value on one ruled line each. Quiet on purpose. */
export function StatList({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-ink-200 border-y border-ink-200", className)}>
      {items.map((it) => {
        const row = (
          <>
            <dt className="min-w-0 text-sm text-ink-700">
              {it.label}
              {it.hint ? <span className="mt-0.5 block text-xs text-ink-600">{it.hint}</span> : null}
            </dt>
            <dd className="nums shrink-0 font-display text-lg font-semibold text-ink-900">{it.value}</dd>
          </>
        );
        // A <dl> may hold only <div> groups of dt/dd: the link goes inside them, never around them.
        return (
          <div key={it.label} className={cn("flex items-baseline justify-between gap-4 py-2.5", it.href && "relative -mx-2 rounded-md px-2 transition-colors duration-[var(--motion-fast)] hover:bg-ink-200/40")}>
            {it.href ? (
              <>
                <dt className="min-w-0 text-sm text-ink-700">
                  <Link href={it.href} className="block after:absolute after:inset-0 after:content-['']">
                    {it.label}
                    {it.hint ? <span className="mt-0.5 block text-xs text-ink-600">{it.hint}</span> : null}
                  </Link>
                </dt>
                <dd className="nums shrink-0 font-display text-lg font-semibold text-ink-900">{it.value}</dd>
              </>
            ) : (
              row
            )}
          </div>
        );
      })}
    </dl>
  );
}

/** Lead figure on the left, the ruled list on the right (stacked on a phone). */
export function Overview({ lead, rest, className }: { lead: React.ReactNode; rest?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid items-start gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]", className)}>
      <div>{lead}</div>
      {rest ? <div>{rest}</div> : null}
    </div>
  );
}

/** A titled block of a page: a heading on a hairline, not a card. */
export function Section({ title, hint, action, children, className }: { title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-ink-200 pb-2">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-ink-900">{title}</h2>
          {hint ? <p className="mt-0.5 text-sm text-ink-600">{hint}</p> : null}
        </div>
        {action ? <div className="shrink-0 text-sm">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
