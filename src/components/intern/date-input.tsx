"use client";

import { useRef } from "react";
import { CalendarDays } from "lucide-react";

import { isRealDay } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

import { controlClass, describedBy, FieldNote, Label } from "./onboarding/fields";

/**
 * The one date input on the intern side (bug sheet 7, NC r24).
 *
 * Typed as DD/MM/YYYY (slashes are added as you type), with a calendar
 * button that opens the browser's own picker. The value it hands back is
 * what legacy stores, YYYY-MM-DD, once the date is complete and real; while
 * it is being typed (or if it is impossible, like 31/02) the typed text is
 * handed back instead, so validation can say what is wrong with it.
 *
 * It replaces native `type="date"` / `type="month"` inputs, which render as
 * "---------, ----" in some locales and ignore the DD/MM/YYYY rule.
 */
export function DateInput({
  id,
  value,
  onChange,
  min,
  max,
  error,
  hint,
  disabled,
  className,
  ariaLabel,
}: {
  id: string;
  /** YYYY-MM-DD, "" or text being typed. */
  value: string;
  onChange: (value: string) => void;
  /** YYYY-MM-DD bounds for the calendar. */
  min?: string;
  max?: string;
  error?: string;
  hint?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const iso = isRealDay(value) ? value : "";

  function type(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    const text =
      digits.length > 4
        ? `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
        : digits.length > 2
          ? `${digits.slice(0, 2)}/${digits.slice(2)}`
          : digits;
    if (digits.length === 8) {
      const day = `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
      onChange(isRealDay(day) ? day : text);
      return;
    }
    onChange(text);
  }

  function openPicker() {
    const el = picker.current;
    if (!el || disabled) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  }

  return (
    <div className={cn("relative", className)}>
      <input
        id={id}
        name={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="DD/MM/YYYY"
        maxLength={10}
        aria-label={ariaLabel}
        value={iso ? toDisplay(iso) : value}
        disabled={disabled}
        onChange={(e) => type(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={controlClass(error, "nums pr-12 tracking-wide")}
      />
      {/* The browser's calendar, opened from the button; it never shows itself. */}
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={iso}
        min={min}
        max={max}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        className="pointer-events-none absolute right-0.5 top-0.5 size-10 opacity-0"
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label="Open calendar"
        tabIndex={-1}
        className="apple-spring absolute right-0.5 top-0.5 grid size-10 place-items-center rounded-apple-sm text-text-subtle hover:bg-ink-100 hover:text-brand-700 disabled:pointer-events-none"
      >
        <CalendarDays className="size-[1.125rem]" aria-hidden />
      </button>
    </div>
  );
}

/** Label, date input and its note, laid out like every other field. */
export function DateField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  error,
  hint,
  optional,
  disabled,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  error?: string;
  hint?: React.ReactNode;
  optional?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={id} optional={optional}>
        {label}
      </Label>
      <DateInput id={id} value={value} onChange={onChange} min={min} max={max} error={error} hint={hint} disabled={disabled} className="mt-2" />
      <FieldNote id={id} error={error} hint={hint} />
    </div>
  );
}

/** "2025-03-15" → "15/03/2025". */
function toDisplay(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Today in local time, YYYY-MM-DD, so a picker cannot offer tomorrow late in the evening. */
export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
