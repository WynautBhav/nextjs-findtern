import { rawScore } from "../employer-candidates.ts";

export const RATING_KEYS = ["communication", "coding", "aptitude", "interview"] as const;

/** A number sets the rating, `null` clears it, `undefined` leaves it alone. */
export type RatingUpdate = Partial<Record<(typeof RATING_KEYS)[number], number | null>>;

const clampRound = (n: number) => Math.round(Math.min(10, Math.max(0, n)) * 10) / 10;

/** Completed internships that each earned the intern +1 (max score stays 10). */
export function completionBonusCount(extra: Record<string, unknown>): number {
  const n = extra.completionBonusCount;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * How many of the granted bonuses are already inside the stored score.
 * `completionBonusApplied` records it; rows from before it existed count as
 * applied whenever they hold a score (the old code added the bonus then, or
 * the imported score was final) and as pending otherwise.
 */
function bonusApplied(extra: Record<string, unknown>): number {
  const count = completionBonusCount(extra);
  const n = extra.completionBonusApplied;
  if (typeof n === "number" && Number.isInteger(n) && n >= 0) return Math.min(n, count);
  return rawScore(extra) !== null ? count : 0;
}

/**
 * Admin grants the completion bonus for one successful internship: the count
 * goes up by one and a live score rises by 1, capped at 10. The count is kept
 * apart from the rated score so every later recompute (ratings edit, bulk
 * import, Incruiter webhook) adds it back. An intern with no score yet keeps
 * the bonus pending (count above `completionBonusApplied`); it is added, once,
 * when their first score arrives.
 */
export function grantCompletionBonus(extra: Record<string, unknown>): Record<string, unknown> {
  const count = completionBonusCount(extra) + 1;
  const next: Record<string, unknown> = { ...extra, completionBonusCount: count };
  const live = rawScore(extra);
  if (live !== null) {
    next.findternScore = clampRound(live + 1);
    next.completionBonusApplied = bonusApplied(extra) + 1;
  } else {
    next.completionBonusApplied = bonusApplied(extra);
  }
  return next;
}

/**
 * Merge new AI-interview ratings into `extraData`.
 *
 * Same rule as legacy: the Findtern Score is the given one when present (bulk
 * import column), otherwise the mean of the four core ratings only - older
 * `overall` / `academic` keys never count - clamped to 0-10 and rounded to one
 * decimal. With no ratings left and no given score, the score is removed.
 * Each granted completion bonus (see `grantCompletionBonus`) adds 1 to a score
 * computed from the ratings, before the 0-10 clamp. A given (bulk import)
 * score is final when the stored score already includes the bonus: it is the
 * number the admin sees and exports, so importing it back must not add the
 * bonus twice. Only a bonus still pending (granted before any score existed,
 * so no exported number can contain it) is added to a given score, once; the
 * applied counter then stops it being added again.
 *
 * Admins must NOT hand-add +1 in a sheet for a granted bonus: the bonus is
 * added here (or already sits in the exported number), so a hand-added +1
 * would count twice.
 *
 * Clearing the score keeps `completionBonusApplied` as it was (never reset
 * to 0): re-importing an old sheet later must not add the bonus a second time.
 */
export function applyRatings(
  extra: Record<string, unknown>,
  updates: RatingUpdate,
  explicitScore?: number | null,
): Record<string, unknown> {
  const ratings: Record<string, number> = { ...((extra.ratings as Record<string, number>) ?? {}) };
  for (const [k, v] of Object.entries(updates)) {
    if (v === null) delete ratings[k];
    else if (typeof v === "number" && Number.isFinite(v)) ratings[k] = clampRound(v); // 0-10, one decimal, like the score
  }
  const values = RATING_KEYS.map((k) => ratings[k]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const count = completionBonusCount(extra);
  const pending = count - bonusApplied(extra);
  const score =
    typeof explicitScore === "number" && Number.isFinite(explicitScore)
      ? clampRound(explicitScore + pending)
      : values.length
        ? clampRound(values.reduce((a, b) => a + b, 0) / values.length + count)
        : null;
  const next: Record<string, unknown> = { ...extra, ratings };
  const clearing = Object.values(updates).some((v) => v === null);
  if (score === null && !clearing && values.length === 0) {
    // Nothing rated and nothing cleared (a link-only save, a webhook with no usable score): an imported score stays.
    return next;
  }
  if (score === null) {
    delete next.findternScore;
    // Pin the counter (legacy rows without it would otherwise read as pending once the score is gone).
    if (count > 0) next.completionBonusApplied = bonusApplied(extra);
  } else {
    next.findternScore = score;
    if (count > 0) next.completionBonusApplied = count;
  }
  return next;
}

type PendingResult = { updates: RatingUpdate; reportUrl?: string; recordingUrl?: string };

/** Unpaid intern: keep what InCruiter sent, apply nothing. A newer result replaces an older pending one. */
export function holdPendingResult(extra: Record<string, unknown>, r: PendingResult, receivedAt = new Date()): Record<string, unknown> {
  const updates = Object.fromEntries(Object.entries(r.updates).filter(([, v]) => typeof v === "number"));
  return { ...extra, incruiterPending: { updates, reportUrl: r.reportUrl, recordingUrl: r.recordingUrl, receivedAt: receivedAt.toISOString() } };
}

/** Once paid: apply a held result and drop the pending key. Null when nothing is held. */
export function releasePendingResult(extra: Record<string, unknown>): Record<string, unknown> | null {
  const held = extra.incruiterPending as (PendingResult & { receivedAt?: string }) | undefined;
  if (!held || typeof held !== "object") return null;
  const { incruiterPending: _drop, ...rest } = extra; // eslint-disable-line @typescript-eslint/no-unused-vars
  const next = applyRatings(rest, held.updates ?? {});
  if (held.reportUrl) next.incruiterReportUrl = held.reportUrl;
  if (held.recordingUrl) next.incruiterRecordingUrl = held.recordingUrl;
  return next;
}

/** True when this change gives the intern their first live (> 0) score. */
export function firstLiveScore(prev: Record<string, unknown>, next: Record<string, unknown>): boolean {
  const live = (e: Record<string, unknown>) => (rawScore(e) ?? 0) > 0;
  return !live(prev) && live(next);
}

/**
 * Which AI interview a newly live score closes (ADP-22). Legacy closed only
 * the intern's latest AI interview, and only when it was not already
 * completed; older rows (missed, cancelled, expired attempts) keep their
 * status so the history stays true. `rows` must be AI interviews only.
 */
export function aiInterviewToClose<T extends { id: string; status: string | null; createdAt: Date | null }>(rows: T[]): T | null {
  const latest = [...rows].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))[0];
  if (!latest) return null;
  const status = String(latest.status ?? "").trim().toLowerCase();
  return status && status !== "completed" ? latest : null;
}

/** Minimal RFC 4180 CSV reader: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

export const RATINGS_TEMPLATE = "email,communication,coding,aptitude,ai interview,findternScore\r\nintern@example.com,8,7,6,7,7\r\n";

/** The same template as rows, for the .xlsx sample (legacy shipped an Excel one). */
export const RATINGS_TEMPLATE_ROWS: (string | number)[][] = [
  ["email", "communication", "coding", "aptitude", "ai interview", "findternScore"],
  ["intern@example.com", 8, 7, 6, 7, 7],
];

/** Legacy aliases. Headings match ignoring case, spaces, `-` and `_`. */
const HEADER_KEYS: Record<string, string[]> = {
  email: ["email", "email address", "user email", "e-mail", "mail"],
  communication: ["communication", "comm", "communication rating"],
  coding: ["coding", "code", "coding rating"],
  aptitude: ["aptitude", "apt", "aptitude rating"],
  interview: ["ai interview", "interview", "ai interview rating", "interview rating"],
  findternScore: ["findternscore", "findtern score", "findtern", "score"],
};

const normHeader = (h: string) => h.toLowerCase().replace(/[\s\-_]/g, "");

/** Rows of { email, updates, score } from the bulk ratings sheet. */
export function readRatingsSheet(text: string): RatingsRow[] {
  return readRatingsRows(parseCsv(text));
}

export type RatingsRow = { row: number; email: string; updates: RatingUpdate; score: number | null; error?: string };

/** Same as `readRatingsSheet`, from rows already split into cells (CSV or .xlsx). */
export function readRatingsRows(cells: string[][]): RatingsRow[] {
  const [header, ...rows] = cells;
  if (!header) return [];
  const col = (key: string) => {
    const wanted = HEADER_KEYS[key].map(normHeader);
    return header.findIndex((h) => wanted.includes(normHeader(h)));
  };
  const idx = Object.fromEntries(Object.keys(HEADER_KEYS).map((k) => [k, col(k)]));
  const num = (r: string[], k: string) => {
    if (idx[k] < 0) return undefined;
    const raw = (r[idx[k]] ?? "").trim();
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 10 ? n : NaN;
  };
  return rows.map((r, i) => {
    const email = (r[idx.email] ?? "").trim().toLowerCase();
    const updates: RatingUpdate = {};
    for (const k of ["communication", "coding", "aptitude", "interview"] as const) {
      const v = num(r, k);
      if (v !== undefined) updates[k] = v;
    }
    const score = num(r, "findternScore") ?? null;
    const bad = Object.values(updates).some((v) => Number.isNaN(v)) || Number.isNaN(score);
    return {
      row: i + 2,
      email,
      updates,
      score,
      error: !email ? "Missing email" : bad ? "Ratings must be numbers from 0 to 10" : Object.keys(updates).length === 0 && score == null ? "No ratings" : undefined,
    };
  });
}
