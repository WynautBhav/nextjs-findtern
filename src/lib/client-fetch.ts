/**
 * CSRF-aware fetch for client components.
 *
 * Every mutating request in this app is cross-site-blocked by `SameSite=Lax` on
 * the session cookie *and* double-submit checked by `checkCsrf`. The cookie
 * half is issued at sign-in (`issueCsrfCookie`); this reads it back and sends
 * the value in a header, which an attacker's origin cannot do because it
 * cannot read our cookie.
 *
 * Use this instead of bare `fetch` for any POST/PATCH/PUT/DELETE. Calling raw
 * `fetch` will fail CSRF with a confusing 403 and no obvious cause.
 */
export async function csrfFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  // The token goes on every method, GET included: a few reads (the AI-interview
  // poll, payment status) sit behind `requireMutation`, which checks it, and the
  // header costs a same-origin GET nothing.
  const csrf = readCsrfCookie();
  const headers = new Headers(init.headers);
  if (csrf) headers.set("x-csrf-token", csrf);

  const res = await fetch(input, { ...init, headers });
  if (res.status === 403) {
    const body = await res.clone().json().catch(() => null);
    announceTermsRequired(body);
    announceAccountDisabled(body);
    announceAccountOnHold(body);
  }
  return res;
}

/**
 * Terms moved on mid-session: open the pop-up in place (TermsGate listens); a reload would drop unsaved input.
 * Call with the parsed body of a 403 response. Shared with the upload's XHR path (file-upload.tsx).
 */
export function announceTermsRequired(body: unknown): void {
  if (typeof window !== "undefined" && (body as { code?: string } | null)?.code === "terms_required") {
    window.dispatchEvent(new CustomEvent("findtern:terms-required"));
  }
}

/** A route refused because the account was disabled: the AccountGuard in the shell signs the tab out with an explanation. */
export function announceAccountDisabled(body: unknown): void {
  if (typeof window !== "undefined" && (body as { code?: string } | null)?.code === "ACCOUNT_DISABLED") {
    window.dispatchEvent(new CustomEvent("findtern:account-disabled"));
  }
}

/** A route refused because an admin froze the account: the AccountGuard in the shell sends the tab to the on-hold page. */
export function announceAccountOnHold(body: unknown): void {
  if (typeof window !== "undefined" && (body as { code?: string } | null)?.code === "ACCOUNT_ON_HOLD") {
    window.dispatchEvent(new CustomEvent("findtern:account-on-hold"));
  }
}

export function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)ft_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}