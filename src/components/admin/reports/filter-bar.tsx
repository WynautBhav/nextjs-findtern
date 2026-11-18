import { Download } from "lucide-react";

import { RP_BUTTON, RP_FIELD } from "@/components/admin/money/rp-parts";
import { cn } from "@/lib/utils";

export const FIELD = RP_FIELD;

/**
 * A plain GET search form (works with no JS, Enter submits): every other query key is carried as a
 * hidden input, the table's page number is dropped, and `extra` renders more controls inside the form.
 */
export function SearchForm({
  params,
  name,
  label,
  placeholder,
  drop = [],
  className,
  children,
}: {
  params: Record<string, string>;
  name: string;
  label: string;
  placeholder: string;
  /** Other keys to reset on submit (the table's page number). */
  drop?: string[];
  className?: string;
  children?: React.ReactNode;
}) {
  const skip = new Set([name, ...drop]);
  return (
    <form method="get" role="search" aria-label={label} className={cn("flex flex-wrap items-center gap-2", className)}>
      <input type="search" name={name} defaultValue={params[name] ?? ""} placeholder={placeholder} aria-label={label} maxLength={80} className={cn(FIELD, "w-full min-w-0 sm:w-56")} />
      {Object.entries(params)
        .filter(([k, v]) => v && !skip.has(k))
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      {children}
      <button type="submit" className={RP_BUTTON}>
        Search
      </button>
    </form>
  );
}

/** A labelled native select inside a SearchForm (no JS: the Search button applies it). */
export function SelectField({ name, label, value, options }: { name: string; label: string; value: string; options: { value: string; label: string }[] }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-700">
      <span className="sr-only sm:not-sr-only">{label}</span>
      <select name={name} defaultValue={value} aria-label={label} className={cn(FIELD, "pr-8")}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The CSV link above a table: carries the exact filter that is on screen. */
export function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} aria-label={label} className={RP_BUTTON}>
      <Download className="size-4" aria-hidden />
      Export CSV
    </a>
  );
}
