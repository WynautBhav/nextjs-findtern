"use client";

/**
 * A GET filter form that applies itself: a select or checkbox applies the
 * moment it changes, and a text field when you press Enter or leave it, so a
 * filter row needs no separate Filter / Apply button. Without JavaScript it
 * is still a plain form that submits on Enter.
 *
 * A text field with `data-complete` (a regular expression) applies only once
 * its value matches, or is cleared: a half-typed DD/MM/YYYY date never runs.
 */
export function AutoSubmitForm({ children, className }: { children: React.ReactNode; className?: string }) {
  function apply(form: HTMLFormElement, el: EventTarget | null) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return;
    const complete = el.dataset.complete;
    if (complete && el.value && !new RegExp(complete).test(el.value)) return;
    form.requestSubmit();
  }

  return (
    <form
      method="get"
      className={className}
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
