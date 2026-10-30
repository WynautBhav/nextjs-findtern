"use client";

import { EXPERIENCE_TYPES, MAX_EXPERIENCES, type ExperienceEntry } from "@/lib/onboarding";

import { DateField, localToday } from "../date-input";
import { AddButton, Check, EmptyEntries, EntryCard, Field, FieldNote, Grid, Label, SelectField, TextArea, controlClass } from "./fields";
import type { StepProps } from "./types";

export function ExperienceStep({ values, update, errors }: StepProps) {
  const today = localToday();
  const experiences = values.experiences ?? [];
  const patch = (id: string, next: Partial<ExperienceEntry>) =>
    update(
      "experiences",
      experiences.map((e) => (e.id === id ? { ...e, ...next } : e)),
    );
  const full = experiences.length >= MAX_EXPERIENCES;
  const add = () =>
    !full &&
    update("experiences", [
      ...experiences,
      // Nothing preselected (INT-30): the type is chosen.
      { id: `exp-${Date.now()}`, type: "", company: "", role: "", from: "", to: "", current: false, description: "" },
    ]);

  if (experiences.length === 0) {
    return (
      <EmptyEntries
        title="No experience added"
        body="Optional. Freshers can add a college project, open-source work or a freelance job - anything you can talk about in an interview."
        action={<AddButton onClick={add}>Add experience</AddButton>}
      />
    );
  }

  return (
    <div className="space-y-5">
      {experiences.map((exp, i) => {
        const k = `exp.${exp.id}`;
        const project = exp.type === "Project";
        return (
          <EntryCard
            key={exp.id}
            title={`Experience ${i + 1}`}
            removeLabel={`Remove experience ${i + 1}`}
            onRemove={() => update("experiences", experiences.filter((e) => e.id !== exp.id))}
          >
            <Grid>
              <SelectField
                id={`${k}.type`}
                label="Type"
                placeholder="Choose the type"
                // A type outside the legacy four (an early build) is chosen again.
                value={EXPERIENCE_TYPES.some((t) => t.value === exp.type) ? exp.type : ""}
                options={[...EXPERIENCE_TYPES]}
                error={errors[`${k}.type`]}
                onChange={(v) => patch(exp.id, { type: v })}
              />
              <Field
                id={`${k}.role`}
                label={project ? "Your role" : "Role or title"}
                placeholder={project ? "e.g. Team lead, Developer" : "e.g. Marketing Intern"}
                maxLength={160}
                value={exp.role}
                error={errors[`${k}.role`]}
                onChange={(v) => patch(exp.id, { role: v })}
              />
            </Grid>
            <Field
              id={`${k}.company`}
              label={project ? "Organisation, college or client" : "Company"}
              placeholder={project ? "e.g. your college, a client, or Self" : "e.g. Infosys"}
              maxLength={160}
              value={exp.company}
              error={errors[`${k}.company`]}
              onChange={(v) => patch(exp.id, { company: v })}
            />
            <div>
              <Grid>
                <DateField
                  id={`${k}.from`}
                  label="Start date"
                  max={today}
                  value={exp.from}
                  error={errors[`${k}.from`]}
                  onChange={(v) => patch(exp.id, { from: v })}
                />
                {exp.current ? (
                  <div className="min-w-0">
                    <Label htmlFor={`${k}.to`}>End date</Label>
                    <input id={`${k}.to`} value="Present" disabled readOnly className={controlClass(undefined, "mt-2 font-medium text-brand-800 disabled:bg-brand-50 disabled:text-brand-800")} />
                    <FieldNote id={`${k}.to`} hint="You still work here." />
                  </div>
                ) : (
                  <DateField
                    id={`${k}.to`}
                    label="End date"
                    min={exp.from || undefined}
                    max={today}
                    value={exp.to}
                    error={errors[`${k}.to`]}
                    onChange={(v) => patch(exp.id, { to: v })}
                  />
                )}
              </Grid>
              <Check className="mt-2" checked={exp.current} onChange={(checked) => patch(exp.id, { current: checked, to: checked ? "" : exp.to })}>
                {project ? "This project is ongoing" : "I currently work here"}
              </Check>
            </div>
            <TextArea
              id={`${k}.description`}
              label={project ? "What you built" : "What you did"}
              rows={4}
              maxLength={2000}
              placeholder={project ? "What you built, your part in it, the tools you used." : "Your work, the tools you used, and a result if you have one."}
              value={exp.description}
              error={errors[`${k}.description`]}
              onChange={(v) => patch(exp.id, { description: v })}
            />
          </EntryCard>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <AddButton onClick={add} disabled={full}>
          Add another
        </AddButton>
        <p className="nums text-xs text-text-subtle">
          {experiences.length} of {MAX_EXPERIENCES}
        </p>
      </div>
    </div>
  );
}
