"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { PER_PAGE_OPTIONS } from "@/lib/admin/params";

/**
 * Rows-per-page control.
 *
 * Separate from the toolbar because it is a display preference rather than a
 * filter - "Clear all" deliberately preserves it, whereas it wipes every
 * chip. Changing it resets to page 1, since page 9 of the old size is rarely a
 * valid page of the new one.
 */
export function PageSizeSelect({ pageKey = "per" }: { pageKey?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const current = Number(searchParams.get(pageKey) ?? "25");
  const pageParam = pageKey === "per" ? "page" : "pper";

  function change(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set(pageKey, value);
    next.delete(pageParam);
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor="per" className="whitespace-nowrap text-xs text-text-subtle">
        Rows
      </label>
      <select
        id="per"
        value={String(PER_PAGE_OPTIONS.includes(current as 10) ? current : 25)}
        onChange={(e) => change(e.target.value)}
        className="apple-spring h-9 cursor-pointer rounded-[10px] border border-ink-200 bg-white px-2.5 pr-7 text-sm text-ink-700 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
      >
        {PER_PAGE_OPTIONS.map((option) => (
          <option key={option} value={String(option)}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
