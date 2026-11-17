/**
 * Autosave as a pure state machine: edit -> pending -> saving -> saved | error.
 *
 * One machine per unit that saves on its own (a plan card, the activation fee,
 * the stipends...). The React hook (components/admin/use-autosave.ts) only owns
 * the timer and the request; every decision lives here so `node --test` covers it:
 *  - an invalid draft is never saved (it says why instead);
 *  - saves are serialised: while one is in flight edits only update the draft, and the
 *    next save goes out after it settles, so two requests for one unit never race;
 *  - a failed save keeps the draft and the server's message and does not retry by itself;
 *    the next edit, or Retry, sends it again;
 *  - `prev` is the server value before the last successful save, for a one-step Undo.
 */

/** Quiet time after the last edit before a save goes out. */
export const AUTOSAVE_DELAY_MS = 1200;

export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error" | "invalid";

export type AutosaveState<T> = {
  /** Last value the server confirmed. */
  saved: T;
  /** What the form shows now. */
  draft: T;
  /** The value in flight, null when no request is out. */
  sending: T | null;
  /** The server value before the last successful save: what Undo restores. */
  prev: T | null;
  /** Inline validation message; while set nothing is saved. */
  invalid: string | null;
  /** The server's message for the last failed save. */
  error: string | null;
  /** A save just succeeded (fades back to idle on `settle`). */
  justSaved: boolean;
  /** The next fire should not wait for the debounce (a switch, an undo). */
  fireNow: boolean;
  /** The request in flight is an undo, so it leaves nothing to undo. */
  undoing: boolean;
  /** Counts requests started; the hook runs one request per increment. */
  seq: number;
};

export type AutosaveAction<T> =
  | { type: "edit"; draft: T; invalid?: string | null; immediate?: boolean }
  | { type: "fire" }
  | { type: "ok" }
  | { type: "fail"; message: string }
  | { type: "retry" }
  | { type: "undo" }
  | { type: "discard" }
  | { type: "settle" }
  | { type: "sync"; value: T };

export function createAutosave<T>(eq: (a: T, b: T) => boolean) {
  const dirty = (s: AutosaveState<T>) => !eq(s.draft, s.saved);

  function status(s: AutosaveState<T>): AutosaveStatus {
    if (s.sending !== null) return "saving";
    if (s.invalid) return "invalid";
    if (s.error !== null) return "error";
    if (dirty(s)) return "pending";
    return s.justSaved ? "saved" : "idle";
  }

  /** Should a request start once the debounce runs out? */
  function wantsFire(s: AutosaveState<T>): boolean {
    return s.sending === null && !s.invalid && s.error === null && dirty(s);
  }

  /** Edits that exist only in the browser: the page must not be left silently. */
  function unsaved(s: AutosaveState<T>): boolean {
    const st = status(s);
    return st === "pending" || st === "saving" || st === "error" || st === "invalid";
  }

  function start(s: AutosaveState<T>): AutosaveState<T> {
    return { ...s, sending: s.draft, justSaved: false, fireNow: false, seq: s.seq + 1 };
  }

  function init(value: T): AutosaveState<T> {
    return { saved: value, draft: value, sending: null, prev: null, invalid: null, error: null, justSaved: false, fireNow: false, undoing: false, seq: 0 };
  }

  function reduce(s: AutosaveState<T>, a: AutosaveAction<T>): AutosaveState<T> {
    switch (a.type) {
      case "edit":
        return { ...s, draft: a.draft, invalid: a.invalid ?? null, error: null, justSaved: false, fireNow: a.immediate === true, undoing: s.sending !== null ? s.undoing : false };
      case "fire":
        return wantsFire(s) ? start(s) : s.fireNow ? { ...s, fireNow: false } : s;
      case "ok":
        if (s.sending === null) return s;
        return { ...s, prev: s.undoing ? null : s.saved, saved: s.sending, sending: null, undoing: false, error: null, justSaved: true };
      case "fail":
        if (s.sending === null) return s;
        return { ...s, sending: null, undoing: false, error: a.message, fireNow: false };
      case "retry": {
        if (s.error === null || s.sending !== null || s.invalid) return s;
        const cleared = { ...s, error: null };
        return dirty(cleared) ? start(cleared) : cleared;
      }
      case "undo":
        if (s.prev === null || s.sending !== null) return s;
        return { ...s, draft: s.prev, invalid: null, error: null, justSaved: false, fireNow: true, undoing: true };
      case "discard":
        if (s.sending !== null) return s;
        return { ...s, draft: s.saved, invalid: null, error: null, fireNow: false, undoing: false };
      case "settle":
        return s.justSaved ? { ...s, justSaved: false } : s;
      case "sync":
        // Never overwrite edits (or a failure the admin has yet to see) with the server copy.
        if (s.sending !== null || s.invalid || s.error !== null || dirty(s)) return s;
        if (eq(s.saved, a.value)) return s;
        return { ...s, saved: a.value, draft: a.value, prev: null };
    }
  }

  return { init, reduce, status, wantsFire, unsaved };
}
