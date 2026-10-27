"use client";

/**
 * The fields of one project, shared by onboarding's project stage and the
 * Projects page drawer, so the two can never disagree about what a project
 * needs (they did: one asked for 1 skill, the other for 1 too, legacy for 4;
 * one pre-selected "remote", the other did not).
 *
 * Rules, all from legacy unless noted:
 * - 4 to 7 skills (EMH-13; max 7 from bug sheet 7 S1 r80).
 * - Scope and work mode start empty and must be picked (EMH-47). Scope
 *   labels "Up to 60/90/180 days" (S1 r81), stored under legacy keys (DB-09).
 * - On-site and hybrid need a state and a city, from the Indian lists, and
 *   start on the company's own city when it is in India (EMH-14, EMH-48).
 * - At most three preferred cities (client QA; legacy five, older lists keep
 *   theirs).
 */

import { Info } from "lucide-react";

import { ChoiceGroup, FieldHint, FieldLabel, NativeSelect, TextField } from "@/components/employer/company-fields";
import { CityField, StateField, districtOptions } from "@/components/employer/location-fields";
import { ChipInput } from "@/components/employer/project-chip-input";
import { scopeOfWorkOptions, scopeValue } from "@/lib/db/schema";
import { STATES } from "@/lib/data/districts";
import { suggestSkills } from "@/lib/data/skills";
import type { ProjectDraft } from "@/lib/employer-onboarding";
import {
  INDIA_ONLY_NOTE,
  MAX_PROJECT_LOCATIONS,
  MAX_PROJECT_SKILLS,
  MIN_PROJECT_SKILLS,
  projectLocationsError,
  projectPlaceError,
  projectSkillsError,
} from "@/lib/project-locations";
import { TIMEZONES } from "@/lib/timezones";

export const WORK_MODES = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
] as const;

/** What a stored record looked like before this edit, for the "keep what you had" rules. */
export type ProjectBaseline = {
  skills: readonly string[];
  preferredLocations: readonly string[];
  scopeOfWork: string;
  city: string;
  state: string;
  locationType: string;
};

/** Field-keyed problems with this project, empty when it may be saved. */
export function projectFormErrors(p: ProjectDraft, before?: ProjectBaseline | null): Record<string, string> {
  const errors: Record<string, string> = {};
  if (p.projectName.trim().length < 2) errors.projectName = "Name the project (at least 2 characters).";
  const skills = projectSkillsError(p.skills, before?.skills);
  if (skills) errors.skills = skills;
  // An unchanged legacy scope ("not sure") may stay; anything new is picked.
  if (!scopeValue(p.scopeOfWork) && !(before && p.scopeOfWork && p.scopeOfWork === before.scopeOfWork)) {
    errors.scopeOfWork = "Pick how long the internship runs.";
  }
  if (!p.locationType) errors.locationType = "Pick a work mode.";
  if (!p.timezone) errors.timezone = "Pick a timezone.";
  const placeUnchanged =
    before &&
    p.city.trim() === before.city.trim() &&
    p.state.trim() === before.state.trim() &&
    p.locationType === before.locationType;
  const place = placeUnchanged ? null : projectPlaceError(p, STATES);
  if (place) {
    if (!p.state.trim()) errors.state = place;
    else if (!p.city.trim()) errors.city = place;
    else errors.state = place;
  }
  if (p.pincode && p.locationType && p.locationType !== "remote" && !/^[1-9]\d{5}$/.test(p.pincode)) {
    errors.pincode = "A PIN code is 6 digits.";
  }
  const places = projectLocationsError(p.preferredLocations, before?.preferredLocations ?? []);
  if (places) errors.preferredLocations = places;
  return errors;
}

/** Where a new on-site role starts: the company's own city, if it is in India. */
export function companyPlaceDefault(company: { city?: string | null; state?: string | null }) {
  const state = (company.state ?? "").trim();
  const inIndia = STATES.some((s) => s.toLowerCase() === state.toLowerCase());
  return inIndia ? { state, city: (company.city ?? "").trim() } : { state: "", city: "" };
}

export function ProjectFields({
  values,
  set,
  errors,
  companyPlace,
  idPrefix = "project",
  showPincode = false,
}: {
  values: ProjectDraft;
  set: (patch: Partial<ProjectDraft>) => void;
  errors: Record<string, string>;
  /** The company's city and state, offered when the role becomes on-site. */
  companyPlace?: { city?: string | null; state?: string | null };
  idPrefix?: string;
  showPincode?: boolean;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;
  const onsite = Boolean(values.locationType) && values.locationType !== "remote";

  function pickMode(mode: string) {
    const patch: Partial<ProjectDraft> = { locationType: mode };
    if (mode === "remote") {
      // A remote role carries no place.
      patch.preferredLocations = [];
    } else if (!values.city && !values.state && companyPlace) {
      Object.assign(patch, companyPlaceDefault(companyPlace));
    }
    set(patch);
  }

  return (
    <div className="space-y-6">
      <TextField
        id={id("name")}
        label="Project name"
        required
        placeholder="Frontend engineering, Growth marketing"
        value={values.projectName}
        error={errors.projectName}
        hint="Candidates see this as the role. Name the work, not a requisition number."
        onChange={(v) => set({ projectName: v })}
      />

      <ChipInput
        id={id("skills")}
        label="Skills"
        required
        hint={`At least ${MIN_PROJECT_SKILLS}, at most ${MAX_PROJECT_SKILLS}. From the same list candidates pick from, so matching works.`}
        placeholder="React, Excel, Figma"
        entries={values.skills}
        min={MIN_PROJECT_SKILLS}
        max={MAX_PROJECT_SKILLS}
        onAdd={(skill) => set({ skills: [...values.skills, skill] })}
        onRemove={(skill) => set({ skills: values.skills.filter((s) => s !== skill) })}
        error={errors.skills}
        suggest={(q) => suggestSkills(q, 8)}
      />

      <ChoiceGroup
        id={id("scope")}
        label="Scope of work"
        required
        value={scopeValue(values.scopeOfWork) || values.scopeOfWork}
        options={scopeOfWorkOptions}
        error={errors.scopeOfWork}
        onChange={(v) => set({ scopeOfWork: v })}
      />

      <ChoiceGroup
        id={id("mode")}
        label="Work mode"
        required
        hint="How the intern works. It decides which candidates you see."
        value={values.locationType}
        options={WORK_MODES}
        error={errors.locationType}
        onChange={pickMode}
      />

      {onsite ? (
        <div className="space-y-4 rounded-apple-lg border border-ink-200/80 bg-ink-50/60 p-4 sm:p-5">
          <p className="flex items-start gap-2 text-sm text-ink-700">
            <Info className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
            <span>
              <span className="font-medium text-ink-900">Where the intern works.</span> {INDIA_ONLY_NOTE}
            </span>
          </p>
          <div className={showPincode ? "grid gap-4 sm:grid-cols-3" : "grid gap-4 sm:grid-cols-2"}>
            <StateField
              id={id("state")}
              label="State"
              required
              india
              value={values.state}
              error={errors.state}
              onChange={(v) => set({ state: v, city: v === values.state ? values.city : "" })}
            />
            <CityField
              id={id("city")}
              label="City"
              required
              india
              state={values.state}
              onStateChange={(v) => set({ state: v })}
              value={values.city}
              error={errors.city}
              onChange={(v) => set({ city: v })}
            />
            {showPincode ? (
              <TextField
                id={id("pincode")}
                label="PIN code"
                optional
                inputMode="numeric"
                maxLength={6}
                value={values.pincode}
                error={errors.pincode}
                onChange={(v) => set({ pincode: v.replace(/\D/g, "") })}
              />
            ) : null}
          </div>
          <ChipInput
            id={id("places")}
            label="Other cities you'd consider"
            hint={`Optional. Up to ${MAX_PROJECT_LOCATIONS}, for candidates who would relocate.`}
            placeholder="Pune"
            suggest={(q) => districtOptions(q).map((d) => d.district)}
            entries={values.preferredLocations}
            max={MAX_PROJECT_LOCATIONS}
            onAdd={(place) => set({ preferredLocations: [...values.preferredLocations, place] })}
            onRemove={(place) => set({ preferredLocations: values.preferredLocations.filter((p) => p !== place) })}
            error={errors.preferredLocations}
          />
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor={id("tz")} required>
            Timezone
          </FieldLabel>
          <NativeSelect
            id={id("tz")}
            value={values.timezone}
            onChange={(e) => set({ timezone: e.target.value })}
            aria-invalid={errors.timezone ? true : undefined}
            error={Boolean(errors.timezone)}
            wrapperClassName="mt-2"
          >
            {TIMEZONES.map((option) =>
              option.group ? (
                <option key={option.id} value={option.id} disabled>
                  {option.label}
                </option>
              ) : (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ),
            )}
          </NativeSelect>
          <FieldHint>Set from your company&apos;s location. Meeting slots and offers use it.</FieldHint>
        </div>
        <label className="flex cursor-pointer items-start gap-3 self-start rounded-apple-md border border-ink-200/80 bg-white px-4 py-3.5 sm:mt-7">
          <input
            type="checkbox"
            checked={values.fullTimeOffer}
            onChange={(e) => set({ fullTimeOffer: e.target.checked })}
            className="mt-0.5 size-4.5 shrink-0 rounded accent-brand-700"
          />
          <span>
            <span className="block text-sm font-medium text-ink-900">Full-time role after the internship</span>
            <span className="mt-0.5 block text-xs text-ink-600">Shown to candidates as a conversion path.</span>
          </span>
        </label>
      </div>
    </div>
  );
}
