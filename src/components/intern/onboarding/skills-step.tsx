"use client";

import { Lock, TriangleAlert } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { SITE } from "@/lib/content/site";
import { SkillPicker } from "@/components/skills/skill-picker";

import type { StepProps } from "./types";

export function SkillsStep({ values, update, errors, skillsLocked }: StepProps) {
  const skills = values.skills ?? [];

  // Legacy rule: once scored (or an AI interview is open) the interview is
  // built on these skills, so they stop being editable. The API enforces it.
  if (skillsLocked) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3 rounded-apple-sm border border-ink-200/80 bg-ink-50 p-4">
          <Lock className="mt-0.5 size-4 shrink-0 text-text-subtle" aria-hidden />
          <p className="text-sm leading-relaxed text-ink-700">
            Your skills are locked because your AI interview is based on them. If one is wrong, write to{" "}
            <a href={`mailto:${SITE.email}`} className="font-medium text-brand-700 underline-offset-4 hover:underline">
              {SITE.email}
            </a>
            .
          </p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {skills.map((s) => (
            <li key={s} className="max-w-full">
              <Pill tone="neutral" className="max-w-full [overflow-wrap:anywhere]">{s}</Pill>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* The legacy skills notice (bug sheet 21 Oct), word for word. */}
      <div className="flex gap-3 rounded-apple-sm border border-accent-300/60 bg-accent-100/50 p-4 sm:p-5">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-accent-700" aria-hidden />
        <div className="text-sm leading-relaxed text-ink-800">
          <p className="font-semibold text-ink-900">Important note</p>
          <p className="mt-1 text-pretty">Just pick the skills you want to be known for. Findtern scores you itself through your AI interview.</p>
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
        <SkillPicker id="skills" label="Your key skills" value={skills} onChange={(n) => update("skills", n)} error={errors.skills} />
        <p className="mt-3 max-w-prose text-pretty text-sm text-ink-600">
          Pick up to 7. Employers see these on your row.
        </p>
      </div>
    </div>
  );
}
