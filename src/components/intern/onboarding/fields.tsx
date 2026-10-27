"use client";

import { Plus, Trash2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Form controls for the onboarding steps.
 *
 * One rule keeps fields side by side aligned (bug sheet 7, NC r23): every
 * field is label → control → one note line, and the note (hint or error)
 * always sits under the control, never between the label and the control.
 * Labels are one line (`truncate` is never used on them, so they are kept
 * short instead), and the control is the same height everywhere.
 */

/** One control size: 44px tall everywhere (touch-first), radius token, 16px text so iOS never zooms. */
export const CONTROL =
  "apple-spring block h-11 w-full min-w-0 rounded-apple-sm border bg-white px-3.5 text-base text-ink-900 shadow-xs outline-none placeholder:text-ink-400 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-600 sm:text-[0.9375rem]";
export const CONTROL_OK = "border-ink-200 hover:border-ink-300 focus-visible:border-brand-600 focus-visible:ring-brand-600/15";
export const CONTROL_BAD = "border-danger focus-visible:border-danger focus-visible:ring-danger/15";
export const controlClass = (error?: string, extra?: string) => cn(CONTROL, error ? CONTROL_BAD : CONTROL_OK, extra);

const LABEL = "block text-sm font-medium text-ink-800";

export function Label({ htmlFor, children, optional }: { htmlFor?: string; children: React.ReactNode; optional?: boolean }) {
  const Tag = htmlFor ? "label" : "span";
  return (
    <Tag htmlFor={htmlFor} className={LABEL}>
      {children}
      {optional ? <span className="ml-1.5 font-normal text-ink-500">(optional)</span> : null}
    </Tag>
  );
}

/**
 * The line under a control: the error when there is one, otherwise the hint.
 */
export function FieldNote({ id, error, hint }: { id: string; error?: React.ReactNode; hint?: React.ReactNode }) {
  if (error) {
    return (
      <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-danger">
        {error}
      </p>
    );
  }
  return hint ? (
    <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-500">
      {hint}
    </p>
  ) : null;
}

export const describedBy = (id: string, error?: React.ReactNode, hint?: React.ReactNode) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

type FieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: React.ReactNode;
  optional?: boolean;
  type?: string;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email" | "url";
  maxLength?: number;
  autoComplete?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
};

export function Field({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  optional,
  type = "text",
  placeholder,
  inputMode,
  maxLength,
  autoComplete,
  disabled,
  className,
  inputClassName,
}: FieldProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={id} optional={optional}>
        {label}
      </Label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        autoComplete={autoComplete}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={controlClass(error, cn("mt-2", inputClassName))}
      />
      <FieldNote id={id} error={error} hint={hint} />
    </div>
  );
}

export function TextArea({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  optional,
  placeholder,
  rows = 4,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: React.ReactNode;
  optional?: boolean;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id} optional={optional}>
        {label}
      </Label>
      <textarea
        id={id}
        name={id}
        rows={rows}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={controlClass(error, "mt-2 h-auto py-2.5 leading-relaxed")}
      />
      <FieldNote id={id} error={error} hint={hint} />
    </div>
  );
}

export type Option = { value: string; label: string };

export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
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
  options: readonly Option[];
  /** Shown while nothing is picked; never preselects a real option. */
  placeholder?: string;
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
      <Select
        id={id}
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        error={error}
        hint={hint}
        disabled={disabled}
        className="mt-2"
      />
      <FieldNote id={id} error={error} hint={hint} />
    </div>
  );
}

/** A bare native select in the control style, with its own chevron. */
export function Select({
  id,
  value,
  onChange,
  options,
  placeholder,
  error,
  hint,
  disabled,
  className,
  ariaLabel,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly Option[];
  placeholder?: string;
  error?: string;
  hint?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        id={id}
        name={id}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={controlClass(error, cn("appearance-none pr-10", !value && "text-ink-400"))}
      >
        {placeholder !== undefined ? (
          <option value="" disabled={Boolean(value)}>
            {placeholder}
          </option>
        ) : null}
        {options.map((o) => (
          <option key={o.value} value={o.value} className="text-ink-900">
            {o.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-500"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      >
        <path d="m5.5 7.75 4.5 4.5 4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/**
 * A row of mutually exclusive options as buttons (status, score type, work
 * mode). Only the picked option looks selected.
 */
export function Choice<T extends string>({
  id,
  label,
  value,
  onChange,
  options,
  error,
  hint,
  optional,
  className,
}: {
  id: string;
  label: string;
  value: T | "" | undefined;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string; detail?: string }[];
  error?: string;
  hint?: React.ReactNode;
  optional?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label optional={optional}>
        <span id={`${id}-label`}>{label}</span>
      </Label>
      <div
        id={id}
        role="radiogroup"
        tabIndex={-1}
        aria-labelledby={`${id}-label`}
        aria-describedby={describedBy(id, error, hint)}
        aria-invalid={error ? true : undefined}
        className="mt-2 flex flex-wrap gap-2 outline-none"
      >
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              data-field={id}
              onClick={() => onChange(o.value)}
              className={cn(
                "apple-spring apple-pressable inline-flex min-h-11 items-center gap-2 rounded-apple-sm border px-4 text-sm font-medium",
                active
                  ? "border-brand-600 bg-brand-50 text-brand-800 shadow-xs ring-1 ring-brand-600/25"
                  : error
                    ? "border-danger/60 bg-white text-ink-700 hover:bg-ink-50"
                    : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded-full border",
                  active ? "border-brand-600 bg-brand-600" : "border-ink-300 bg-white",
                )}
              >
                {active ? <span className="size-1.5 rounded-full bg-white" /> : null}
              </span>
              <span>{o.label}</span>
              {o.detail ? <span className="text-xs font-normal text-ink-500">{o.detail}</span> : null}
            </button>
          );
        })}
      </div>
      <FieldNote id={id} error={error} hint={hint} />
    </div>
  );
}

/** A titled section inside a step. */
export function Section({
  title,
  hint,
  action,
  children,
  first = false,
}: {
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <section className={cn("space-y-5", !first && "border-t border-ink-200/70 pt-8")}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-xl">
          <h3 className="text-base font-semibold tracking-[-0.01em] text-ink-900">{title}</h3>
          {hint ? <p className="mt-1 text-sm leading-relaxed text-ink-600">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Two (or three) columns from `sm` up, one on phones. Items align to the top. */
export function Grid({ children, cols = 2, className }: { children: React.ReactNode; cols?: 2 | 3; className?: string }) {
  return (
    <div className={cn("grid items-start gap-x-5 gap-y-6", cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2", className)}>
      {children}
    </div>
  );
}

/** A repeated entry (an experience, a course) with its number and a remove button. */
export function EntryCard({
  title,
  onRemove,
  removeLabel,
  children,
}: {
  title: string;
  onRemove?: () => void;
  removeLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-apple-lg border border-ink-200/80 bg-ink-50/50 p-4 sm:p-5">
      <div className="mb-4 flex min-h-11 items-center justify-between gap-3">
        <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-brand-700">{title}</p>
        {onRemove ? <RemoveButton label={removeLabel} onClick={onRemove} /> : null}
      </div>
      <div className="space-y-6">{children}</div>
    </div>
  );
}

export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="apple-spring -mr-2 grid size-11 shrink-0 place-items-center rounded-apple-sm text-ink-500 hover:bg-danger-soft hover:text-danger"
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  );
}

export function AddButton({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}>
      <Plus className="size-4" aria-hidden />
      {children}
    </button>
  );
}

/** A quiet empty state inside a step: what goes here and the one action. */
export function EmptyEntries({ title, body, action }: { title: string; body: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-apple-lg border border-dashed border-ink-200 bg-ink-50/40 px-6 py-9 text-center">
      <p className="text-[0.9375rem] font-semibold text-ink-900">{title}</p>
      <p className="mt-1.5 max-w-sm text-pretty text-sm leading-relaxed text-ink-600">{body}</p>
      <div className="mt-5">{action}</div>
    </div>
  );
}

/** A checkbox with a 44px tap target. */
export function Check({
  id,
  checked,
  onChange,
  children,
  className,
}: {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-ink-800", className)}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-[1.125rem] shrink-0 accent-brand-700"
      />
      <span>{children}</span>
    </label>
  );
}
