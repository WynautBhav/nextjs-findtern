"use client";

import { useId, useRef, useState } from "react";
import { Languages, Plus, X } from "lucide-react";

import { FILTER_LANGUAGES, LANGUAGE_FILTER_LEVELS, MAX_LANGUAGES, serializeLanguages, type LanguageLevelFilter, type LanguageWant } from "@/lib/language-filter";
import { cn } from "@/lib/utils";

const LEVEL_OPTIONS: { value: LanguageLevelFilter; label: string }[] = [{ value: "", label: "Any level" }, ...LANGUAGE_FILTER_LEVELS];

/**
 * Languages wanted, each with its least level (Native, Professional, Basic). One row per language, then "Add another
 * language": a typed box with a suggestion list (the City box's pattern). The whole list travels in ONE hidden field (`lang`);
 * the level radios are kept out of the form (`form=""`) so only that field reaches the URL. Their change still
 * bubbles to the form, which applies it like any other filter; adding or removing a language submits the form.
 */
export function LanguageFilterField({ initial }: { initial: LanguageWant[] }) {
  const listId = useId();
  const hidden = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLInputElement>(null);
  const [wants, setWants] = useState<LanguageWant[]>(initial);
  const [adding, setAdding] = useState(initial.length === 0);
  const [draft, setDraft] = useState("");
  const full = wants.length >= MAX_LANGUAGES;
  const free = FILTER_LANGUAGES.filter((l) => !wants.some((w) => w.language === l));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const typed = draft.trim().toLowerCase();
  // Names that start with what is typed first, then names that contain it.
  const options = open
    ? [...free.filter((l) => l.toLowerCase().startsWith(typed)), ...(typed ? free.filter((l) => !l.toLowerCase().startsWith(typed) && l.toLowerCase().includes(typed)) : [])].slice(0, 8)
    : [];

  function submitSoon() {
    // After React has written the new list into the hidden field.
    window.setTimeout(() => hidden.current?.form?.requestSubmit(), 0);
  }
  function add(language: string) {
    if (!language || full || wants.some((w) => w.language === language)) return;
    setWants([...wants, { language, level: "" }]);
    setDraft("");
    setOpen(false);
    setActive(-1);
    setAdding(false);
    submitSoon();
  }

  return (
    <div>
      <input ref={hidden} type="hidden" name="lang" value={serializeLanguages(wants)} />
      {wants.length > 0 ? (
        <ul className="mt-2 space-y-3">
          {wants.map((want) => (
            <li key={want.language} className="rounded-apple-sm border border-ink-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                  <Languages className="size-4 text-ink-600" aria-hidden />
                  {want.language}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setWants(wants.filter((w) => w !== want));
                    submitSoon();
                  }}
                  aria-label={`Remove ${want.language}`}
                  className="apple-spring -mr-1.5 grid size-9 place-items-center rounded-full text-ink-500 outline-none hover:bg-ink-100 hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500 touch:size-11"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
              <fieldset className="mt-2">
                <legend className="sr-only">{want.language} level</legend>
                <div className="grid grid-cols-2 gap-1.5">
                  {LEVEL_OPTIONS.map((o) => (
                    <label key={o.value || "any"} className="relative cursor-pointer">
                      <input
                        type="radio"
                        form=""
                        name={`lang-level-${want.language}`}
                        value={o.value}
                        checked={want.level === o.value}
                        onChange={() => setWants(wants.map((w) => (w === want ? { ...w, level: o.value } : w)))}
                        className="peer sr-only"
                      />
                      <span
                        className={cn(
                          "apple-spring flex min-h-9 items-center justify-center rounded-lg bg-ink-50 px-2 text-[13px] font-medium text-ink-800 ring-1 ring-inset ring-ink-200 touch:min-h-11",
                          "hover:bg-ink-100 peer-checked:bg-brand-700 peer-checked:text-white peer-checked:ring-brand-700 peer-checked:hover:bg-brand-800 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600",
                        )}
                      >
                        {o.label}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </li>
          ))}
        </ul>
      ) : null}

      {full ? (
        <p className="mt-2 text-xs text-text-subtle">Up to {MAX_LANGUAGES} languages.</p>
      ) : adding ? (
        <div className="relative mt-2">
          <label htmlFor="filter-lang" className="sr-only">
            {wants.length > 0 ? "Add another language" : "Language"}
          </label>
          <Languages className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-600" aria-hidden />
          <input
            ref={box}
            id="filter-lang"
            type="text"
            form=""
            role="combobox"
            aria-expanded={options.length > 0}
            aria-controls={options.length > 0 ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 && options[active] ? `${listId}-${active}` : undefined}
            value={draft}
            autoFocus={wants.length > 0}
            autoComplete="off"
            placeholder="Type a language"
            onChange={(e) => {
              setDraft(e.target.value);
              setActive(-1);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if ((e.key === "ArrowDown" || e.key === "ArrowUp") && options.length > 0) {
                e.preventDefault();
                const step = e.key === "ArrowDown" ? 1 : -1;
                setActive((i) => (i < 0 && step < 0 ? options.length - 1 : (i + step + options.length) % options.length));
              } else if (e.key === "Enter") {
                e.preventDefault();
                add(options[active] ?? options[0] ?? "");
              } else if (e.key === "Escape") {
                setOpen(false);
                if (!draft && wants.length > 0) setAdding(false);
              }
            }}
            onBlur={() =>
              window.setTimeout(() => {
                setOpen(false);
                if (!draft.trim() && wants.length > 0) setAdding(false);
              }, 120)
            }
            className="min-h-11 w-full rounded-apple-sm border border-ink-200 bg-white py-2 pl-10 pr-3 text-base text-ink-900 outline-none transition-colors placeholder:text-text-subtle hover:border-ink-300 focus:border-brand-800 focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 focus:ring-offset-white md:text-sm"
          />
          {options.length > 0 ? (
            <ul
              id={listId}
              role="listbox"
              aria-label="Language suggestions"
              // A press on the list must not blur the box and close it.
              onMouseDown={(e) => e.preventDefault()}
              className="absolute left-0 z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-apple-sm border border-ink-200 bg-white py-1 shadow-sm"
            >
              {options.map((l, i) => (
                <li
                  key={l}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onClick={() => add(l)}
                  className={cn("apple-spring flex min-h-11 cursor-pointer items-center px-3 text-sm text-ink-800 hover:bg-ink-50", i === active && "bg-brand-50 text-brand-800")}
                >
                  {l}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-brand-800 outline-none hover:text-brand-900 hover:underline focus-visible:ring-2 focus-visible:ring-brand-500 touch:min-h-11"
        >
          <Plus className="size-4" aria-hidden />
          Add another language
        </button>
      )}
    </div>
  );
}
