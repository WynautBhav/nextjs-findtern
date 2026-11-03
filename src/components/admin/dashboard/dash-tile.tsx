import { ArrowLinkButton } from "@/components/admin/panel";
import { cn } from "@/lib/utils";

/**
 * A dashboard figure tile. Same look as `StatCard` but sized for a 2-up phone grid: the label stays on
 * one or two lines (short label, no wrapping caption under it) and the figure is smaller below `sm`.
 * `featured` is the one filled brand tile on the page; the caller never feeds it a zero.
 */
export function DashTile({
  label,
  value,
  hint,
  href,
  featured = false,
}: {
  label: string;
  value: number;
  hint: string;
  href?: string;
  featured?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col rounded-[var(--radius-admin-card)] p-3.5 sm:p-[var(--admin-pad-panel)]",
        featured
          ? "bg-[color:var(--admin-tile)] text-[color:var(--admin-tile-ink)] shadow-[0_14px_30px_-16px_rgb(14_96_73/0.7)]"
          : "border border-[color:var(--admin-panel-edge)] bg-[color:var(--admin-panel)] shadow-[var(--admin-shadow)]",
        href && "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn("pt-1 text-sm font-medium leading-5", featured ? "text-[color:var(--admin-tile-ink)]" : "text-text-subtle")}>{label}</p>
        {href ? <ArrowLinkButton href={href} label={`Open ${label}`} inverted={featured} stretch className="max-sm:size-8" /> : null}
      </div>
      <p
        className={cn(
          "nums mt-2 text-[1.75rem] font-semibold leading-none tracking-[-0.03em] sm:mt-3 sm:text-[2.5rem]",
          featured ? "text-[color:var(--admin-tile-ink)]" : "text-foreground",
        )}
      >
        {value.toLocaleString("en-IN")}
      </p>
      <p className={cn("mt-1.5 line-clamp-2 text-xs leading-4 sm:mt-2 sm:text-sm sm:leading-5", featured ? "text-[color:var(--admin-tile-ink)]/90" : "text-text-subtle")}>{hint}</p>
    </div>
  );
}
