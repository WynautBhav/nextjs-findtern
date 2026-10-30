"use client";

import { useState } from "react";
import { Building2, Home, Laptop, MapPin, Plus, Shuffle, X } from "lucide-react";

import { suggestDistricts } from "@/lib/data/districts";
import { CUSTOM_CITY, cascadeWorkModes, widestWorkMode } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

import { FieldNote, Label, Section, controlClass, onRadioKeys, radioTab } from "./fields";
import type { StepProps } from "./types";

const MODES = [
  { value: "remote", label: "Remote", detail: "Work from home", icon: Home },
  { value: "hybrid", label: "Hybrid", detail: "Some days at the office", icon: Shuffle },
  { value: "onsite", label: "Onsite", detail: "At the office every day", icon: Building2 },
] as const;

const MAX_CITIES = 5;

export function LocationStep({ values, update, errors }: StepProps) {
  // One pick; the stored set is that mode plus every less on-site one
  // (onsite ⇒ hybrid + remote), and all of them show selected (bug sheet 8).
  const picked = widestWorkMode(values.locationTypes ?? []);
  const included = cascadeWorkModes([], picked ?? "");
  const needsCities = picked === "onsite" || picked === "hybrid";
  const cities = Array.from(new Set(values.preferredLocations ?? []));

  function pick(mode: (typeof MODES)[number]["value"]) {
    const next = cascadeWorkModes([], mode);
    update("locationTypes", next);
    // Remote only: there is no city to work from, so none is kept (bug sheet 23 Oct).
    if (mode === "remote") update("preferredLocations", []);
  }

  return (
    <div className="space-y-8">
      <Section first title="How you want to work">
        <div
          id="locationTypes"
          role="radiogroup"
          aria-label="Work mode"
          aria-describedby={errors.locationTypes ? "locationTypes-error" : "locationTypes-hint"}
          tabIndex={-1}
          onKeyDown={onRadioKeys}
          className="grid gap-3 outline-none sm:grid-cols-3"
        >
          {MODES.map(({ value, label, detail, icon: Icon }, i) => {
            const on = included.includes(value);
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={picked === value}
                tabIndex={radioTab(picked === value, i, picked !== null)}
                data-field="locationTypes"
                onClick={() => pick(value)}
                className={cn(
                  "apple-spring apple-pressable flex min-h-11 items-center gap-3 rounded-apple-lg border p-4 text-left",
                  on
                    ? "border-brand-600 bg-brand-50 shadow-xs ring-1 ring-brand-600/25"
                    : errors.locationTypes
                      ? "border-danger/60 bg-white hover:bg-ink-50"
                      : "border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50",
                )}
              >
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-apple-sm", on ? "bg-brand-700 text-white" : "bg-ink-100 text-ink-600")}>
                  <Icon className="size-[1.125rem]" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-[0.9375rem] font-semibold", on ? "text-brand-900" : "text-ink-900")}>{label}</span>
                  <span className="block text-sm text-ink-600">{detail}</span>
                </span>
              </button>
            );
          })}
        </div>
        <FieldNote
          id="locationTypes"
          error={errors.locationTypes}
          hint={
            picked === "onsite"
              ? "Onsite also tells employers you are open to hybrid and remote roles."
              : picked === "hybrid"
                ? "Hybrid also tells employers you are open to remote roles."
                : "Pick the most on-site option you can do."
          }
        />
      </Section>

      {needsCities ? (
        <Section title="Cities you can work from" hint={`Up to ${MAX_CITIES}. Employers offering ${picked} roles see these.`}>
          <CityPicker cities={cities} error={errors.preferredLocations} onChange={(next) => update("preferredLocations", next)} />
        </Section>
      ) : null}

      <Section title="Your laptop">
        <div id="hasLaptop" role="radiogroup" aria-label="Do you have a laptop?" tabIndex={-1} onKeyDown={onRadioKeys} className="grid gap-3 outline-none sm:grid-cols-2">
          {[
            { value: true, label: "I have a laptop", detail: "Ready to start on day one." },
            { value: false, label: "I don't have one", detail: "The employer would need to provide a system." },
          ].map((o, i) => {
            const on = values.hasLaptop === o.value;
            return (
              <button
                key={String(o.value)}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={radioTab(on, i, typeof values.hasLaptop === "boolean")}
                data-field="hasLaptop"
                onClick={() => update("hasLaptop", o.value)}
                className={cn(
                  "apple-spring apple-pressable flex min-h-11 items-start gap-3 rounded-apple-lg border p-4 text-left",
                  on
                    ? "border-brand-600 bg-brand-50 shadow-xs ring-1 ring-brand-600/25"
                    : errors.hasLaptop
                      ? "border-danger/60 bg-white hover:bg-ink-50"
                      : "border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50",
                )}
              >
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-apple-sm", on ? "bg-brand-700 text-white" : "bg-ink-100 text-ink-600")}>
                  <Laptop className="size-[1.125rem]" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-[0.9375rem] font-semibold", on ? "text-brand-900" : "text-ink-900")}>{o.label}</span>
                  <span className="block text-sm text-ink-600">{o.detail}</span>
                </span>
              </button>
            );
          })}
        </div>
        <FieldNote id="hasLaptop" error={errors.hasLaptop} />
      </Section>
    </div>
  );
}

/**
 * Up to five cities, picked from the district list ("Jaipur, Rajasthan").
 * A city that is not a district can be typed as "City, State" (legacy rule).
 */
function CityPicker({ cities, error, onChange }: { cities: string[]; error?: string; onChange: (cities: string[]) => void }) {
  const [query, setQuery] = useState("");
  const full = cities.length >= MAX_CITIES;
  const taken = (c: string) => cities.some((x) => x.toLowerCase() === c.toLowerCase());
  const q = query.trim();
  const matches = q ? suggestDistricts(q, 6).map((d) => `${d.district}, ${d.state}`).filter((c) => !taken(c)) : [];
  const custom = q && CUSTOM_CITY.test(q) && !taken(q) && !matches.some((m) => m.toLowerCase() === q.toLowerCase()) ? q.replace(/\s*,\s*/, ", ") : null;

  function add(city: string) {
    if (full || taken(city)) return;
    onChange([...cities, city]);
    setQuery("");
    document.getElementById("preferredLocations")?.focus();
  }

  return (
    <div>
      <Label htmlFor="preferredLocations">
        Add a city <span className="nums font-normal text-text-subtle">({cities.length} of {MAX_CITIES})</span>
      </Label>
      <input
        id="preferredLocations"
        // Leaving the box is not "done": the city count shows after Continue.
        data-field="city-draft"
        value={query}
        disabled={full}
        autoComplete="off"
        placeholder={full ? "That's five - remove one to add another" : "Start typing, e.g. Pune"}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const first = matches[0] ?? custom;
            if (first) add(first);
          }
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "preferredLocations-error" : "preferredLocations-hint"}
        className={controlClass(error, "mt-2")}
      />
      <FieldNote
        id="preferredLocations"
        error={error}
        hint={q && matches.length === 0 && !custom ? "Not on the list? Type it as City, State - like Noida, Uttar Pradesh." : undefined}
      />
      {matches.length > 0 || custom ? (
        <ul aria-label="Matching cities" className="mt-3 flex flex-wrap gap-2">
          {[...matches, ...(custom ? [custom] : [])].map((c) => (
            <li key={c}>
              <button
                type="button"
                onClick={() => add(c)}
                className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3.5 text-sm text-ink-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 sm:min-h-9"
              >
                <Plus className="size-3.5 text-text-subtle" aria-hidden />
                {c === custom ? `Add "${c}"` : c}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {cities.length > 0 ? (
        <ul aria-label="Your cities" className="mt-4 flex flex-wrap gap-2">
          {cities.map((c) => (
            <li key={c} className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 pl-3.5 text-sm font-medium text-brand-900">
              <MapPin className="size-3.5 text-brand-600" aria-hidden />
              {c}
              <button
                type="button"
                onClick={() => onChange(cities.filter((x) => x !== c))}
                aria-label={`Remove ${c}`}
                className="apple-spring grid size-11 place-items-center rounded-full text-brand-700 hover:bg-brand-100 hover:text-danger"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
