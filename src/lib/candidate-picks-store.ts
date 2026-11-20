/**
 * Client-side truth for the two things on the Candidates page that change without a page render:
 * the compare picks (a tick) and the shortlist star. Plain module state with subscribers (no React here), read in
 * components through `useSyncExternalStore` (see hooks/use-candidate-picks.ts).
 *
 * - Compare picks belong to a project. The page seeds them from the server on every project it shows; a tick calls
 *   `setPicks`. The Candidates region writes them to the `ft_emp_compare` cookie (RememberSelection) so the compare page and
 *   a reload agree. The server never needs them in the results query, so a tick costs no request at all.
 * - A shortlist change is an *override* of what the (possibly cached) results say, per project and candidate, until the
 *   next page load. The results response only fills in the rest.
 */

import { MAX_COMPARE } from "./compare-map.ts";

export type PicksState = { project: string | null; ids: string[] };

type Listener = () => void;

let picks: PicksState = { project: null, ids: [] };
const pickListeners = new Set<Listener>();
const shortlistOverrides = new Map<string, boolean>();
let shortlistVersion = 0;
const shortlistListeners = new Set<Listener>();

const same = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export function getPicks(): PicksState {
  return picks;
}

/** From the server: the picks for `project`. A no-op when nothing changed (keeps the snapshot stable for React). */
export function seedPicks(project: string | null, ids: string[]): void {
  if (picks.project === project && same(picks.ids, ids)) return;
  picks = { project, ids: ids.slice(0, MAX_COMPARE) };
  pickListeners.forEach((fn) => fn());
}

/** A tick or Deselect all: replaces this project's picks (never more than four). */
export function setPicks(ids: string[]): void {
  if (same(picks.ids, ids)) return;
  picks = { project: picks.project, ids: ids.slice(0, MAX_COMPARE) };
  pickListeners.forEach((fn) => fn());
}

/** Tick or untick one candidate. Returns false when four are already picked and this one is not among them. */
export function togglePick(internId: string): boolean {
  const lower = internId.toLowerCase();
  const has = picks.ids.some((id) => id.toLowerCase() === lower);
  if (has) {
    setPicks(picks.ids.filter((id) => id.toLowerCase() !== lower));
    return true;
  }
  if (picks.ids.length >= MAX_COMPARE) return false;
  setPicks([...picks.ids, internId]);
  return true;
}

export function subscribePicks(fn: Listener): () => void {
  pickListeners.add(fn);
  return () => pickListeners.delete(fn);
}

const key = (projectId: string, internId: string) => `${projectId}:${internId}`;

/** What the user last did to this star, or undefined when the results' own value stands. */
export function getShortlistOverride(projectId: string, internId: string): boolean | undefined {
  return shortlistOverrides.get(key(projectId, internId));
}

/** Record a star change (optimistic or confirmed); `undefined` drops the override (rollback to what the results say). */
export function setShortlistOverride(projectId: string, internId: string, on: boolean | undefined): void {
  const k = key(projectId, internId);
  if (on === undefined) {
    if (!shortlistOverrides.delete(k)) return;
  } else {
    if (shortlistOverrides.get(k) === on) return;
    shortlistOverrides.set(k, on);
  }
  shortlistVersion += 1;
  shortlistListeners.forEach((fn) => fn());
}

/** Changes on every star change: a cheap snapshot for `useSyncExternalStore`. */
export function shortlistSnapshot(): number {
  return shortlistVersion;
}

export function subscribeShortlist(fn: Listener): () => void {
  shortlistListeners.add(fn);
  return () => shortlistListeners.delete(fn);
}

/** The event the console shell listens to to move the Shortlist badge without a page render. */
export const SHORTLIST_EVENT = "ft:shortlist-changed";
export type ShortlistEventDetail = { projectId: string; internId: string; on: boolean };

export function announceShortlist(detail: ShortlistEventDetail): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<ShortlistEventDetail>(SHORTLIST_EVENT, { detail }));
}

/** Tests only. */
export function resetPicksStore(): void {
  picks = { project: null, ids: [] };
  shortlistOverrides.clear();
  shortlistVersion = 0;
}

/**
 * The Shortlist badge: the server's number plus the stars pressed since that number was drawn. A star on or off is +1 / -1 for
 * that one candidate on that project; the badge counts distinct people across projects, so a person already on another
 * project's shortlist is counted once by the server and the adjustment can be one off until the next page load replaces it.
 * Never below zero; "99+" stays "99+" (the true number is not known).
 */
export function adjustedBadge(base: number | string | undefined, delta: number): number | string | undefined {
  if (typeof base === "string") return base;
  const next = Math.max(0, (base ?? 0) + delta);
  return next > 0 ? (next > 99 ? "99+" : next) : undefined;
}
