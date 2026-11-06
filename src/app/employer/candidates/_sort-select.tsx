"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { fieldClass } from "@/components/employer/ui-tokens";
import { sortChangeAction, sortCommitValue } from "@/components/employer/candidate-view";

/**
 * Sort by, in the results toolbar. A native select (keyboard and screen
 * readers for free); each option carries the URL that applies it, so the
 * server page stays the one place that builds query strings.
 */
export function SortSelect({
  value,
  options,
  className,
}: {
  value: string;
  options: { value: string; label: string; href: string }[];
  className?: string;
}) {
  const router = useRouter();
  // A keyboard choice waits here for Enter or blur; the select shows it meanwhile.
  const [held, setHeld] = useState<string | null>(null);
  const keyboard = useRef(false);
  const pending = useRef<string | null>(null);

  function apply(next: string) {
    const hit = options.find((o) => o.value === next);
    if (hit) router.push(hit.href, { scroll: false });
  }
  function commit() {
    const next = sortCommitValue(pending.current, value);
    pending.current = null;
    keyboard.current = false;
    setHeld(null);
    if (next !== null) apply(next);
  }

  return (
    <>
      <label htmlFor="candidate-sort" className="sr-only">
        Sort by
      </label>
      <select
        id="candidate-sort"
        value={held ?? value}
        onPointerDown={() => {
          keyboard.current = false;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
          } else if (!e.altKey && !e.ctrlKey && !e.metaKey && e.key !== "Tab") {
            keyboard.current = true;
          }
        }}
        // Choosing from the open list with Enter fires `change` after keydown: commit on keyup too.
        onKeyUp={(e) => {
          if (e.key === "Enter") commit();
        }}
        onBlur={commit}
        onChange={(e) => {
          if (sortChangeAction(keyboard.current) === "hold") {
            pending.current = e.target.value;
            setHeld(e.target.value);
          } else apply(e.target.value);
        }}
        className={cn(fieldClass, "min-h-11 w-auto min-w-0 pr-8 sm:min-h-10", className)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            Sort: {o.label}
          </option>
        ))}
      </select>
    </>
  );
}
