import { BANDS, bandFor } from "../../../lib/score.ts";

/**
 * The hourly rate of the band a score falls in, in plain words. Numbers come
 * from BANDS (lib/score); nothing is invented. INR only: interns see India.
 */
export function bandRateLine(score: number): string {
  const band = bandFor(score);
  if (band.rateMinor <= 0) {
    return `${band.name} band: ${band.blurb.replace(/\.$/, "")}. Reach ${BANDS[1].min.toFixed(0)}.0 to move up a band.`;
  }
  const rupees = band.rateMinor / 100;
  return `${band.name} band: employers book you at ₹${rupees.toLocaleString("en-IN")} an hour. ${band.blurb}`;
}
