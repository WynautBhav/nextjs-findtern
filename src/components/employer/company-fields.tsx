"use client";

/**
 * Form controls for the employer's own records: company profile, onboarding
 * and projects.
 *
 * Three forms used to carry three copies of the same input recipe, each with
 * its own pixel radius and a 14px literal, and they had drifted (one had a
 * 1.5 gap under the label, one a 2, one an uppercase label). One recipe now,
 * on the system's tokens: `rounded-apple-sm` controls, 15px reading text,
 * `text-sm` labels, errors in words next to the field they are about.
 */

import { AlertCircle, CheckCircle2, ChevronDown, Info } from "lucide-react";

import { cn } from "@/lib/utils";

/** The control recipe, shared with location-fields and phone-field. */
export function controlClass(error?: boolean, className?: string) {
  return cn(
    "apple-spring block min-h-11 w-full rounded-apple-sm border bg-white px-3.5 text-[0.9375rem] text-ink-900 shadow-xs outline-none",
    "placeholder:text-ink-400 focus:ring-2 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500",
    // aria-readonly, not :read-only - a <select> always matches :read-only.
    "aria-readonly:cursor-default aria-readonly:bg-ink-50 aria-readonly:text-ink-600 aria-readonly:shadow-none",
    error
      ? "border-danger focus:border-danger focus:ring-danger/20"
      : "border-ink-200 hover:border-ink-300 focus:border-brand-500 focus:ring-brand-500/20",
    className,
  );
}

/**
 * A native select drawn like the other controls: the browser's own arrow
 * differs per platform and sat at a different inset from the city field's
 * chevron, so it is replaced by the same icon. Still a real <select>, so
 * keyboard and screen-reader behaviour are the platform's.
 */
export function NativeSelect({
  error,
  className,
  wrapperClassName,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean; wrapperClassName?: string }) {
  return (
    <div className={cn("relative", wrapperClassName)}>
      <select {...rest} className={controlClass(error, cn("appearance-none pr-10", className))}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
    </div>
  );
}

export function FieldLabel({
  htmlFor,
  children,
  required,
  optional,
  as: As = "label",
}: {
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
  optional?: boolean;
  as?: "label" | "span";
}) {
  return (
    <As {...(As === "label" ? { htmlFor } : {})} className="block text-sm font-medium text-ink-800">
      {children}
      {required ? (
        <span aria-hidden className="text-danger">
          {" "}*
        </span>
      ) : null}
      {optional ? <span className="font-normal text-ink-500"> (optional)</span> : null}
    </As>
  );
}

export function FieldHint({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mt-1.5 text-xs leading-relaxed text-ink-600">
      {children}
    </p>
  );
}

export function FieldError({ id, children }: { id?: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-sm text-danger">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** aria wiring for a control with an optional error and hint. */
export function describedBy(id: string, error?: string, hint?: React.ReactNode) {
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}

export function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  type = "text",
  placeholder,
  inputMode,
  maxLength,
  readOnly,
  required,
  optional,
  autoComplete,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: React.ReactNode;
  type?: string;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email" | "url";
  maxLength?: number;
  readOnly?: boolean;
  required?: boolean;
  optional?: boolean;
  autoComplete?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <FieldLabel htmlFor={id} required={required} optional={optional}>
        {label}
      </FieldLabel>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        readOnly={readOnly}
        aria-readonly={readOnly || undefined}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        {...describedBy(id, error, hint)}
        className={controlClass(Boolean(error), "mt-2")}
      />
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : hint ? <FieldHint id={`${id}-hint`}>{hint}</FieldHint> : null}
    </div>
  );
}

export function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  error,
  hint,
  placeholder = "Select…",
  required,
  className,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  error?: string;
  hint?: React.ReactNode;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  // A stored value the list no longer offers stays visible rather than
  // silently snapping to the placeholder.
  const unlisted = value && !options.some((o) => o.value === value) ? value : null;
  return (
    <div className={className}>
      <FieldLabel htmlFor={id} required={required}>
        {label}
      </FieldLabel>
      <NativeSelect
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...describedBy(id, error, hint)}
        error={Boolean(error)}
        wrapperClassName="mt-2"
      >
        <option value="">{placeholder}</option>
        {unlisted ? <option value={unlisted}>{unlisted}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : hint ? <FieldHint id={`${id}-hint`}>{hint}</FieldHint> : null}
    </div>
  );
}

/**
 * A single choice shown as buttons (scope of work, work mode). Nothing is
 * pre-selected unless the record already has a value: an unchosen project
 * used to become a 60-day remote role without the employer noticing (EMH-47).
 */
export function ChoiceGroup({
  id,
  label,
  value,
  options,
  onChange,
  error,
  hint,
  required,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string; detail?: string }[];
  onChange: (value: string) => void;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
}) {
  return (
    <fieldset aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}>
      <legend className="block text-sm font-medium text-ink-800">
        {label}
        {required ? (
          <span aria-hidden className="text-danger">
            {" "}*
          </span>
        ) : null}
      </legend>
      {hint && !error ? <FieldHint id={`${id}-hint`}>{hint}</FieldHint> : null}
      <div role="radiogroup" aria-label={label} className="mt-2.5 flex flex-wrap gap-2">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={cn(
                "apple-spring apple-pressable inline-flex min-h-11 items-center gap-2 rounded-apple-sm border px-4 text-sm font-medium",
                active
                  ? "border-brand-700 bg-brand-700 text-white shadow-xs"
                  : error
                    ? "border-danger/50 bg-white text-ink-700 hover:bg-ink-50"
                    : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50",
              )}
            >
              {o.label}
              {o.detail ? <span className={cn("text-xs", active ? "text-white/80" : "text-ink-500")}>{o.detail}</span> : null}
            </button>
          );
        })}
      </div>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </fieldset>
  );
}

/** A group of related fields with a heading. */
export function FormSection({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="text-base font-semibold tracking-[-0.01em] text-ink-900">{title}</legend>
      {hint ? <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-600">{hint}</p> : null}
      <div className="mt-5 space-y-5">{children}</div>
    </fieldset>
  );
}

/** A form-level message: what failed, what saved, or what to know. */
export function FormNotice({
  tone,
  children,
  className,
}: {
  tone: "error" | "success" | "info";
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "error" ? AlertCircle : tone === "success" ? CheckCircle2 : Info;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-apple-md border px-4 py-3 text-sm leading-relaxed",
        tone === "error" && "border-danger/25 bg-danger-soft text-danger",
        tone === "success" && "border-brand-200 bg-brand-50 text-brand-800",
        tone === "info" && "border-ink-200/80 bg-ink-50 text-ink-700",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
