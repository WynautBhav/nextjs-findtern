import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
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
  Receipt,
  CalendarClock,
  GraduationCap,
  Sparkles,
} from "lucide-react";

import { ConsoleShell, type ConsoleNavGroup, type ConsoleNavItem } from "@/components/layout/console-shell";
import { RAIL_COOKIE } from "@/lib/rail";
import { ViewAsBanner } from "@/components/admin/view-as-banner";
import { PresenceHeartbeat } from "@/components/app/presence-heartbeat";
import { TermsGate } from "@/components/app/terms-gate";
import { WarningGate } from "@/components/app/warning-gate";
import { pendingWarningFor } from "@/lib/moderation/standing-db";
import { ToastProvider } from "@/components/app/toast";
import { getSession, loginRedirectFor } from "@/lib/auth";
import { AccountGuard } from "@/components/app/account-guard";
import { getDb, schema } from "@/lib/db";
import { SITE } from "@/lib/content/site";
import { shouldShowTermsPrompt } from "@/lib/terms";
import { getEmployerRows } from "@/lib/employer-request";
import { gated } from "@/lib/request-gate";
import { activeCampusDrives } from "@/lib/college/campus-lock";
import { driveCountdown } from "@/lib/college/drive-pricing";
import { DriveEndingBanner } from "@/components/employer/campus/drive-ending-banner";
import { DRIVES_HREF, employerTabHrefs, withDrivesItem } from "@/lib/employer-nav";

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
    ],
  },
  {
    title: "After the hire",
    items: [
      { href: "/employer/timesheets", label: "Timesheets", icon: <Clock /> },
      { href: "/employer/orders", label: "Orders", icon: <ShoppingCart />, also: ["/employer/checkout"] },
      { href: "/employer/subscription", label: "Findtern Pro", icon: <Sparkles /> },
    ],
  },
];

export default async function EmployerLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "employer") redirect(await loginRedirectFor("employer"));

  // A first confirmed violation is a warning the person must acknowledge: a blocking notice until they do. A failed read shows nothing (never traps anyone); an admin viewing as them is not shown it.
  const pendingWarning = session.impersonator ? false : Boolean(await pendingWarningFor({ type: "employer", id: session.uid }).catch(() => null));

  let companyName = "Company Account";
  let unreadAlerts = 0;
  let cartCount = 0;
  // Unknown (a failed read) must not trap someone behind a pop-up they may have already accepted.
  let termsVersion: string | null | undefined;
  // Three independent reads, started together (through the per-request gate, so the page's other reads share the pool fairly). Each result is kept or dropped on its own, so one failed read
  // leaves the others (and the fallbacks above) as they were.
  const db = getDb();
  // Two statements: the employer row (shared with the setup check and the page, one read per request) and both badge
  // counts in one round trip.
  const [empRes, countsRes, lockRes] = await Promise.allSettled([
    getEmployerRows(session.uid),
    gated(() =>
      db.execute<{ unread: string | number; cart: string | number }>(sql`
        SELECT
          (SELECT count(*) FROM ${schema.notifications}
            WHERE ${schema.notifications.recipientType} = 'employer' AND ${schema.notifications.recipientId} = ${session.uid} AND ${schema.notifications.isRead} = false) AS unread,
          -- Distinct people, not cart lines: one candidate saved to two projects is one. Same set as the Shortlist page and
          -- its steps strip: saved, legacy "checkout" rows included, and no live proposal yet (QA-124).
          (SELECT count(DISTINCT ci.intern_id) FROM ${schema.employerCartItems} ci
            WHERE ci.employer_id = ${session.uid} AND ci.list_type IN ('cart', 'checkout')
              AND NOT EXISTS (SELECT 1 FROM ${schema.proposals} p WHERE p.employer_id = ci.employer_id AND p.intern_id = ci.intern_id AND lower(btrim(p.status)) NOT IN ('rejected', 'withdrawn', 'expired'))) AS cart`),
    ),
    // Campus-locked mode: the live drives this company is inside (server time, every request).
    gated(() => activeCampusDrives(session.uid)),
  ]);
  const campus = lockRes.status === "fulfilled" ? lockRes.value : [];
  if (lockRes.status === "rejected") console.error("[employer/layout] campus drive read failed", lockRes.reason);
  const liveDrive = campus[0] ?? null;
  const ending = liveDrive ? driveCountdown(liveDrive.drive.endsAt) : null;
  if (empRes.status === "fulfilled") {
    const [emp] = empRes.value;
    if (emp?.companyName) companyName = emp.companyName;
    termsVersion = emp?.termsAcceptedVersion ?? null;
  }
  if (countsRes.status === "fulfilled") {
    const row = countsRes.value.rows[0];
    unreadAlerts = Number(row?.unread ?? 0);
    cartCount = Number(row?.cart ?? 0);
  }
  // A failed read leaves its fallback (0 = no badge, never a wrong number) but must not be silent.
  for (const [what, res] of [["company", empRes], ["alert and shortlist badges", countsRes]] as const) {
    if (res.status === "rejected") console.error(`[employer/layout] ${what} read failed`, res.reason);
  }

  // The shortlist count rides on its own item, like the bag in the header.
  // Inside a live drive the item reads "Virtual drive", leads to that drive and stays marked for the whole drive.
  // Only while the drive is live: once it is over the item is gone, and so are the pages (employer/drives).
  const drivesItem: ConsoleNavItem = liveDrive
    ? { href: `${DRIVES_HREF}/${liveDrive.drive.id}`, label: "Virtual drive", icon: <GraduationCap />, badge: "Live", badgeLabel: "drive", also: [DRIVES_HREF] }
    : { href: DRIVES_HREF, label: "Virtual drive", icon: <GraduationCap /> };
  const groups: ConsoleNavGroup[] = withDrivesItem(NAV_GROUPS, Boolean(liveDrive), drivesItem).map((g) => ({
    ...g,
    items: g.items.map((i) => (i.href === "/employer/cart" && cartCount > 0 ? { ...i, badge: cartCount > 99 ? "99+" : cartCount, badgeLabel: "saved" } : i)),
  }));
  // Phone tab bar: the places an employer returns to (the rest stay in the menu).
  const flat = groups.flatMap((g) => g.items);
  const shortlistTab: ConsoleNavItem = {
    href: "/employer/cart",
    label: "Shortlist",
    icon: <ShoppingBag />,
    ...(cartCount > 0 ? { badge: cartCount > 99 ? "99+" : cartCount } : {}),
  };
  const tabs = employerTabHrefs(Boolean(liveDrive))
    .map((href) => (href === shortlistTab.href ? shortlistTab : href === DRIVES_HREF ? drivesItem : flat.find((i) => i.href === href)))
    .filter((i): i is ConsoleNavItem => Boolean(i));

  return (
    <ToastProvider>
    {/* `data-console` scopes console-wide CSS (globals.css: native selects draw the same on macOS as elsewhere). `contents` adds no box. */}
    <div data-console="employer" className="contents">
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
      <PresenceHeartbeat />
      {session.impersonator ? null : <AccountGuard role="employer" />}
      {/* In the page flow, above every employer page: the shell's banner slot sits beside the content, not above it. */}
      {liveDrive && ending?.showExpiryWarning ? <DriveEndingBanner driveId={liveDrive.drive.id} collegeName={liveDrive.collegeName} daysRemaining={ending.daysRemaining} /> : null}
      {children}
      {pendingWarning ? <WarningGate /> : null}
      <TermsGate role="employer" initialOpen={termsVersion !== undefined && shouldShowTermsPrompt({ acceptedVersion: termsVersion, impersonating: !!session.impersonator })} />
    </ConsoleShell>
    </div>
    </ToastProvider>
  );
}
