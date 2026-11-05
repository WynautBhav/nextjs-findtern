"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import {
  FieldNote,
  Label,
  controlClass,
} from "@/components/intern/onboarding/fields";
import { buttonClass } from "@/components/ui/button";
import { SUGGESTED_SKILLS, didYouMean, suggestSkills } from "@/lib/data/skills";
import { MAX_SKILLS, MIN_SKILLS } from "@/lib/onboarding";

const FIRST_PICKS = 18;

/** Search-and-pick skills list shared by intern onboarding and the admin editor. */
export function SkillPicker({
  id,
  label,
  value,
  onChange,
  error,
  max = MAX_SKILLS,
  min = MIN_SKILLS,
}: {
  id: string;
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  error?: string;
  max?: number;
  min?: number;
}) {
  const [draft, setDraft] = useState("");
  const [allPicks, setAllPicks] = useState(false);
  const has = (name: string) =>
    value.some((s) => s.toLowerCase() === name.trim().toLowerCase());
  const full = value.length >= max;

  function add(name: string) {
    const clean = name.trim();
    // Case-insensitive, as legacy (INT-30). No level is asked for: the server
    // stores every skill at the default one.
    if (!clean || has(clean) || full) return;
    onChange([...value, clean]);
    setDraft("");
  }
  function remove(name: string) {
    onChange(value.filter((s) => s !== name));
  }

  const matches = draft.trim()
    ? suggestSkills(draft, 6).filter((s) => !has(s))
    : [];
  const suggestion = draft.trim() ? didYouMean(draft, value) : null;
  const picks = SUGGESTED_SKILLS.filter((s) => !has(s));
  const shownPicks = allPicks ? picks : picks.slice(0, FIRST_PICKS);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-baseline justify-between gap-4">
          <Label htmlFor={id}>{label}</Label>
          <p className="nums text-sm text-ink-600" aria-live="polite">
            <span className="font-semibold text-ink-900">{value.length}</span>{" "}
            of {max}
            {value.length < min ? (
              <span className="text-text-subtle"> · at least {min}</span>
            ) : null}
          </p>
        </div>
        <div className="mt-2 flex gap-2.5">
          <input
            id={id}
            // Leaving the box is not "done": the count shows after Continue, so
            // no message jumps in under a suggestion being tapped.
            data-field="skills-draft"
            value={draft}
            maxLength={80}
            disabled={full}
            autoComplete="off"
            placeholder={
              full
                ? `You have ${max} skills - remove one to add another`
                : "Type a skill, e.g. React, Sales, Excel"
            }
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(draft);
              }
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className={controlClass(error)}
          />
          <button
            type="button"
            disabled={!draft.trim() || full}
            onClick={() => add(draft)}
            className={buttonClass({
              variant: "primary",
              size: "md",
              className: "shrink-0 px-4",
            })}
          >
            <Plus className="size-4" aria-hidden />
            Add
          </button>
        </div>
        <FieldNote id={id} error={error} />

        {suggestion ? (
          <p className="mt-2 text-sm text-ink-700">
            Did you mean{" "}
            <button
              type="button"
              onClick={() => add(suggestion)}
              className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline underline-offset-4 sm:min-h-0"
            >
              {suggestion}
            </button>
            ?
          </p>
        ) : null}
        {matches.length > 0 ? (
          <ul
            aria-label="Matching skills"
            className="mt-3 flex flex-wrap gap-2"
          >
            {matches.map((s) => (
              <li key={s}>
                <SkillChip onClick={() => add(s)}>{s}</SkillChip>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {value.length > 0 ? (
        <div>
          <p className="text-sm font-medium text-ink-800">Your skills</p>
          <ol className="mt-3 divide-y divide-ink-200/70 overflow-hidden rounded-apple-lg border border-ink-200/80 bg-white">
            {value.map((skill, i) => (
              <li key={skill} className="flex items-center gap-x-2 px-4 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="nums grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                    {i + 1}
                  </span>
                  <span className="min-w-0 text-[0.9375rem] font-medium text-ink-900 [overflow-wrap:anywhere]">
                    {skill}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => remove(skill)}
                  aria-label={`Remove ${skill}`}
                  className="apple-spring grid size-11 shrink-0 place-items-center rounded-apple-sm text-text-subtle hover:bg-danger-soft hover:text-danger"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {!full ? (
        <div>
          <p className="text-sm font-medium text-ink-800">Popular picks</p>
          <p className="mt-1 text-xs text-text-subtle">
            Technical and non-technical. Tap to add.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {shownPicks.map((s) => (
              <li key={s}>
                <SkillChip onClick={() => add(s)}>{s}</SkillChip>
              </li>
            ))}
            {picks.length > FIRST_PICKS ? (
              <li>
                <button
                  type="button"
                  onClick={() => setAllPicks((v) => !v)}
                  aria-expanded={allPicks}
                  className="inline-flex min-h-9 items-center px-2 text-sm font-medium text-brand-700 touch:min-h-11 underline-offset-4 hover:underline"
                >
                  {allPicks
                    ? "Show fewer"
                    : `${picks.length - FIRST_PICKS} more`}
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function SkillChip({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="apple-spring apple-pressable inline-flex min-h-9 items-center gap-1.5 rounded-full touch:min-h-11 border border-ink-200 bg-white px-3.5 text-sm text-ink-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800"
    >
      <Plus className="size-3.5 text-text-subtle" aria-hidden />
      {children}
    </button>
  );
}
