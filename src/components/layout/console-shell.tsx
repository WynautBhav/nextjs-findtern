"use client";

/**
 * The frame for intern, employer and college pages (admin has its own, `AdminShell`, built from the
 * same parts in `shell-parts.tsx`).
 *
 * - Rail on the left, flat on warm paper with a hairline edge. It collapses to an icon rail; the
 *   choice lives in a cookie the server layout reads, so the first paint is right.
 * - Top bar: search first (Ctrl K jumps to any page), then where you are (a dateline, or a trail on
 *   detail pages), then "Ask Findy", extra actions, alerts and the account menu. A double rule under
 *   it (`.ledger-head`). No blur, no pill.
 * - Phones: a bottom bar with the role's real destinations and a "More" for the rest.
 * - One breakpoint (lg) for every role.
 * - `tone` and `flush` are accepted for old callers and ignored: there is one look now.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, ChevronsLeft, ChevronsRight, CircleQuestionMark, LogOut, Mail, Menu, MessageSquareText, X } from "lucide-react";

import { FeedbackFab } from "@/components/app/feedback-fab";
import { Logo, LogoMark } from "@/components/brand/logo";
import { APP_FONT_CLASSES } from "@/components/layout/app-fonts";
import { Folio } from "@/components/layout/folio";
import { usePageEnter } from "@/components/layout/page-enter";
import { ShellPalette } from "@/components/layout/shell-palette";
import {
  AskLauncher,
  RAIL_FOOT,
  RailGroups,
  RailLink,
  RailScroller,
  TabBar,
  UserMenu,
  activeHrefOf,
  type MenuLink,
  type NavGroup,
  type NavItem,
} from "@/components/layout/shell-parts";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { breadcrumbsFor } from "@/lib/breadcrumbs";
import { csrfFetch } from "@/lib/client-fetch";
import { RAIL_COOKIE } from "@/lib/rail";
import { cn } from "@/lib/utils";

export type ConsoleNavItem = NavItem;
export type ConsoleNavGroup = NavGroup;
export type ConsoleMenuLink = MenuLink;

export function ConsoleShell({
  roleLabel,
  homeHref,
  groups,
  tabs,
  account,
  menu = [],
  alerts,
  topActions,
  help,
  signOutTo,
  initialCollapsed = false,
  crumbLabels = {},
  crumbParents,
  rootCrumb,
  width = "wide",
  banner,
  children,
}: {
  /** Said under the logo ("Employer", "College"). Plain text, not a badge. */
  roleLabel?: string;
  homeHref: string;
  groups: NavGroup[];
  /** Phone bottom bar (up to 5). The rest sit behind "More". */
  tabs?: NavItem[];
  account: { name: string; email: string; subtitle?: string; photoUrl?: string | null };
  menu?: MenuLink[];
  /** The bell. Consoles with no inbox leave it out. */
  alerts?: { href: string; count: number; label?: string };
  /** Extra controls in the top bar (the shortlist bag). */
  topActions?: React.ReactNode;
  /** FAQ / contact / email. Present means the console has the assistant. */
  help?: { faqHref: string; contactHref: string; email: string };
  signOutTo: string;
  initialCollapsed?: boolean;
  crumbLabels?: Record<string, string>;
  crumbParents?: Record<string, { label: string; href: string }>;
  rootCrumb: { label: string; href: string };
  /** `reading` keeps prose screens to a comfortable measure; `wide` is for tables. */
  width?: "reading" | "wide";
  /** @deprecated accepted for old callers; ignored. */
  tone?: "dark" | "light";
  /** @deprecated accepted for old callers; ignored. */
  flush?: boolean;
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const enterRef = usePageEnter(pathname);
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  // Portalled dialogs and menus live under <body>: give <html> the same fonts and tokens.
  useEffect(() => {
    const root = document.documentElement;
    const classes = APP_FONT_CLASSES.split(" ");
    root.classList.add(...classes);
    root.dataset.app = "1";
    return () => {
      root.classList.remove(...classes);
      delete root.dataset.app;
    };
  }, []);

  const allItems = groups.flatMap((g) => g.items);
  const crumbs = breadcrumbsFor(pathname, { ...Object.fromEntries(allItems.map((i) => [i.href, i.label])), ...crumbLabels }, crumbParents ? "" : "Details", crumbParents).filter((c) => c.href !== rootCrumb.href);
  const showCrumbs = crumbs.length > 1;
  const waitingElsewhere = allItems.filter((i) => !tabs?.some((t) => t.href === i.href)).reduce((n, i) => n + (typeof i.badge === "number" ? i.badge : 0), 0);

  function toggleRail() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${RAIL_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  async function signOut() {
    const res = await csrfFetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      window.alert("Sign out didn't go through. Check your connection and try again.");
      return;
    }
    // Onboarding drafts hold personal details; the next person on this browser must not see them.
    try {
      for (const k of Object.keys(window.localStorage)) if (k.startsWith("findtern:") && k.includes("-onboarding")) window.localStorage.removeItem(k);
    } catch {
      // Storage blocked: nothing was saved there either.
    }
    router.replace(signOutTo);
    router.refresh();
  }

  const gridLine = cn("mx-auto w-full min-w-0 px-[var(--space-page)]", width === "reading" ? "max-w-[72rem]" : "max-w-[88rem]");
  // Intern and employer carry the launcher at every width; the others only from lg (their phones keep the floating one).
  const askEverywhere = /^\/(intern|employer|college)(\/|$)/.test(pathname);
  const helpLinks: NavItem[] = help
    ? [
        { href: help.faqHref, label: "Help & FAQ", icon: <CircleQuestionMark />, prefetch: false, newTab: true },
        { href: help.contactHref, label: "Contact us", icon: <MessageSquareText />, prefetch: false, newTab: true },
        { href: `mailto:${help.email}`, label: "Email us", icon: <Mail /> },
      ]
    : [];

  const paletteItems = groups.flatMap((g) => g.items.filter((i) => !i.locked && !i.href.startsWith("mailto:")).map((i) => ({ href: i.href, label: i.label, group: g.title ?? rootCrumb.label, icon: i.icon })));

  const rail = (compact: boolean, onNavigate?: () => void) => (
    <>
      <RailScroller>
        <RailGroups groups={groups} pathname={pathname} compact={compact} onNavigate={onNavigate} />
      </RailScroller>
      <div className="mt-3 shrink-0 space-y-0.5 pb-1">
        {helpLinks[0] ? <RailLink item={helpLinks[0]} active={false} compact={compact} onNavigate={onNavigate} /> : null}
        <FeedbackFab variant="link" deepLink={!onNavigate} className={cn(RAIL_FOOT, compact && "justify-center px-0 [&>span]:sr-only")} />
        <button type="button" onClick={signOut} title={compact ? "Sign out" : undefined} className={cn(RAIL_FOOT, compact && "justify-center px-0")}>
          <LogOut aria-hidden />
          <span className={cn(compact && "sr-only")}>Sign out</span>
        </button>
      </div>
    </>
  );

  const homeLabel = roleLabel ? `Findtern ${roleLabel} home` : "Findtern home";
  const brand = (compact: boolean) => (
    <div className={cn("flex min-h-12 items-center", compact ? "justify-center" : "px-2")}>
      <Link href={homeHref} aria-label={homeLabel} className="flex min-w-0 flex-col justify-center">
        {compact ? <LogoMark variant="green" alt="" className="size-8" /> : <Logo variant="green" priority className="h-8" />}
        {!compact && roleLabel ? <span className="mt-1 text-xs font-medium text-ink-600">{roleLabel}</span> : null}
      </Link>
    </div>
  );

  return (
    <>
      <div
        data-app="1"
        data-tone="light"
        className={cn(
          APP_FONT_CLASSES,
          "min-h-[100dvh] overflow-x-clip lg:flex",
          collapsed ? "lg:[--console-rail:4.5rem]" : "lg:[--console-rail:15rem]",
        )}
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
            className="absolute -right-3 top-[3.75rem] z-10 grid size-6 place-items-center rounded-full border border-ink-300 bg-paper text-ink-600 transition-colors hover:text-ink-900"
          >
            {collapsed ? <ChevronsRight className="size-3.5" aria-hidden /> : <ChevronsLeft className="size-3.5" aria-hidden />}
          </button>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="ledger-head sticky top-0 z-30 bg-canvas">
            <div className={cn("flex h-14 items-center gap-1.5", gridLine)}>
              <Sheet open={drawer} onOpenChange={setDrawer}>
                <SheetTrigger asChild>
                  <button type="button" aria-label="Open navigation" className="-ml-2 grid size-11 place-items-center rounded-md text-ink-700 hover:bg-ink-200/60 lg:hidden">
                    <Menu className="size-5" aria-hidden />
                  </button>
                </SheetTrigger>
                <SheetContent side="left" showCloseButton={false} aria-modal="true" className={cn(APP_FONT_CLASSES, "flex w-[19rem] flex-col border-r-0 bg-canvas p-4 text-ink-900")}>
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <div className="flex items-center justify-between gap-2">
                    {brand(false)}
                    <button type="button" onClick={() => setDrawer(false)} aria-label="Close navigation" className="grid size-11 place-items-center rounded-md text-ink-600 hover:bg-ink-200/60 hover:text-ink-900">
                      <X className="size-5" aria-hidden />
                    </button>
                  </div>
                  {rail(false, () => setDrawer(false))}
                </SheetContent>
              </Sheet>
              <Link href={homeHref} aria-label={homeLabel} className="flex min-h-11 items-center lg:hidden">
                <LogoMark variant="green" alt="" className="size-8" />
              </Link>

              <div className="min-w-0 flex-1 md:flex-none md:basis-[22rem]">
                <ShellPalette items={paletteItems} withAssistant={Boolean(help)} />
              </div>

              {showCrumbs ? (
                <nav aria-label="Breadcrumb" className="ml-3 hidden min-w-0 flex-1 items-center gap-1.5 text-sm lg:flex">
                  <Link href={rootCrumb.href} className="shrink-0 font-medium text-ink-600 hover:text-ink-900">
                    {rootCrumb.label}
                  </Link>
                  {crumbs.map((crumb, index) => (
                    <span key={crumb.href} className="flex min-w-0 items-center gap-1.5">
                      <span aria-hidden className="text-ink-500">/</span>
                      {index === crumbs.length - 1 ? (
                        <span aria-current="page" className="truncate font-medium text-ink-900">{crumb.label}</span>
                      ) : crumb.link ? (
                        <Link href={crumb.href} className="truncate font-medium text-ink-600 hover:text-ink-900">{crumb.label}</Link>
                      ) : (
                        <span className="truncate text-ink-600">{crumb.label}</span>
                      )}
                    </span>
                  ))}
                </nav>
              ) : (
                <Folio className="ml-3 hidden min-w-0 flex-1 truncate text-sm text-ink-600 xl:block" />
              )}

              <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
                {help ? <AskLauncher className={askEverywhere ? undefined : "max-lg:hidden"} /> : null}
                {topActions}
                {alerts ? (
                  <Link
                    href={alerts.href}
                    aria-label={alerts.count > 0 ? `${alerts.label ?? "Notifications"}, ${alerts.count} unread` : alerts.label ?? "Notifications"}
                    title={alerts.label ?? "Notifications"}
                    className="relative grid size-11 shrink-0 place-items-center rounded-md text-ink-600 transition-colors hover:bg-ink-200/60 hover:text-ink-900"
                  >
                    <Bell className="size-5" aria-hidden />
                    {alerts.count > 0 ? (
                      <span className="nums absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 text-xs font-semibold leading-none text-white ring-2 ring-canvas">
                        {alerts.count > 99 ? "99+" : alerts.count}
                      </span>
                    ) : null}
                  </Link>
                ) : null}
                <UserMenu account={account} menu={[...menu, ...helpLinks.slice(1)]} onSignOut={signOut} />
              </div>
            </div>
          </header>

          <main id="main" tabIndex={-1} className={cn(gridLine, "flex-1 pt-6 outline-none lg:pt-8", tabs ? "pb-28 lg:pb-20" : "pb-20")}>
            <div ref={enterRef}>
              {children}
            </div>
          </main>

          {tabs ? <TabBar tabs={tabs} pathname={pathname} onMore={() => setDrawer(true)} moreBadge={waitingElsewhere} /> : null}
        </div>
        {banner}
      </div>
    </>
  );
}

export { activeHrefOf };
