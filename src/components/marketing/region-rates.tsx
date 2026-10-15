"use client";

import { useSyncExternalStore } from "react";

import { formatMoney, formatRate, detectIsIndia } from "@/lib/format";
import {
  BANDS,
  bandsForRegion,
  currencyForRegion,
  type Band,
  type BandId,
} from "@/lib/score";

/**
 * Region-aware rates for marketing surfaces.
 *
 * Server components render INR (the safe default) and cannot know the
 * visitor's region; every marketing price therefore resolves on the client
 * through `useRegionBands()`. Callers pass a band *id*, never an amount -
 * passing an INR amount and formatting it as USD is exactly how the site
 * once printed ₹1/hr and ₹2/hr. Geometry (band ids, min/max) never moves -
 * only money does - so the swap cannot reshape a layout.
 */

export function useRegionBands(): {
  isIndia: boolean;
  currency: "INR" | "USD";
  bands: Band[];
} {
  const isIndia = useIsIndia();
  return {
    isIndia,
    currency: currencyForRegion(isIndia),
    bands: bandsForRegion(isIndia),
  };
}

/**
 * Client-side region for pricing. Reads the timezone via
 * useSyncExternalStore with a server snapshot of true, so the first client
 * render matches the server INR markup and there is no hydration mismatch.
 * Lives here - not in lib/format - because that module is imported by server
 * components, which cannot import client-only React APIs.
 */
export function useIsIndia(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => detectIsIndia(),
    () => true,
  );
}

/** The INR band geometry, for layouts that must not move between regions. */
export { BANDS };

function bandById(bands: Band[], id: BandId): Band {
  return bands.find((b) => b.id === id) ?? bands[0];
}

/** Formatted hourly rate for a band id, in the visitor's currency. */
export function BandRate({ bandId, className }: { bandId: BandId; className?: string }) {
  const { bands, currency } = useRegionBands();
  return <span className={className}>{formatRate(bandById(bands, bandId).rateMinor, currency)}</span>;
}

/** Formatted per-hire charge (or the waived label) for a band id. */
export function BandPerHire({
  bandId,
  waivedLabel = "Waived",
}: {
  bandId: BandId;
  waivedLabel?: string;
}) {
  const { bands, currency } = useRegionBands();
  const band = bandById(bands, bandId);
  return <>{band.perHireMinor > 0 ? formatMoney(band.perHireMinor, currency) : waivedLabel}</>;
}
