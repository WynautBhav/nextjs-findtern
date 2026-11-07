import { cn } from "@/lib/utils";
import { DmyDateInput } from "@/components/app/dmy-date-input";
import { fieldClass } from "@/components/employer/ui-tokens";

export function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  /** Kept for callers; every step is its own tile now. */
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rise grid gap-5 rounded-[24px] bg-white p-6 shadow-tile sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:gap-x-4 sm:p-8"
      style={{ ["--i" as string]: n }}
    >
      <span aria-hidden className="nums hidden text-5xl font-light leading-none tracking-[-0.05em] text-brand-600/70 sm:block">
        {n}
      </span>
      <div className="min-w-0 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
          {hint ? <p className="mt-0.5 text-sm text-text-subtle">{hint}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

/* ── Form primitives ────────────────────────────────────────────────────── */

const fieldCls = (error?: boolean, extra?: string) =>
  cn(fieldClass, "mt-2 px-3.5", error && "border-danger hover:border-danger focus-visible:border-danger focus-visible:ring-danger/20", extra);

export function Field({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  type = "text",
  placeholder,
  inputMode,
  min,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  type?: string;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "decimal" | "email" | "url";
  min?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-text-subtle">{hint}</p> : null}
      {type === "date" ? (
        // DD/MM/YYYY, not the browser's native date control (QA-126).
        <DmyDateInput
          id={id}
          name={id}
          value={value}
          min={min}
          onChange={onChange}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={fieldCls(Boolean(error))}
        />
      ) : (
        <input
          id={id}
          name={id}
          type={type}
          value={value}
          placeholder={placeholder}
          inputMode={inputMode}
          min={min}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={fieldCls(Boolean(error))}
        />
      )}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A value owned by the project, shown but not editable from here. */
export function ReadOnlyField({
  id,
  label,
  value,
  hint,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  hint?: string;
  /** A figure: if a phone ever opens a keyboard on it, the numeric one (QA-126). */
  inputMode?: "numeric" | "decimal";
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-text-subtle">{hint}</p> : null}
      <input
        id={id}
        name={id}
        value={value}
        readOnly
        inputMode={inputMode}
        className={fieldCls(false, "cursor-not-allowed bg-ink-50 text-ink-600")}
      />
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
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-text-subtle">{hint}</p> : null}
      <select
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={fieldCls(Boolean(error))}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
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
  rows = 4,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-text-subtle">{hint}</p> : null}
      <textarea
        id={id}
        name={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={fieldCls(Boolean(error), "py-2.5 leading-relaxed")}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
