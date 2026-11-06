/**
 * Which of an employer's projects each candidate is shortlisted for.
 * The compare list is shared across projects (one cookie), but a shortlist is
 * per project, so the same candidate can sit on two. Pure, for the compare
 * page and the candidate cards.
 */
export function shortlistProjectsByIntern(
  rows: readonly { internId: string; projectName: string }[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { internId, projectName } of rows) {
    const name = projectName.trim();
    if (!name) continue;
    const list = out.get(internId) ?? [];
    if (!list.some((n) => n.toLowerCase() === name.toLowerCase())) list.push(name);
    out.set(internId, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  return out;
}
