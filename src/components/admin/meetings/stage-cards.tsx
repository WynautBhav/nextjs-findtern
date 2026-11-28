"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { cn } from "@/lib/utils";

/**
 * The stage figures over the meeting table. Each is a toggle button: pressing it sets `?stage=` (pressing the active
 * one, or Total, clears it), so the figure on the card is the length of the list it opens. Counts come from the server
 * (meeting-stage.ts stageCounts over the same filtered rows the table shows).
 */
export type StageCard = {
  key: string;
  label: string;
  count: number;
  hint: string;
  dot?: string;
};

export function StageCards({
  cards,
  active,
  noLink,
}: {
  cards: StageCard[];
  active: string;
  noLink: { count: number; on: boolean };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const go = (edit: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    edit(next);
    next.delete("page");
    const qs = next.toString();
    start(() =>
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }),
    );
  };
  const pick = (key: string) =>
    go((next) =>
      key === "total" || key === active
        ? next.delete("stage")
        : next.set("stage", key),
    );
  const toggleNoLink = () =>
    go((next) => (noLink.on ? next.delete("nolink") : next.set("nolink", "1")));

  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-label="Meetings by stage"
        aria-busy={pending}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7"
      >
        {cards.map((c) => {
          const on = c.key === "total" ? active === "" : active === c.key;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() => pick(c.key)}
              className={cn(
                c.key === "total" && "max-sm:col-span-2",
                "group flex min-w-0 flex-col justify-start rounded-[var(--radius-admin-card)] border p-4 text-left transition-colors duration-150 motion-reduce:transition-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                on
                  ? "border-transparent bg-[color:var(--admin-tile)] text-[color:var(--admin-tile-ink)]"
                  : "border-[color:var(--admin-panel-edge)] bg-[color:var(--admin-panel)] hover:bg-[color:var(--admin-panel-2)]",
              )}
            >
              <span
                className={cn(
                  "flex min-h-10 items-start gap-2 text-sm font-medium",
                  on
                    ? "text-[color:var(--admin-tile-ink)]"
                    : "text-text-subtle",
                )}
              >
                {c.dot ? (
                  <span
                    aria-hidden
                    className={cn(
                      "mt-[0.4rem] size-1.5 shrink-0 rounded-full",
                      c.dot,
                    )}
                  />
                ) : null}
                <span className="leading-tight">{c.label}</span>
              </span>
              <span
                className={cn(
                  "nums mt-3 block text-[2rem] font-semibold leading-none tracking-[-0.03em]",
                  on ? "text-[color:var(--admin-tile-ink)]" : "text-foreground",
                )}
              >
                {c.count.toLocaleString("en-IN")}
              </span>
              <span
                className={cn(
                  "mt-2 block text-[0.8125rem] leading-snug",
                  on
                    ? "text-[color:var(--admin-tile-ink)]"
                    : "text-text-subtle",
                )}
              >
                {c.hint}
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-pressed={noLink.on}
        onClick={toggleNoLink}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none max-lg:h-11",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          noLink.on
            ? "border-transparent bg-[color:var(--admin-tile)] text-[color:var(--admin-tile-ink)]"
            : "border-[color:var(--admin-panel-edge)] bg-[color:var(--admin-panel)] text-foreground hover:bg-[color:var(--admin-panel-2)]",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full",
            noLink.on ? "bg-[color:var(--admin-tile-ink)]" : "bg-warning",
          )}
        />
        No meeting link ({noLink.count.toLocaleString("en-IN")})
      </button>
    </div>
  );
}
