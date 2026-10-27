import type { Metadata } from "next";
import { LayoutDashboard, Megaphone, ListChecks, HelpCircle, Mail } from "lucide-react";

import { AppShell, type NavGroup } from "@/components/layout/app-shell";
import { requireCollegeContext } from "@/lib/college/scope";

export const metadata: Metadata = {
  title: "Placement console | Findtern",
  robots: { index: false, follow: false },
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Placement",
    items: [
      { href: "/college", label: "Students", icon: <LayoutDashboard className="size-4" /> },
      { href: "/college/drives", label: "Drives", icon: <Megaphone className="size-4" /> },
      { href: "/college/roster", label: "Roster", icon: <ListChecks className="size-4" /> },
    ],
  },
  {
    title: "Help",
    items: [
      { href: "/faq", label: "FAQ", icon: <HelpCircle className="size-4" /> },
      { href: "/contact", label: "Contact Findtern", icon: <Mail className="size-4" /> },
    ],
  },
];

export default async function CollegeLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCollegeContext();
  return (
    <AppShell area="college" brand="College" groups={NAV_GROUPS} companyName={ctx.college.name} email={ctx.admin.email}>
      {children}
    </AppShell>
  );
}
