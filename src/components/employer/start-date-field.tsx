"use client";

import { useEffect, useId, useState } from "react";

import { DmyDateInput } from "@/components/app/dmy-date-input";
import { fieldClass } from "@/components/employer/ui-tokens";
import { cn } from "@/lib/utils";
import { fixStartDate, startDateHint, startDayDisabled } from "./start-date-model";

/**
 * The hiring start date, on the rule the server enforces (lib/business-days.ts): a weekday, two days after sending.
 * Weekends and too-early days are greyed out in the calendar; a date typed or carried in that breaks the rule is moved
 * to the nearest allowed day and the field says so in a live region. The line under the field always names the earliest
 * start, so the employer never has to guess why a day is greyed out.
 *
 * `keep` is the date an edit started with: it was valid when the offer went out, so it is never moved or refused
 * (the server leaves an unchanged start date alone too).
 */
export function StartDateField({
  id,
  label = "Start date",
  hint,
  value,
  onChange,
  error,
  keep = "",
  required,
  className,
}: {
  id?: string;
  label?: string;
  /** What the date means for the offer, above the field. */
  hint?: string;
  value: string;
  onChange: (iso: string) => void;
  error?: string;
  keep?: string;
  required?: boolean;
  className?: string;
}) {
  const auto = useId();
  const fieldId = id ?? `${auto}-start`;
  const [now, setNow] = useState(() => new Date());
  const [notice, setNotice] = useState<string | null>(null);

  // The earliest day moves at midnight India time: look again when the tab comes back and when the field is used.
  useEffect(() => {
    const refresh = () => setNow(new Date());
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  const disabled = startDayDisabled(now);
  const hintId = `${fieldId}-hint`;
  const lineId = `${fieldId}-earliest`;
  const errorId = `${fieldId}-error`;

  function change(iso: string) {
    const at = new Date();
    setNow(at);
    const fixed = fixStartDate(iso, at, keep);
    setNotice(fixed.notice);
    onChange(fixed.value);
  }

  return (
    <div className={className}>
      <label htmlFor={fieldId} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="mt-0.5 text-xs text-text-subtle">
          {hint}
        </p>
      ) : null}
      <div className="mt-2" onFocusCapture={() => setNow(new Date())}>
        <DmyDateInput
          id={fieldId}
          name={fieldId}
          value={value}
          onChange={change}
          isDisabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(hint && hintId, lineId, notice && `${fieldId}-notice`, error && errorId) || undefined}
          className={cn(fieldClass, error && "border-danger hover:border-danger focus-visible:border-danger focus-visible:ring-danger/20")}
        />
      </div>
      <p id={lineId} className="mt-1.5 text-xs text-text-subtle">
        {startDateHint(now)}
      </p>
      {/* Always in the page so a screen reader hears the change when the text appears. */}
      <div role="status" aria-live="polite">
        {notice ? (
          <p id={`${fieldId}-notice`} className="mt-1.5 rounded-apple-sm bg-warning-soft px-2.5 py-1.5 text-xs font-medium text-warning">
            {notice}
          </p>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
