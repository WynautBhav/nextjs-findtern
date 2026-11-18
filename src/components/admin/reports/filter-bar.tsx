import { Download } from "lucide-react";

import { cn } from "@/lib/utils";
import { FILTER_BUTTON, FILTER_CONTROL, FILTER_SELECT, FilterBar, FilterField } from "../filter-controls.tsx";

export const FIELD = FILTER_CONTROL;

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
  const id = `search-${name}`;
  return (
    <form method="get" role="search" aria-label={label} className={className}>
      <FilterBar name="search-form">
        <FilterField label={label} htmlFor={id} className="w-full min-w-0 sm:w-56">
          <input id={id} type="search" name={name} defaultValue={params[name] ?? ""} placeholder={placeholder} maxLength={80} className={cn(FILTER_CONTROL, "w-full min-w-0")} />
        </FilterField>
        {Object.entries(params)
          .filter(([k, v]) => v && !skip.has(k))
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        {children}
        <FilterField>
          <button type="submit" className={FILTER_BUTTON}>
            Search
          </button>
        </FilterField>
      </FilterBar>
    </form>
  );
}

/** A labelled native select inside a SearchForm (no JS: the Search button applies it). */
export function SelectField({ name, label, value, options }: { name: string; label: string; value: string; options: { value: string; label: string }[] }) {
  const id = `select-${name}`;
  return (
    <FilterField label={label} htmlFor={id}>
      <select id={id} name={name} defaultValue={value} className={FILTER_SELECT}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FilterField>
  );
}

/** The CSV link under a table header: carries the exact filter that is on screen. */
export function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      title={label}
      className={FILTER_BUTTON}
    >
      <Download className="size-4" aria-hidden />
      Export CSV
    </a>
  );
}
