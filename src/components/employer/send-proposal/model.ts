/** Pure pieces of the proposal composer, moved verbatim out of the form. */

export const DURATIONS = [
  { value: "1m", label: "1 month" },
  { value: "2m", label: "2 months" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
] as const;

/** Tomorrow in India, as YYYY-MM-DD. */
export function tomorrowIst(): string {
  return new Date(Date.now() + 330 * 60_000 + 86_400_000).toISOString().slice(0, 10);
}

/* ── Validation ──────────────────────────────────────────────────────────── */

export type Draft = {
  projectId: string;
  roleTitle: string;
  duration: string;
  startDate: string;
  minStart: string;
  mode: string;
  city: string;
  state: string;
  officeDays: string;
  homeDays: string;
  /** Working days in the week: office + home must equal it (EMH-27). */
  week: number;
  laptop: string;
  message: string;
  shiftFrom: string;
  shiftTo: string;
  timezone: string;
};

export function validate(draft: Draft): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!draft.projectId) errors.projectId = "A proposal must attach to one of your projects.";
  if (draft.roleTitle.trim().length < 2) errors.roleTitle = "Give the role a title.";
  if (!DURATIONS.some((d) => d.value === draft.duration)) errors.duration = "Pick a duration.";
  if (!draft.startDate) {
    errors.startDate = "Pick a start date after today, as DD/MM/YYYY.";
  } else if (Number.isNaN(Date.parse(draft.startDate))) {
    errors.startDate = "That is not a date.";
  } else if (draft.startDate < draft.minStart) {
    errors.startDate = "Pick a date after today.";
  }

  if (draft.mode !== "remote" && !draft.city.trim()) {
    errors.city = "An on-site or hybrid role needs a city.";
  }
  if (draft.mode !== "remote" && !draft.state.trim()) {
    errors.state = "An on-site or hybrid role needs a state.";
  }
  if (draft.mode === "hybrid") {
    const office = Number(draft.officeDays);
    const home = Number(draft.homeDays);
    if (!(office >= 1) || !(home >= 1) || office + home !== draft.week) {
      errors.officeDays = `Split the ${draft.week} working days between office and home, at least one each.`;
    }
  }

  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!time.test(draft.shiftFrom)) errors.shiftFrom = "Pick a start time.";
  if (!time.test(draft.shiftTo)) errors.shiftTo = "Pick an end time.";
  else if (draft.shiftFrom === draft.shiftTo) errors.shiftTo = "The end time must differ from the start.";
  if (!draft.timezone || draft.timezone.startsWith("group-")) errors.timezone = "Pick a timezone.";
  if (!draft.laptop) errors.laptop = "Say who provides the laptop.";
  if (draft.message.trim().length < 30) {
    errors.message = "At least a couple of sentences - 30 characters minimum.";
  }

  return errors;
}
