import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  ShoppingCart,
  CalendarDays,
  Bell,
  Building2,
  Users,
  GitCompare,
  ShoppingBag,
  Clock,
  Send,
  KeyRound,
  Receipt,
  GraduationCap,
} from "lucide-react";

import { ConsoleShell, type ConsoleNavGroup } from "@/components/layout/console-shell";
import { RAIL_COOKIE } from "@/lib/rail";
import { ViewAsBanner } from "@/components/admin/view-as-banner";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { SITE } from "@/lib/content/site";
import { q } from "@/lib/college/sql";

const NAV_GROUPS: ConsoleNavGroup[] = [
  {
    title: "Talent & Pipeline",
    items: [
      { href: "/employer/dashboard", label: "Dashboard", icon: <LayoutDashboard /> },
      { href: "/employer/candidates", label: "Candidates", icon: <Users /> },
      { href: "/employer/compare", label: "Compare", icon: <GitCompare /> },
      { href: "/employer/drives", label: "Campus drives", icon: <GraduationCap /> },
      { href: "/employer/projects", label: "Projects", icon: <FolderKanban /> },
    ],
  },
  {
    title: "Proposals & Hiring",
    items: [
      { href: "/employer/proposals", label: "Proposals", icon: <FileText /> },
      { href: "/employer/send-proposal", label: "Send proposal", icon: <Send /> },
      { href: "/employer/schedule", label: "Schedule", icon: <CalendarDays /> },
      { href: "/employer/timesheets", label: "Timesheets", icon: <Clock /> },
    ],
  },
  {
    title: "Billing & Account",
    items: [
      { href: "/employer/cart", label: "Shortlist", icon: <ShoppingBag /> },
      { href: "/employer/orders", label: "Orders", icon: <ShoppingCart /> },
      { href: "/employer/alerts", label: "Alerts", icon: <Bell /> },
      { href: "/employer/account", label: "Company profile", icon: <Building2 /> },
    ],
  },
];

export default async function EmployerLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "employer") redirect("/employer/login");

  let companyName = "Company Account";
  let unreadAlerts = 0;
  let cartCount = 0;
  try {
    const db = getDb();
    const [emp] = await db
      .select({ companyName: schema.employers.companyName })
      .from(schema.employers)
      .where(eq(schema.employers.id, session.uid))
      .limit(1);
    if (emp?.companyName) companyName = emp.companyName;

    const [unread] = await db
      .select({ value: count() })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.recipientType, "employer"),
          eq(schema.notifications.recipientId, session.uid),
          eq(schema.notifications.isRead, false),
        ),
      );
    unreadAlerts = Number(unread?.value ?? 0);

    const [cart] = await db
      .select({ value: count() })
      .from(schema.employerCartItems)
      // Same set as the Shortlist page and its steps strip: saved, legacy
      // "checkout" rows included, and no live proposal yet (QA-124).
      .where(
        and(
          eq(schema.employerCartItems.employerId, session.uid),
          inArray(schema.employerCartItems.listType, ["cart", "checkout"]),
          sql`NOT EXISTS (SELECT 1 FROM ${schema.proposals} p WHERE p.employer_id = ${q(schema.employerCartItems, schema.employerCartItems.employerId)} AND p.intern_id = ${q(schema.employerCartItems, schema.employerCartItems.internId)} AND p.status NOT IN ('rejected', 'withdrawn', 'expired'))`,
        ),
      );
    cartCount = Number(cart?.value ?? 0);
  } catch {
    // Keep fallback
  }

  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.map((i) =>
      i.href === "/employer/cart" && cartCount > 0
        ? { ...i, badge: cartCount }
        : i.href === "/employer/alerts" && unreadAlerts > 0
          ? { ...i, badge: unreadAlerts > 99 ? "99+" : unreadAlerts }
          : i,
    ),
  }));

  return (
    <ConsoleShell
      roleLabel="Employer"
      homeHref="/employer/dashboard"
      groups={groups}
      account={{ name: companyName, email: session.email }}
      menu={[
        { href: "/employer/account", label: "Company profile", icon: <Building2 /> },
        { href: "/employer/orders", label: "Orders & invoices", icon: <Receipt /> },
        { href: "/employer/account#security", label: "Change password", icon: <KeyRound /> },
      ]}
      topActions={
        <Link
          href="/employer/cart"
          aria-label={cartCount > 0 ? `Shortlist, ${cartCount} candidates` : "Shortlist"}
          className="apple-spring relative grid size-11 place-items-center rounded-apple-sm text-ink-600 hover:bg-ink-100 hover:text-ink-900"
        >
          <ShoppingBag className="size-5" aria-hidden />
          {cartCount > 0 ? (
            <span className="nums absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-700 px-1 text-2xs font-bold text-white ring-2 ring-surface">
              {cartCount > 99 ? "99+" : cartCount}
            </span>
          ) : null}
        </Link>
      }
      alerts={{ href: "/employer/alerts", count: unreadAlerts, label: "Alerts" }}
      help={{ faqHref: "/faq#employers", contactHref: "/contact", email: SITE.adminEmail }}
      signOutTo="/employer/login"
      initialCollapsed={(await cookies()).get(RAIL_COOKIE)?.value === "1"}
      rootCrumb={{ label: "Home", href: "/employer/dashboard" }}
      crumbParents={{
        "/employer/proposal": { label: "Proposals", href: "/employer/proposals" },
        "/employer/intern": { label: "Candidates", href: "/employer/candidates" },
      }}
      banner={session.impersonator ? <ViewAsBanner viewing={companyName} admin={session.impersonator.email} /> : null}
    >
      {children}
    </ConsoleShell>
  );
}
