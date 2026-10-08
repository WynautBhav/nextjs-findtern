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
  const method = (init.method ?? "GET").toUpperCase();
  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(method);

  if (!isMutation) return fetch(input, init);

  const csrf = readCsrfCookie();
  const headers = new Headers(init.headers);
  if (csrf) headers.set("x-csrf-token", csrf);

  return fetch(input, { ...init, headers });
}

function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)ft_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}