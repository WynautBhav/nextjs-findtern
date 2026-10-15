import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { AdminShell } from "@/components/admin/admin-shell";
import type { NavGroup } from "@/components/admin/admin-nav";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

/**
 * The admin console is per-request (session-gated, live counts) and must
 * never prerender: without this, `next build` on hosts with no DATABASE_URL
 * tries to bake every admin screen and fails on the first query.
 */
export const dynamic = "force-dynamic";

const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin/dashboard", label: "Dashboard" },
      { href: "/admin/proposal-tracker", label: "Proposal Pipeline" },
      { href: "/admin/notification-history", label: "Notification History" },
      { href: "/admin/messages", label: "Inbound Messages" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/interns", label: "Candidate Directory" },
      { href: "/admin/interns/terms", label: "Intern Terms" },
      { href: "/admin/interns/non-disclosure", label: "Intern NDA" },
      { href: "/admin/companies", label: "Hiring Partners" },
      { href: "/admin/companies/terms", label: "Company Terms" },
      { href: "/admin/roles", label: "Roles and Access" },
    ],
  },
  {
    label: "Work",
    items: [
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
      { href: "/admin/reports", label: "Analytics Reports" },
      { href: "/admin/promo-codes", label: "Promotional Codes" },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/cms", label: "Website Content" },
      { href: "/admin/notifications", label: "Send Notification" },
    ],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/admin/login");

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
    <AdminShell groups={NAV} email={session.email} role={session.role} unreadCount={unreadMessages}>
      {children}
    </AdminShell>
  );
}
