"use client";

import { useId, useState } from "react";
import { CalendarDays } from "lucide-react";

import { AutoSubmitForm } from "@/components/app/auto-submit-form";
import { cn } from "@/lib/utils";
import { FILTER_CONTROL, FilterField } from "./filter-controls.tsx";

/**
 * A from-to date filter in DD/MM/YYYY, the format the whole product shows.
 * The native date input rendered mm/dd/yyyy in an en-US browser and needed an
 * Apply button; this one applies itself (AutoSubmitForm) once a date is
 * complete or cleared, and sends ISO YYYY-MM-DD in hidden fields, so the pages
 * read `from` / `to` exactly as before. Every other query value is carried
 * along; the page number is dropped (it would point past the narrowed list).
 */

const DMY = "^\\d{1,2}/\\d{1,2}/\\d{4}$";

function toIso(dmy: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dmy.trim());
  if (!m) return "";
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return "";
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function toDmy(iso: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

const field = cn(FILTER_CONTROL, "w-40 pr-10 tabular-nums max-sm:w-full");

export function DateRangeForm({
  params,
  fromKey = "from",
  toKey = "to",
  drop = [],
  fromLabel = "From",
  toLabel = "To",
  className,
}: {
  params: Record<string, string>;
  fromKey?: string;
  toKey?: string;
  /** Extra keys to drop when the range changes (e.g. a preset period). */
  drop?: string[];
  fromLabel?: string;
  toLabel?: string;
  className?: string;
}) {
  const [from, setFrom] = useState(params[fromKey] ?? "");
  const [to, setTo] = useState(params[toKey] ?? "");
  const skip = new Set([fromKey, toKey, "page", ...drop]);
  const fromId = useId();
  const toId = useId();

  return (
    <AutoSubmitForm className={cn("flex flex-wrap items-end gap-x-2.5 gap-y-3 max-sm:w-full", className)}>
      {Object.entries(params)
        .filter(([k, v]) => !skip.has(k) && v)
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      {from ? <input type="hidden" name={fromKey} value={from} /> : null}
      {to ? <input type="hidden" name={toKey} value={to} /> : null}
      {(
        [
          [fromLabel, params[fromKey], setFrom, fromId],
          [toLabel, params[toKey], setTo, toId],
        ] as const
      ).map(([label, initial, set, id]) => (
        <FilterField key={label} label={label} htmlFor={id} className="max-sm:flex-1">
          <div className="relative">
            {/* Uncontrolled on purpose: AutoSubmitForm compares the value with
                its defaultValue to tell an edit from a plain focus-and-leave. */}
            <input
              id={id}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="DD/MM/YYYY"
              defaultValue={toDmy(initial)}
              data-complete={DMY}
              data-date="dmy"
              onChange={(e) => set(toIso(e.target.value))}
              className={field}
            />
            <CalendarDays aria-hidden className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-text-subtle" />
          </div>
        </FilterField>
      ))}
      {/* Enter applies with two fields too; implicit submission needs a button. */}
      <button type="submit" className="sr-only">
        Apply dates
      </button>
    </AutoSubmitForm>
  );
}
