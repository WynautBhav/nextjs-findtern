/**
 * Admin permissions: one catalog (the legacy vocabulary, shared with the live
 * `admin_roles` rows) and one map from URL to the permission it needs.
 * Enforced in src/proxy.ts for every /admin page and /api/admin call, and in
 * requireMutation for the shared /api routes admins also use.
 */

export const PERMISSIONS = [
  { key: "dashboard:read", label: "See the dashboard" },
  { key: "users:read", label: "See registered users and view as them" },
  { key: "interns:read", label: "See candidate profiles and assessments" },
  { key: "interns:write", label: "Edit, approve or deactivate candidates" },
  { key: "companies:read", label: "See employer accounts and projects" },
  { key: "companies:write", label: "Edit or deactivate employers" },
  { key: "transactions:read", label: "See orders, invoices and payouts" },
  { key: "transactions:write", label: "Record payouts, promo codes and offline payments" },
  { key: "reports:read", label: "See reports and export data" },
  { key: "cms:read", label: "See website content, terms and pricing" },
  { key: "cms:write", label: "Edit website content, terms and pricing" },
  { key: "contact:intern:read", label: "Read messages from candidates" },
  { key: "contact:intern:write", label: "Handle messages from candidates" },
  { key: "contact:employer:read", label: "Read messages from employers" },
  { key: "contact:employer:write", label: "Handle messages from employers" },
  { key: "notifications:read", label: "See sent notifications" },
  { key: "notifications:write", label: "Send notifications" },
  { key: "roles:write", label: "Manage staff and roles" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];
export const WILDCARD = "*";

type Rule = [prefix: string, read: Permission[], write?: Permission[]];

const CONTACT_R: Permission[] = ["contact:intern:read", "contact:employer:read"];
const CONTACT_W: Permission[] = ["contact:intern:write", "contact:employer:write"];

/** Longest prefix wins, so specific paths sit next to their parents. */
const RULES: Rule[] = [
  // pages
  ["/admin/dashboard", ["dashboard:read"]],
  ["/admin/proposal-tracker", ["interns:read"], ["interns:write"]],
  ["/admin/notification-history", ["notifications:read"]],
  ["/admin/notifications", ["notifications:read"], ["notifications:write"]],
  ["/admin/messages", CONTACT_R, CONTACT_W],
  ["/admin/interns/terms", ["cms:read"], ["cms:write"]],
  ["/admin/interns/non-disclosure", ["cms:read"], ["cms:write"]],
  ["/admin/interns", ["interns:read"], ["interns:write"]],
  ["/admin/users", ["users:read"]],
  ["/admin/companies/terms", ["cms:read"], ["cms:write"]],
  ["/admin/companies", ["companies:read"], ["companies:write"]],
  ["/admin/roles", ["roles:write"]],
  ["/admin/projects", ["companies:read"]],
  ["/admin/orders", ["transactions:read"]],
  ["/admin/intern-invoices", ["transactions:read"]],
  ["/admin/transactions", ["transactions:read"]],
  ["/admin/payouts", ["transactions:read"]],
  ["/admin/promo-codes", ["transactions:read"]],
  ["/admin/reports", ["reports:read"]],
  ["/admin/cms", ["cms:read"]],
  ["/admin/settings", ["cms:read"]],
  ["/admin/no-access", []],
  // admin APIs
  ["/api/admin/metrics", ["dashboard:read"]],
  ["/api/admin/notifications", ["notifications:read"], ["notifications:write"]],
  ["/api/admin/messages", CONTACT_R, CONTACT_W],
  ["/api/admin/support-file", CONTACT_R],
  ["/api/admin/interns/", ["interns:read"], ["interns:write"]],
  ["/api/admin/interns/status", ["interns:read"], ["interns:write"]],
  ["/api/admin/interns/visibility", ["interns:read"], ["interns:write"]],
  ["/api/admin/intern", ["cms:read"], ["cms:write"]],
  ["/api/admin/interviews", ["interns:read"], ["interns:write"]],
  ["/api/admin/company", ["cms:read"], ["cms:write"]],
  ["/api/admin/companies", ["companies:read"], ["companies:write"]],
  ["/api/admin/users", ["users:read"], ["interns:write"]],
  ["/api/admin/contact", ["users:read"], ["interns:write", "companies:write"]],
  ["/api/admin/impersonate", ["users:read"], ["users:read"]],
  ["/api/admin/roles", ["roles:write"], ["roles:write"]],
  ["/api/admin/staff", ["roles:write"], ["roles:write"]],
  ["/api/admin/orders", ["transactions:read"], ["transactions:write"]],
  ["/api/admin/transactions", ["transactions:read"], ["transactions:write"]],
  ["/api/admin/payouts", ["transactions:read"], ["transactions:write"]],
  ["/api/admin/all-payouts", ["transactions:read"], ["transactions:write"]],
  ["/api/admin/promo-codes", ["transactions:read"], ["transactions:write"]],
  // Per-type check happens in the route (interns, companies, payments…).
  ["/api/admin/export", []],
  ["/api/admin/cms", ["cms:read"], ["cms:write"]],
  ["/api/admin/website", ["cms:read"], ["cms:write"]],
  ["/api/admin/ndc-clauses", ["cms:read"], ["cms:write"]],
  ["/api/admin/pricing", ["cms:read"], ["cms:write"]],
  ["/api/admin/google", ["cms:write"]],
  ["/api/admin/account", [], []],
  ["/admin/account", [], []],
  // shared APIs an admin can call
  ["/api/uploads", [], ["cms:write"]],
  ["/api/users", ["users:read"], ["interns:write"]],
  ["/api/proposals", ["interns:read"], ["interns:write"]],
  ["/api/interviews", ["interns:read"], ["interns:write"]],
  ["/api/timesheets", ["interns:read"], ["interns:write"]],
];

const SORTED = [...RULES].sort((a, b) => b[0].length - a[0].length);

/**
 * Permissions that satisfy this request (any one is enough).
 * `null`: no rule matched, so only a super admin (`*`) may proceed.
 */
export function requiredPermissions(pathname: string, method = "GET"): Permission[] | null {
  // /api/admin/interns/<id>/payouts → payouts, not intern editing
  if (/^\/api\/admin\/interns\/[^/]+\/payouts/.test(pathname)) {
    return method === "GET" ? ["transactions:read"] : ["transactions:write"];
  }
  const rule = SORTED.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
  if (!rule) return null;
  const [, read, write] = rule;
  return method === "GET" || method === "HEAD" ? read : (write ?? read);
}

export function allows(granted: readonly string[] | undefined, needed: Permission[] | null): boolean {
  const g = granted ?? [];
  if (g.includes(WILDCARD)) return true;
  if (needed === null) return false;
  return needed.length === 0 || needed.some((p) => g.includes(p));
}

/**
 * Staff can only hand out what they hold: no one without `*` can create a
 * super-admin role or grant a permission they don't have themselves.
 */
export function canGrant(granted: readonly string[] | undefined, wanted: readonly string[]): boolean {
  const g = granted ?? [];
  if (g.includes(WILDCARD)) return true;
  return wanted.every((p) => p !== WILDCARD && g.includes(p));
}

/** What each CSV export needs, by `?type=`. */
export const EXPORT_PERMISSIONS: Record<string, Permission[]> = {
  interns: ["interns:read", "reports:read"],
  proposals: ["interns:read", "reports:read"],
  companies: ["companies:read", "reports:read"],
  projects: ["companies:read", "reports:read"],
  payments: ["transactions:read", "reports:read"],
};
