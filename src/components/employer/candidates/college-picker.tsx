"use client";

import { useId, useMemo, useState } from "react";
import { Check, ChevronDown, Lock, Search } from "lucide-react";

import { collegeKey, type CollegeOption } from "@/lib/candidate-pro-filters";
import { cn } from "@/lib/utils";

/**
 * College filter for Findtern Pro subscribers: type to narrow the list of colleges in the pool, tick any number
 * of them. Each tick is a plain checkbox named `colleges`, so the filter form applies it like every other
 * filter and a name with a comma or an ampersand travels whole. Ticked colleges stay in the form even when the
 * typed text hides them (they are hidden, not removed), and a ticked college the pool no longer has still
 * shows, with a zero, so it can be unticked.
 */
export function CollegePicker({ options, selected }: { options: CollegeOption[]; selected: string[] }) {
  const [query, setQuery] = useState("");
  const listId = useId();
  const statusId = useId();

  const rows = useMemo(() => {
    const have = new Set(options.map((o) => collegeKey(o.name)));
    const missing = selected.filter((name) => !have.has(collegeKey(name))).map((name) => ({ name, count: 0 }));
    const chosen = new Set(selected.map(collegeKey));
    // Ticked first, so what is applied is always at the top of the list.
    return [...missing, ...options].sort((a, b) => Number(chosen.has(collegeKey(b.name))) - Number(chosen.has(collegeKey(a.name))));
  }, [options, selected]);
  const chosen = useMemo(() => new Set(selected.map(collegeKey)), [selected]);

  const needle = collegeKey(query);
  const shown = rows.filter((r) => !needle || collegeKey(r.name).includes(needle));

  if (rows.length === 0) {
    return <p className="text-xs leading-relaxed text-text-subtle">No college is listed on the candidates in this list yet.</p>;
  }

  return (
    <div>
      <label htmlFor={`${listId}-search`} className="sr-only">
        Search colleges
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" aria-hidden />
        {/* No `name`: the typed text is never sent. Enter picks nothing and must not submit the form. */}
        <input
          id={`${listId}-search`}
          type="text"
          aria-controls={listId}
          autoComplete="off"
          value={query}
          placeholder="Search colleges"
          onChange={(e) => setQuery(e.target.value)}
          onBlur={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
            if (e.key === "Escape" && query) {
              e.preventDefault();
              setQuery("");
            }
          }}
          className="block h-11 w-full rounded-xl border border-ink-200 bg-ink-50 pl-9 pr-3 text-base text-ink-900 outline-none transition-colors placeholder:text-text-subtle hover:border-ink-300 focus-visible:border-brand-600 focus-visible:bg-white focus-visible:ring-[3px] focus-visible:ring-brand-600/20 md:text-sm"
        />
      </div>
      <p id={statusId} role="status" className="mt-1.5 text-xs text-text-subtle">
        {needle ? `${shown.length} of ${rows.length} colleges match` : `${rows.length} college${rows.length === 1 ? "" : "s"}${selected.length > 0 ? `, ${selected.length} chosen` : ""}`}
      </p>
      <ul id={listId} aria-label="Colleges" className="mt-1 max-h-56 overflow-y-auto overscroll-contain rounded-xl border border-ink-200 bg-white p-1">
        {rows.map((row) => {
          const hidden = needle !== "" && !collegeKey(row.name).includes(needle);
          return (
            <li key={collegeKey(row.name)} hidden={hidden}>
              <label className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 text-sm text-ink-800 hover:bg-ink-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500">
                <input
                  type="checkbox"
                  name="colleges"
                  value={row.name}
                  defaultChecked={chosen.has(collegeKey(row.name))}
                  className="mt-0.5 size-4 shrink-0 rounded-[4px] border-ink-300 accent-ink-900"
                />
                <span className="min-w-0 flex-1 break-words">{row.name}</span>
                <span className={cn("nums shrink-0 text-xs leading-5 text-text-subtle", row.count === 0 && "text-ink-500")} aria-label={`${row.count} candidate${row.count === 1 ? "" : "s"}`}>
                  {row.count}
                </span>
              </label>
            </li>
          );
        })}
        {needle && shown.length === 0 ? <li className="px-2 py-3 text-sm text-ink-600">No college matches “{query}”.</li> : null}
      </ul>
    </div>
  );
}

/**
 * The College filter inside a live campus drive: the pool is the drive's college, so it is the one choice, already on.
 * The dropdown also lists the other colleges on Findtern by initials only (redacted on the server), locked until the
 * drive is over. Nothing here is a form field: the lock is decided on the server, never by this control.
 */
export function CampusCollegeSelect({ current, others }: { current: CollegeOption; others: string[] }) {
  const listId = useId();
  return (
    <details
      className="group relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && e.currentTarget.open) {
          e.currentTarget.open = false;
          e.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary
        aria-controls={listId}
        className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3 text-sm text-ink-900 transition-colors hover:border-ink-300 focus-visible:border-brand-600 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-600/20 [&::-webkit-details-marker]:hidden"
      >
        <span className="min-w-0 flex-1 truncate font-medium">{current.name}</span>
        <span className="nums shrink-0 text-xs text-text-subtle">{current.count}</span>
        <ChevronDown className="size-4 shrink-0 text-ink-500 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <ul id={listId} aria-label="Colleges" className="mt-1 max-h-56 overflow-y-auto overscroll-contain rounded-xl border border-ink-200 bg-white p-1">
        <li className="flex min-h-11 items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-ink-900">
          <Check className="size-4 shrink-0 text-brand-700" aria-hidden />
          <span className="min-w-0 flex-1 break-words">{current.name}</span>
          <span className="sr-only">, chosen,</span>
          <span className="nums shrink-0 text-xs text-text-subtle" aria-label={`${current.count} candidate${current.count === 1 ? "" : "s"}`}>
            {current.count}
          </span>
        </li>
        {others.map((name, i) => (
          <li key={`${name}-${i}`} className="flex min-h-11 items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-ink-400">
            <Lock className="size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 tracking-wide">{name}</span>
            <span className="sr-only">, locked during the drive</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
