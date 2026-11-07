import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/** One collapsible group of the filter rail. CSS-only (<details>), so it works without JS. */
export function FilterSection({
  title,
  summary,
  open,
  children,
}: {
  title: string;
  /** What is set, shown quietly on the right ("Any", "3 set"). */
  summary?: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open || undefined} className="group border-t border-ink-100 first:border-t-0">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-apple-sm text-sm font-medium text-ink-900 outline-none focus-visible:ring-[3px] focus-visible:ring-brand-600/30 [&::-webkit-details-marker]:hidden">
        <span className="flex-1">{title}</span>
        {summary ? <span className="text-xs font-normal text-text-subtle group-open:hidden">{summary}</span> : null}
        <ChevronDown className="size-4 text-text-subtle transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <div className="details-reveal pb-4">{children}</div>
    </details>
  );
}

/** A native checkbox drawn as a switch. Unchecked sends nothing unless a hidden twin precedes it. */
export function SwitchField({
  name,
  value,
  defaultChecked,
  label,
  hint,
  zeroValue,
}: {
  name: string;
  value: string;
  defaultChecked: boolean;
  label: string;
  hint?: string;
  /** Sent when unchecked (a hidden input before the checkbox). */
  zeroValue?: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-1 text-sm text-ink-800">
      <span className="min-w-0">
        <span className="block font-medium text-ink-900">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-text-subtle">{hint}</span> : null}
      </span>
      {zeroValue !== undefined ? <input type="hidden" name={name} value={zeroValue} /> : null}
      <input type="checkbox" role="switch" name={name} value={value} defaultChecked={defaultChecked} className="peer sr-only" />
      <span
        aria-hidden
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full bg-ink-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform",
          "peer-checked:bg-brand-700 peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600 motion-reduce:transition-none motion-reduce:after:transition-none",
        )}
      />
    </label>
  );
}

/** Radio pills sharing one name: the price bands. The empty value means "any". */
export function PillRadios({
  name,
  value,
  options,
}: {
  name: string;
  value: string;
  options: { value: string; label: string; sub?: string }[];
}) {
  return (
    <div role="radiogroup" className="grid grid-cols-2 gap-2">
      {options.map((o) => (
        <label key={o.value || "any"} className="relative cursor-pointer">
          <input type="radio" name={name} value={o.value} defaultChecked={value === o.value} className="peer sr-only" />
          <span
            className={cn(
              "apple-spring flex min-h-11 flex-col justify-center rounded-apple-sm bg-ink-50 px-3 py-1.5 text-sm font-medium text-ink-800 ring-1 ring-inset ring-ink-200",
              "hover:bg-ink-100 peer-checked:bg-brand-700 peer-checked:text-white peer-checked:ring-brand-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600",
              "peer-checked:[&_.sub]:text-white/75",
            )}
          >
            <span className="nums">{o.label}</span>
            {o.sub ? <span className="sub text-xs font-normal text-text-subtle">{o.sub}</span> : null}
          </span>
        </label>
      ))}
    </div>
  );
}
