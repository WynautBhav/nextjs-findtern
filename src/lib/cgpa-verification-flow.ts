import { CGPA_SLA_HOURS, readCgpaVerification, type CgpaVerification } from "./cgpa-verification.ts";
import { scoreProblem, type ScoreType } from "./onboarding.ts";

/**
 * The writers around `extra_data.cgpaVerification` (the reader and the gate live in cgpa-verification.ts):
 * what a profile save does to it, what an admin decision does to it, and the SLA clock the admin queue shows.
 * Pure: the routes read and write the rows. History is kept inside the same jsonb value, so no migration.
 */

export type CgpaHistoryEvent = "requested" | "reset" | "verified" | "incorrect";

export type CgpaHistoryEntry = {
  at: string;
  event: CgpaHistoryEvent;
  claimedScore: string;
  scoreType: ScoreType | "";
  semester: number | null;
  correctedScore?: string;
  by?: string;
  note?: string;
};

/** What `extra_data.cgpaVerification` holds: the normalised fields plus the history. */
export type StoredCgpaVerification = CgpaVerification & { history: CgpaHistoryEntry[] };

const MAX_HISTORY = 20;
const HOUR_MS = 3_600_000;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** The stored history, oldest first; anything unreadable is dropped. */
export function readCgpaHistory(extraData: unknown): CgpaHistoryEntry[] {
  const raw = isRecord(extraData) && isRecord(extraData.cgpaVerification) ? extraData.cgpaVerification.history : null;
  if (!Array.isArray(raw)) return [];
  const out: CgpaHistoryEntry[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.at !== "string") continue;
    const event = item.event;
    if (event !== "requested" && event !== "reset" && event !== "verified" && event !== "incorrect") continue;
    const entry: CgpaHistoryEntry = {
      at: item.at,
      event,
      claimedScore: typeof item.claimedScore === "string" ? item.claimedScore : "",
      scoreType: item.scoreType === "cgpa" || item.scoreType === "percentage" ? item.scoreType : "",
      semester: typeof item.semester === "number" && Number.isInteger(item.semester) ? item.semester : null,
    };
    if (typeof item.correctedScore === "string") entry.correctedScore = item.correctedScore;
    if (typeof item.by === "string") entry.by = item.by;
    if (typeof item.note === "string") entry.note = item.note;
    out.push(entry);
  }
  return out;
}

/** The score the profile holds now: the corrected one after an "incorrect" decision, else the claim. */
export function effectiveScore(v: CgpaVerification): string {
  return v.status === "incorrect" && v.correctedScore !== undefined ? v.correctedScore : v.claimedScore;
}

/** "8.4", "8.40" and "8.4%" are one score. */
function sameScore(a: string, b: string): boolean {
  const x = a.trim().replace(/%$/, "");
  const y = b.trim().replace(/%$/, "");
  if (x === y) return true;
  const nx = Number(x);
  const ny = Number(y);
  return x !== "" && y !== "" && Number.isFinite(nx) && Number.isFinite(ny) && nx === ny;
}

export type CgpaClaim = { score: string; scoreType: ScoreType | ""; semester: number | null };

function withHistory(v: CgpaVerification, history: CgpaHistoryEntry[], entry: CgpaHistoryEntry): StoredCgpaVerification {
  return { ...v, history: [...history, entry].slice(-MAX_HISTORY) };
}

/**
 * What a profile save does to `cgpaVerification`. A semester and a score together flag the intern `pending`; a
 * change of score, score type or semester starts the check again (the earlier decision stays in the history).
 * Returns the value to store, or null when nothing changes: no semester or no score (legacy interns are never
 * gated), or the same claim as before.
 */
export function nextCgpaVerification(extraData: unknown, claim: CgpaClaim, now: Date = new Date()): StoredCgpaVerification | null {
  const score = claim.score.trim();
  if (claim.semester === null || score === "") return null;
  const prev = readCgpaVerification(extraData);
  const flagged = prev.status !== "not_required";
  if (flagged && prev.semester === claim.semester && prev.scoreType === claim.scoreType && sameScore(effectiveScore(prev), score)) return null;

  const history = readCgpaHistory(extraData);
  const at = now.toISOString();
  const verification: CgpaVerification = { status: "pending", claimedScore: score, scoreType: claim.scoreType, semester: claim.semester, requestedAt: at };
  return withHistory(verification, history, {
    at,
    event: flagged || history.length > 0 ? "reset" : "requested",
    claimedScore: score,
    scoreType: claim.scoreType,
    semester: claim.semester,
  });
}

export type CgpaDecisionInput = { decision: "verified" | "incorrect"; correctedScore?: string; note?: string };

/** What is wrong with a decision (null when fine). `claimed` is the score being judged. */
export function decisionProblem(input: CgpaDecisionInput, claimed: string, scoreType: ScoreType | ""): string | null {
  if (input.decision !== "incorrect") return null;
  const corrected = (input.correctedScore ?? "").trim();
  if (!corrected) return "Enter the corrected score.";
  const bad = scoreProblem(scoreType, corrected);
  if (bad) return bad;
  if (sameScore(corrected, claimed)) return "The corrected score must be different from the claimed one. Use Verify if it is right.";
  if (!(input.note ?? "").trim()) return "Add a note saying what the proof shows.";
  return null;
}

export type CgpaDecisionResult =
  | { ok: true; noop: boolean; verification: StoredCgpaVerification; previous: CgpaVerification; newScore: string | null }
  | { ok: false; status: 400 | 409; error: string };

/**
 * An admin's decision on a pending check. Verified keeps the profile score; incorrect replaces it with the
 * corrected one (`newScore`) and keeps the claim in the history. The same decision again is a no-op (so a
 * double click or a retry writes, audits and emails once); a different decision on a decided check is refused,
 * because the intern has to change their score for it to be checked again.
 */
export function applyCgpaDecision(
  extraData: unknown,
  input: CgpaDecisionInput & { by: string; now?: Date },
): CgpaDecisionResult {
  const now = input.now ?? new Date();
  const prev = readCgpaVerification(extraData);
  const history = readCgpaHistory(extraData);
  if (prev.status === "not_required") return { ok: false, status: 409, error: "This candidate has no CGPA check to decide." };
  if (prev.status !== "pending") {
    if (prev.status === input.decision) {
      return { ok: true, noop: true, verification: { ...prev, history }, previous: prev, newScore: null };
    }
    return { ok: false, status: 409, error: `This check was already marked ${prev.status === "verified" ? "correct" : "incorrect"}. The candidate has to change their score before it can be decided again.` };
  }
  const problem = decisionProblem(input, prev.claimedScore, prev.scoreType);
  if (problem) return { ok: false, status: 400, error: problem };

  const at = now.toISOString();
  const note = (input.note ?? "").trim();
  const next: CgpaVerification = { ...prev, status: input.decision, decidedAt: at, decidedBy: input.by };
  if (note) next.note = note;
  let newScore: string | null = null;
  if (input.decision === "incorrect") {
    newScore = (input.correctedScore ?? "").trim();
    next.correctedScore = newScore;
  }
  const verification = withHistory(next, history, {
    at,
    event: input.decision,
    claimedScore: prev.claimedScore,
    scoreType: prev.scoreType,
    semester: prev.semester,
    ...(newScore ? { correctedScore: newScore } : {}),
    by: input.by,
    ...(note ? { note } : {}),
  });
  return { ok: true, noop: false, verification, previous: prev, newScore };
}

export type CgpaSlaTone = "none" | "ok" | "soon" | "overdue";

/**
 * The SLA clock on an accepted offer: green under 24 h in, amber from 24 h to the 48 h deadline, red after it.
 * No acceptance yet means nothing is due.
 */
export function cgpaSla(acceptedAt: string | null, now: Date = new Date()): { tone: CgpaSlaTone; label: string; hoursElapsed: number | null } {
  const start = acceptedAt ? Date.parse(acceptedAt) : NaN;
  if (!Number.isFinite(start)) return { tone: "none", label: "Not accepted yet", hoursElapsed: null };
  const elapsed = (now.getTime() - start) / HOUR_MS;
  if (elapsed >= CGPA_SLA_HOURS.max) {
    const over = Math.floor(elapsed - CGPA_SLA_HOURS.max);
    return { tone: "overdue", label: over < 1 ? "Overdue" : `${over} h overdue`, hoursElapsed: elapsed };
  }
  const left = Math.max(1, Math.ceil(CGPA_SLA_HOURS.max - elapsed));
  return { tone: elapsed >= CGPA_SLA_HOURS.min ? "soon" : "ok", label: `${left} h left`, hoursElapsed: elapsed };
}

/**
 * The offer details after the intern accepts: `acceptedAt` is stamped the first time only (the SLA clock and the
 * expiry rules read it), and a later call never moves it.
 */
export function withAcceptedAt(offerDetails: unknown, now: Date = new Date()): Record<string, unknown> {
  const base = isRecord(offerDetails) ? offerDetails : {};
  const existing = typeof base.acceptedAt === "string" ? Date.parse(base.acceptedAt) : NaN;
  return Number.isFinite(existing) ? { ...base } : { ...base, acceptedAt: now.toISOString() };
}

/**
 * The offer details of an accepted, unpaid offer after Findtern marks its intern's CGPA incorrect: the correction is
 * recorded and any earlier confirmation by the employer is cleared, so the employer has to confirm the corrected
 * score (proposalCgpaGate reads `cgpaAckAt` against the decision time).
 */
export function withCgpaCorrection(offerDetails: unknown, c: { from: string; to: string; scoreType: string; at: string }): Record<string, unknown> {
  const { cgpaAckAt: _ack, ...rest } = isRecord(offerDetails) ? offerDetails : ({} as Record<string, unknown>);
  void _ack;
  return { ...rest, cgpaCorrection: { from: c.from, to: c.to, scoreType: c.scoreType, at: c.at } };
}
