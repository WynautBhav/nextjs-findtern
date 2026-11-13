import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, count, countDistinct, eq, inArray, sql } from "drizzle-orm";
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  ShoppingCart,
  Building2,
  Users,
  ShoppingBag,
  Clock,
  KeyRound,
  MessageSquare,
  Receipt,
  CalendarClock,
} from "lucide-react";

import { ConsoleShell, type ConsoleNavGroup, type ConsoleNavItem } from "@/components/layout/console-shell";
import { RAIL_COOKIE } from "@/lib/rail";
import { ViewAsBanner } from "@/components/admin/view-as-banner";
import { MessagingLive } from "@/components/messaging";
import { TermsGate } from "@/components/app/terms-gate";
import { ToastProvider } from "@/components/app/toast";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { SITE } from "@/lib/content/site";
import { q } from "@/lib/college/sql";
import { shouldShowTermsPrompt } from "@/lib/terms";
import { gated } from "@/lib/request-gate";

// The path in order: find, shortlist, offer, interview, hire, then timesheet and pay.
// Shortlist is its own step of that path (the page, its title and the hiring-steps bar all
// say "Shortlist"), so it gets its own item and lights up alone; Compare stays under
// Candidates; Interviews have their own item. `also` keeps the right item lit on every sub-page.
const NAV_GROUPS: ConsoleNavGroup[] = [
  {
    title: "Hiring",
    items: [
      { href: "/employer/dashboard", label: "Dashboard", icon: <LayoutDashboard /> },
      {
        href: "/employer/candidates",
        label: "Candidates",
        icon: <Users />,
        also: ["/employer/compare", "/employer/intern"],
      },
      { href: "/employer/cart", label: "Shortlist", icon: <ShoppingBag />, also: ["/employer/shortlist"] },
      { href: "/employer/projects", label: "Projects", icon: <FolderKanban /> },
      {
        href: "/employer/proposals",
        label: "Proposals",
        icon: <FileText />,
        also: ["/employer/proposal", "/employer/send-proposal"],
      },
      { href: "/employer/schedule", label: "Interviews", icon: <CalendarClock /> },
      { href: "/employer/messages", label: "Messages", icon: <MessageSquare />, liveUnread: true },
    ],
  },
  {
    title: "After the hire",
    items: [
      { href: "/employer/timesheets", label: "Timesheets", icon: <Clock /> },
      { href: "/employer/orders", label: "Orders", icon: <ShoppingCart />, also: ["/employer/checkout"] },
    ],
  },
];

export default async function EmployerLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "employer") redirect("/login?as=employer");

  let companyName = "Company Account";
  let unreadAlerts = 0;
  let cartCount = 0;
  // Unknown (a failed read) must not trap someone behind a pop-up they may have already accepted.
  let termsVersion: string | null | undefined;
  // Three independent reads, started together (through the per-request gate, so the page's other reads share the pool fairly). Each result is kept or dropped on its own, so one failed read
  // leaves the others (and the fallbacks above) as they were.
  const db = getDb();
  const [empRes, unreadRes, cartRes] = await Promise.allSettled([
    gated(() =>
      db
        .select({ companyName: schema.employers.companyName, termsVersion: schema.employers.termsAcceptedVersion })
        .from(schema.employers)
        .where(eq(schema.employers.id, session.uid))
        .limit(1),
    ),
    gated(() =>
      db
        .select({ value: count() })
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.recipientType, "employer"),
            eq(schema.notifications.recipientId, session.uid),
            eq(schema.notifications.isRead, false),
          ),
        ),
    ),
    gated(() =>
      db
        // Distinct people, not cart lines: one candidate saved to two projects is one.
        .select({ value: countDistinct(schema.employerCartItems.internId) })
        .from(schema.employerCartItems)
        // Same set as the Shortlist page and its steps strip: saved, legacy
        // "checkout" rows included, and no live proposal yet (QA-124).
        .where(
          and(
            eq(schema.employerCartItems.employerId, session.uid),
            inArray(schema.employerCartItems.listType, ["cart", "checkout"]),
            sql`NOT EXISTS (SELECT 1 FROM ${schema.proposals} p WHERE p.employer_id = ${q(schema.employerCartItems, schema.employerCartItems.employerId)} AND p.intern_id = ${q(schema.employerCartItems, schema.employerCartItems.internId)} AND p.status NOT IN ('rejected', 'withdrawn', 'expired'))`,
          ),
        ),
    ),
  ]);
  if (empRes.status === "fulfilled") {
    const [emp] = empRes.value;
    if (emp?.companyName) companyName = emp.companyName;
    termsVersion = emp?.termsVersion ?? null;
  }
  if (unreadRes.status === "fulfilled") unreadAlerts = Number(unreadRes.value[0]?.value ?? 0);
  if (cartRes.status === "fulfilled") cartCount = Number(cartRes.value[0]?.value ?? 0);

  // Messages carries its own live unread count (MessagingLive); nothing else in the sidebar does.
  // The shortlist count rides on its own item, like the bag in the header.
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.map((i) => (i.href === "/employer/cart" && cartCount > 0 ? { ...i, badge: cartCount > 99 ? "99+" : cartCount, badgeLabel: "saved" } : i)),
  }));
  // Phone tab bar: the five places an employer returns to (the rest stay in the menu).
  const flat = groups.flatMap((g) => g.items);
  const shortlistTab: ConsoleNavItem = {
    href: "/employer/cart",
    label: "Shortlist",
    icon: <ShoppingBag />,
    ...(cartCount > 0 ? { badge: cartCount > 99 ? "99+" : cartCount } : {}),
  };
  const tabs = ["/employer/dashboard", "/employer/candidates", "/employer/proposals", "/employer/messages", "/employer/cart"]
    .map((href) => (href === shortlistTab.href ? shortlistTab : flat.find((i) => i.href === href)))
    .filter((i): i is ConsoleNavItem => Boolean(i));

  return (
    <ToastProvider>
    <ConsoleShell
      roleLabel="Employer"
      tone="light"
      flush
      homeHref="/employer/dashboard"
      groups={groups}
      tabs={tabs}
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
          title="Shortlist"
          className="apple-spring relative grid size-11 place-items-center rounded-apple-sm text-ink-600 hover:bg-ink-100 hover:text-ink-900"
        >
          <ShoppingBag className="size-5" aria-hidden />
          {cartCount > 0 ? (
            <span className="nums absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-700 px-1 text-2xs font-semibold text-white ring-2 ring-surface">
              {cartCount > 99 ? "99+" : cartCount}
            </span>
          ) : null}
        </Link>
      }
      alerts={{ href: "/employer/alerts", count: unreadAlerts, label: "Alerts" }}
      help={{ faqHref: "/faq#employers", contactHref: "/contact", email: SITE.adminEmail }}
      signOutTo="/login?as=employer"
      initialCollapsed={(await cookies()).get(RAIL_COOKIE)?.value === "1"}
      rootCrumb={{ label: "Home", href: "/employer/dashboard" }}
      crumbLabels={{ "/employer/cart": "Shortlist" }}
      crumbParents={{
        "/employer/proposal": { label: "Proposals", href: "/employer/proposals" },
        "/employer/intern": { label: "Candidates", href: "/employer/candidates" },
      }}
      banner={session.impersonator ? <ViewAsBanner viewing={companyName} admin={session.impersonator.email} /> : null}
    >
      <MessagingLive />
      {children}
      <TermsGate role="employer" initialOpen={termsVersion !== undefined && shouldShowTermsPrompt({ acceptedVersion: termsVersion, impersonating: !!session.impersonator })} />
    </ConsoleShell>
    </ToastProvider>
  );
}
