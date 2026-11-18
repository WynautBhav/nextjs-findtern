"use client";

/**
 * The admin console's frame: the same parts and the same paper as the other three roles
 * (`shell-parts.tsx`), plus what only staff need: a light/dark switch, the messages shortcut and
 * live queue counts on rail items.
 *
 * - The rail is the work queue: items carry a count (`badge`); a number ticks to its new value
 *   through `Count` when the server layout re-renders. A count that could not be read is not passed.
 * - The theme (light default) lives in the `ft_admin_theme` cookie the server layout reads. The root
 *   carries `data-admin-theme` and, when dark, `dark`; the same goes on <html> while mounted so
 *   Radix portals match.
 * - The rail's collapsed state lives in a cookie (`RAIL_COOKIE` from `@/lib/rail`).
 * - Phones: a bottom bar with the staff's busiest destinations and "More" for the rest.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProgressRouter } from "@/components/layout/navigation-progress";
import { useEffect, useState } from "react";
import { MotionConfig } from "motion/react";
import { ChevronsLeft, ChevronsRight, LogOut, Menu, MessageSquare, Moon, Sun, X } from "lucide-react";

import { Count } from "@/components/admin/motion";
import { FeedbackFab } from "@/components/app/feedback-fab";
import { Logo, LogoMark } from "@/components/brand/logo";
import { APP_FONT_CLASSES } from "@/components/layout/app-fonts";
import { RAIL_FOOT, RailGroups, RailScroller, TabBar, UserMenu, type NavGroup, type NavItem } from "@/components/layout/shell-parts";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { breadcrumbsFor } from "@/lib/breadcrumbs";
import { ADMIN_THEME_COOKIE, type AdminTheme } from "@/lib/admin/theme";
import { csrfFetch } from "@/lib/client-fetch";
import { RAIL_COOKIE } from "@/lib/rail";
import { cn } from "@/lib/utils";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** A count beside the label (unread messages, payouts due). A number ticks via `Count`; zero shows nothing. */
  badge?: number | string;
  /** Said after the count to assistive tech ("due", "awaiting a score"): "Payouts 3 due". */
  badgeNote?: string;
  /** A quiet dot: this needs someone, without turning it into a score. */
  attention?: boolean;
  /** Other paths this item stands for (one "Legal texts" item for four pages). */
  also?: string[];
};
export type AdminNavGroup = { title?: string; items: AdminNavItem[] };
export type AdminMenuLink = { href: string; label: string; icon: React.ReactNode };

/** A queue count reads "99+" past 99 so it never grows wide. */
const formatBadge = (n: number) => (n > 99 ? "99+" : String(Math.round(n)));

/** The destinations staff return to most; shown on the phone bar only if their role may open them. */
const PHONE_TABS = ["/admin/dashboard", "/admin/proposal-tracker", "/admin/payouts", "/admin/interns"];

function asNav(i: AdminNavItem): NavItem {
  const n = typeof i.badge === "number" ? i.badge : null;
  return {
    href: i.href,
    label: i.label,
    icon: i.icon,
    also: i.also,
    attention: i.attention,
    badge: n !== null ? (n > 0 ? formatBadge(n) : undefined) : i.badge || undefined,
    badgeNode: n !== null && n > 0 ? <Count value={n} format={formatBadge} /> : undefined,
    badgeLabel: i.badgeNote,
  };
}

export function AdminShell({
  homeHref,
  groups,
  account,
  menu = [],
  topActions,
  signOutTo,
  initialCollapsed = false,
  initialTheme = "light",
  unreadMessages = 0,
  crumbLabels = {},
  rootCrumb,
  children,
}: {
  homeHref: string;
  groups: AdminNavGroup[];
  account: { name: string; email: string; subtitle?: string; photoUrl?: string | null };
  menu?: AdminMenuLink[];
  topActions?: React.ReactNode;
  signOutTo: string;
  initialCollapsed?: boolean;
  initialTheme?: AdminTheme;
  /** Unread contact messages, for the dot on the top bar's messages button. */
  unreadMessages?: number;
  crumbLabels?: Record<string, string>;
  rootCrumb: { label: string; href: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useProgressRouter();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [theme, setTheme] = useState<AdminTheme>(initialTheme);
  const [signOutError, setSignOutError] = useState(false);

  // Portalled surfaces (dialogs, sheets, menus, the command palette) render under <body>: they get
  // the theme, the fonts and the token block through <html>. Re-runs when the toggle flips.
  useEffect(() => {
    const root = document.documentElement;
    const classes = APP_FONT_CLASSES.split(" ");
    root.classList.toggle("dark", theme === "dark");
    root.classList.add(...classes);
    root.dataset.console = "admin";
    root.dataset.app = "1";
    root.dataset.adminTheme = theme;
    root.style.colorScheme = theme;
    return () => {
      root.classList.remove("dark", ...classes);
      delete root.dataset.console;
      delete root.dataset.app;
      delete root.dataset.adminTheme;
      root.style.colorScheme = "";
    };
  }, [theme]);

  const navGroups: NavGroup[] = groups.map((g) => ({ title: g.title, items: g.items.map(asNav) }));
  const allItems = groups.flatMap((g) => g.items);
  const crumbs = breadcrumbsFor(pathname, { ...Object.fromEntries(allItems.map((i) => [i.href, i.label])), ...crumbLabels }, "", {}).filter((c) => c.href !== rootCrumb.href);
  // A top-level page's H1 already says where you are: the trail only appears on nested routes.
  const nested = pathname.split("/").filter(Boolean).length > 2;
  const tabs = PHONE_TABS.map((h) => allItems.find((i) => i.href === h)).filter((i): i is AdminNavItem => Boolean(i)).map(asNav);
  const waiting = allItems.filter((i) => !PHONE_TABS.includes(i.href)).reduce((n, i) => n + (typeof i.badge === "number" ? i.badge : 0), 0);
  const messagesHref = allItems.find((i) => i.href === "/admin/messages")?.href;
  const logoVariant = theme === "dark" ? "white" : "green";

  function toggleRail() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${RAIL_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }
  function toggleTheme() {
    const next: AdminTheme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.cookie = `${ADMIN_THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }
  async function signOut() {
    setSignOutError(false);
    const res = await csrfFetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      setSignOutError(true);
      return;
    }
    router.replace(signOutTo);
    router.refresh();
  }

  const rail = (compact: boolean, onNavigate?: () => void) => (
    <>
      <RailScroller>
        <RailGroups groups={navGroups} pathname={pathname} compact={compact} onNavigate={onNavigate} />
      </RailScroller>
      <div className="mt-3 shrink-0 space-y-0.5 pb-1">
        <FeedbackFab variant="link" deepLink={!onNavigate} className={cn(RAIL_FOOT, compact && "justify-center px-0 [&>span]:sr-only")} />
        <button type="button" onClick={signOut} title={compact ? "Sign out" : undefined} className={cn(RAIL_FOOT, compact && "justify-center px-0")}>
          <LogOut aria-hidden />
          <span className={cn(compact && "sr-only")}>Sign out</span>
        </button>
        {signOutError ? (
          <p role="alert" className="px-3 text-xs text-danger">
            Sign out didn&apos;t go through. Check your connection and try again.
          </p>
        ) : null}
      </div>
    </>
  );

  const brand = (compact: boolean) => (
    <div className={cn("flex min-h-12 items-center", compact ? "justify-center" : "px-2")}>
      <Link href={homeHref} aria-label="Findtern home" className="flex min-w-0 flex-col justify-center">
        {compact ? <LogoMark variant={logoVariant} alt="" className="size-8" /> : <Logo variant={logoVariant} priority className="h-8" />}
        {!compact ? <span className="mt-1 text-xs font-medium text-ink-600">Admin</span> : null}
      </Link>
    </div>
  );

  const iconBtn = "relative grid size-11 shrink-0 place-items-center rounded-md text-ink-600 transition-colors duration-[var(--motion-fast)] hover:bg-ink-200/60 hover:text-ink-900";

  return (
    <MotionConfig reducedMotion="user">
      <div
        data-app="1"
        data-console="admin"
        data-admin-theme={theme}
        className={cn(APP_FONT_CLASSES, "min-h-[100dvh] overflow-x-clip text-foreground lg:flex", theme === "dark" && "dark")}
        style={{ colorScheme: theme }}
      >
        <aside
          aria-label="Sidebar"
          className={cn(
            "sticky top-0 hidden h-[100dvh] shrink-0 flex-col border-r border-ink-200 px-3 py-4 transition-[width] duration-[var(--motion-base)] ease-[var(--ease-app)] motion-reduce:transition-none lg:flex",
            collapsed ? "w-[4.5rem]" : "w-60",
          )}
        >
          {brand(collapsed)}
          <div className="flex min-h-0 flex-1 flex-col">{rail(collapsed)}</div>
          <button
            type="button"
            onClick={toggleRail}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className="absolute -right-3 top-[3.75rem] z-10 grid size-6 place-items-center rounded-full border border-ink-300 bg-canvas text-ink-600 transition-colors hover:text-ink-900"
          >
            {collapsed ? <ChevronsRight className="size-3.5" aria-hidden /> : <ChevronsLeft className="size-3.5" aria-hidden />}
          </button>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-ink-200 bg-canvas">
            <div className="mx-auto flex h-14 w-full max-w-[90rem] items-center gap-1.5 px-[var(--space-page)]">
              <Sheet open={drawer} onOpenChange={setDrawer}>
                <SheetTrigger asChild>
                  <button type="button" aria-label={waiting > 0 ? `Open navigation, ${waiting} waiting` : "Open navigation"} className={cn(iconBtn, "-ml-2 lg:hidden")}>
                    <Menu className="size-5" aria-hidden />
                  </button>
                </SheetTrigger>
                <SheetContent side="left" showCloseButton={false} aria-modal="true" className={cn(APP_FONT_CLASSES, "flex w-[19rem] flex-col border-r border-ink-200 bg-canvas p-4 text-foreground")}>
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <div className="flex items-center justify-between gap-2">
                    {brand(false)}
                    <button type="button" onClick={() => setDrawer(false)} aria-label="Close navigation" className={iconBtn}>
                      <X className="size-5" aria-hidden />
                    </button>
                  </div>
                  {rail(false, () => setDrawer(false))}
                </SheetContent>
              </Sheet>

              <div className="min-w-0 flex-1">{topActions}</div>

              <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                {messagesHref ? (
                  <Link href={messagesHref} className={iconBtn} aria-label={unreadMessages > 0 ? `Messages, ${unreadMessages} unread` : "Messages"}>
                    <MessageSquare className="size-5" aria-hidden />
                    {unreadMessages > 0 ? <span aria-hidden className="absolute right-2.5 top-2.5 size-2 rounded-full bg-signal ring-2 ring-canvas" /> : null}
                  </Link>
                ) : null}
                <button type="button" onClick={toggleTheme} aria-pressed={theme === "dark"} aria-label="Dark mode" className={iconBtn}>
                  {theme === "dark" ? <Moon className="size-5" aria-hidden /> : <Sun className="size-5" aria-hidden />}
                </button>
                <UserMenu account={account} menu={menu} onSignOut={signOut} />
              </div>
            </div>
          </header>

          <main id="main" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-[90rem] flex-1 px-[var(--space-page)] pb-28 pt-6 outline-none lg:pb-20 lg:pt-8">
            {nested ? (
              <nav aria-label="Breadcrumb" className="mb-3 flex min-w-0 items-center gap-1.5 text-sm">
                <Link href={rootCrumb.href} className="inline-flex min-h-9 shrink-0 items-center font-medium text-ink-600 hover:text-ink-900">
                  {rootCrumb.label}
                </Link>
                {crumbs.map((crumb) => (
                  <span key={crumb.href} className="flex min-w-0 items-center gap-1.5">
                    <span aria-hidden className="text-ink-500">/</span>
                    {crumb.href === pathname ? (
                      <span aria-current="page" className="truncate font-medium text-ink-900">{crumb.label}</span>
                    ) : crumb.link ? (
                      <Link href={crumb.href} className="inline-flex min-h-9 items-center truncate font-medium text-ink-600 hover:text-ink-900">{crumb.label}</Link>
                    ) : (
                      <span className="truncate text-ink-600">{crumb.label}</span>
                    )}
                  </span>
                ))}
              </nav>
            ) : null}
            <div key={pathname} className="page-enter">
              {children}
            </div>
          </main>

          <TabBar tabs={tabs} pathname={pathname} onMore={() => setDrawer(true)} moreBadge={waiting} />
        </div>
      </div>
    </MotionConfig>
  );
}
