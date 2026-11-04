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
  // The terms moved on mid-session: reload so the layout mounts the terms pop-up (it only mounts when behind).
  if (res.status === 403 && typeof window !== "undefined") {
    const body = await res.clone().json().catch(() => null);
    if (body?.code === "terms_required") window.location.reload();
  }
  return res;
}

function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)ft_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}