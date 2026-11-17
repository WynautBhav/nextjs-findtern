"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Undo2 } from "lucide-react";

import { AUTOSAVE_DELAY_MS, type AutosaveState, type createAutosave } from "@/lib/admin/autosave";
import { cn } from "@/lib/utils";

/**
 * The React half of autosave: it owns the debounce timer and the one request in
 * flight; every decision is in the pure machine (lib/admin/autosave.ts).
 *
 * `server` is the copy the page loaded; when it changes (after `router.refresh()`)
 * and nothing is being edited, the form adopts it. Edits are never overwritten.
 */

export type SaveResult = { ok: true } | { ok: false; error: string };

type Machine<T> = ReturnType<typeof createAutosave<T>>;

export function useAutosave<T>(
  machine: Machine<T>,
  server: T,
  save: (value: T, saved: T) => Promise<SaveResult>,
  onSaved?: () => void,
) {
  const [state, dispatch] = useReducer(machine.reduce, server, machine.init);

  // Re-sync from the server copy, during render (not in an effect): see AdminPricingEditor's old note.
  const serverKey = JSON.stringify(server);
  const [seenKey, setSeenKey] = useState(serverKey);
  if (seenKey !== serverKey) {
    setSeenKey(serverKey);
    dispatch({ type: "sync", value: server });
  }

  // Latest callbacks and state for the effects below (written in an effect, never during render).
  const saveRef = useRef(save);
  const onSavedRef = useRef(onSaved);
  const stateRef = useRef<AutosaveState<T>>(state);
  useEffect(() => {
    saveRef.current = save;
    onSavedRef.current = onSaved;
    stateRef.current = state;
  });

  // Debounce: a save goes out once edits have been quiet for AUTOSAVE_DELAY_MS (at once for a switch or undo).
  useEffect(() => {
    if (!machine.wantsFire(state)) return;
    const t = setTimeout(() => dispatch({ type: "fire" }), state.fireNow ? 0 : AUTOSAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [machine, state]);

  // One request per `seq`, so a re-render (or Strict Mode's second effect pass) never sends it twice.
  const startedSeq = useRef(0);
  useEffect(() => {
    if (state.sending === null || startedSeq.current >= state.seq) return;
    startedSeq.current = state.seq;
    saveRef.current(state.sending, state.saved).then(
      (r) => {
        dispatch(r.ok ? { type: "ok" } : { type: "fail", message: r.error });
        if (r.ok) onSavedRef.current?.();
      },
      () => dispatch({ type: "fail", message: "Not saved: the network request failed." }),
    );
  }, [state.sending, state.seq, state.saved]);

  // "Saved" fades back to the quiet "Live on the site".
  const justSaved = state.justSaved;
  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => dispatch({ type: "settle" }), 2500);
    return () => clearTimeout(t);
  }, [justSaved]);

  // Leaving the page with edits that are not on the server: warn (reload, close, back to another site).
  const unsaved = machine.unsaved(state);
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  // Hiding the tab or navigating inside the app: send what is waiting now rather than lose it.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden") dispatch({ type: "fire" });
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, []);
  useEffect(
    () => () => {
      const s = stateRef.current;
      // Unmounted (client-side navigation) with a valid edit still waiting: fire the request without a component to report to.
      if (machine.wantsFire(s)) void saveRef.current(s.draft, s.saved).catch(() => {});
    },
    [machine],
  );

  return {
    state,
    status: machine.status(state),
    edit: (draft: T, invalid: string | null = null, immediate = false) => dispatch({ type: "edit", draft, invalid, immediate }),
    /** Save what is waiting now (Enter, the Save now button). */
    flush: () => dispatch({ type: "fire" }),
    retry: () => dispatch({ type: "retry" }),
    undo: () => dispatch({ type: "undo" }),
    discard: () => dispatch({ type: "discard" }),
  };
}

type AutosaveApi<T> = ReturnType<typeof useAutosave<T>>;

/**
 * The visible state of one autosaving unit: Saving…, Saved, or the server's error with Retry,
 * plus a quiet "Live on the site" when nothing is waiting and an Undo for the last saved change.
 * Anything saved here is on the public site at once, so there is no confirm step: Undo is the way back.
 */
export function AutosaveStatus<T>({
  auto,
  live = "Live on the site",
  className,
}: {
  auto: Pick<AutosaveApi<T>, "state" | "status" | "retry" | "undo" | "discard">;
  /** What "nothing is waiting" means for this unit (a plan that is switched off is not on the site). */
  live?: string;
  className?: string;
}) {
  const { state, status } = auto;
  const canUndo = state.prev !== null && (status === "idle" || status === "saved");
  return (
    <div role="status" aria-live="polite" className={cn("flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1 text-xs", className)}>
      {status === "saving" ? (
        <span className="inline-flex items-center gap-1.5 text-ink-600">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…
        </span>
      ) : status === "pending" ? (
        <span className="inline-flex items-center gap-1.5 text-accent-700">
          <span className="size-1.5 rounded-full bg-accent-700" aria-hidden /> Unsaved · saving in a moment
        </span>
      ) : status === "saved" ? (
        <span className="inline-flex items-center gap-1.5 font-medium text-success">
          <CheckCircle2 className="size-3.5" aria-hidden /> Saved · {live.charAt(0).toLowerCase() + live.slice(1)}
        </span>
      ) : status === "error" ? (
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-danger">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          <span>Error: {state.error}</span>
          <button type="button" onClick={auto.retry} className="font-medium underline underline-offset-2">
            Retry
          </button>
          <button type="button" onClick={auto.discard} className="font-medium underline underline-offset-2">
            Discard change
          </button>
        </span>
      ) : status === "invalid" ? (
        <span className="inline-flex items-center gap-1.5 text-danger">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> Not saved: fix the highlighted field
          <button type="button" onClick={auto.discard} className="ml-1 font-medium underline underline-offset-2">
            Discard change
          </button>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-text-subtle">
          <span className="size-1.5 rounded-full bg-success" aria-hidden /> {live}
        </span>
      )}
      {canUndo ? (
        <button
          type="button"
          onClick={auto.undo}
          title="Put the previous saved value back"
          className="inline-flex items-center gap-1 font-medium text-brand-700 underline underline-offset-2"
        >
          <Undo2 className="size-3.5" aria-hidden /> Undo last change
        </button>
      ) : null}
    </div>
  );
}
