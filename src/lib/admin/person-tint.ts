/**
 * Each person in the admin gets one pale tint of their own, stable across pages and reloads, so a
 * name is recognised by its colour as well as its initials. Identity, not data: the six pairs live
 * in globals.css as `--admin-person-N` (fill) and `--admin-person-ink-N` (text, >= 4.5:1 on it).
 */
export const PERSON_TINTS = 6;

/** FNV-1a over the key, so near-identical ids (sequential numbers) still spread across the six. */
export function personTint(key: string | number | null | undefined): number {
  const text = String(key ?? "");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % PERSON_TINTS) + 1;
}

/** Up to two initials from a display name; "?" when there is no name to read. */
export function initialsOf(name: string | null | undefined): string {
  const letters = (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toUpperCase() ?? "")
    .join("");
  return letters || "?";
}
