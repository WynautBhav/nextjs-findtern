/**
 * The password rule, once (QA-016). The validator, the form hint and the
 * refusal message are all built from PASSWORD_RULES, so what a form says and
 * what the server accepts cannot drift apart again: the admin account route
 * refused "Abcdefg1" with a message that never mentioned the special
 * character it was missing. Client-safe (no node imports), so forms can show
 * the same hint; `lib/security/password` re-exports the validator.
 *
 * The rules are the legacy `isStrongPassword` (routes.ts:27), unchanged, so
 * nobody's rule moves mid-migration.
 */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

/** `label` reads inside a sentence; `item` is the signup checklist line. */
export const PASSWORD_RULES: readonly { label: string; item: string; test: (pw: string) => boolean }[] = [
  { label: `at least ${PASSWORD_MIN} characters`, item: `At least ${PASSWORD_MIN} characters`, test: (pw) => pw.length >= PASSWORD_MIN && pw.length <= PASSWORD_MAX },
  { label: "a lowercase letter", item: "One lowercase letter", test: (pw) => /[a-z]/.test(pw) },
  { label: "an uppercase letter", item: "One uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { label: "a number", item: "One number", test: (pw) => /\d/.test(pw) },
  { label: "a special character (like ! or @)", item: "One special character", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export function isStrongPassword(pw: unknown): boolean {
  return typeof pw === "string" && PASSWORD_RULES.every((r) => r.test(pw));
}

const [length, ...kinds] = PASSWORD_RULES.map((r) => r.label);
const rule = `${length}, with ${kinds.slice(0, -1).join(", ")} and ${kinds[kinds.length - 1]}`;

/** Under a password field. */
export const PASSWORD_HINT = `${rule.charAt(0).toUpperCase()}${rule.slice(1)}.`;
/** Every "weak password" refusal. */
export const WEAK_PASSWORD_MESSAGE = `Use ${rule}.`;
