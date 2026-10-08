import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import type { NavGroup } from "@/components/admin/admin-nav";
import { getSession } from "@/lib/auth";

const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin/dashboard", label: "Dashboard" },
      { href: "/admin/messages", label: "Inbound Messages" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/interns", label: "Candidate Directory" },
      { href: "/admin/companies", label: "Hiring Partners" },
      { href: "/admin/roles", label: "Roles and Access" },
    ],
  },
  {
    label: "Work",
    items: [
      { href: "/admin/projects", label: "Work Projects" },
      { href: "/admin/proposal-tracker", label: "Proposal Pipeline" },
    ],
  },
  {
    label: "Finance",
    items: [
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

  return (
    <AdminShell groups={NAV} email={session.email} role={session.role}>
      {children}
    </AdminShell>
  );
}
