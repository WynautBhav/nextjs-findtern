"use client";

import { useState } from "react";

/**
 * A date field in DD/MM/YYYY, the one format the product shows (bug sheet 7,
 * DESIGN.md §0). The native date input follows the browser's language, so an
 * en-US browser showed mm/dd/yyyy on the offer and booking forms while
 * Schedule asked for DD/MM/YYYY (QA-126). The value in and out stays ISO
 * (YYYY-MM-DD); "" until the text is a real date. `min` / `max` are ISO too,
 * and a date outside them reports why rather than passing silently.
 */

function toIso(text: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return "";
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return "";
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function toDmy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export function DmyDateInput({
  value,
  onChange,
  min,
  max,
  ...rest
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "min" | "max"> & {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
}) {
  const [text, setText] = useState(() => toDmy(value));
  // Follow a value set from outside (a reset, a prefill) without fighting
  // the half-typed text that maps to "".
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== toIso(text)) setText(toDmy(value));
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={rest.placeholder ?? "DD/MM/YYYY"}
      value={text}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        const iso = toIso(next);
        const out = iso && ((min && iso < min) || (max && iso > max)) ? "" : iso;
        e.target.setCustomValidity(
          next.trim() && !iso
            ? "Use DD/MM/YYYY, for example 31/10/2026."
            : iso && min && iso < min
              ? `Pick ${toDmy(min)} or later.`
              : iso && max && iso > max
                ? `Pick ${toDmy(max)} or earlier.`
                : "",
        );
        setSeen(out);
        onChange(out);
      }}
    />
  );
}
