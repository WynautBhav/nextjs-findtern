"use client";

import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A date field in DD/MM/YYYY, the one format the product shows (bug sheet 7,
 * DESIGN.md §0). The native date input follows the browser's language, so an
 * en-US browser showed mm/dd/yyyy on the offer and booking forms while
 * Schedule asked for DD/MM/YYYY (QA-126). The value in and out stays ISO
 * (YYYY-MM-DD); "" until the text is a real date. `min` / `max` are ISO too,
 * and a date outside them reports why rather than passing silently.
 *
 * A calendar button sits at the end of the field (bug sheet 9: "add calendar in
 * start date"): it opens the browser's own picker through a hidden date input,
 * as the intern forms do, and the picked day lands in the text as DD/MM/YYYY.
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
  className,
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
  const field = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  function commit(next: string) {
    setText(next);
    const iso = toIso(next);
    const out = iso && ((min && iso < min) || (max && iso > max)) ? "" : iso;
    field.current?.setCustomValidity(
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
  }

  function openPicker() {
    const el = picker.current;
    if (!el || rest.disabled) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  }

  const name = rest["aria-label"];
  return (
    <div className="relative">
      <input
        {...rest}
        ref={field}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={rest.placeholder ?? "DD/MM/YYYY"}
        value={text}
        onChange={(e) => commit(e.target.value)}
        className={cn(className, "pr-12")}
      />
      {/* The picker never shows itself: the button below opens it. */}
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={toIso(text)}
        min={min}
        max={max}
        onChange={(e) => {
          if (e.target.value) commit(toDmy(e.target.value));
        }}
        className="pointer-events-none absolute bottom-0.5 right-0.5 size-10 opacity-0"
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={rest.disabled}
        // A mouse shortcut, hidden from assistive technology: the field itself takes the typed date, and inside a
        // <label> a visible button would be read out as part of the field's name ("Paid from Open calendar").
        aria-hidden
        aria-label={name ? `Open calendar, ${name}` : "Open calendar"}
        tabIndex={-1}
        className="apple-spring absolute bottom-0.5 right-0.5 grid size-10 place-items-center rounded-apple-sm text-text-subtle hover:bg-ink-100 hover:text-brand-700 disabled:pointer-events-none"
      >
        <CalendarDays className="size-[1.125rem]" aria-hidden />
      </button>
    </div>
  );
}
