"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { COUNTRIES } from "@/lib/data/countries";
import { DISTRICTS, STATES, suggestDistricts, type District } from "@/lib/data/districts";
import { controlClass, FieldError, FieldHint, FieldLabel, NativeSelect } from "@/components/employer/company-fields";
import { cn } from "@/lib/utils";

/**
 * Country / state / city pickers for the employer forms (bug sheet 7, NC r37
 * and r38: dropdowns for every place).
 *
 * Country and state are selects. In India the city is a dropdown of the
 * chosen state's districts that also filters as you type; picking one fills
 * the state. A stored value that is not in a list (legacy rows were typed by
 * hand) is kept as an extra option so it loads and saves unchanged. Outside
 * India state and city are plain text, because the district list is Indian.
 */

type Common = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  /** Kept for older callers; every field now uses one label size. */
  compact?: boolean;
};

function aria(id: string, error?: string, hint?: string) {
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}

function Below({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error) return <FieldError id={`${id}-error`}>{error}</FieldError>;
  if (hint) return <FieldHint id={`${id}-hint`}>{hint}</FieldHint>;
  return null;
}

/** A select over `options`, keeping an unlisted stored value selectable. */
function ListSelect({ options, placeholder, ...p }: Common & { options: string[]; placeholder: string }) {
  const extra = p.value && !options.includes(p.value) ? [p.value] : [];
  return (
    <div>
      <FieldLabel htmlFor={p.id} required={p.required}>
        {p.label}
      </FieldLabel>
      <NativeSelect
        id={p.id}
        name={p.id}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        {...aria(p.id, p.error, p.hint)}
        error={Boolean(p.error)}
        wrapperClassName="mt-2"
      >
        <option value="">{placeholder}</option>
        {extra.map((o) => (
          <option key={`extra-${o}`} value={o}>
            {o}
          </option>
        ))}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </NativeSelect>
      <Below id={p.id} error={p.error} hint={p.hint} />
    </div>
  );
}

function PlainText(p: Common & { placeholder?: string }) {
  return (
    <div>
      <FieldLabel htmlFor={p.id} required={p.required}>
        {p.label}
      </FieldLabel>
      <input
        id={p.id}
        name={p.id}
        type="text"
        value={p.value}
        placeholder={p.placeholder}
        onChange={(e) => p.onChange(e.target.value)}
        {...aria(p.id, p.error, p.hint)}
        className={controlClass(Boolean(p.error), "mt-2")}
      />
      <Below id={p.id} error={p.error} hint={p.hint} />
    </div>
  );
}

export function CountrySelect(p: Common) {
  return <ListSelect {...p} options={COUNTRIES} placeholder="Select country" />;
}

/** State: a select of Indian states in India, free text elsewhere. */
export function StateField({ india, ...p }: Common & { india: boolean }) {
  return india ? (
    <ListSelect {...p} options={STATES} placeholder="Select state" />
  ) : (
    <PlainText {...p} placeholder="State / region" />
  );
}

/**
 * Districts for the city dropdown: those matching `query`, limited to
 * `state` when one is chosen. With a state and no query, the whole state's
 * list (a dropdown, not a guessing game).
 */
export function districtOptions(query: string, state?: string, limit = 8): District[] {
  const q = query.trim().toLowerCase();
  const inState = state && STATES.includes(state);
  if (!q) return inState ? DISTRICTS.filter((d) => d.state === state).sort((a, b) => a.district.localeCompare(b.district)) : [];
  if (!inState) return suggestDistricts(q, limit);
  return DISTRICTS.filter((d) => d.state === state && d.district.toLowerCase().includes(q))
    .sort((a, b) => Number(!a.district.toLowerCase().startsWith(q)) - Number(!b.district.toLowerCase().startsWith(q)))
    .slice(0, Math.max(limit, 12));
}

/**
 * City: in India a combobox over the districts (of the chosen state, if
 * any); picking one also fills the state. Anything typed is still kept.
 */
export function CityField({
  india,
  state,
  onStateChange,
  placeholder,
  ...p
}: Common & {
  india: boolean;
  state?: string;
  onStateChange?: (state: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  if (!india) return <PlainText {...p} placeholder={placeholder ?? "City"} />;

  // While the field holds a picked city, opening it lists the whole state
  // again rather than only the one exact match.
  const picked = DISTRICTS.some((d) => d.district === p.value && (!state || d.state === state));
  const options = open ? districtOptions(picked ? "" : p.value, state) : [];
  const listId = `${p.id}-options`;

  function pick(d: District) {
    p.onChange(d.district);
    if (onStateChange && d.state !== state) onStateChange(d.state);
    setActive(-1);
    setOpen(false);
  }

  return (
    <div className="relative">
      <FieldLabel htmlFor={p.id} required={p.required}>
        {p.label}
      </FieldLabel>
      <div className="relative mt-2">
        <input
          id={p.id}
          name={p.id}
          type="text"
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 && options[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={p.value}
          placeholder={placeholder ?? (state && STATES.includes(state) ? `Pick a city in ${state}` : "Start typing a city")}
          onChange={(e) => {
            p.onChange(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && !open) {
              e.preventDefault();
              setOpen(true);
              return;
            }
            if (options.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % options.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              pick(options[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          {...aria(p.id, p.error, p.hint)}
          className={controlClass(Boolean(p.error), "pr-9")}
        />
        <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
      </div>
      {options.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${p.label} options`}
          className="absolute inset-x-0 z-30 mt-1 max-h-64 overflow-auto rounded-apple-md border border-ink-200 bg-white py-1 shadow-md"
        >
          {options.map((d, i) => (
            <li key={`${d.district}-${d.state}`} id={`${listId}-${i}`} role="option" aria-selected={i === active || d.district === p.value}>
              <button
                type="button"
                tabIndex={-1}
                // onMouseDown so the pick lands before the input's blur.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(d);
                }}
                className={cn(
                  "flex min-h-11 w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-sm text-ink-800 hover:bg-ink-50",
                  (i === active || d.district === p.value) && "bg-brand-50 text-brand-800",
                )}
              >
                <span>{d.district}</span>
                {state && STATES.includes(state) ? null : <span className="text-xs text-ink-500">{d.state}</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Below id={p.id} error={p.error} hint={p.hint} />
    </div>
  );
}
