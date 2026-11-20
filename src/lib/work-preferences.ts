import { MODE_LABEL, preferredCities } from "./employer-candidates.ts";
import { workModes } from "./onboarding.ts";

export type WorkPreferenceChip = {
  label: string;
  /** The city they live in now. */
  current?: boolean;
  /** A city the employer's selected project is in. */
  matchesProject?: boolean;
};

export type WorkPreferenceRow = {
  key: "cities" | "modes";
  label: string;
  /** Empty means the intern left it blank: show "Not specified". */
  chips: WorkPreferenceChip[];
};

const cityKey = (city: string) => city.trim().toLowerCase();

/**
 * Where an intern wants to work, as an employer reads it: the cities they chose (each once, the home city
 * marked as their current one) and the work modes, Remote / Hybrid / On-site in that order, each once.
 * `projectCities` are the selected project's own cities (lib/project-locations); a preferred city among
 * them is flagged. Reads only what the candidate profile already carries.
 */
export function workPreferenceRows(
  profile: { location: string; preferredLocations: string[]; workModes: string[] },
  projectCities: string[] = [],
): WorkPreferenceRow[] {
  const home = cityKey((profile.location ?? "").split(",")[0]);
  const project = new Set(projectCities.map(cityKey).filter(Boolean));
  return [
    {
      key: "cities",
      label: "Preferred cities",
      chips: preferredCities(profile.preferredLocations).map((city) => ({
        label: city,
        ...(home && cityKey(city) === home ? { current: true } : {}),
        ...(project.has(cityKey(city)) ? { matchesProject: true } : {}),
      })),
    },
    {
      key: "modes",
      label: "Work mode",
      chips: workModes(profile.workModes).map((mode) => ({ label: MODE_LABEL[mode] ?? mode })),
    },
  ];
}
