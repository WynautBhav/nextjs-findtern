"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";

import { districtOptions } from "@/components/employer/location-fields";

const MAX = 5;

/**
 * Cities filter on the candidates page (QA Sheet1 r55): chips picked from the
 * district list, the same vocabulary the employer and intern location pickers
 * use. Still a plain GET form field - a hidden `city` input carries the chips
 * comma-separated, which is the format the page already parses - so the other
 * filters submit with it unchanged. Typed text that was not turned into a chip
 * is sent too, so a city outside the list still filters.
 */
export function CityFilter({
  defaultValue,
  label = "Cities",
  autoApply = false,
}: {
  defaultValue: string;
  label?: string;
  /** Submit the surrounding form when a chip is added or removed. */
  autoApply?: boolean;
}) {
  const hidden = useRef<HTMLInputElement>(null);
  const [chips, setChips] = useState<string[]>(() =>
    Array.from(
      new Set(
        defaultValue
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
      ),
    ).slice(0, MAX),
  );
  const [initial] = useState(chips);
  const [draft, setDraft] = useState("");

  // Chips change through state, which fires no form "change" event.
  useEffect(() => {
    if (!autoApply || chips.join("|") === initial.join("|")) return;
    hidden.current?.form?.requestSubmit();
  }, [autoApply, chips, initial]);
  const [open, setOpen] = useState(false);
  const full = chips.length >= MAX;

  const options =
    open && !full
      ? districtOptions(draft, undefined, 6).filter(
          (d) => !chips.some((c) => c.toLowerCase() === d.district.toLowerCase()),
        )
      : [];

  function add(raw: string) {
    const city = raw.trim();
    if (!city || full || chips.some((c) => c.toLowerCase() === city.toLowerCase())) return;
    setChips([...chips, city]);
    setDraft("");
  }

  const value = [...chips, draft.trim()].filter(Boolean).join(", ");

  return (
    <div className="min-w-0">
      <label htmlFor="filter-city" className="block text-xs font-semibold text-ink-700">
        {label}
      </label>
      <input ref={hidden} type="hidden" name="city" value={value} />
      <div className="relative mt-2">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-ink-600">
          <MapPin className="size-4" aria-hidden />
        </span>
        <input
          id="filter-city"
          type="text"
          value={draft}
          disabled={full}
          autoComplete="off"
          placeholder={full ? `${MAX} cities max` : chips.length ? "Add another" : "Bengaluru, Pune"}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            // Enter with text turns it into a chip; on an empty box it submits.
            if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
              e.preventDefault();
              add(options[0]?.district ?? draft);
            } else if (e.key === "Backspace" && !draft && chips.length > 0) {
              setChips(chips.slice(0, -1));
            }
          }}
          className="apple-spring min-h-11 w-full rounded-apple-sm border border-ink-200/90 bg-white/90 pl-10 pr-3.5 text-sm text-ink-900 shadow-2xs outline-none placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-ink-50"
        />
        {options.length > 0 ? (
          <ul className="absolute left-0 z-20 mt-1 w-max min-w-full max-w-[18rem] overflow-hidden rounded-apple-sm border border-ink-200 bg-white shadow-sm">
            {options.map((d) => (
              <li key={`${d.district}-${d.state}`}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    add(d.district);
                  }}
                  className="apple-spring flex min-h-11 w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm text-ink-800 hover:bg-ink-50"
                >
                  <span>{d.district}</span>
                  <span className="text-xs text-ink-500">{d.state}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {chips.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((city) => (
            <li
              key={city}
              className="inline-flex items-center gap-0.5 rounded-full bg-brand-50 py-0.5 pl-2.5 pr-0.5 text-xs font-medium text-brand-700"
            >
              {city}
              <button
                type="button"
                onClick={() => setChips(chips.filter((c) => c !== city))}
                aria-label={`Remove ${city}`}
                className="apple-spring grid size-7 shrink-0 place-items-center rounded-full hover:bg-brand-100"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
