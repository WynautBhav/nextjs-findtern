export type SkillMatch = { matched: string[]; missing: string[]; total: number };

function clean(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const t = raw.trim();
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length === 7) break;
  }
  return out;
}

/** Which wanted skills the candidate has. Case-insensitive, trimmed, deduped, both capped at 7. Names keep the wanted spelling. */
export function skillMatch(candidateSkills: readonly string[], wantedSkills: readonly string[]): SkillMatch {
  const have = new Set(clean(candidateSkills).map((s) => s.toLowerCase()));
  const wanted = clean(wantedSkills);
  const matched = wanted.filter((s) => have.has(s.toLowerCase()));
  const missing = wanted.filter((s) => !have.has(s.toLowerCase()));
  return { matched, missing, total: wanted.length };
}
