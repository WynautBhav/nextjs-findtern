"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { controlClass, FieldError, FieldHint, FieldLabel } from "@/components/employer/company-fields";
import { arrowKey, limitNote } from "@/components/employer/skill-combobox";
import { cn } from "@/lib/utils";

/**
 * A list of short entries (a project's skills, its preferred cities) typed
 * or picked from suggestions. Enter adds; the button adds; each chip has its
 * own remove button with a name, so a keyboard user can take one out.
 *
 * `min` only shapes the counter copy; the form decides whether to block.
 */
export function ChipInput({
  id,
  label,
  hint,
  placeholder,
  entries,
  min,
  max,
  onAdd,
  onRemove,
  error,
  suggest,
  listOnly,
  required,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  placeholder?: string;
  entries: string[];
  min?: number;
  max: number;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  error?: string;
  /** Vocabulary to offer while typing. Free text is still accepted. */
  suggest?: (query: string) => string[];
  /** Only an entry that is on the `suggest` list can be added; free text is refused. */
  listOnly?: boolean;
  required?: boolean;
}) {
  const [draft, setDraft] = useState("");
  // The suggestion list is showing: set by focus and typing, cleared by Escape or blur.
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const full = entries.length >= max;
  const has = (v: string) => entries.some((e) => e.toLowerCase() === v.toLowerCase());
  // What the current query offers, whether or not the list is showing (the arrow keys reopen it).
  const offered = suggest && !full && draft.trim() ? suggest(draft).filter((o) => !has(o)).slice(0, 8) : [];
  const options = open ? offered : [];
  const listId = `${id}-suggestions`;
  const [notOnList, setNotOnList] = useState("");

  function commit(value?: string) {
    let next = (value ?? draft).trim();
    if (!next || full || has(next)) return;
    if (listOnly && suggest) {
      // The list's own spelling; anything else is refused.
      const match = suggest(next).find((o) => o.toLowerCase() === next.toLowerCase());
      if (!match) {
        setNotOnList(`"${next}" is not on the list. Pick one of the suggestions.`);
        return;
      }
      next = match;
      if (has(next)) return;
    }
    setNotOnList("");
    onAdd(next);
    setDraft("");
    setActive(-1);
  }

  const counter =
    limitNote(entries.length, max, "added") ??
    (min && entries.length < min ? `${entries.length} of at least ${min} added.` : `${entries.length} of ${max} added.`);

  return (
    <div>
      <FieldLabel htmlFor={id} required={required}>
        {label}
      </FieldLabel>
      {hint ? <FieldHint>{hint}</FieldHint> : null}
      <div className="relative mt-2 flex gap-2">
        <input
          id={id}
          value={draft}
          placeholder={full ? `${max} added. Remove one to swap it out.` : placeholder}
          disabled={full}
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 && options[active] ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-count`}
          autoComplete="off"
          onChange={(e) => {
            setDraft(e.target.value);
            setNotOnList("");
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            const arrow = arrowKey(e.key, { open: options.length > 0, count: offered.length, highlight: active });
            if (arrow) {
              // Also reopens a list closed by Escape, with the current query.
              e.preventDefault();
              setOpen(arrow.open);
              setActive(arrow.highlight);
            } else if (e.key === "Enter") {
              // Otherwise Enter submits the surrounding form.
              e.preventDefault();
              commit(active >= 0 ? options[active] : undefined);
            } else if (e.key === "Escape") {
              setOpen(false);
              setActive(-1);
            }
          }}
          className={controlClass(Boolean(error), "min-w-0 flex-1")}
        />
        <button
          type="button"
          onClick={() => commit()}
          disabled={full || !draft.trim()}
          className={buttonClass({ variant: "outline", size: "md", className: "h-11 shrink-0 px-4 text-sm" })}
        >
          <Plus className="size-4" aria-hidden />
          Add
        </button>
        {options.length > 0 ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={`${label} suggestions`}
            // The scrollbar and padding are part of the list: a press there must not blur the input and close it.
            onMouseDown={(e) => e.preventDefault()}
            className="absolute inset-x-0 top-full z-30 mt-1 max-h-60 overflow-auto rounded-apple-md border border-ink-200 bg-white py-1 shadow-md"
          >
            {options.map((option, i) => (
              <li
                key={option}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // onMouseDown so the pick lands before the input's blur.
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(option);
                }}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center px-3.5 py-2 text-left text-sm text-ink-800 hover:bg-ink-50",
                  i === active && "bg-brand-50 text-brand-800",
                )}
              >
                {option}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {entries.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={label}>
          {entries.map((entry) => (
            <li
              key={entry}
              className="inline-flex items-center gap-0.5 rounded-full bg-brand-50 py-0.5 pl-3 pr-0.5 text-sm font-medium text-brand-800 ring-1 ring-inset ring-brand-200/70"
            >
              {entry}
              <button
                type="button"
                onClick={() => onRemove(entry)}
                aria-label={`Remove ${entry}`}
                className="apple-spring grid size-8 shrink-0 place-items-center rounded-full text-brand-600 hover:bg-brand-100 hover:text-brand-900 touch:size-11"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error || notOnList ? (
        <FieldError id={`${id}-error`}>{error || notOnList}</FieldError>
      ) : (
        <p id={`${id}-count`} aria-live="polite" className="nums mt-1.5 text-xs text-ink-600">
          {counter}
        </p>
      )}
    </div>
  );
}
