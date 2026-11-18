import { Download } from "lucide-react";

import { cn } from "@/lib/utils";

export const FIELD =
  "h-10 rounded-full bg-[color:var(--admin-panel-2)] px-4 text-base sm:text-sm text-foreground placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11";

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
      <button type="submit" className="apple-spring inline-flex h-10 items-center rounded-full bg-[color:var(--admin-panel-2)] px-4 text-sm font-medium text-foreground hover:bg-[color:var(--admin-bar-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11">
        Search
      </button>
    </form>
  );
}

/** A labelled native select inside a SearchForm (no JS: the Search button applies it). */
export function SelectField({ name, label, value, options }: { name: string; label: string; value: string; options: { value: string; label: string }[] }) {
  return (
    <label className="flex items-center gap-2 text-sm text-text-subtle">
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

/** The CSV link under a table header: carries the exact filter that is on screen. */
export function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      aria-label={label}
      className="apple-spring inline-flex h-10 items-center gap-1.5 rounded-full bg-[color:var(--admin-panel-2)] px-4 text-sm font-medium text-foreground hover:bg-[color:var(--admin-bar-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11"
    >
      <Download className="size-4" aria-hidden />
      Export CSV
    </a>
  );
}
