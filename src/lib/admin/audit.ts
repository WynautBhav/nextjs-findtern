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
  "role.create": "Created a role",
  "role.update": "Edited a role",
  "role.delete": "Deleted a role",
  "staff.create": "Added a staff member",
  "staff.update": "Changed a staff member",
  "staff.delete": "Removed a staff member",
  "user.activate": "Activated a user",
  "user.deactivate": "Deactivated a user",
  "promo.create": "Created a promo code",
  "promo.update": "Edited a promo code",
  "promo.delete": "Deleted a promo code",
  "intern.activation_marked_paid": "Marked activation fee paid",
  "intern.marked_completed": "Marked an internship completed",
  "intern.ratings_update": "Edited a candidate's scores",
  "intern.ratings_import": "Imported candidate scores",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export function actionLabel(action: string): string {
  return (AUDIT_ACTIONS as Record<string, string>)[action] ?? action;
}

const SECRET_KEY = /pass(word)?|secret|token|otp|hash|cvv|pin$/i;
const ACCOUNT_KEY = /account|acct|iban/i;

function maskAccount(v: unknown): string {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits.length > 4 ? `••••${digits.slice(-4)}` : "••••";
}

/** Redacts secrets and masks account numbers, recursively. Applied on write and again on display. */
export function redactMeta(value: unknown, key = ""): unknown {
  if (SECRET_KEY.test(key)) return "[hidden]";
  if (ACCOUNT_KEY.test(key) && (typeof value === "string" || typeof value === "number")) return maskAccount(value);
  if (Array.isArray(value)) return value.map((v) => redactMeta(v, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactMeta(v, k)]));
  }
  // A bare 9-18 digit run in free text looks like an account number.
  if (typeof value === "string") return value.replace(/\b\d{9,18}\b/g, (m) => maskAccount(m));
  return value;
}

/** One-line "key: value" summary for the table; redacted, capped at 160 chars. */
export function summarizeMeta(meta: unknown): string {
  if (!meta || typeof meta !== "object") return "";
  const parts = Object.entries(redactMeta(meta) as Record<string, unknown>).map(([k, v]) => {
    const text = typeof v === "string" ? v : JSON.stringify(v);
    return `${k}: ${text}`;
  });
  const out = parts.join(" · ");
  return out.length > 160 ? `${out.slice(0, 157)}...` : out;
}

/**
 * The one way to write an audit row. Pass a transaction to make the row part of
 * it (a failed audit rolls the change back). With a plain db and `strict` off, a
 * failed audit is logged and never turns an already-done change into a 500.
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
