import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { AdminShell } from "@/components/admin/admin-shell";
import type { NavGroup } from "@/components/admin/admin-nav";
import { allows, requiredPermissions } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

/**
 * The admin console is per-request (session-gated, live counts) and must
 * never prerender: without this, `next build` on hosts with no DATABASE_URL
 * tries to bake every admin screen and fails on the first query.
 */
export const dynamic = "force-dynamic";

/**
 * Sidebar groups. Day-to-day work first (who is in the pipeline, who owes or
 * is owed money), publishing second, and everything that is configured once
 * and rarely revisited - the rate card, the legal texts, who can sign in -
 * clubbed under Settings instead of being scattered across People and
 * Content. The one-item "Work" group is folded into People & Work.
 */
const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin/dashboard", label: "Dashboard" },
      { href: "/admin/proposal-tracker", label: "Proposal Pipeline" },
      { href: "/admin/messages", label: "Inbound Messages" },
      { href: "/admin/notification-history", label: "Notification History" },
    ],
  },
  {
    label: "People & Work",
    items: [
      { href: "/admin/interns", label: "Candidate Directory" },
      { href: "/admin/users", label: "Registered Users" },
      { href: "/admin/companies", label: "Hiring Partners" },
      { href: "/admin/projects", label: "Work Projects" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/admin/orders", label: "Employer Orders" },
      { href: "/admin/intern-invoices", label: "Intern Invoices" },
      { href: "/admin/transactions", label: "Financial Ledger" },
      { href: "/admin/payouts", label: "Intern Disbursements" },
      { href: "/admin/promo-codes", label: "Promotional Codes" },
      { href: "/admin/reports", label: "Analytics Reports" },
    ],
  },
  {
    label: "Publishing",
    items: [
      { href: "/admin/cms", label: "Website Content" },
      { href: "/admin/notifications", label: "Send Notification" },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/admin/settings", label: "Pricing & Fees" },
      { href: "/admin/cms/terms", label: "Platform Terms" },
      { href: "/admin/interns/terms", label: "Intern Terms" },
      { href: "/admin/interns/non-disclosure", label: "Intern NDA" },
      { href: "/admin/companies/terms", label: "Company Terms" },
      { href: "/admin/roles", label: "Roles and Access" },
      { href: "/admin/account", label: "Your account" },
    ],
  },
];

/** href → sidebar label, for breadcrumbs. */
const NAV_LABELS: Record<string, string> = Object.fromEntries(
  NAV.flatMap((g) => g.items.map((i) => [i.href, i.label])),
);

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/admin/login");

  // Only links this role can open.
  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => allows(session.permissions, requiredPermissions(i.href))),
  })).filter((g) => g.items.length > 0);

  let unreadMessages = 0;
  try {
    const db = getDb();
    const [unread] = await db
      .select({ value: count() })
      .from(schema.contactMessages)
      .where(eq(schema.contactMessages.isRead, false));
    unreadMessages = Number(unread?.value ?? 0);
  } catch {}

  return (
    <AdminShell groups={groups} labels={NAV_LABELS} email={session.email} role={session.role} unreadCount={unreadMessages}>
      {children}
    </AdminShell>
  );
}
