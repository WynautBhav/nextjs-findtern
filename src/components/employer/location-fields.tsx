"use client";

import { useState } from "react";

import { COUNTRIES } from "@/lib/data/countries";
import { DISTRICTS, STATES, suggestDistricts, type District } from "@/lib/data/districts";

/**
 * Country / state / city pickers for the employer forms (QA rows 37, 38).
 *
 * Country and state are selects; the city is a text field with district
 * suggestions. Free text stays possible everywhere it has to: a stored value
 * that is not in a list (legacy rows were typed by hand) is kept as an extra
 * option so it loads and saves unchanged, and outside India state and city
 * are plain text because the district list is Indian only.
 */

const CONTROL =
  "apple-spring w-full min-h-11 rounded-[10px] border bg-white px-3.5 text-[14px] text-ink-900 outline-none placeholder:text-ink-400 focus:ring-2";
const OK = "border-ink-200 focus:border-brand-500 focus:ring-brand-500/20";
const BAD = "border-danger focus:border-danger focus:ring-danger/20";

type Common = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  /** Smaller label, as in the project drawer. */
  compact?: boolean;
};

function Label({ id, label, required, compact }: Pick<Common, "id" | "label" | "required" | "compact">) {
  return (
    <label
      htmlFor={id}
      className={compact ? "block text-xs font-semibold text-ink-800" : "block text-sm font-medium text-ink-800"}
    >
      {label}
      {required ? <span aria-hidden className="text-danger"> *</span> : null}
    </label>
  );
}

function ErrorText({ id, error }: { id: string; error?: string }) {
  return error ? (
    <p id={`${id}-error`} className="mt-1.5 text-xs text-danger">
      {error}
    </p>
  ) : null;
}

function control(error: string | undefined, compact: boolean | undefined) {
  return `${CONTROL} ${compact ? "mt-1.5" : "mt-2"} ${error ? BAD : OK}`;
}

function aria(id: string, error?: string) {
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
  } as const;
}

/** A select over `options`, keeping an unlisted stored value selectable. */
function ListSelect({ options, placeholder, ...p }: Common & { options: string[]; placeholder: string }) {
  const extra = p.value && !options.includes(p.value) ? [p.value] : [];
  return (
    <div>
      <Label {...p} />
      <select
        id={p.id}
        name={p.id}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        {...aria(p.id, p.error)}
        className={control(p.error, p.compact)}
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
      </select>
      <ErrorText id={p.id} error={p.error} />
    </div>
  );
}

function PlainText(p: Common & { placeholder?: string }) {
  return (
    <div>
      <Label {...p} />
      <input
        id={p.id}
        name={p.id}
        type="text"
        value={p.value}
        placeholder={p.placeholder}
        onChange={(e) => p.onChange(e.target.value)}
        {...aria(p.id, p.error)}
        className={control(p.error, p.compact)}
      />
      <ErrorText id={p.id} error={p.error} />
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

/** Districts matching `query`, limited to `state` when one is chosen. */
export function districtOptions(query: string, state?: string, limit = 8): District[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  if (!state || !STATES.includes(state)) return suggestDistricts(q, limit);
  return DISTRICTS.filter((d) => d.state === state && d.district.toLowerCase().startsWith(q)).slice(0, limit);
}

/**
 * City: in India a text field that suggests districts (of the chosen state,
 * if any); picking one also fills the state. Anything typed is still kept.
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
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  if (!india) return <PlainText {...p} placeholder={placeholder ?? "City"} />;

  const options = focused ? districtOptions(p.value, state).filter((d) => d.district !== p.value) : [];
  const listId = `${p.id}-options`;

  function pick(d: District) {
    p.onChange(d.district);
    if (onStateChange && d.state !== state) onStateChange(d.state);
    setActive(-1);
    setFocused(false);
  }

  return (
    <div className="relative">
      <Label {...p} />
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
        placeholder={placeholder ?? "Start typing a city"}
        onChange={(e) => {
          p.onChange(e.target.value);
          setActive(-1);
          setFocused(true);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onKeyDown={(e) => {
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
            setFocused(false);
          }
        }}
        {...aria(p.id, p.error)}
        className={control(p.error, p.compact)}
      />
      {options.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 z-20 mt-1 max-h-64 overflow-auto rounded-[10px] border border-ink-200 bg-white shadow-md"
        >
          {options.map((d, i) => (
            <li key={`${d.district}-${d.state}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                tabIndex={-1}
                // onMouseDown so the pick lands before the input's blur.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(d);
                }}
                className={`apple-spring flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-ink-800 hover:bg-ink-50 ${
                  i === active ? "bg-ink-50" : ""
                }`}
              >
                <span>{d.district}</span>
                <span className="text-xs text-text-subtle">{d.state}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <ErrorText id={p.id} error={p.error} />
    </div>
  );
}
