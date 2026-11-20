/** Auth and onboarding forms (see the placement note in ChatWidget). */
export const FORM_ROUTE =
  /^\/(?:login|signup|forgot-password|reset-password|verify-email|(?:intern|employer)\/onboarding)(?:\/|$)/;

/** Where a person is filling something in: the forms above, profile/settings/document edits, and the contact form. */
const EDIT_ROUTE = /^\/(?:contact|intern\/(?:profile|settings|documents|bank-details)|employer\/(?:account|send-proposal))(?:\/|$)/;

/**
 * May the chat put itself in front of the visitor (the nudge, or a queued open replayed once the widget has loaded)?
 * Never while a field has focus or a file picker is open, and never on a form or edit route. A click on "Ask Findy"
 * is the visitor's own and is handled by the caller, not here.
 */
export function mayAutoShow({ pathname, typing, uploading }: { pathname: string | null | undefined; typing: boolean; uploading: boolean }): boolean {
  if (typing || uploading) return false;
  const path = pathname ?? "";
  return !FORM_ROUTE.test(path) && !EDIT_ROUTE.test(path);
}

/**
 * Where the floating launcher sits for a route. The intern onboarding page is a form, but it renders inside the intern
 * console, whose top bar already carries "Ask Findy"; treating it as a plain form left a second, floating launcher on
 * desktop. So it counts as console here (launcher off, panel opens from the top bar), not as a form.
 */
export function launcherPlacement(pathname: string | null | undefined) {
  const path = pathname ?? "";
  const isForm = FORM_ROUTE.test(path) && !/^\/intern\/onboarding(?:\/|$)/.test(path);
  return {
    isForm,
    inApp: !isForm && /^\/(intern|employer|college)(\/|$)/.test(path),
    hasBottomNav: !isForm && /^\/(intern|college)(\/|$)/.test(path),
    /** The intern and employer consoles have "Ask Findy" in the top bar at every width: no floating launcher. */
    headerOnly: !isForm && /^\/(intern|employer)(\/|$)/.test(path),
  };
}

export type Box = { left: number; right: number; top: number; bottom: number };

/**
 * How far (px) the launcher must rise from where it rests to sit clear above every floating action bar it would
 * cover. Bars are the `[data-floating-bar]` elements (a fixed or sticky bar that holds a page's main action).
 * A bar that overlaps the launcher sideways and is not wholly above it pushes it up to the bar's top edge minus
 * `gap`; the result is re-checked against the bars above, so a stack of bars is cleared too.
 */
export function launcherLift(rest: Box, bars: Box[], gap = 8): number {
  let lift = 0;
  for (let pass = 0; pass <= bars.length; pass++) {
    const top = rest.top - lift;
    const bottom = rest.bottom - lift;
    const hit = bars.filter((b) => b.left < rest.right && b.right > rest.left && b.top < bottom + gap && b.bottom > top - gap);
    if (hit.length === 0) break;
    lift = Math.max(lift, rest.bottom - Math.min(...hit.map((b) => b.top)) + gap);
  }
  return Math.max(0, Math.ceil(lift));
}

/** A text-like control outside the chat itself has focus. */
export function isTypingTarget(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLElement &&
    t.matches("input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable=true]") &&
    !t.closest("[data-chat-root]")
  );
}

let picking = false;
let watching = false;

/** Whether a file picker was opened and not yet answered (chosen or cancelled). */
export const filePickerOpen = () => picking;

/**
 * Start noting file pickers: a click on a file input (or the label for one) opens the picker, and nothing else tells
 * the page when it is open. Cleared on choose or cancel, and after a minute in case neither event arrives.
 */
export function watchFilePicker(): void {
  if (watching || typeof document === "undefined") return;
  watching = true;
  let timer: number | undefined;
  const settle = () => {
    picking = false;
    window.clearTimeout(timer);
  };
  document.addEventListener(
    "click",
    (e) => {
      const el = e.target instanceof Element ? e.target : null;
      const label = el?.closest("label");
      const input = el?.closest("input[type=file]") ?? (label ? label.control : null);
      if (input instanceof HTMLInputElement && input.type === "file") {
        picking = true;
        window.clearTimeout(timer);
        timer = window.setTimeout(settle, 60_000);
      }
    },
    true,
  );
  document.addEventListener("change", (e) => e.target instanceof HTMLInputElement && e.target.type === "file" && settle(), true);
  document.addEventListener("cancel", (e) => e.target instanceof HTMLInputElement && e.target.type === "file" && settle(), true);
}
