/**
 * Admin permissions: one catalog (the legacy vocabulary, shared with the live
 * `admin_roles` rows) and one map from URL to the permission it needs.
 * Enforced in src/proxy.ts for every /admin page and /api/admin call, and in
 * requireMutation for the shared /api routes admins also use.
 */

export const PERMISSIONS = [
  { key: "dashboard:read", label: "See the dashboard" },
  { key: "users:read", label: "See registered users" },
  { key: "interns:read", label: "See candidate profiles and assessments" },
  { key: "interns:write", label: "Edit, approve or deactivate candidates" },
  { key: "companies:read", label: "See employer accounts and projects" },
  { key: "companies:write", label: "Edit or deactivate employers" },
  { key: "transactions:read", label: "See orders, invoices and payouts" },
  { key: "transactions:write", label: "Record payouts, promo codes, offline payments and change pricing" },
  { key: "reports:read", label: "See reports and export data" },
  { key: "cms:read", label: "See website content, terms and pricing" },
  { key: "cms:write", label: "Edit website content and terms" },
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

/*
 * Pages that moved groups in this build also accept the permission legacy
 * gated them on, so no existing role loses access at cutover and none gains
 * anything it did not have: intern terms/NDA were `interns:*`, company terms
 * `companies:*`, promo codes `cms:*`, intern invoices `reports:read`.
 */
const INTERN_LEGAL_R: Permission[] = ["cms:read", "interns:read"];
const INTERN_LEGAL_W: Permission[] = ["cms:write", "interns:write"];
const COMPANY_LEGAL_R: Permission[] = ["cms:read", "companies:read"];
const COMPANY_LEGAL_W: Permission[] = ["cms:write", "companies:write"];
const PROMO_R: Permission[] = ["transactions:read", "cms:read"];
const PROMO_W: Permission[] = ["transactions:write", "cms:write"];

/** Longest prefix wins, so specific paths sit next to their parents. */
const RULES: Rule[] = [
  // pages
  ["/admin/dashboard", ["dashboard:read"]],
  // Pipeline: one page, two views. The page admits either side; the Proposals view itself checks interns:read in the page
  // and the Meetings view the /admin/meetings rule below. A single proposal's page stays interns:read.
  ["/admin/proposal-tracker", ["interns:read", "companies:read"], ["interns:write"]],
  ["/admin/proposal-tracker/", ["interns:read"], ["interns:write"]],
  ["/admin/ai-interviews", ["interns:read"], ["interns:write"]],
  // Meetings (the Pipeline's Meetings view; /admin/meetings redirects there): real interviews and drive calls (both sides take part).
  ["/admin/meetings", ["interns:read", "companies:read"], ["interns:write", "companies:write"]],
  // Master data: students, employers and colleges in one place; follow-ups are written through /api/admin/follow-ups.
  ["/admin/master-data", ["interns:read", "companies:read"], ["interns:write", "companies:write"]],
  ["/admin/cgpa-verifications", ["interns:read"], ["interns:write"]],
  // Meeting reviews: either side may be warned, so either read/write permission opens it; the route then needs the write of the PARTY chosen.
  ["/admin/meeting-reviews", ["interns:read", "companies:read"], ["interns:write", "companies:write"]],
  ["/admin/subscriptions", ["transactions:read"], ["transactions:write"]],
  ["/admin/notification-history", ["notifications:read"]],
  // Someone who may send must be able to open the composer (legacy quirk fixed).
  ["/admin/notifications", ["notifications:read", "notifications:write"], ["notifications:write"]],
  ["/admin/messages", CONTACT_R, CONTACT_W],
  ["/admin/interns/terms", INTERN_LEGAL_R, INTERN_LEGAL_W],
  ["/admin/interns/non-disclosure", INTERN_LEGAL_R, INTERN_LEGAL_W],
  ["/admin/interns", ["interns:read"], ["interns:write"]],
  ["/admin/users", ["users:read"]],
  ["/admin/companies/terms", COMPANY_LEGAL_R, COMPANY_LEGAL_W],
  ["/admin/companies", ["companies:read"], ["companies:write"]],
  // College partners are customers like companies; issuing a placement officer's login is a company-side write.
  ["/admin/colleges", ["companies:read"], ["companies:write"]],
  ["/admin/drive-overview", ["companies:read"], ["companies:write"]],
  ["/admin/refunds", ["transactions:read"]],
  ["/admin/roles", ["roles:write"]],
  ["/admin/audit-log", ["roles:write"]],
  ["/admin/projects", ["companies:read"]],
  ["/admin/orders", ["transactions:read"]],
  ["/admin/intern-invoices", ["transactions:read", "reports:read"]],
  ["/admin/invoices", ["transactions:read"]],
  ["/admin/transactions", ["transactions:read"]],
  ["/admin/payouts", ["transactions:read"]],
  ["/admin/promo-codes", PROMO_R, PROMO_W],
  ["/admin/reports", ["reports:read"]],
  ["/admin/cms", ["cms:read"]],
  ["/admin/settings", ["cms:read"]],
  // Legacy /admin/website?tab=… links; the page only redirects into /admin/cms.
  ["/admin/website", ["cms:read"]],
  ["/admin/no-access", []],
  // admin APIs
  ["/api/admin/reports", ["reports:read"]],
  ["/api/admin/notifications", ["notifications:read"], ["notifications:write"]],
  ["/api/admin/messages", CONTACT_R, CONTACT_W],
  ["/api/admin/support-file", CONTACT_R],
  ["/api/admin/interns/", ["interns:read"], ["interns:write"]],
  ["/api/admin/interns/status", ["interns:read"], ["interns:write"]],
  ["/api/admin/interns/visibility", ["interns:read"], ["interns:write"]],
  ["/api/admin/intern", INTERN_LEGAL_R, INTERN_LEGAL_W],
  ["/api/admin/interviews", ["interns:read"], ["interns:write"]],
  ["/api/admin/ai-reports", ["interns:read"], ["interns:write"]],
  ["/api/admin/cgpa-verifications", ["interns:read"], ["interns:write"]],
  ["/api/admin/meeting-reviews", ["interns:read", "companies:read"], ["interns:write", "companies:write"]],
  ["/api/admin/meetings", ["interns:read", "companies:read"]],
  // Employer subscriptions are money: grant, revoke and the price are Accounts (transactions:write).
  ["/api/admin/subscriptions", ["transactions:read"], ["transactions:write"]],
  // The expired-offers and expired-AI-interviews CSV (tracker and AI interviews tabs).
  ["/api/admin/expired", ["interns:read"]],
  // One proposal as a PDF (Projects offers pop-up): read only, the offer's candidate and pay.
  ["/api/admin/proposals", ["interns:read"]],
  ["/api/admin/company", COMPANY_LEGAL_R, COMPANY_LEGAL_W],
  ["/api/admin/companies", ["companies:read"], ["companies:write"]],
  ["/api/admin/colleges", ["companies:read"], ["companies:write"]],
  // Drive orders, roster imports, identity reviews: college customer work like /api/admin/colleges. Refunds (package M) and projects (package L) reuse the pair.
  ["/api/admin/drive-orders", ["companies:read"], ["companies:write"]],
  ["/api/admin/imports", ["companies:read"], ["companies:write"]],
  ["/api/admin/identity-reviews", ["companies:read"], ["companies:write"]],
  ["/api/admin/drive-overview", ["companies:read"], ["companies:write"]],
  ["/api/admin/refunds", ["transactions:read"], ["transactions:write"]],
  ["/api/admin/projects", ["companies:read"], ["companies:write"]],
  // A project's offers pop-up and its CSV carry the interns' names, contacts and pay: candidate data, so interns:read
  // (its own prefix, not under /api/admin/projects, which companies:read opens). Read only; no write rule.
  ["/api/admin/project-offers", ["interns:read"]],
  ["/api/admin/follow-ups", ["interns:read", "companies:read"], ["interns:write", "companies:write"]],
  ["/api/admin/users", ["users:read"], ["interns:write"]],
  ["/api/admin/contact", ["users:read"], ["interns:write", "companies:write"]],
  // /api/admin/impersonate has no rule on purpose: no rule = super admin only.
  ["/api/admin/roles", ["roles:write"], ["roles:write"]],
  // The audit-log CSV: without a rule only super admin (*) got through the proxy, though the page is roles:write.
  ["/api/admin/audit-log", ["roles:write"]],
  ["/api/admin/staff", ["roles:write"], ["roles:write"]],
  ["/api/admin/orders", ["transactions:read"], ["transactions:write"]],
  // Issuing, receiving and voiding a payroll invoice is money: Accounts (transactions:write).
  ["/api/admin/invoices", ["transactions:read"], ["transactions:write"]],
  ["/api/admin/transactions", ["transactions:read"], ["transactions:write"]],
  // The payouts CSV is also a report export (#31); longest prefix wins over /api/admin/payouts.
  ["/api/admin/payouts/export", ["transactions:read", "reports:read"], ["transactions:write"]],
  ["/api/admin/payouts", ["transactions:read"], ["transactions:write"]],
  ["/api/admin/all-payouts", ["transactions:read"], ["transactions:write"]],
  ["/api/admin/promo-codes", PROMO_R, PROMO_W],
  // Minting a code that makes a payment free is finance's call: Accounts (transactions:write) only, not the content permission (cms:write) that edits ordinary codes.
  ["/api/admin/promo-codes/full-waiver", ["transactions:read"], ["transactions:write"]],
  // Per-type check happens in the route (interns, companies, payments…).
  ["/api/admin/export", []],
  // Command palette search: any admin may call it; the handler checks each result group's permission.
  ["/api/admin/search", []],
  ["/api/admin/cms", ["cms:read"], ["cms:write"]],
  ["/api/admin/website", ["cms:read"], ["cms:write"]],
  ["/api/admin/ndc-clauses", INTERN_LEGAL_R, INTERN_LEGAL_W],
  // Every price, fee and stipend is money: Accounts (transactions:write) only, not the content permission (cms:write). Super admin keeps it via "*".
  ["/api/admin/pricing", ["cms:read"], ["transactions:write"]],
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

type RuleLists = { read: Permission[]; write: Permission[] | undefined };

/** The read and write lists that govern a path; `null` when no rule matches. */
function rulesFor(pathname: string): RuleLists | null {
  // /api/admin/interns/<id>/payouts → payouts, not intern editing
  if (/^\/api\/admin\/interns\/[^/]+\/payouts/.test(pathname)) {
    return { read: ["transactions:read"], write: ["transactions:write"] };
  }
  // Recording an offline activation fee is Accounts' work (owner, 6 Nov), not intern editing.
  if (/^\/api\/admin\/interns\/[^/]+\/mark-paid\/?$/.test(pathname)) {
    return { read: ["interns:read"], write: ["transactions:write"] };
  }
  // College money (seat batches, payouts, bank, the seat code) is Accounts' work, not Sales': the same permission the routes check
  // in-route. Reading it is open to either side (Sales sees the college, Accounts sees the money).
  if (/^\/api\/admin\/colleges\/[^/]+\/(seat-batches|payouts|bank|promo-code)(\/|$)/.test(pathname)) {
    return { read: ["transactions:read", "companies:read"], write: ["transactions:write"] };
  }
  // Recording that a drive order was paid is money: Accounts, like a seat batch. Reading stays open to either side.
  if (/^\/api\/admin\/drive-orders\/[^/]+\/payment\/?$/.test(pathname)) {
    return { read: ["transactions:read", "companies:read"], write: ["transactions:write"] };
  }
  // The college's own page: Accounts opens it too, to pay a batch or a withdrawal. Editing the college stays a company write.
  if (/^\/admin\/colleges\/[^/]+(\/|$)/.test(pathname)) {
    return { read: ["companies:read", "transactions:read"], write: ["companies:write"] };
  }
  const rule = SORTED.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
  return rule ? { read: rule[1], write: rule[2] } : null;
}

/**
 * Permissions that satisfy this request (any one is enough).
 * `null`: no rule matched, so only a super admin (`*`) may proceed.
 */
export function requiredPermissions(pathname: string, method = "GET"): Permission[] | null {
  const rules = rulesFor(pathname);
  if (!rules) return null;
  return method === "GET" || method === "HEAD" ? rules.read : (rules.write ?? rules.read);
}

export function allows(granted: readonly string[] | undefined, needed: Permission[] | null): boolean {
  const g = granted ?? [];
  if (g.includes(WILDCARD)) return true;
  if (needed === null) return false;
  return needed.length === 0 || needed.some((p) => g.includes(p));
}

/**
 * Whether these permissions may write to a path: the same write rule the proxy applies, so UI controls match the server.
 * A path with no write rule of its own is not writable (only `*`); it never falls back to the read rule.
 */
export function canWrite(granted: readonly string[] | undefined, pathname: string): boolean {
  return allows(granted, rulesFor(pathname)?.write ?? null);
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

/** What each CSV export needs, by `?type=`: the data's own read permission, or reports:read (the Reports page links every export; owner answer #31). */
export const EXPORT_PERMISSIONS: Record<string, Permission[]> = {
  interns: ["interns:read", "reports:read"],
  proposals: ["interns:read", "reports:read"],
  companies: ["companies:read", "reports:read"],
  projects: ["companies:read", "reports:read"],
  payments: ["transactions:read", "reports:read"],
  payouts: ["transactions:read", "reports:read"],
  "intern-payments": ["transactions:read", "reports:read"],
};

/** Full bank account numbers in the Candidates export: only for those who record payouts. */
export const BANK_EXPORT_PERMISSIONS: Permission[] = ["transactions:write"];

/** The role row a staff member's stored role refers to (case and spacing ignored, as sign-in does for super_admin); the raw value when none matches. */
export function canonicalRoleKey(stored: string | null | undefined, roleKeys: readonly string[]): string {
  const raw = String(stored ?? "");
  const wanted = raw.trim().toLowerCase();
  return roleKeys.find((k) => k.toLowerCase() === wanted) ?? raw;
}

/** Where staff land, in order of preference: the first page their role opens. */
const LANDING_PAGES = [
  "/admin/dashboard",
  "/admin/interns",
  "/admin/companies",
  "/admin/proposal-tracker",
  "/admin/messages",
  "/admin/transactions",
  "/admin/payouts",
  "/admin/reports",
  "/admin/notifications",
  "/admin/cms",
  "/admin/users",
  "/admin/roles",
];

export function firstAllowedPage(granted: readonly string[] | undefined): string | null {
  return LANDING_PAGES.find((path) => allows(granted, requiredPermissions(path))) ?? null;
}
