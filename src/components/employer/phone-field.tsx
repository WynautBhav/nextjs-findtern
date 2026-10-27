"use client";

/**
 * Phone number with a country code, for the employer's company forms.
 *
 * Every country, not the seven codes an earlier picker offered (bug sheet 7,
 * NC r9): the list is `lib/data/dial-codes`, the same one signup uses, so a
 * number accepted at signup is never unrepresentable here. A code saved
 * before the list existed stays selectable rather than vanishing.
 */

import { DIAL_CODES } from "@/lib/data/dial-codes";
import { controlClass, describedBy, FieldError, FieldHint, FieldLabel, NativeSelect } from "@/components/employer/company-fields";
import { phoneHint } from "@/lib/phone";

export function DialCodeSelect({
  id,
  value,
  onChange,
  error,
  label,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  /** Accessible name; the visible label belongs to the phone field. */
  label: string;
  className?: string;
}) {
  const known = DIAL_CODES.some((d) => d.code === value);
  return (
    <NativeSelect
      id={id}
      name={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      aria-invalid={error || undefined}
      error={error}
      className={`nums ${className ?? ""}`}
      wrapperClassName="w-32 shrink-0 sm:w-44"
    >
      {!known && value ? <option value={value}>{value}</option> : null}
      {DIAL_CODES.map((d) => (
        <option key={`${d.code}-${d.country}`} value={d.code}>
          {d.code} {d.country}
        </option>
      ))}
    </NativeSelect>
  );
}

export function PhoneField({
  id,
  label = "Phone number",
  code,
  onCodeChange,
  number,
  onNumberChange,
  error,
  required,
}: {
  id: string;
  label?: string;
  code: string;
  onCodeChange: (value: string) => void;
  number: string;
  onNumberChange: (value: string) => void;
  error?: string;
  required?: boolean;
}) {
  const hint = phoneHint(code);
  return (
    <div>
      <FieldLabel htmlFor={id} required={required}>
        {label}
      </FieldLabel>
      <div className="mt-2 flex gap-2">
        <DialCodeSelect id={`${id}-code`} label={`${label}: country code`} value={code} onChange={onCodeChange} error={Boolean(error)} />
        <input
          id={id}
          name={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={15}
          value={number}
          onChange={(e) => onNumberChange(e.target.value.replace(/\D/g, ""))}
          placeholder={code === "+91" ? "98765 43210" : "Phone number"}
          {...describedBy(id, error, hint)}
          className={controlClass(Boolean(error), "nums min-w-0 flex-1")}
        />
      </div>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : <FieldHint id={`${id}-hint`}>{hint}</FieldHint>}
    </div>
  );
}
