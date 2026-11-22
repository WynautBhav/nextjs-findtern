import { AccountGuard } from "@/components/app/account-guard";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LayoutDashboard, Megaphone, Table2, Ticket, UserCheck, Users, Wallet } from "lucide-react";

import { ConsoleShell, type ConsoleNavGroup } from "@/components/layout/console-shell";
import { TermsGate } from "@/components/app/terms-gate";
import { RAIL_COOKIE } from "@/lib/rail";
import { pendingApprovalCount } from "@/lib/college/approvals";
import { pendingLeaveCount } from "@/lib/college/leave-request-read";
import { requireCollegeContext } from "@/lib/college/scope";
import { SITE } from "@/lib/content/site";
import { shouldShowTermsPrompt } from "@/lib/terms";

export const metadata: Metadata = {
  title: "Placement console",
  robots: { index: false, follow: false },
};

/** `waiting` = students to accept plus leave requests: everything that needs the officer's decision. */
const navFor = (waiting: number): ConsoleNavGroup[] => [
  {
    title: "Placement",
    items: [
      { href: "/college", label: "Dashboard", icon: <LayoutDashboard /> },
      { href: "/college/students", label: "Students", icon: <Users /> },
      { href: "/college/approvals", label: "Approvals", icon: <UserCheck />, ...(waiting > 0 ? { badge: waiting, badgeLabel: "waiting for your decision" } : {}) },
      { href: "/college/drives", label: "Drives", icon: <Megaphone /> },
      { href: "/college/master-data", label: "Master data", icon: <Table2 /> },
    ],
  },
  {
    title: "Billing",
    items: [
      { href: "/college/seats", label: "Seats", icon: <Ticket /> },
      { href: "/college/earnings", label: "Earnings", icon: <Wallet /> },
    ],
  },
];

/**
 * The placement officer's console: the same frame as the other roles, with
 * no cart, alerts or company account links, since a college neither buys nor
 * receives notifications here.
 */
export default async function CollegeLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCollegeContext();
  const [leaves, approvals] = await Promise.all([
    pendingLeaveCount(ctx.college.id).catch(() => 0),
    pendingApprovalCount(ctx.college.id, ctx.college.emailDomains).catch(() => 0),
  ]);
  const NAV = navFor(leaves + approvals);
  return (
    <ConsoleShell
      roleLabel="College"
      homeHref="/college"
      groups={NAV}
      // The phone tab bar keeps its five; Master data opens from the menu.
      tabs={NAV[0].items.filter((i) => i.href !== "/college/master-data")}
      account={{ name: ctx.college.name, email: ctx.admin.email }}
      help={{ faqHref: "/faq", contactHref: "/contact?type=college", email: SITE.adminEmail }}
      signOutTo="/login?as=college"
      initialCollapsed={(await cookies()).get(RAIL_COOKIE)?.value === "1"}
      rootCrumb={{ label: "Dashboard", href: "/college" }}
      // Record pages read "Drives", not "Drives / Details"; no back links needed.
      // Leave requests are decided on the Approvals page; the old address still opens.
      crumbParents={{ "/college/leave-requests": { label: "Approvals", href: "/college/approvals" } }}
    >
      {children}
      <AccountGuard role="college" />
      <TermsGate role="college" initialOpen={shouldShowTermsPrompt({ acceptedVersion: ctx.admin.termsAcceptedVersion })} />
    </ConsoleShell>
  );
}
