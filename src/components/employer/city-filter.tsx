"use client";

import { useId, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";

import { districtOptions } from "@/components/employer/location-fields";
import { cn } from "@/lib/utils";

/**
 * City filter on the candidates page: ONE city, in one box. Suggestions come from the district list (the same
 * vocabulary the employer and intern location pickers use). Picking a suggestion puts it in the box and applies it;
 * a new pick replaces it; the x clears it. Typed text that matches no suggestion still filters (Enter or leaving
 * the box). Still a plain GET form field: a hidden `city` input carries the value, so the other filters submit
 * with it unchanged. An old comma list keeps its first city.
 */
export function CityFilter({
  defaultValue,
  label = "City",
  autoApply = false,
}: {
  defaultValue: string;
  label?: string;
  /** Submit the surrounding form when the city is picked or cleared. */
  autoApply?: boolean;
}) {
  const hidden = useRef<HTMLInputElement>(null);
  const typing = useRef<HTMLInputElement>(null);
  const [first] = useState(() => defaultValue.split(",").map((c) => c.trim()).find(Boolean) ?? "");
  const [value, setValue] = useState(first);
  // What the list is filtered on now: the panel is not remounted after its own change, so this moves with each commit.
  const [applied, setApplied] = useState(first);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();

  const typed = value.trim();
  const options = open && typed && typed.toLowerCase() !== applied.toLowerCase() ? districtOptions(typed, undefined, 6) : [];

  function commit(next: string) {
    const city = next.trim();
    setValue(city);
    setOpen(false);
    setActive(-1);
    if (!autoApply || city.toLowerCase() === applied.toLowerCase()) return;
    setApplied(city);
    // The hidden input must hold the new value before the form reads it.
    if (hidden.current) hidden.current.value = city;
    hidden.current?.form?.requestSubmit();
  }

  return (
    <div className="min-w-0">
      <label htmlFor="filter-city" className="block text-xs font-semibold text-ink-700">
        {label}
      </label>
      <input ref={hidden} type="hidden" name="city" value={typed} />
      <div className="relative mt-2">
        <MapPin className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-600" aria-hidden />
        <input
          ref={typing}
          id="filter-city"
          type="text"
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls={options.length > 0 ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 && options[active] ? `${listId}-${active}` : undefined}
          value={value}
          autoComplete="off"
          placeholder="e.g. Pune"
          onChange={(e) => {
            setValue(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={(e) => {
            setOpen(true);
            e.currentTarget.select();
          }}
          onBlur={() =>
            window.setTimeout(() => {
              setOpen(false);
              // Leaving the box applies what is typed (a city outside the list still filters).
              if (document.activeElement !== typing.current) commit(typing.current?.value ?? "");
            }, 120)
          }
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && !open) {
              e.preventDefault();
              setOpen(true);
            } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && options.length > 0) {
              e.preventDefault();
              const step = e.key === "ArrowDown" ? 1 : -1;
              setActive((i) => (i < 0 && step < 0 ? options.length - 1 : (i + step + options.length) % options.length));
            } else if (e.key === "Escape" && open) {
              setOpen(false);
              setActive(-1);
            } else if (e.key === "Enter") {
              // Enter takes the highlighted suggestion, else the first, else the typed text; it never submits twice.
              e.preventDefault();
              commit(options[active]?.district ?? options[0]?.district ?? value);
            }
          }}
          className={cn(
            "min-h-11 w-full rounded-apple-sm border border-ink-200 bg-white py-2 pl-10 text-base text-ink-900 outline-none transition-colors placeholder:text-text-subtle hover:border-ink-300 focus:border-brand-800 focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 focus:ring-offset-white md:text-sm",
            value ? "pr-11" : "pr-3",
          )}
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              commit("");
              typing.current?.focus();
            }}
            aria-label={`Clear city (${value})`}
            className="apple-spring absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-ink-500 outline-none hover:bg-ink-100 hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500 touch:size-11"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
        {options.length > 0 ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={`${label} suggestions`}
            className="absolute left-0 z-20 mt-1 w-max min-w-full max-w-[18rem] overflow-hidden rounded-apple-sm border border-ink-200 bg-white shadow-sm"
          >
            {options.map((d, i) => (
              <li
                key={`${d.district}-${d.state}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // Keep focus in the box on press; the pick itself is the click, so assistive tech that only clicks works too.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(d.district)}
                className={cn(
                  "apple-spring flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-left text-sm text-ink-800 hover:bg-ink-50",
                  i === active && "bg-brand-50 text-brand-800",
                )}
              >
                <span>{d.district}</span>
                <span className="text-xs text-text-subtle">{d.state}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
