import { legacyOverLimit } from "../skills-limit.ts";

export type OverLimitIntern = { userId: string; count: number; skills: string[] };

/** Pure: pick the rows holding more than 7 skills (skills may be strings or {name}). */
export function pickOverLimit(rows: { userId: string; skills: unknown }[]): OverLimitIntern[] {
  const out: OverLimitIntern[] = [];
  for (const r of rows) {
    if (!legacyOverLimit(r.skills)) continue;
    const names = (r.skills as unknown[]).map((s) => (typeof s === "string" ? s : ((s as { name?: string })?.name ?? ""))).filter(Boolean);
    out.push({ userId: r.userId, count: names.length, skills: names });
  }
  return out.sort((a, b) => b.count - a.count);
}

/**
 * Admin follow-up: interns whose stored skills exceed the limit (legacy data).
 * Call from an admin report or script; no page uses it yet.
 */
export async function listInternsOverSkillLimit(): Promise<OverLimitIntern[]> {
  const { getDb, schema } = await import("../db");
  const rows = await getDb()
    .select({ userId: schema.internOnboarding.userId, skills: schema.internOnboarding.skills })
    .from(schema.internOnboarding);
  return pickOverLimit(rows);
}
