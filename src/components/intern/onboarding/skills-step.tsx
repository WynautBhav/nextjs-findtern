"use client";

import { useState } from "react";
import { Lock, Plus, TriangleAlert, X } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { SUGGESTED_SKILLS, didYouMean, suggestSkills } from "@/lib/data/skills";
import { MAX_SKILLS, MIN_SKILLS, type SkillWithRating } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

import { FieldNote, Label, controlClass } from "./fields";
import type { StepProps } from "./types";

const RATINGS: SkillWithRating["rating"][] = ["Beginner", "Intermediate", "Advanced"];
const FIRST_PICKS = 18;

export function SkillsStep({ values, update, errors, skillsLocked }: StepProps) {
  const [draft, setDraft] = useState("");
  const [allPicks, setAllPicks] = useState(false);
  const skills = values.skills ?? [];
  const rated = values.skillsWithRatings ?? [];
  const has = (name: string) => skills.some((s) => s.toLowerCase() === name.trim().toLowerCase());
  const ratingOf = (name: string) => rated.find((r) => r.name.toLowerCase() === name.toLowerCase())?.rating ?? "Beginner";

  // Legacy rule: once rated (or an AI interview is open) the interview is
  // built on these skills, so they stop being editable. The API enforces it.
  if (skillsLocked) {
    return (
      <div className="space-y-5">
        <div className="flex gap-3 rounded-apple-lg border border-ink-200/80 bg-ink-50 p-4">
          <Lock className="mt-0.5 size-4 shrink-0 text-text-subtle" aria-hidden />
          <p className="text-sm leading-relaxed text-ink-700">
            Your skills are locked because your AI interview is based on them. If one is wrong, write to{" "}
            <a href="mailto:communicate@findtern.in" className="font-medium text-brand-700 underline-offset-4 hover:underline">
              communicate@findtern.in
            </a>
            .
          </p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {skills.map((s) => (
            <li key={s}>
              <Pill tone="neutral">
                {s} · {ratingOf(s)}
              </Pill>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const full = skills.length >= MAX_SKILLS;

  function add(name: string) {
    const clean = name.trim();
    // Case-insensitive, as legacy (INT-30); new skills start at Beginner (legacy default).
    if (!clean || has(clean) || full) return;
    update("skills", [...skills, clean]);
    update("skillsWithRatings", [...rated.filter((r) => r.name.toLowerCase() !== clean.toLowerCase()), { name: clean, rating: "Beginner" }]);
    setDraft("");
  }
  function remove(name: string) {
    update("skills", skills.filter((s) => s !== name));
    update("skillsWithRatings", rated.filter((r) => r.name.toLowerCase() !== name.toLowerCase()));
  }
  function rate(name: string, rating: SkillWithRating["rating"]) {
    const exists = rated.some((r) => r.name.toLowerCase() === name.toLowerCase());
    update(
      "skillsWithRatings",
      exists ? rated.map((r) => (r.name.toLowerCase() === name.toLowerCase() ? { ...r, rating } : r)) : [...rated, { name, rating }],
    );
  }

  const matches = draft.trim() ? suggestSkills(draft, 6).filter((s) => !has(s)) : [];
  const suggestion = draft.trim() ? didYouMean(draft, skills) : null;
  const picks = SUGGESTED_SKILLS.filter((s) => !has(s));
  const shownPicks = allPicks ? picks : picks.slice(0, FIRST_PICKS);

  return (
    <div className="space-y-8">
      {/* The legacy skills notice (bug sheet 21 Oct), word for word. */}
      <div className="flex gap-3 rounded-apple-lg border border-accent-300/60 bg-accent-100/50 p-4 sm:p-5">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-accent-700" aria-hidden />
        <div className="text-sm leading-relaxed text-ink-800">
          <p className="font-semibold text-ink-900">Important note</p>
          <p className="mt-1 text-pretty">
            The self-evaluated skill ratings you provide will directly influence the difficulty level of your AI interview. Giving honest and
            accurate ratings will ensure you are assessed fairly, helping you achieve a better score and improving your chances of being
            shortlisted by employers.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-pretty">
            <li>Your AI interview questions are based on the skills you provide, allowing employers to assess you accurately.</li>
            <li>
              Once submitted, skills cannot be changed as this impacts your vetting status. To update skills after completion of your AI
              Interview, please contact Findtern Support; note that additional charges and terms apply.
            </li>
          </ol>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-4">
          <Label htmlFor="skills">Your key skills</Label>
          <p className="nums text-sm text-ink-600" aria-live="polite">
            <span className="font-semibold text-ink-900">{skills.length}</span> of {MAX_SKILLS}
            {skills.length < MIN_SKILLS ? <span className="text-text-subtle"> · at least {MIN_SKILLS}</span> : null}
          </p>
        </div>
        <div className="mt-2 flex gap-2.5">
          <input
            id="skills"
            // Leaving the box is not "done": the count shows after Continue, so
            // no message jumps in under a suggestion being tapped.
            data-field="skills-draft"
            value={draft}
            disabled={full}
            autoComplete="off"
            placeholder={full ? `You have ${MAX_SKILLS} skills - remove one to add another` : "Type a skill, e.g. React, Sales, Excel"}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(draft);
              }
            }}
            aria-invalid={errors.skills ? true : undefined}
            aria-describedby={errors.skills ? "skills-error" : undefined}
            className={controlClass(errors.skills)}
          />
          <button type="button" disabled={!draft.trim() || full} onClick={() => add(draft)} className={buttonClass({ variant: "primary", size: "md", className: "shrink-0 px-4" })}>
            <Plus className="size-4" aria-hidden />
            Add
          </button>
        </div>
        <FieldNote id="skills" error={errors.skills} />

        {suggestion ? (
          <p className="mt-2 text-sm text-ink-700">
            Did you mean{" "}
            <button type="button" onClick={() => add(suggestion)} className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline underline-offset-4 sm:min-h-0">
              {suggestion}
            </button>
            ?
          </p>
        ) : null}
        {matches.length > 0 ? (
          <ul aria-label="Matching skills" className="mt-3 flex flex-wrap gap-2">
            {matches.map((s) => (
              <li key={s}>
                <SkillChip onClick={() => add(s)}>{s}</SkillChip>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {skills.length > 0 ? (
        <div>
          <p className="text-sm font-medium text-ink-800">Rate each skill</p>
          <ol className="mt-3 divide-y divide-ink-200/70 overflow-hidden rounded-apple-lg border border-ink-200/80 bg-white">
            {skills.map((skill, i) => (
              <li key={skill} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <div className="order-1 flex min-w-0 items-center gap-3">
                  <span className="nums grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{i + 1}</span>
                  <span className="truncate text-[0.9375rem] font-medium text-ink-900">{skill}</span>
                </div>
                <div className="order-3 col-span-2 flex sm:order-2 sm:col-span-1">
                  <div role="radiogroup" aria-label={`How good are you at ${skill}?`} className="flex flex-1 rounded-apple-sm bg-ink-100 p-1 sm:flex-none">
                    {RATINGS.map((r) => {
                      const on = ratingOf(skill) === r;
                      return (
                        <button
                          key={r}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => rate(skill, r)}
                          className={cn(
                            "apple-spring min-h-10 flex-1 rounded-apple-sm px-2.5 text-xs font-semibold sm:min-h-8 sm:flex-none",
                            on ? "bg-white text-brand-800 shadow-xs" : "text-ink-600 hover:text-ink-900",
                          )}
                        >
                          {r}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Beside the name on phones, after the rating from sm up. */}
                <button
                  type="button"
                  onClick={() => remove(skill)}
                  aria-label={`Remove ${skill}`}
                  className="apple-spring order-2 grid size-11 shrink-0 place-items-center rounded-apple-sm text-text-subtle hover:bg-danger-soft hover:text-danger sm:order-3"
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
          <p className="mt-1 text-xs text-text-subtle">Technical and non-technical. Tap to add.</p>
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
                  className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-brand-700 underline-offset-4 hover:underline sm:min-h-9"
                >
                  {allPicks ? "Show fewer" : `${picks.length - FIRST_PICKS} more`}
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function SkillChip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3.5 text-sm text-ink-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 sm:min-h-9"
    >
      <Plus className="size-3.5 text-text-subtle" aria-hidden />
      {children}
    </button>
  );
}
