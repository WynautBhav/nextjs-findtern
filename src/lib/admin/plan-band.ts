/**
 * The legacy site prices a candidate by reading each plan's
 * `features[1]` ("Under 6/10", "6-8/10", "8+/10 (Top Rated)") as a score band
 * (FindTern client/src/lib/pricingTiers.ts, parseScoreBand + deriveScoreTiers).
 * A plan whose band has no finite lower bound is not a tier there. Rewording
 * that row in the new admin silently changes or drops a legacy price (DB-26),
 * so the editor warns and the API refuses a reword that breaks a working band.
 */

export type ScoreBand = { min: number; max?: number };

/** Port of the legacy parser, byte-for-byte in behaviour. */
export function parseLegacyScoreBand(label: string): ScoreBand {
  const s = String(label ?? "").replace(/⭐/g, "").trim().toLowerCase();

  const plus = s.match(/(\d+(?:\.\d+)?)\s*\+\s*(?:\/\s*10)?/);
  if (plus) return { min: Number(plus[1]) };

  const range = s.match(/(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)(?:\s*\/\s*10)?/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };

  const lt = s.match(/less\s+than\s+(\d+(?:\.\d+)?)(?:\s*\/\s*10)?/);
  if (lt) return { min: Number.NEGATIVE_INFINITY, max: Number(lt[1]) };

  const under = s.match(/<\s*(\d+(?:\.\d+)?)(?:\s*\/\s*10)?/);
  if (under) return { min: Number.NEGATIVE_INFINITY, max: Number(under[1]) };

  return { min: Number.NEGATIVE_INFINITY, max: Infinity };
}

/** Whether legacy treats this row as a priced tier (finite lower bound). */
export function isLegacyTier(label: string | undefined | null): boolean {
  return Number.isFinite(parseLegacyScoreBand(label ?? "").min);
}

/** "score 6 to 8", "score 8 and above", or null when legacy ignores it. */
export function describeLegacyBand(label: string | undefined | null): string | null {
  const band = parseLegacyScoreBand(label ?? "");
  if (!Number.isFinite(band.min)) return null;
  return band.max === undefined || !Number.isFinite(band.max) ? `score ${band.min} and above` : `score ${band.min} to below ${band.max}`;
}

/**
 * The warning (or refusal) for a change to the "Findtern Score" row.
 * `block` is true when a working legacy tier would stop parsing.
 */
export function legacyBandChange(
  previous: string | undefined | null,
  next: string | undefined | null,
): { block: boolean; message: string } | null {
  const before = describeLegacyBand(previous);
  const after = describeLegacyBand(next);
  if ((previous ?? "").trim() === (next ?? "").trim()) return null;
  if (before && !after) {
    return {
      block: true,
      message: `The legacy site reads this row as "${before}" to price candidates. "${String(next ?? "").trim() || "(blank)"}" can't be read that way. Keep a band like "6-8/10" or "8+/10".`,
    };
  }
  if (before !== after) {
    return {
      block: false,
      message: after
        ? `The legacy site will now price this plan for ${after}${before ? ` (was ${before})` : ""}.`
        : "The legacy site ignores this row for pricing.",
    };
  }
  return null;
}
