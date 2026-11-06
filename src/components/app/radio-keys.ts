/**
 * Arrow / Home / End on a `role="radiogroup"`: focus moves to the neighbour and
 * picks it (the ARIA radio pattern). Pair with `radioTab` on each radio so only
 * one is in the Tab order.
 */
export function onRadioKeys(e: React.KeyboardEvent<HTMLElement>) {
  const radios = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)'));
  const at = radios.indexOf(document.activeElement as HTMLElement);
  if (at < 0) return;
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  const to = e.key === "Home" ? 0 : e.key === "End" ? radios.length - 1 : step ? (at + step + radios.length) % radios.length : -1;
  if (to < 0) return;
  e.preventDefault();
  radios[to].focus();
  // Already-checked radios are not clicked again: tapping the widest work mode steps it back.
  if (radios[to].getAttribute("aria-checked") !== "true") radios[to].click();
}

/** Roving tabindex: the checked radio is the one tab stop, else the first. */
export const radioTab = (checked: boolean, index: number, anyChecked: boolean) => (checked || (!anyChecked && index === 0) ? 0 : -1);
