"use client";

import { useState } from "react";

import { AutoSubmitForm } from "@/components/app/auto-submit-form";
import { cn } from "@/lib/utils";

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

const field =
  "h-9 w-32 rounded-apple-sm border border-ink-200 bg-white px-2.5 text-sm tabular-nums text-ink-800 placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 max-lg:h-11";

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

  return (
    <AutoSubmitForm className={cn("flex flex-wrap items-end gap-2", className)}>
      {Object.entries(params)
        .filter(([k, v]) => !skip.has(k) && v)
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      {from ? <input type="hidden" name={fromKey} value={from} /> : null}
      {to ? <input type="hidden" name={toKey} value={to} /> : null}
      {(
        [
          [fromLabel, params[fromKey], setFrom],
          [toLabel, params[toKey], setTo],
        ] as const
      ).map(([label, initial, set]) => (
        <label key={label} className="flex flex-col gap-1 text-xs font-medium text-ink-600">
          {label}
          {/* Uncontrolled on purpose: AutoSubmitForm compares the value with
              its defaultValue to tell an edit from a plain focus-and-leave. */}
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="DD/MM/YYYY"
            defaultValue={toDmy(initial)}
            data-complete={DMY}
            onChange={(e) => set(toIso(e.target.value))}
            className={field}
          />
        </label>
      ))}
      {/* Enter applies with two fields too; implicit submission needs a button. */}
      <button type="submit" className="sr-only">
        Apply dates
      </button>
    </AutoSubmitForm>
  );
}
