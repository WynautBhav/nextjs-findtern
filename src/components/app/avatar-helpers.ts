/** Token-only tints (bg + text pairs, all AA). */
export const AVATAR_TINTS = [
  "bg-brand-50 text-brand-800",
  "bg-accent-100 text-accent-700",
  "bg-info-soft text-info",
  "bg-success-soft text-success",
  "bg-ink-100 text-ink-700",
] as const;

/** Deterministic tint from a string. Same input, same tint. */
export function avatarTint(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

export function avatarLabel({ name, initials, masked }: { name?: string; initials?: string; masked?: boolean }): string {
  if (masked) return `Candidate ${initials || ""}`.trim() + " (identity hidden until you hire)";
  return name || initials || "Profile photo";
}
