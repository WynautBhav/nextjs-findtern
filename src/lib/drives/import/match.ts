import { nameKey, normaliseEmail } from "./normalize.ts";

export type CandidateUser = { id: string; email: string; emailVerified: boolean; phone?: string | null; name: string };
export type MatchEntry = { email: string; phone: string | null; name: string };
export type MatchKind = "email_exact" | "phone_name_suggestion" | "ambiguous" | "none";
export type MatchResult = { kind: MatchKind; candidates: string[] };

/**
 * email_exact: entry email == a VERIFIED user's email (auto-link candidate).
 * phone_name_suggestion: same phone AND same name; admin review only, never links.
 * Several matches at any tier → ambiguous, nothing is picked. Unverified email never matches.
 */
export function matchEntry(entry: MatchEntry, users: readonly CandidateUser[]): MatchResult {
  const email = normaliseEmail(entry.email);
  if (email) {
    const hits = users.filter((u) => u.emailVerified && u.email.trim().toLowerCase() === email);
    if (hits.length === 1) return { kind: "email_exact", candidates: [hits[0].id] };
    if (hits.length > 1) return { kind: "ambiguous", candidates: hits.map((u) => u.id) };
  }
  if (entry.phone) {
    const key = nameKey(entry.name);
    const hits = users.filter((u) => u.phone && u.phone === entry.phone && key !== "" && nameKey(u.name) === key);
    if (hits.length === 1) return { kind: "phone_name_suggestion", candidates: [hits[0].id] };
    if (hits.length > 1) return { kind: "ambiguous", candidates: hits.map((u) => u.id) };
  }
  return { kind: "none", candidates: [] };
}
