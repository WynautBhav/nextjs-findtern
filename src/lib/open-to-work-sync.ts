/**
 * Keeps every "open to work" control on one page showing the same state.
 *
 * The flag has one source of truth, `extra_data.openToWork` on the server. The Home banner and the
 * switch each used to copy it into their own state at first render, so a save from one left the
 * other on the old value until a reload. A save now announces the value the server stored; every
 * control on the page listens and follows. Pure (no React, no fetch) so node:test can run it.
 */
export const OPEN_TO_WORK_EVENT = "findtern:open-to-work";

/** The value the server stored, read from a save response. Falls back to what was asked for. */
export function storedOpenToWork(body: unknown, requested: boolean): boolean {
  const value = body && typeof body === "object" ? (body as { openToWork?: unknown }).openToWork : undefined;
  return typeof value === "boolean" ? value : requested;
}

export function announceOpenToWork(value: boolean, target: EventTarget = window): void {
  target.dispatchEvent(new CustomEvent<boolean>(OPEN_TO_WORK_EVENT, { detail: value }));
}

/** Calls `onChange` with each announced value; returns the unsubscribe function. */
export function subscribeOpenToWork(onChange: (value: boolean) => void, target: EventTarget = window): () => void {
  const listener = (event: Event) => {
    const value = (event as CustomEvent<unknown>).detail;
    if (typeof value === "boolean") onChange(value);
  };
  target.addEventListener(OPEN_TO_WORK_EVENT, listener);
  return () => target.removeEventListener(OPEN_TO_WORK_EVENT, listener);
}
