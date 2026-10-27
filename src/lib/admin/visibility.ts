/**
 * Admin show / hide of a candidate, mirrored into the legacy flag (DB-11).
 *
 * The new app hides through `users.profile_visibility`; legacy has no such
 * column and reads only `intern_onboarding.extra_data.openToWork`. An admin
 * hide therefore also switches `openToWork` off, and records that the admin
 * did it (`hiddenByAdmin`), so that:
 *  - an admin "show" switches `openToWork` back on only when the admin was
 *    the one who switched it off, never overriding an intern's own choice;
 *  - the 30-day self-hide limit (schedulers.ts) can tell an admin hide from
 *    an intern's and leave it alone.
 * Returns the new extraData, or null when nothing changes.
 */
export function adminVisibilityExtra(
  extra: Record<string, unknown> | null | undefined,
  visibility: "live" | "hidden",
): Record<string, unknown> | null {
  const current = extra && typeof extra === "object" ? extra : {};
  const hiddenByIntern = current.openToWork === false && current.hiddenByAdmin !== true;

  if (visibility === "hidden") {
    if (hiddenByIntern || current.hiddenByAdmin === true) return null;
    return { ...current, openToWork: false, hiddenByAdmin: true };
  }

  if (current.hiddenByAdmin !== true) return null;
  const next: Record<string, unknown> = { ...current, openToWork: true };
  delete next.hiddenByAdmin;
  return next;
}
