import { formatDate, formatMoney } from "../format.ts";
import { redactMeta } from "./audit.ts";

/**
 * Turns an audit row's stored meta into one human line for the table and the CSV.
 * Pure (no DB): the query resolves the names, this only words them. Everything is
 * redacted first, so a secret that slipped into meta is never shown.
 */

/** Names the query resolved for this page of rows: id (or role key) → display name. */
export type AuditNames = {
  intern: Map<string, string>;
  company: Map<string, string>;
  college: Map<string, string>;
  /** Role display names by key ("exec_sales") and by id. */
  role: Map<string, string>;
  /** Staff by id. */
  admin: Map<string, string>;
};

export function emptyNames(): AuditNames {
  return { intern: new Map(), company: new Map(), college: new Map(), role: new Map(), admin: new Map() };
}

type Ctx = { action: string; meta: Record<string, unknown>; names: AuditNames };

const LABELS: Record<string, string> = {
  internId: "Candidate",
  employerId: "Company",
  companyId: "Company",
  collegeId: "College",
  referenceId: "Reference",
  isPartner: "Partner",
  showOnWebsite: "On website",
  isActive: "Active",
  maxUsages: "Max uses",
  minOrderAmountMinor: "Minimum order",
  aisheCode: "AISHE code",
  emailDomains: "Email domains",
  adminEmail: "Staff email",
  targetEmail: "Viewing as",
  credentialsReset: "Password reset",
  validFrom: "Valid from",
  validUntil: "Valid until",
  discountType: "Discount type",
  discountValue: "Discount",
  appliesTo: "Applies to",
  findternScore: "Findtern score",
  featureList: "Feature list",
  value: "Value",
};

function sentence(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function fieldLabel(key: string): string {
  return LABELS[key] ?? sentence(key.replace(/Minor$/, "").replace(/Id$/, ""));
}

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const isDiff = (v: unknown): v is { from: unknown; to: unknown } => isRecord(v) && "from" in v && "to" in v;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const shortId = (s: string) => (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s) ? s.slice(0, 8) : s);

function discountType(m: Record<string, unknown>): string | null {
  if (typeof m.discountType === "string") return m.discountType;
  const c = m.changes;
  if (isRecord(c) && isDiff(c.discountType) && typeof c.discountType.to === "string") return c.discountType.to;
  return null;
}

function money(n: number): string {
  return formatMoney(n, "INR", { zeroLabel: false });
}

function fmt(key: string, v: unknown, ctx: Ctx): string {
  if (v == null) return "none";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") {
    if (/Minor$/.test(key)) return money(v);
    if (key === "value" && ctx.action === "settings.update") return money(v);
    if (key === "discountValue") {
      const t = discountType(ctx.meta);
      if (t === "fixed") return money(v);
      if (t === "percentage") return `${v}%`;
    }
    return String(v);
  }
  if (typeof v === "string") {
    const n = ctx.names;
    if (key === "internId") return n.intern.get(v) ?? shortId(v);
    if (key === "employerId" || key === "companyId") return n.company.get(v) ?? shortId(v);
    if (key === "collegeId") return n.college.get(v) ?? shortId(v);
    if (key === "role" || key === "roleKey") return n.role.get(v) ?? v;
    if (ISO.test(v) && /(From|Until|At|Date)$/.test(key)) return formatDate(v);
    if (/Id$/.test(key)) return shortId(v);
    return cap(v, 80);
  }
  if (Array.isArray(v)) return cap(v.every((x) => typeof x === "string") ? v.join(", ") : `${v.length} items`, 120);
  return cap(JSON.stringify(v), 120);
}

const strings = (v: unknown): string[] | null => {
  if (v == null) return [];
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null;
};

function entry(key: string, v: unknown, ctx: Ctx): string | null {
  const label = fieldLabel(key);
  if (!isDiff(v)) return `${label}: ${fmt(key, v, ctx)}`;
  const a = strings(v.from);
  const b = strings(v.to);
  if (Array.isArray(v.from) || Array.isArray(v.to)) {
    if (!a || !b) return JSON.stringify(v.from) === JSON.stringify(v.to) ? null : `${label}: changed`;
    const added = b.filter((x) => !a.includes(x));
    const removed = a.filter((x) => !b.includes(x));
    if (!added.length && !removed.length) return null;
    return `${label}: ${[added.length ? `added ${cap(added.join(", "), 80)}` : "", removed.length ? `removed ${cap(removed.join(", "), 80)}` : ""].filter(Boolean).join("; ")}`;
  }
  if (JSON.stringify(v.from ?? null) === JSON.stringify(v.to ?? null)) return null;
  return `${label}: ${fmt(key, v.from, ctx)} → ${fmt(key, v.to, ctx)}`;
}

/** What an export row's rows were: "candidates", "employer dues", ... */
export function exportNoun(action: string, meta: Record<string, unknown>): string {
  if (action === "export.payouts") return meta.view === "dues" ? "employer dues" : "payouts";
  if (action === "export.hired") return "hired candidates";
  if (action === "export.users") return "registered users";
  if (action === "export.audit_log") return "audit log entries";
  return "candidates";
}

export function describeAudit(action: string, rawMeta: unknown, names: AuditNames = emptyNames()): string {
  if (!isRecord(rawMeta)) return "";
  const m = redactMeta(rawMeta) as Record<string, unknown>;
  if (action.startsWith("export.") && typeof m.rows === "number") {
    const line = `Exported ${m.rows} ${m.rows === 1 ? "row" : "rows"} of ${exportNoun(action, m)}`;
    return m.fullAccountNumbers === true ? `${line} · full account numbers included` : line;
  }
  const ctx: Ctx = { action, meta: m, names };
  const parts: string[] = [];
  for (const [k, v] of Object.entries(m)) {
    if (k === "filters" || k === "columns") continue;
    if (k === "code" && action.startsWith("promo.")) continue; // the target shows the code
    if (k === "discountType" && "changes" in m) continue; // context for the discount value only
    if (k === "changes" && isRecord(v)) {
      const rows = Object.entries(v).map(([ck, cv]) => entry(ck, cv, ctx)).filter((x): x is string => x !== null);
      parts.push(...(rows.length ? rows : ["No fields changed"]));
      continue;
    }
    if (k === "fields" && Array.isArray(v)) {
      parts.push(`Changed: ${v.map((f) => fieldLabel(String(f)).toLowerCase()).join(", ")}`);
      continue;
    }
    const e = entry(k, v, ctx);
    if (e) parts.push(e);
  }
  return cap(parts.join(" · "), 400);
}

/** Where a target lives in the admin, and its name when we could resolve one. */
export function describeTarget(
  action: string,
  type: string | null,
  id: string | null,
  meta: unknown,
  names: AuditNames,
): { name: string | null; href: string | null } {
  const m = isRecord(meta) ? meta : {};
  const str = (k: string) => (typeof m[k] === "string" ? (m[k] as string) : null);
  if (action.startsWith("export.") && !id) {
    if (action === "export.interns") return { name: "Candidates", href: "/admin/interns" };
    if (action === "export.users") return { name: "Registered users", href: "/admin/users" };
    if (action === "export.payouts") return { name: "Payouts", href: "/admin/payouts" };
    if (action === "export.audit_log") return { name: "Audit log", href: "/admin/audit-log" };
    if (action === "export.hired") return { name: "Hired candidates", href: null };
  }
  if (type === "payout") {
    const internId = str("internId");
    const who = internId ? names.intern.get(internId) : null;
    return { name: who ? `Payout to ${who}` : null, href: internId ? `/admin/interns/${internId}` : null };
  }
  if (!id) return { name: null, href: null };
  if (type === "intern") return { name: names.intern.get(id) ?? null, href: `/admin/interns/${id}` };
  if (type === "employer") return { name: names.company.get(id) ?? null, href: `/admin/companies/${id}` };
  if (type === "college") return { name: names.college.get(id) ?? null, href: "/admin/colleges" };
  if (type === "promo_code") return { name: null, href: "/admin/promo-codes" };
  if (type === "role") return { name: names.role.get(id) ?? str("name"), href: "/admin/roles" };
  if (type === "admin") return { name: names.admin.get(id) ?? str("name") ?? str("email"), href: "/admin/roles" };
  if (type === "pricing_plan") return { name: str("plan"), href: null };
  return { name: null, href: null };
}
