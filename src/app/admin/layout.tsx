import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  CircleUserRound,
  CreditCard,
  FileText,
  Globe,
  History,
  LayoutDashboard,
  MessageSquare,
  Receipt,
  ScrollText,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingBag,
  Tag,
  UserCheck,
  Users,
} from "lucide-react";

import { CommandPalette } from "@/components/admin/command-palette";
import { ConsoleShell, RAIL_COOKIE, type ConsoleNavGroup } from "@/components/layout/console-shell";
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
const NAV: ConsoleNavGroup[] = [
  {
    title: "Overview",
    items: [
      { href: "/admin/dashboard", label: "Dashboard", icon: <LayoutDashboard /> },
      { href: "/admin/proposal-tracker", label: "Proposal pipeline", icon: <Send /> },
      { href: "/admin/messages", label: "Messages", icon: <MessageSquare /> },
      { href: "/admin/notification-history", label: "Notification history", icon: <History /> },
    ],
  },
  {
    title: "People and work",
    items: [
      { href: "/admin/interns", label: "Candidates", icon: <Users /> },
      { href: "/admin/users", label: "Users", icon: <UserCheck /> },
      { href: "/admin/companies", label: "Companies", icon: <Building2 /> },
      { href: "/admin/projects", label: "Projects", icon: <Briefcase /> },
    ],
  },
  {
    title: "Finance",
    items: [
      { href: "/admin/orders", label: "Orders", icon: <ShoppingBag /> },
      { href: "/admin/intern-invoices", label: "Intern invoices", icon: <Receipt /> },
      { href: "/admin/transactions", label: "Transactions", icon: <ArrowLeftRight /> },
      { href: "/admin/payouts", label: "Payouts", icon: <CreditCard /> },
      { href: "/admin/promo-codes", label: "Promo codes", icon: <Tag /> },
      { href: "/admin/reports", label: "Reports", icon: <BarChart3 /> },
    ],
  },
  {
    title: "Publishing",
    items: [
      { href: "/admin/cms", label: "Website content", icon: <Globe /> },
      { href: "/admin/notifications", label: "Send notification", icon: <Bell /> },
    ],
  },
  {
    title: "Settings",
    items: [
      { href: "/admin/settings", label: "Pricing and fees", icon: <Settings /> },
      { href: "/admin/cms/terms", label: "Website terms", icon: <ScrollText /> },
      { href: "/admin/interns/terms", label: "Intern terms", icon: <FileText /> },
      { href: "/admin/interns/non-disclosure", label: "Intern NDA", icon: <ShieldCheck /> },
      { href: "/admin/companies/terms", label: "Company terms", icon: <ScrollText /> },
      { href: "/admin/roles", label: "Roles and access", icon: <Shield /> },
      { href: "/admin/account", label: "Your account", icon: <CircleUserRound /> },
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

  const withBadges = groups.map((g) => ({
    ...g,
    items: g.items.map((i) => (i.href === "/admin/messages" && unreadMessages > 0 ? { ...i, badge: unreadMessages > 99 ? "99+" : unreadMessages } : i)),
  }));

  return (
    <ConsoleShell
      roleLabel="Admin"
      homeHref="/admin/dashboard"
      groups={withBadges}
      account={{ name: session.email.split("@")[0], email: session.email, subtitle: roleName(session.permissions) }}
      menu={[{ href: "/admin/account", label: "Your account", icon: <CircleUserRound /> }]}
      topActions={<CommandPalette />}
      alerts={{ href: "/admin/messages", count: unreadMessages, label: "Inbound messages" }}
      signOutTo="/admin/login"
      initialCollapsed={(await cookies()).get(RAIL_COOKIE)?.value === "1"}
      crumbLabels={NAV_LABELS}
      rootCrumb={{ label: "Workspace", href: "/admin/dashboard" }}
    >
      {children}
    </ConsoleShell>
  );
}

function roleName(permissions: string[] | undefined): string {
  return permissions?.includes("*") ? "Super admin" : "Staff";
}
