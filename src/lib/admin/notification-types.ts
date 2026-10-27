/**
 * Automatic reminder types the scheduler sends. Legacy hid these from the
 * admin notification history so staff see what people sent, not the
 * machine's daily nudges.
 */
export const AUTO_NOTIFICATION_TYPES = [
  "weekly_hire_tip",
  "employer_profile_completion_nudge",
  "timesheet_reminder",
  "payment_reminder",
  "interview_reminder",
  "intern_onboarding_reminder",
];

/** One side of a send: everyone active, or a picked list of ids. */
export type AudienceSide = { all: boolean; ids: string[] };

/**
 * Normalises a composer request into per-type audiences: trims ids, drops
 * blanks and duplicates (ADP-26), and maps the older single-audience shape
 * (`recipientType` + `recipientIds` / `all`) onto the per-side one. "both"
 * with no per-side detail keeps its legacy meaning: everyone on both sides.
 */
export function normaliseAudience(input: {
  recipientType?: "intern" | "employer" | "both";
  recipientIds?: string[];
  all?: boolean;
  interns?: AudienceSide;
  employers?: AudienceSide;
}): { intern: AudienceSide | null; employer: AudienceSide | null } {
  const clean = (ids: string[] | undefined) => [...new Set((ids ?? []).map((id) => String(id ?? "").trim()).filter(Boolean))];
  const side = (s: AudienceSide | undefined | null): AudienceSide | null =>
    s && (s.all || clean(s.ids).length) ? { all: Boolean(s.all), ids: s.all ? [] : clean(s.ids) } : null;

  if (input.interns || input.employers) {
    return { intern: side(input.interns), employer: side(input.employers) };
  }
  const type = input.recipientType ?? "intern";
  if (type === "both") return { intern: { all: true, ids: [] }, employer: { all: true, ids: [] } };
  const one = side({ all: Boolean(input.all), ids: input.recipientIds ?? [] });
  return type === "intern" ? { intern: one, employer: null } : { intern: null, employer: one };
}

/** Notification type: a short slug (legacy free text, e.g. "update", "promo"). */
export function cleanNotificationType(raw: string | undefined): string {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return value || "custom";
}
