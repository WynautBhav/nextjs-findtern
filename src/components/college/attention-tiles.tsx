import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";

import { Surface } from "@/components/app/primitives";
import { cn } from "@/lib/utils";

export type AttentionTile = { key: string; label: string; value: number; hint: string; clearHint: string; href: string };

/**
 * What needs the placement officer, as a grid of tiles in the admin dashboard's shape: label and an arrow on top, the
 * count large, one line under it. Every tile always shows, so the grid never jumps; a zero reads "All clear" and
 * recedes (no fill, grey), so what is waiting stands out. The first tile with something waiting, in order of urgency,
 * is the one filled tile on the page. The whole tile is the link.
 */
export function AttentionTiles({ tiles }: { tiles: AttentionTile[] }) {
  const featured = tiles.find((t) => t.value > 0)?.key ?? null;
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4" aria-label="Needs your attention">
      {tiles.map((t) => {
        const clear = t.value === 0;
        const on = t.key === featured;
        return (
          <li key={t.key} className="min-w-0">
            <Surface
              className={cn(
                "relative flex h-full flex-col p-3.5 transition-colors sm:p-5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-500",
                on ? "border-brand-800 bg-brand-800 text-white" : clear ? "border-ink-200 bg-transparent shadow-none hover:bg-card" : "hover:border-ink-300",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <Link href={t.href} className={cn("pt-1 text-sm font-medium leading-5 outline-none after:absolute after:inset-0 after:content-['']", on ? "text-white" : "text-ink-700")}>
                  {t.label}
                </Link>
                <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-full border sm:size-9", on ? "border-white/30 text-white" : "border-ink-200 text-ink-600")}>
                  <ArrowUpRight className="size-4" />
                </span>
              </div>
              <p className={cn("nums mt-2 font-semibold leading-none tracking-[-0.03em] sm:mt-3", clear ? "text-base font-medium sm:text-lg" : "text-[1.75rem] sm:text-[2.5rem]", on ? "text-white" : clear ? "text-ink-500" : "text-ink-900")}>
                {clear ? (
                  <span className="flex items-center gap-1.5">
                    <Check aria-hidden className="size-4 sm:size-5" strokeWidth={2.5} />
                    All clear
                  </span>
                ) : (
                  t.value.toLocaleString("en-IN")
                )}
              </p>
              <p className={cn("mt-auto line-clamp-2 pt-2 text-xs leading-4 sm:text-sm sm:leading-5", on ? "text-white/85" : "text-text-subtle")}>{clear ? t.clearHint : t.hint}</p>
            </Surface>
          </li>
        );
      })}
    </ul>
  );
}
