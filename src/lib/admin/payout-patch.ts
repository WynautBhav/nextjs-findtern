/**
 * What the audit row for an intern-payout PATCH says. Pure, so the rule "every edit leaves a trail" is testable
 * without a database. Returns null when the PATCH changes nothing (no row is written for a no-op).
 *
 * The note text is never copied into the log (it can carry bank-return details); only that it changed.
 * `to: paid` is not handled here: marking paid has its own action (`payout.mark_paid`).
 */
export type PatchedPayout = { internId: string; status: string; referenceId?: string | null; raw: unknown };
export type PayoutPatchBody = { status?: string; referenceId?: string | null; opsNote?: string | null; notes?: string | null };

export type PayoutPatchAudit = {
  internId: string;
  statusFrom?: string;
  statusTo?: string;
  referenceFrom?: string | null;
  referenceTo?: string | null;
  noteChanged?: true;
};

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function payoutPatchAudit(existing: PatchedPayout, body: PayoutPatchBody): PayoutPatchAudit | null {
  const meta: PayoutPatchAudit = { internId: existing.internId };
  let changed = false;

  if (body.status !== undefined && body.status !== existing.status) {
    meta.statusFrom = existing.status;
    meta.statusTo = body.status;
    changed = true;
  }
  if (body.referenceId !== undefined) {
    const from = text(existing.referenceId) || null;
    const to = text(body.referenceId) || null;
    if (from !== to) {
      meta.referenceFrom = from;
      meta.referenceTo = to;
      changed = true;
    }
  }
  const note = body.opsNote !== undefined ? body.opsNote : body.notes;
  if (note !== undefined) {
    const raw = existing.raw && typeof existing.raw === "object" ? (existing.raw as Record<string, unknown>) : {};
    if (text(note) !== text(raw.opsNote)) {
      meta.noteChanged = true;
      changed = true;
    }
  }
  return changed ? meta : null;
}
