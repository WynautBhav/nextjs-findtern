import { redirect } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
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
  HelpCircle,
  Mail,
  GraduationCap,
} from "lucide-react";

import { AppShell, type NavGroup } from "@/components/layout/app-shell";
import { ViewAsBanner } from "@/components/admin/view-as-banner";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Talent & Pipeline",
    items: [
      { href: "/employer/dashboard", label: "Dashboard", icon: <LayoutDashboard className="size-4" /> },
      { href: "/employer/candidates", label: "Candidates", icon: <Users className="size-4" /> },
      { href: "/employer/compare", label: "Compare", icon: <GitCompare className="size-4" /> },
      { href: "/employer/drives", label: "Campus drives", icon: <GraduationCap className="size-4" /> },
      { href: "/employer/projects", label: "Projects", icon: <FolderKanban className="size-4" /> },
    ],
  },
  {
    title: "Proposals & Hiring",
    items: [
      { href: "/employer/proposals", label: "Proposals", icon: <FileText className="size-4" /> },
      { href: "/employer/send-proposal", label: "Send proposal", icon: <Send className="size-4" /> },
      { href: "/employer/schedule", label: "Schedule", icon: <CalendarDays className="size-4" /> },
      { href: "/employer/timesheets", label: "Timesheets", icon: <Clock className="size-4" /> },
    ],
  },
  {
    title: "Billing & Account",
    items: [
      { href: "/employer/cart", label: "Cart", icon: <ShoppingBag className="size-4" /> },
      { href: "/employer/orders", label: "Orders", icon: <ShoppingCart className="size-4" /> },
      { href: "/employer/alerts", label: "Alerts", icon: <Bell className="size-4" /> },
      { href: "/employer/account", label: "Company Profile", icon: <Building2 className="size-4" /> },
    ],
  },
  {
    title: "Help",
    items: [
      { href: "/faq#employers", label: "FAQ", icon: <HelpCircle className="size-4" /> },
      { href: "/contact", label: "Contact", icon: <Mail className="size-4" /> },
    ],
  },
];

export default async function EmployerLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "employer") redirect("/employer/login");

  let companyName = "Company Account";
  let unreadAlerts = 0;
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
  } catch {
    // Keep fallback
  }

  return (
    <AppShell
      brand="Employer"
      groups={NAV_GROUPS}
      companyName={companyName}
      email={session.email}
      unreadAlerts={unreadAlerts}
    >
      {children}
      {session.impersonator ? (
        <ViewAsBanner viewing={companyName} admin={session.impersonator.email} />
      ) : null}
    </AppShell>
  );
}
