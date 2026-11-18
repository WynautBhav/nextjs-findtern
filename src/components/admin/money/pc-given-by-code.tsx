import { Money } from "@/components/admin/money/ledger";

/**
 * Where the discount went: one ruled line per code that has given any, the bar its true share of the total.
 * Shown only when two or more codes have given something (one line at 100% says nothing).
 */
export function GivenByCode({ lines }: { lines: { id: string; code: string; minor: number }[] }) {
  const total = lines.reduce((s, l) => s + l.minor, 0);
  const top = [...lines].sort((a, b) => b.minor - a.minor).slice(0, 4);
  if (lines.length < 2 || total <= 0) return null;
  return (
    <section aria-label="Discount given by code" className="mt-8 max-w-lg">
      <h2 className="border-b-2 border-ink-800 pb-2 font-display text-lg font-semibold text-ink-900">Where it went</h2>
      <ul>
        {top.map((l) => {
          const share = l.minor / total;
          return (
            <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-ink-200 py-2.5">
              <span className="min-w-0 truncate text-sm font-medium text-ink-900">{l.code}</span>
              <Money minor={l.minor} className="text-sm text-ink-900" />
              <div role="img" aria-label={`${Math.round(share * 100)}% of all discount given`} className="col-span-2 mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-200">
                <div className="h-full rounded-full bg-ink-800" style={{ width: `${share * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      {lines.length > top.length ? <p className="mt-2 text-xs text-ink-600">The top {top.length} of {lines.length} codes. Bars are each code&apos;s share of all discount given.</p> : <p className="mt-2 text-xs text-ink-600">Bars are each code&apos;s share of all discount given.</p>}
    </section>
  );
}
