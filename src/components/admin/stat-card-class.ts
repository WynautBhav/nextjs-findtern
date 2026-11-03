import { cn } from "../../lib/utils.ts";

/**
 * The figure's classes. `leading-none` goes after the size classes on purpose: `cn` (tailwind-merge)
 * treats a font size as also setting the line height and drops an earlier `leading-*`.
 */
export function statValueClass(fit: boolean, featured: boolean): string {
  return cn(
    "nums font-semibold tracking-[-0.03em]",
    fit ? "whitespace-nowrap text-[clamp(1.375rem,13cqi,2.75rem)]" : "text-[2rem] sm:text-[2.5rem] lg:text-[2.75rem]",
    featured ? "text-[color:var(--admin-tile-ink)]" : "text-foreground",
    "leading-none",
  );
}
