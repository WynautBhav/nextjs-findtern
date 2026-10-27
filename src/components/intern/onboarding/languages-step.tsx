"use client";

import { LANGUAGES, LANGUAGE_LEVELS, MAX_EXTRACURRICULARS, type ExtracurricularEntry, type LanguageEntry } from "@/lib/onboarding";

import { AddButton, Check, EmptyEntries, EntryCard, Field, FieldNote, Grid, SelectField } from "./fields";
import type { StepProps } from "./types";

/* ── Languages ─────────────────────────────────────────────────────────── */

export function LanguagesStep({ values, update, errors }: StepProps) {
  const languages = values.languages ?? [];
  const patch = (id: string, next: Partial<LanguageEntry>) =>
    update(
      "languages",
      languages.map((l) => (l.id === id ? { ...l, ...next } : l)),
    );
  // A new row starts blank, as in legacy; read, write and speak start ticked.
  const add = () => update("languages", [...languages, { id: `lang-${Date.now()}`, language: "", level: "", read: true, write: true, speak: true }]);

  return (
    <div className="space-y-5">
      {errors.languages ? (
        <p id="languages" tabIndex={-1} className="text-sm font-medium text-danger outline-none">
          {errors.languages}
        </p>
      ) : null}
      {languages.map((lang, i) => {
        const k = `lang.${lang.id}`;
        // A legacy language outside the list (rare) stays selectable.
        const options = !lang.language || LANGUAGES.some((l) => l === lang.language) ? [...LANGUAGES] : [lang.language, ...LANGUAGES];
        return (
          <EntryCard
            key={lang.id}
            title={`Language ${i + 1}`}
            removeLabel={`Remove language ${i + 1}`}
            onRemove={languages.length > 1 ? () => update("languages", languages.filter((l) => l.id !== lang.id)) : undefined}
          >
            <Grid>
              <SelectField
                id={`${k}.language`}
                label="Language"
                placeholder="Choose a language"
                value={lang.language}
                options={options.map((l) => ({ value: l, label: l }))}
                error={errors[`${k}.language`]}
                onChange={(v) => patch(lang.id, { language: v })}
              />
              <SelectField
                id={`${k}.level`}
                label="Level"
                placeholder="Choose a level"
                value={lang.level}
                options={LANGUAGE_LEVELS}
                error={errors[`${k}.level`]}
                onChange={(v) => patch(lang.id, { level: v as LanguageEntry["level"] })}
              />
            </Grid>
            <fieldset>
              <legend className="text-sm font-medium text-ink-800">You can</legend>
              <div className="mt-1 flex flex-wrap gap-x-6">
                <Check checked={lang.read !== false} onChange={(v) => patch(lang.id, { read: v })}>
                  Read
                </Check>
                <Check checked={lang.write !== false} onChange={(v) => patch(lang.id, { write: v })}>
                  Write
                </Check>
                <Check checked={lang.speak !== false} onChange={(v) => patch(lang.id, { speak: v })}>
                  Speak
                </Check>
              </div>
            </fieldset>
          </EntryCard>
        );
      })}
      <AddButton onClick={add}>Add a language</AddButton>
    </div>
  );
}

/* ── Activities ────────────────────────────────────────────────────────── */

const ACTIVITY_LEVELS = [
  { value: "Beginner", label: "Beginner - took part" },
  { value: "Intermediate", label: "Intermediate - core team" },
  { value: "Advanced", label: "Advanced - led or won" },
];

export function ExtracurricularStep({ values, update, errors }: StepProps) {
  const rows = values.extracurriculars ?? [];
  const patch = (id: string, next: Partial<ExtracurricularEntry>) =>
    update(
      "extracurriculars",
      rows.map((r) => (r.id === id ? { ...r, ...next } : r)),
    );
  const full = rows.length >= MAX_EXTRACURRICULARS;
  // Legacy starts a new activity at Beginner.
  const add = () => !full && update("extracurriculars", [...rows, { id: `act-${Date.now()}`, activity: "", level: "Beginner", description: "" }]);

  if (rows.length === 0) {
    return (
      <EmptyEntries
        title="No activities added"
        body="Optional, but it shows teamwork and initiative: a club you ran, a hackathon, NSS, a sport, a fest you organised."
        action={<AddButton onClick={add}>Add an activity</AddButton>}
      />
    );
  }

  return (
    <div className="space-y-5">
      {rows.map((act, i) => {
        const k = `act.${act.id}`;
        return (
          <EntryCard
            key={act.id}
            title={`Activity ${i + 1}`}
            removeLabel={`Remove activity ${i + 1}`}
            onRemove={() => update("extracurriculars", rows.filter((r) => r.id !== act.id))}
          >
            <Grid>
              <Field
                id={`${k}.activity`}
                label="Activity"
                placeholder="e.g. NSS volunteer, Coding club lead"
                value={act.activity}
                error={errors[`${k}.activity`]}
                onChange={(v) => patch(act.id, { activity: v })}
              />
              <SelectField
                id={`${k}.level`}
                label="Level"
                placeholder="Choose a level"
                value={act.level}
                options={ACTIVITY_LEVELS}
                error={errors[`${k}.level`]}
                onChange={(v) => patch(act.id, { level: v as ExtracurricularEntry["level"] })}
              />
            </Grid>
            <Field
              id={`${k}.description`}
              label="What you achieved"
              optional
              placeholder="e.g. Ran a 200-person fest; 2nd of 50 teams"
              value={act.description ?? ""}
              onChange={(v) => patch(act.id, { description: v })}
            />
          </EntryCard>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <AddButton onClick={add} disabled={full}>
          Add another
        </AddButton>
        <p className="nums text-xs text-ink-500">
          {rows.length} of {MAX_EXTRACURRICULARS}
        </p>
      </div>
      {errors.extracurriculars ? <FieldNote id="extracurriculars" error={errors.extracurriculars} /> : null}
    </div>
  );
}
