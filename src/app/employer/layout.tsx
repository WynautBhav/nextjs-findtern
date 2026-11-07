import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, count, eq, inArray, sql } from "drizzle-orm";
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
} from "lucide-react";

import { ConsoleShell, type ConsoleNavGroup, type ConsoleNavItem } from "@/components/layout/console-shell";
import { RAIL_COOKIE } from "@/lib/rail";
import { ViewAsBanner } from "@/components/admin/view-as-banner";
import { LiveProvider } from "@/components/app/live-provider";
import { TermsGate } from "@/components/app/terms-gate";
import { ToastProvider } from "@/components/app/toast";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { SITE } from "@/lib/content/site";
import { q } from "@/lib/college/sql";
import { countsFor, type LiveCounts } from "@/lib/live-counts";
import { shouldShowTermsPrompt } from "@/lib/terms";

// The path in order: find, shortlist, offer, interview, hire, then timesheet and pay.
// Shortlist and Compare sit under Candidates (tabs there, and the bag in the header);
// Interviews sit under Proposals. `also` keeps the right item lit on every sub-page.
const NAV_GROUPS: ConsoleNavGroup[] = [
  {
    title: "Hiring",
    items: [
      { href: "/employer/dashboard", label: "Dashboard", icon: <LayoutDashboard /> },
      {
        href: "/employer/candidates",
        label: "Candidates",
        icon: <Users />,
        also: ["/employer/compare", "/employer/cart", "/employer/shortlist", "/employer/intern"],
      },
      { href: "/employer/projects", label: "Internships", icon: <FolderKanban /> },
      {
        href: "/employer/proposals",
        label: "Proposals",
        icon: <FileText />,
        also: ["/employer/proposal", "/employer/send-proposal", "/employer/schedule"],
      },
      { href: "/employer/messages", label: "Messages", icon: <MessageSquare /> },
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
  let live: LiveCounts = { notifications: 0, messages: 0, latest: null, lastMessageAt: null };
  let cartCount = 0;
  // Unknown (a failed read) must not trap someone behind a pop-up they may have already accepted.
  let termsVersion: string | null | undefined;
  try {
    const db = getDb();
    const [emp] = await db
      .select({ companyName: schema.employers.companyName, termsVersion: schema.employers.termsAcceptedVersion })
      .from(schema.employers)
      .where(eq(schema.employers.id, session.uid))
      .limit(1);
    if (emp?.companyName) companyName = emp.companyName;
    termsVersion = emp?.termsVersion ?? null;

    // Unread alerts and messages: the same query the live stream sends, so the badges never disagree with it.
    live = await countsFor("employer", session.uid);

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

  // Only Messages carries a count in the sidebar: it is the one queue that needs the employer.
  const withBadge = (i: ConsoleNavItem): ConsoleNavItem => {
    const n = i.href === "/employer/messages" ? live.messages : 0;
    return n > 0 ? { ...i, badge: n > 99 ? "99+" : n, attention: true } : i;
  };
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.map(withBadge) }));
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
  const unreadAlerts = live.notifications;

  return (
    <ToastProvider>
    <ConsoleShell
      roleLabel="Employer"
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
          className="apple-spring relative grid size-11 place-items-center rounded-apple-sm text-ink-600 hover:bg-ink-100 hover:text-ink-900"
        >
          <ShoppingBag className="size-5" aria-hidden />
          {cartCount > 0 ? (
            <span className="nums absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-700 px-1 text-2xs font-semibold text-white ring-2 ring-surface">
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
      crumbParents={{
        "/employer/proposal": { label: "Proposals", href: "/employer/proposals" },
        "/employer/intern": { label: "Candidates", href: "/employer/candidates" },
      }}
      banner={session.impersonator ? <ViewAsBanner viewing={companyName} admin={session.impersonator.email} /> : null}
    >
      <LiveProvider initial={live} />
      {children}
      <TermsGate role="employer" initialOpen={termsVersion !== undefined && shouldShowTermsPrompt({ acceptedVersion: termsVersion, impersonating: !!session.impersonator })} />
    </ConsoleShell>
    </ToastProvider>
  );
}
