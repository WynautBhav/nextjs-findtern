"use client";

import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { fieldClass } from "@/components/employer/ui-tokens";

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
  return (
    <>
      <label htmlFor="candidate-sort" className="sr-only">
        Sort by
      </label>
      <select
        id="candidate-sort"
        value={value}
        onChange={(e) => {
          const hit = options.find((o) => o.value === e.target.value);
          if (hit) router.push(hit.href, { scroll: false });
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
