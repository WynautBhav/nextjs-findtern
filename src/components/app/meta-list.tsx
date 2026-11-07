import { cn } from "@/lib/utils";

export type MetaItem = { icon?: React.ReactNode; text?: React.ReactNode | null };

/** Inline facts separated by a gap (no divider glyph, so nothing can orphan at a line start); wraps cleanly, drops empty items. */
export function MetaList({ items, className }: { items: MetaItem[]; className?: string }) {
  const kept = items.filter((i) => i.text !== null && i.text !== undefined && i.text !== "" && i.text !== false);
  if (kept.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-subtle", className)}>
      {kept.map((it, i) => (
        <li key={i} className="flex min-w-0 items-center gap-1.5">
          {it.icon ? <span aria-hidden className="inline-flex shrink-0 [&_svg]:size-3.5">{it.icon}</span> : null}
          <span className="min-w-0 break-words">{it.text}</span>
        </li>
      ))}
    </ul>
  );
}
