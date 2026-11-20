"use client";

import { useId, useRef, useState } from "react";
import { Languages, X } from "lucide-react";

import { PillRadios } from "@/components/employer/candidates/filter-parts";
import { FILTER_LANGUAGES, LANGUAGE_FILTER_LEVELS, parseLanguage, type LanguageLevelFilter } from "@/lib/language-filter";
import { cn } from "@/lib/utils";

/**
 * Language, typed with suggestions (a native datalist: keyboard and screen readers for free), then, once a listed
 * language is chosen, the least level wanted: Native, Professional or Basic. A listed language applies as soon as it
 * is complete; clearing the box applies too. Plain form fields (`lang`, `ll`), so the rest of the form travels with them.
 */
export function LanguageFilterField({ language, level }: { language: string; level: LanguageLevelFilter }) {
  const listId = useId();
  const box = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(language);
  const [applied, setApplied] = useState(language);
  const chosen = parseLanguage(value);

  function apply(next: string) {
    if (next === applied) return;
    setApplied(next);
    // Submit after React has written the new value into the field.
    window.setTimeout(() => box.current?.form?.requestSubmit(), 0);
  }

  return (
    <div>
      <label htmlFor="filter-lang" className="sr-only">
        Language
      </label>
      <div className="relative mt-2">
        <Languages className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-600" aria-hidden />
        <input
          ref={box}
          id="filter-lang"
          name="lang"
          type="text"
          list={listId}
          value={value}
          autoComplete="off"
          placeholder="Type a language"
          onChange={(e) => {
            const hit = parseLanguage(e.target.value);
            // A complete listed name takes its listed spelling ("english" -> "English") and applies.
            setValue(hit || e.target.value);
            if (hit) apply(hit);
          }}
          onBlur={() => {
            if (!value.trim()) apply("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply(chosen);
            }
          }}
          className={cn(
            "min-h-11 w-full rounded-apple-sm border border-ink-200 bg-white py-2 pl-10 text-base text-ink-900 outline-none transition-colors placeholder:text-text-subtle hover:border-ink-300 focus:border-brand-800 focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 focus:ring-offset-white md:text-sm",
            value ? "pr-11" : "pr-3",
          )}
        />
        <datalist id={listId}>
          {FILTER_LANGUAGES.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
        {value ? (
          <button
            type="button"
            onClick={() => {
              setValue("");
              apply("");
              box.current?.focus();
            }}
            aria-label={`Clear language (${value})`}
            className="apple-spring absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-ink-500 outline-none hover:bg-ink-100 hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500 touch:size-11"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
      {chosen ? (
        <fieldset className="mt-3">
          <legend className="mb-2 text-xs font-semibold text-ink-700">{chosen} level</legend>
          <PillRadios name="ll" value={level} options={[{ value: "", label: "Any level" }, ...LANGUAGE_FILTER_LEVELS.map((l) => ({ value: l.value, label: l.label }))]} />
        </fieldset>
      ) : null}
    </div>
  );
}
