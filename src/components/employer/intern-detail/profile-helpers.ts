/** Pure display rules for the candidate profile, kept out of the components so they can be tested. */
import { skillBaseName } from "../candidate-view.ts";

/**
 * The candidate's skills in the project's terms: those the project asks for
 * (matched on the base name, level dropped, case ignored) and the rest, each
 * in the order the candidate listed them. With no project every skill is "other".
 */
export function splitSkills(skills: string[], wanted: string[]): { matches: string[]; others: string[] } {
  const wantedSet = new Set(wanted.map((s) => skillBaseName(s).toLowerCase()));
  const matches: string[] = [];
  const others: string[] = [];
  for (const skill of skills) (wantedSet.has(skillBaseName(skill).toLowerCase()) ? matches : others).push(skill);
  return { matches, others };
}

/** Axes high to low; unrated ones last, each group keeping its given order. */
export function rankAxes<T extends { value: number | null }>(axes: T[]): T[] {
  const rated = axes.filter((a): a is T & { value: number } => a.value !== null);
  return [...rated.sort((a, b) => b.value - a.value), ...axes.filter((a) => a.value === null)];
}

export type ProfileAction = { kind: "send" } | { kind: "view"; proposalId: string } | { kind: "blocked"; reason: string };

/**
 * The one control (or sentence) the floating bar carries below xl: the same
 * choice the rail makes, in the same order. Null when the rail has nothing to say.
 */
export function mainAction(
  action: ProfileAction,
  relation: { hired: boolean; proposal: { id: string } | null } | null,
): { kind: "send" } | { kind: "view"; proposalId: string } | { kind: "placement"; proposalId: string } | { kind: "reason"; text: string } | null {
  if (action.kind === "send") return { kind: "send" };
  if (action.kind === "view") return { kind: "view", proposalId: action.proposalId };
  if (relation?.hired) return relation.proposal ? { kind: "placement", proposalId: relation.proposal.id } : null;
  return { kind: "reason", text: action.reason };
}
