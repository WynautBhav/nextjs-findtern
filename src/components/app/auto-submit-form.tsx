"use client";

/**
 * A GET filter form that applies itself: a select or checkbox applies the
 * moment it changes, and a text field when you press Enter or leave it, so a
 * filter row needs no separate Filter / Apply button. Without JavaScript it
 * is still a plain form that submits on Enter.
 *
 * A text field with `data-complete` (a regular expression) applies only once
 * its value matches, or is cleared: a half-typed DD/MM/YYYY date never runs.
 * With `data-date="dmy"` it must also be a real date. Text that is not says
 * so ("Use DD/MM/YYYY") instead of being ignored or applied as a filter that
 * matches nothing (QA-127).
 */

const DMY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function realDmy(value: string): boolean {
  const m = DMY.exec(value.trim());
  if (!m) return false;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Why a field's text can't be applied, or null when it can (or is empty). */
function problem(el: HTMLInputElement | HTMLSelectElement): string | null {
  if (!(el instanceof HTMLInputElement) || !el.value.trim()) return null;
  const complete = el.dataset.complete;
  const dmy = el.dataset.date === "dmy";
  if (complete && !new RegExp(complete).test(el.value.trim())) return dmy ? "Use DD/MM/YYYY, for example 31/10/2026." : "Check the format.";
  if (dmy && !realDmy(el.value)) return "That isn't a real date. Use DD/MM/YYYY.";
  return null;
}

function flag(el: HTMLInputElement | HTMLSelectElement, message: string | null): boolean {
  el.setCustomValidity(message ?? "");
  if (message) el.reportValidity();
  return !message;
}

export function AutoSubmitForm({ children, className }: { children: React.ReactNode; className?: string }) {
  function apply(form: HTMLFormElement, el: EventTarget | null) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return;
    if (!flag(el, problem(el))) return;
    form.requestSubmit();
  }

  return (
    <form
      method="get"
      className={className}
      onSubmit={(e) => {
        // Enter submits natively; hold it while any field can't be applied.
        for (const el of Array.from(e.currentTarget.elements)) {
          if ((el instanceof HTMLInputElement || el instanceof HTMLSelectElement) && !flag(el, problem(el))) {
            e.preventDefault();
            return;
          }
        }
      }}
      onInput={(e) => {
        // A correction clears the message as you type.
        if (e.target instanceof HTMLInputElement) e.target.setCustomValidity("");
      }}
      onChange={(e) => {
        const el = e.target;
        // Selects and checkboxes apply at once; text waits for Enter or blur.
        if (el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && el.type === "checkbox")) {
          apply(e.currentTarget, el);
        }
      }}
      onBlur={(e) => {
        const el = e.target;
        if (el instanceof HTMLInputElement && el.type !== "checkbox" && el.defaultValue !== el.value) {
          apply(e.currentTarget, el);
        }
      }}
    >
      {children}
    </form>
  );
}
