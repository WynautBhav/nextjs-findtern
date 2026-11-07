/**
 * Intern presence for employers: a label such as "Online now", never a time.
 *
 * Deliberately inert on this branch. Master's `user_presence` has no
 * per-student hide setting, and employers never saw presence before, so
 * showing it would be a consent change. `presenceOf` therefore answers "no
 * label" for everyone until a hide column and its settings toggle land
 * (migration 0028+). The screens already render nothing for a null label.
 */
export type PresenceLabel = "Online now" | "Active today" | "Active this week";

/** Labels for a page of interns. Every requested id is a key; all are null here. */
export async function presenceOf(internIds: string[]): Promise<Record<string, PresenceLabel | null>> {
  return Object.fromEntries([...new Set(internIds.filter(Boolean))].map((id) => [id, null]));
}
