import { projectMatchState, type ProjectMatchState } from "./project-match.ts";
import type { CandidatesData, Filters } from "./candidates-params.ts";

/** How the selected project relates to this list (see `projectMatchState`), read off the loaded data. */
export function matchStateOf(data: CandidatesData, filters: Filters): ProjectMatchState {
  return projectMatchState({
    hasProject: Boolean(data.activeProjectId),
    projectDefaults: filters.projectDefaults,
    skillsSet: filters.skillsSet,
    skills: filters.skills,
    projectSkills: data.activeProjectSkills,
    projectCity: data.cityDefault,
  });
}

export function projectNameOf(data: CandidatesData): string {
  return data.projects.find((p) => p.id === data.activeProjectId)?.projectName ?? "";
}

