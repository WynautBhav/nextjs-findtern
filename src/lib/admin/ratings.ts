export type RatingUpdate = Partial<Record<"communication" | "coding" | "aptitude" | "interview", number>>;

/**
 * Merge new AI-interview ratings into `extraData`. The Findtern Score is the
 * given one when present (bulk import column), otherwise the mean of the
 * four ratings.
 */
export function applyRatings(
  extra: Record<string, unknown>,
  updates: RatingUpdate,
  explicitScore?: number | null,
): Record<string, unknown> {
  const defined = Object.fromEntries(Object.entries(updates).filter(([, v]) => typeof v === "number"));
  const ratings = { ...((extra.ratings as Record<string, number>) ?? {}), ...defined };
  const values = Object.values(ratings).filter((v): v is number => typeof v === "number");
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  return { ...extra, ratings, findternScore: explicitScore ?? mean };
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

const HEADER_KEYS: Record<string, string[]> = {
  email: ["email", "email address", "user email"],
  communication: ["communication", "comm"],
  coding: ["coding", "code"],
  aptitude: ["aptitude", "apt"],
  interview: ["ai interview", "ai_interview", "interview"],
  findternScore: ["findternscore", "findtern score", "score"],
};

/** Rows of { email, updates, score } from the bulk ratings sheet. */
export function readRatingsSheet(text: string): { row: number; email: string; updates: RatingUpdate; score: number | null; error?: string }[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const col = (key: string) => header.findIndex((h) => HEADER_KEYS[key].includes(h.trim().toLowerCase()));
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
