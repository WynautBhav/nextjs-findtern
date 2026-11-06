/** Shortlist rows are people, not saved lines: one row per candidate, however many projects they are saved to. */

type Line = { candidate: { id: string }; projectId: string; projectName: string | null };

/** Groups lines by candidate in first-seen order; `primary` is that person's first line. */
export function groupByCandidate<T extends Line>(lines: T[]): { primary: T; lines: T[] }[] {
  const groups = new Map<string, { primary: T; lines: T[] }>();
  for (const l of lines) {
    const g = groups.get(l.candidate.id);
    if (g) g.lines.push(l);
    else groups.set(l.candidate.id, { primary: l, lines: [l] });
  }
  return [...groups.values()];
}

/** "A", "A, B", "A, B +N": the projects one person is saved to. */
export function projectsLabel(lines: Line[]): string {
  const names = lines.map((l) => l.projectName ?? "Project");
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}
