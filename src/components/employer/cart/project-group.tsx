import { CartLine } from "./cart-line";
import type { Currency } from "@/lib/employer-pricing";
import type { CartLineItem } from "./cart-helpers";

/** One project's candidates under a quiet heading with its count. */
export function ProjectGroup({
  name,
  lines,
  closed,
  nameOf,
  currency,
  timezone,
  busyId,
  onMeeting,
  onRemove,
  startIndex,
}: {
  name: string;
  lines: CartLineItem[];
  closed: boolean;
  nameOf: (l: CartLineItem) => string;
  currency: Currency;
  timezone: string;
  busyId: string | null;
  onMeeting: (l: CartLineItem) => void;
  onRemove: (l: CartLineItem) => void;
  startIndex: number;
}) {
  return (
    <section aria-label={name} className="mt-6 first:mt-0">
      <h3 className="mb-3 flex items-baseline gap-2 text-sm font-semibold text-ink-900">
        {name}
        <span className="nums font-normal text-text-subtle">{lines.length}</span>
        {closed ? <span className="font-normal text-text-subtle">Closed</span> : null}
      </h3>
      <ul className="grid gap-3">
        {lines.map((line, i) => (
          <CartLine
            key={line.id}
            line={line}
            index={startIndex + i}
            name={nameOf(line)}
            currency={currency}
            timezone={timezone}
            busy={busyId === line.id}
            onMeeting={() => onMeeting(line)}
            onRemove={() => onRemove(line)}
          />
        ))}
      </ul>
    </section>
  );
}

/** Group lines by project, keeping first-seen order. */
export function groupByProject(lines: CartLineItem[]): { id: string; name: string; closed: boolean; lines: CartLineItem[] }[] {
  const map = new Map<string, { id: string; name: string; closed: boolean; lines: CartLineItem[] }>();
  for (const l of lines) {
    const g = map.get(l.projectId) ?? { id: l.projectId, name: l.projectName, closed: Boolean(l.projectClosed), lines: [] };
    g.lines.push(l);
    map.set(l.projectId, g);
  }
  return [...map.values()];
}
