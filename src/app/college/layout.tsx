import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LayoutDashboard, ListChecks, Megaphone } from "lucide-react";

import { ConsoleShell, type ConsoleNavGroup } from "@/components/layout/console-shell";
import { RAIL_COOKIE } from "@/lib/rail";
import { requireCollegeContext } from "@/lib/college/scope";
import { SITE } from "@/lib/content/site";

export const metadata: Metadata = {
  title: "Placement console",
  robots: { index: false, follow: false },
};

const NAV: ConsoleNavGroup[] = [
  {
    title: "Placement",
    items: [
      { href: "/college", label: "Students", icon: <LayoutDashboard /> },
      { href: "/college/drives", label: "Drives", icon: <Megaphone /> },
      { href: "/college/roster", label: "Roster", icon: <ListChecks /> },
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
  return (
    <ConsoleShell
      roleLabel="College"
      homeHref="/college"
      groups={NAV}
      tabs={NAV[0].items}
      account={{ name: ctx.college.name, email: ctx.admin.email }}
      help={{ faqHref: "/faq", contactHref: "/contact", email: SITE.adminEmail }}
      signOutTo="/college/login"
      initialCollapsed={(await cookies()).get(RAIL_COOKIE)?.value === "1"}
      rootCrumb={{ label: "Students", href: "/college" }}
    >
      {children}
    </ConsoleShell>
  );
}
