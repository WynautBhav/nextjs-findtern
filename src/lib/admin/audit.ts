import type { getDb } from "@/lib/db";

/** Anything with .insert(): the db or a transaction. */
type Executor = Pick<ReturnType<typeof getDb>, "insert">;

export type AuditEntry = {
  adminId: string;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  meta?: Record<string, unknown>;
};

/** Every action written anywhere → its human label. A test fails if a written action is missing here. */
export const AUDIT_ACTIONS = {
  "account.update": "Changed own account details",
  "impersonate.start": "Started viewing as a user",
  "impersonate.stop": "Stopped viewing as a user",
  "export.interns": "Exported candidates",
  "export.audit_log": "Exported the audit log",
  "export.users": "Exported registered users",
  "export.payouts": "Exported payouts or employer dues",
  "export.hired": "Exported hired candidates",
  "payout.resend_email": "Resent a payout email",
  "payout.mark_paid": "Marked a payout paid",
  "pricing.update": "Edited pricing",
  "settings.update": "Edited platform settings",
  "identity.reveal": "Revealed a candidate's identity",
  "contact.update": "Edited contact details",
  "college.password_reset": "Reset a TPO password",
  "college.create": "Added a college",
  "college.update": "Edited a college",
  "college.partner_toggle": "Changed a college's partner status",
  "college.tpo_code_create": "Created a TPO code",
  "college.tpo_cap_update": "Changed a TPO seat cap",
  "college.seat_batch_create": "Created a college seat batch",
  "college.seat_batch_paid": "Marked a college seat batch paid",
  "college.seat_batch_void": "Voided a college seat batch",
  "college.billing_update": "Edited a college's billing details",
  "college.payout_paid": "Marked a college payout paid",
  "college.payout_reject": "Rejected a college payout request",
  "college.bank_reveal": "Revealed a college's bank account",
  "role.create": "Created a role",
  "role.update": "Edited a role",
  "role.delete": "Deleted a role",
  "staff.create": "Added a staff member",
  "staff.update": "Changed a staff member",
  "staff.delete": "Removed a staff member",
  "user.activate": "Activated a user",
  "user.deactivate": "Deactivated a user",
  "refund.create": "Created refund rows for students who got a drive seat",
  "refund.initiate": "Initiated a student refund",
  "refund.reconcile": "Refund status settled from Razorpay (automatic job)",
  "promo.create": "Created a promo code",
  "promo.update": "Edited a promo code",
  "promo.delete": "Deleted a promo code",
  "intern.activation_marked_paid": "Marked activation fee paid",
  "intern.marked_completed": "Marked an internship completed",
  "intern.completed_auto": "Internship completed automatically on final timesheet approval",
  "intern.approval_update": "Changed a candidate's review status",
  "intern.ratings_update": "Edited a candidate's scores",
  "interview.ai_link_added": "Added an AI interview link",
  "intern.ratings_import": "Imported candidate scores",
  "company.update": "Edited a company",
  "company.delete": "Deleted a company",
  "intern.visibility": "Changed candidate visibility",
  "intern.skills_update": "Edited a candidate's skills",
  "payout.create": "Created a stipend payout",
  "order.marked_received": "Marked an order's money received",
  "cms.create": "Added website content",
  "cms.update": "Edited website content",
  "cms.delete": "Deleted website content",
  "notification.send": "Sent a notification",
  "message.mark_read": "Marked messages read or unread",
  "message.delete": "Deleted messages",
  "ndc.create": "Added a non-disclosure clause",
  "ndc.update": "Edited a non-disclosure clause",
  "ndc.delete": "Deleted a non-disclosure clause",
  "campaign.send": "Emailed drive codes to a roster",
  "campaign.resend": "Resent a drive code email",
  "drive_order.create": "Created a college drive order",
  "drive_order.paid": "Marked a college drive order paid",
  "drive_import.preview": "Previewed a drive roster import",
  "drive_import.confirm": "Confirmed a drive roster import",
  "identity_review.decide": "Decided a student identity match",
  "project.approve": "Approved an internship posting",
  "project.reject": "Rejected an internship posting",
  "project.takedown": "Took an internship posting down",
  "project.restore": "Restored a taken-down internship posting",
  "proposal.takedown_withdraw": "Offer withdrawn because its posting was taken down",
  "roster_import.purge": "Purged expired roster uploads (automatic)",
  "college.admin_create": "Created a TPO login",
  "terms.publish": "Published terms",
  "account.password_change": "Changed own password",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export function actionLabel(action: string): string {
  return (AUDIT_ACTIONS as Record<string, string>)[action] ?? action;
}

const SECRET_KEY = /pass(word)?|secret|token|otp|hash|cvv|pin$|api_?key|authori[sz]ation|cookie|session|credential/i;
/** Keys that hold a bank account number: "account", "bankAccountNumber", "acctNo", "iban". Not "accountHolder". */
const ACCOUNT_KEY = /(account|acct)(_?(no|num|number))?$|iban/i;
/** A parent that says "bank": a bare number/no/num under it is the account number ({ bank: { number } }). */
const BANK_PARENT = /bank|account|acct/i;
const BARE_NUMBER_KEY = /^(no|num|number)$/i;
/** "a/c 1234 5678 9012", "account no: 123456789012": an account label followed by 9-18 digits (spaces/dashes allowed). */
const LABELLED_ACCOUNT = /\b(a\/c|acc(?:oun)?t)\b[^\d\n]{0,12}((?:\d[ -]?){8,17}\d)\b/gi;

function maskAccount(v: unknown): string {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits.length > 4 ? `••••${digits.slice(-4)}` : "••••";
}

/**
 * Redacts secrets and masks account numbers, recursively. Applied on write and again on display.
 * Masking is by key only (plus an "a/c ..." label in free text): phone numbers and payout
 * references (UTR) are 9-18 digits too, and the trail must keep showing them.
 */
export function redactMeta(value: unknown, key = "", parentKey = "", inAccount = false): unknown {
  const scalar = typeof value === "string" || typeof value === "number";
  if (SECRET_KEY.test(key) && typeof value !== "boolean" && value != null) return "[hidden]";
  const accountKey = inAccount || ACCOUNT_KEY.test(key) || (BARE_NUMBER_KEY.test(key) && BANK_PARENT.test(parentKey));
  if (scalar && accountKey) return maskAccount(value);
  // An account key holding a { from, to } diff, an array or any nested object: every value inside is the number.
  if (Array.isArray(value)) return value.map((v) => redactMeta(v, key, parentKey, accountKey));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactMeta(v, k, key, accountKey)]));
  }
  if (typeof value === "string") return value.replace(LABELLED_ACCOUNT, (_m, label: string, digits: string) => `${label} ${maskAccount(digits)}`);
  return value;
}

/**
 * What an edit changed, as { field: { from, to } }, for the fields in `after`
 * that differ from `before` (Dates compare as instants, undefined as null).
 * Callers that hold both sides pass this as meta.changes so the log can show
 * "field: old → new" instead of a list of every field that was submitted.
 */
export function diffFields(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> {
  const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v === undefined ? null : v);
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, next] of Object.entries(after)) {
    if (next === undefined) continue;
    const from = norm(before[k]);
    const to = norm(next);
    if (JSON.stringify(from) !== JSON.stringify(to)) out[k] = { from, to };
  }
  return out;
}

/**
 * The one way to write an audit row. With a plain db and `strict` off, a failed
 * audit is logged and never turns an already-done change into a 500. Inside a
 * transaction always pass `strict: true`: a swallowed insert error leaves the
 * Postgres transaction aborted, so COMMIT silently becomes ROLLBACK while the
 * route reports success.
 */
export async function recordAdminAudit(ex: Executor, entry: AuditEntry, opts: { strict?: boolean } = {}): Promise<void> {
  try {
    // Lazy so the pure helpers above stay importable from plain-node tests.
    const { schema } = await import("@/lib/db");
    await ex.insert(schema.adminAuditLog).values({
      adminId: entry.adminId,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      meta: redactMeta(entry.meta ?? {}) as Record<string, unknown>,
    });
  } catch (err) {
    if (opts.strict) throw err;
    console.error("[audit] write failed", entry.action, err);
  }
}
