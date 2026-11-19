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
