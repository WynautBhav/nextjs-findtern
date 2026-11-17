import { EmptyScene } from "@/components/app/primitives";
import { cn } from "@/lib/utils";

/** A small read-only table in the DataTable treatment (sticky sentence-case header, right-aligned figures, no zebra). Cells collapse to labelled rows on a phone (data-stack). */
export function SimpleTable({
  head,
  rows,
  right = [],
  empty,
  minWidth = "lg:min-w-[32rem]",
  caption,
  maxHeight = "max-h-[32rem]",
}: {
  head: string[];
  rows: React.ReactNode[][];
  right?: number[];
  empty: { title: string; body: string };
  minWidth?: string;
  /** Accessible name of the scroll region (default: the first column). */
  caption?: string;
  maxHeight?: string;
}) {
  if (rows.length === 0) return <EmptyScene compact title={empty.title} body={empty.body} />;
  return (
    // Focusable, so the inner scroll can be reached from the keyboard (axe scrollable-region-focusable).
    <div tabIndex={0} role="region" aria-label={caption ?? `${head[0]} table`} data-stack className={cn(maxHeight, "overflow-y-auto lg:overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring")}>
      <table className={cn("w-full text-left text-sm", minWidth)}>
        <thead>
          <tr className="border-b border-[color:var(--admin-rule)]">
            {head.map((h, i) => (
              <th key={h} scope="col" className={cn("sticky top-0 z-10 bg-[color:var(--admin-panel)] px-3 py-2.5 text-[0.8125rem] font-medium text-text-subtle first:pl-[var(--admin-pad-panel)] last:pr-[var(--admin-pad-panel)]", right.includes(i) && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-[color:var(--admin-rule)] last:border-0 hover:bg-[color:var(--admin-panel-2)]">
              {r.map((cell, i) => (
                <td
                  key={i}
                  {...(i === 0 ? { "data-title": "" } : { "data-label": head[i] })}
                  {...(cell === "-" || cell === "–" || cell === "—" ? { "data-empty": "" } : {})}
                  className={cn("px-3 py-2.5 text-foreground [overflow-wrap:anywhere] first:pl-[var(--admin-pad-panel)] last:pr-[var(--admin-pad-panel)]", right.includes(i) && "nums text-right")}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
