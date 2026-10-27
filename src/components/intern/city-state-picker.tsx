"use client";

import { useState } from "react";

import { STATES, districtsOf } from "@/lib/data/districts";

import { Field, FieldNote, Label, Select } from "./onboarding/fields";

const OTHER = "__other";

/**
 * State and city as dropdowns (bug sheet 7, NC r22), from the district list
 * the legacy app used (`cityStatePincode.json`, trimmed into districts.json).
 *
 * The state comes first so the city list is short; a city that is not a
 * district is typed in ("Not listed"), as the legacy form's "enter manually".
 * A stored value that is not on either list stays selectable, so no legacy
 * row is blanked by opening the form. Renders two grid cells: state, city.
 */
export function CityStatePicker({
  state,
  city,
  onState,
  onCity,
  stateError,
  cityError,
  idPrefix = "",
}: {
  state: string;
  city: string;
  onState: (state: string) => void;
  onCity: (city: string) => void;
  stateError?: string;
  cityError?: string;
  /** Prefix for the field ids (the About step uses the bare `state` / `city`). */
  idPrefix?: string;
}) {
  const stateId = `${idPrefix}state`;
  const cityId = `${idPrefix}city`;
  const states = state && !STATES.includes(state) ? [state, ...STATES] : STATES;
  const cities = districtsOf(state);
  const listed = (c: string) => cities.some((d) => d.toLowerCase() === c.trim().toLowerCase());
  const [typing, setTyping] = useState(() => Boolean(city && state && !listed(city)));
  const manual = typing || Boolean(city && state && cities.length > 0 && !listed(city)) || (Boolean(state) && cities.length === 0);

  return (
    <>
      <div className="min-w-0">
        <Label htmlFor={stateId}>State</Label>
        <Select
          id={stateId}
          value={state}
          placeholder="Choose your state"
          onChange={(next) => {
            onState(next);
            // A city from another state no longer fits.
            if (!districtsOf(next).some((d) => d.toLowerCase() === city.trim().toLowerCase())) onCity("");
            setTyping(false);
          }}
          options={states.map((s) => ({ value: s, label: s }))}
          error={stateError}
          className="mt-2"
        />
        <FieldNote id={stateId} error={stateError} />
      </div>

      {manual ? (
        <Field
          id={cityId}
          label="City"
          value={city}
          onChange={onCity}
          placeholder="Type your city"
          autoComplete="address-level2"
          error={cityError}
          hint={
            cities.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setTyping(false);
                  onCity("");
                }}
                className="font-medium text-brand-700 underline-offset-4 hover:underline"
              >
                Pick from the list instead
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="min-w-0">
          <Label htmlFor={cityId}>City</Label>
          <Select
            id={cityId}
            value={listed(city) ? cities.find((d) => d.toLowerCase() === city.trim().toLowerCase()) ?? "" : ""}
            placeholder={state ? "Choose your city" : "Choose a state first"}
            disabled={!state}
            onChange={(next) => {
              if (next === OTHER) {
                setTyping(true);
                onCity("");
                window.requestAnimationFrame(() => document.getElementById(cityId)?.focus());
                return;
              }
              onCity(next);
            }}
            options={[...cities.map((d) => ({ value: d, label: d })), { value: OTHER, label: "Not listed - type it" }]}
            error={cityError}
            className="mt-2"
          />
          <FieldNote id={cityId} error={cityError} />
        </div>
      )}
    </>
  );
}
