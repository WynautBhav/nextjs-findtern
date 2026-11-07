import { skillMatch } from "../app/skill-match.ts";

export type MatchProject = { id: string; projectName: string; skills: readonly string[] };

/** The project a candidate fits best (most matched skills; first wins ties). Null when none share a skill. */
export function bestProjectFor<P extends MatchProject>(candidateSkills: readonly string[], projects: readonly P[]): { project: P; matched: number; total: number } | null {
  let best: { project: P; matched: number; total: number } | null = null;
  for (const project of projects) {
    const { matched, total } = skillMatch(candidateSkills, project.skills);
    if (matched.length > 0 && (!best || matched.length > best.matched)) best = { project, matched: matched.length, total };
  }
  return best;
}
