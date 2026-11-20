"use client";

import { useSyncExternalStore } from "react";

import { getPicks, getShortlistOverride, shortlistSnapshot, subscribePicks, subscribeShortlist, type PicksState } from "@/lib/candidate-picks-store";

const SERVER: PicksState = { project: null, ids: [] };

/** The compare picks for the project on screen (client truth; seeded by the Candidates region). */
export function useComparePicks(): PicksState {
  return useSyncExternalStore(subscribePicks, getPicks, () => SERVER);
}

/** The star: what the user last did to it, else `initial` (what the results say). Re-renders only on a star change. */
export function useShortlisted(projectId: string, internId: string, initial: boolean): boolean {
  useSyncExternalStore(subscribeShortlist, shortlistSnapshot, () => 0);
  return getShortlistOverride(projectId, internId) ?? initial;
}
