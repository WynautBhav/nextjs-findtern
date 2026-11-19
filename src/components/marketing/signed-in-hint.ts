/**
 * Does this cookie string carry the sign-in hint? `ft_csrf` is the script-readable double-submit cookie issued at
 * sign-in (12 h, renewed by the proxy): not a secret and not proof of a session. It only decides which button a
 * static page shows; the destination still checks the real session.
 */
export function hasSignInHint(cookie: string | null | undefined): boolean {
  return /(?:^|;\s*)ft_csrf=[^;]+/.test(cookie ?? "");
}
