"use client";

/**
 * The admin console's own frame (owner decisions: dark ops desk 3 Nov 2026, then the framed light
 * canvas from the reference board with a light/dark toggle, 4 Nov 2026). It replaces
 * `ConsoleShell` for `/admin/**`; intern, employer and college keep the shared shell untouched.
 *
 * - One rounded frame on a grey canvas (`--admin-canvas`, `--admin-frame`, globals.css). The rail
 *   and the top bar sit on the frame with no rules; content sits on panels one tone step off it.
 *   Below `lg` the canvas inset and the frame radius drop to nothing.
 * - The active rail item is marked by a 3px brand bar on the frame's edge plus brand text; the bar
 *   slides between items (the layoutId below).
 * - The theme (light default) lives in the `ft_admin_theme` cookie the server layout reads, so the
 *   first paint is right. The root carries `data-admin-theme` and, when dark, `dark`, which flips
 *   every tokenised class beneath it. Radix dialogs, sheets and menus portal to <body>, outside
 *   this element, so the same attribute and class are put on <html> while the shell is mounted.
 * - The rail's collapsed state lives in a cookie too (`RAIL_COOKIE` from `@/lib/rail`: this file is
 *   "use client", and a server layout importing a constant from it would receive a client reference).
 * - The rail is the live work queue: items carry a count (`badge`), and a numeric one ticks to its
 *   new value through `Count` when the server layout re-renders. A count that could not be read is
 *   simply not passed, never 0.
 * - Reduced motion: `MotionConfig` honours the OS setting for every JS animation in the console;
 *   the CSS switch in globals.css covers the rest.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { ChevronDown, ChevronsLeft, ChevronsRight, LogOut, Menu, MessageSquare, Moon, Sun, X } from "lucide-react";

import { AdminAvatar } from "@/components/admin/avatar";
import { ADMIN_DUR, ADMIN_EASE, Count, seconds } from "@/components/admin/motion";
import { FeedbackFab } from "@/components/app/feedback-fab";
import { Logo, LogoMark } from "@/components/brand/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/** The shared admin timing, so the highlight and the sheets agree. */
const SLIDE = { duration: seconds(ADMIN_DUR.base), ease: ADMIN_EASE };

/** A queue count reads "99+" past 99 so the pill never grows wide. */
const formatBadge = (n: number) => (n > 99 ? "99+" : String(Math.round(n)));

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
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [theme, setTheme] = useState<AdminTheme>(initialTheme);
  const [signOutError, setSignOutError] = useState(false);

  // Portalled surfaces (dialogs, sheets, menus, the command palette) render under <body>: they
  // get the theme and the admin token block through <html>. Re-run when the toggle flips.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.dataset.console = "admin";
    root.dataset.adminTheme = theme;
    root.style.colorScheme = theme;
    return () => {
      root.classList.remove("dark");
      delete root.dataset.console;
      delete root.dataset.adminTheme;
      root.style.colorScheme = "";
    };
  }, [theme]);

  const allItems = groups.flatMap((g) => g.items);
  // The longest matching href wins, so /admin/interns/terms doesn't also light up /admin/interns.
  const activeHref = allItems
    .flatMap((i) => [i.href, ...(i.also ?? [])].map((p) => ({ path: p.split("#")[0], href: i.href.split("#")[0] })))
    .filter(({ path }) => pathname === path || pathname.startsWith(`${path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]?.href;
  // The root crumb already names the home page; don't repeat it. Detail pages read
  // "Offers", not "Offers / Details": the title names the record.
  const crumbs = breadcrumbsFor(
    pathname,
    { ...Object.fromEntries(allItems.map((i) => [i.href, i.label])), ...crumbLabels },
    "",
    {},
  ).filter((c) => c.href !== rootCrumb.href);
  // A top-level page's H1 already says where you are, so the trail only appears on nested routes
  // (a record, a legal text): /admin/companies has none, /admin/companies/<id> has "Workspace / Companies".
  const nested = pathname.split("/").filter(Boolean).length > 2;
  // Anything waiting in the rail, for the phone's menu button (the rail is behind it below lg).
  const waiting = allItems.reduce((n, i) => n + (typeof i.badge === "number" ? i.badge : 0), 0);

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

  const logoVariant = theme === "dark" ? "white" : "green";
  const messagesHref = allItems.find((i) => i.href === "/admin/messages")?.href;

  const rail = (compact: boolean, instance: string, onNavigate?: () => void) => (
    <LayoutGroup id={instance}>
      <RailScroller>
        {groups.map((group, i) => (
          <div key={group.title ?? i}>
            {group.title ? (
              compact ? (
                <div aria-hidden className="mx-auto mb-2 h-px w-6 bg-ink-300" />
              ) : (
                <p className="mb-2 px-4 text-xs font-medium uppercase tracking-wide text-text-subtle">{group.title}</p>
              )
            ) : null}
            <ul className="flex flex-col gap-1">
              {group.items.map((item) => (
                <li key={item.href}>
                  <RailLink item={item} active={activeHref === item.href.split("#")[0]} compact={compact} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </RailScroller>

      <div className="mt-3 shrink-0 space-y-1 border-t border-ink-300/60 pt-3">
        <FeedbackFab
          variant="link"
          deepLink={!onNavigate}
          className={cn("w-full gap-3.5 px-4 text-ink-600 hover:bg-[var(--admin-panel)] hover:text-ink-900 [&>svg]:size-5 [@media(pointer:fine)]:min-h-10", compact && "justify-center px-0 [&>span]:sr-only")}
        />
        <button
          type="button"
          onClick={signOut}
          title={compact ? "Sign out" : undefined}
          className={cn(
            "apple-spring flex min-h-11 w-full items-center gap-3.5 rounded-full px-4 text-sm text-ink-600 hover:bg-[var(--admin-panel)] hover:text-ink-900 [@media(pointer:fine)]:min-h-10",
            compact && "justify-center px-0",
          )}
        >
          <LogOut className="size-5 shrink-0" aria-hidden />
          <span className={cn(compact && "sr-only")}>Sign out</span>
        </button>
        {signOutError ? (
          <p role="alert" className="px-4 text-xs text-danger">
            Sign out didn&apos;t go through. Check your connection and try again.
          </p>
        ) : null}
      </div>
    </LayoutGroup>
  );

  const circle =
    "apple-spring relative grid size-11 shrink-0 place-items-center rounded-full border border-[var(--admin-panel-edge)] bg-[var(--admin-panel)] text-ink-700 hover:text-ink-900";

  return (
    <MotionConfig reducedMotion="user">
      <div
        data-console="admin"
        data-admin-theme={theme}
        className={cn("apple-admin min-h-[100dvh] bg-[var(--admin-canvas)] text-foreground lg:p-3", theme === "dark" && "dark")}
        style={{ colorScheme: theme }}
      >
        <div className="relative min-h-[100dvh] overflow-x-clip bg-[var(--admin-frame)] lg:flex lg:min-h-[calc(100dvh-1.5rem)] lg:overflow-clip lg:rounded-[var(--radius-admin-frame)]">
          {/* ── Desktop rail ───────────────────────────────────────────── */}
          <aside
            aria-label="Sidebar"
            className={cn(
              "sticky top-3 hidden h-[calc(100dvh-1.5rem)] shrink-0 flex-col px-5 py-5 transition-[width] duration-[var(--duration-admin-slow)] ease-[var(--ease-out-soft)] motion-reduce:transition-none lg:flex",
              collapsed ? "w-[5.75rem]" : "w-72",
            )}
          >
            <div className={cn("flex min-h-10 items-center", collapsed ? "justify-center" : "gap-2 px-2")}>
              <Link href={homeHref} aria-label="Findtern home" className="flex min-w-0 items-center">
                {collapsed ? <LogoMark variant={logoVariant} alt="" className="size-8" /> : <Logo variant={logoVariant} priority className="h-8" />}
              </Link>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">{rail(collapsed, "desk")}</div>
            <button
              type="button"
              onClick={toggleRail}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              className="apple-spring absolute -right-3.5 top-[4.25rem] z-10 grid size-7 place-items-center rounded-full border border-ink-300 bg-[var(--admin-panel)] text-ink-600 hover:text-ink-900"
            >
              {collapsed ? <ChevronsRight className="size-4" aria-hidden /> : <ChevronsLeft className="size-4" aria-hidden />}
            </button>
          </aside>

          {/* ── Content column ─────────────────────────────────────────── */}
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 bg-[var(--admin-frame)]">
              <div className="flex h-[4.5rem] items-center gap-2 px-[clamp(1rem,3vw,2rem)] sm:gap-3">
                <Sheet open={drawer} onOpenChange={setDrawer}>
                  <SheetTrigger asChild>
                    <button
                      type="button"
                      aria-label={waiting > 0 ? `Open navigation, ${waiting} waiting` : "Open navigation"}
                      className={cn(circle, "-ml-1 lg:hidden")}
                    >
                      <Menu className="size-5" aria-hidden />
                      {waiting > 0 ? <span aria-hidden className="absolute right-2 top-2 size-2 rounded-full bg-accent-400 ring-2 ring-[var(--admin-panel)]" /> : null}
                    </button>
                  </SheetTrigger>
                  <SheetContent side="left" showCloseButton={false} aria-modal="true" className="flex w-[19rem] flex-col border-r border-ink-200 bg-[var(--admin-frame)] p-4 text-foreground">
                    <SheetTitle className="sr-only">Navigation</SheetTitle>
                    <div className="flex min-h-12 items-center justify-between gap-2 px-2">
                      <Logo variant={logoVariant} className="h-9" />
                      <button type="button" onClick={() => setDrawer(false)} aria-label="Close navigation" className="apple-spring grid size-11 place-items-center rounded-full text-ink-600 hover:bg-[var(--admin-panel)] hover:text-ink-900">
                        <X className="size-5" aria-hidden />
                      </button>
                    </div>
                    {rail(false, "drawer", () => setDrawer(false))}
                  </SheetContent>
                </Sheet>

                <div className="min-w-0 flex-1">{topActions}</div>

                <div className="flex shrink-0 items-center gap-2">
                  {messagesHref ? (
                    <Link href={messagesHref} className={circle} aria-label={unreadMessages > 0 ? `Messages, ${unreadMessages} unread` : "Messages"}>
                      <MessageSquare className="size-[1.15rem]" aria-hidden />
                      {unreadMessages > 0 ? <span aria-hidden className="absolute right-2.5 top-2.5 size-2 rounded-full bg-accent-400 ring-2 ring-[var(--admin-panel)]" /> : null}
                    </Link>
                  ) : null}
                  <button type="button" onClick={toggleTheme} aria-pressed={theme === "dark"} aria-label="Dark mode" className={circle}>
                    {theme === "dark" ? <Moon className="size-[1.15rem]" aria-hidden /> : <Sun className="size-[1.15rem]" aria-hidden />}
                  </button>
                  <AccountMenu account={account} menu={menu} onSignOut={signOut} />
                </div>
              </div>
            </header>

            <main
              id="main"
              tabIndex={-1}
              className="mx-auto w-full min-w-0 max-w-[90rem] flex-1 px-[clamp(1rem,3vw,2rem)] pb-16 pt-2 outline-none"
            >
              {/* Nested routes only: the way back up. A list page's H1 already says where you are. */}
              {nested ? (
                <nav aria-label="Breadcrumb" className="mb-2 flex min-w-0 items-center gap-2 text-sm">
                  <Link href={rootCrumb.href} className="apple-spring inline-flex min-h-9 shrink-0 items-center font-medium text-ink-600 hover:text-ink-900">
                    {rootCrumb.label}
                  </Link>
                  {crumbs.map((crumb) => {
                    // The page itself, not just the last label: a record's parent list stays a link.
                    const here = crumb.href === pathname;
                    return (
                      <span key={crumb.href} className="flex min-w-0 items-center gap-2">
                        <span aria-hidden className="text-ink-400">/</span>
                        {here ? (
                          <span aria-current="page" className="truncate font-semibold text-ink-900">{crumb.label}</span>
                        ) : crumb.link ? (
                          <Link href={crumb.href} className="apple-spring inline-flex min-h-9 items-center truncate font-medium text-ink-600 hover:text-ink-900">{crumb.label}</Link>
                        ) : (
                          <span className="truncate font-medium text-ink-600">{crumb.label}</span>
                        )}
                      </span>
                    );
                  })}
                </nav>
              ) : null}
              {children}
            </main>
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}

/**
 * The rail's scroller (admin has 20 links; a laptop shows about 16). The links
 * keep their size and the list scrolls (QA-144): a thin scrollbar stays
 * visible, the bottom fades only while there is more below, and the current
 * page is scrolled into view so it is never hidden under the fold.
 */
function RailScroller({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [more, setMore] = useState(false);
  const [above, setAbove] = useState(false);

  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const update = () => {
      setMore(nav.scrollTop + nav.clientHeight < nav.scrollHeight - 1);
      setAbove(nav.scrollTop > 1);
    };
    const current = nav.querySelector('[aria-current="page"]')?.getBoundingClientRect();
    const box = nav.getBoundingClientRect();
    if (current && current.bottom > box.bottom - 48) {
      nav.scrollTop += current.top - box.top - (box.height - current.height) / 2;
    }
    update();
    nav.addEventListener("scroll", update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(nav);
    return () => {
      nav.removeEventListener("scroll", update);
      resize.disconnect();
    };
  }, []);

  return (
    <nav
      ref={ref}
      aria-label="Main"
      className={cn(
        "-mx-2 mt-3 min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden overscroll-contain px-2 py-1 [scrollbar-color:var(--color-ink-300)_transparent] [scrollbar-width:thin]",
        // Fade only the edge that has more behind it; the scrollbar stays visible.
        more && !above && "[mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)]",
        more && above && "[mask-image:linear-gradient(to_bottom,transparent,black_1rem,black_calc(100%-2rem),transparent)]",
        !more && above && "[mask-image:linear-gradient(to_bottom,transparent,black_1rem)]",
      )}
    >
      {children}
    </nav>
  );
}

function RailLink({ item, active, compact, onNavigate }: { item: AdminNavItem; active: boolean; compact: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={compact ? item.label : undefined}
      className={cn(
        // 44px on touch; 40px with a mouse. A short window scrolls the rail rather than squeezing the links (QA-144),
        // with a gap between rows and wider spacing between groups.
        "apple-spring group relative flex min-h-11 items-center gap-3.5 rounded-full px-4 text-sm [@media(pointer:fine)]:min-h-10",
        active ? "font-semibold text-brand-700" : "text-ink-600 hover:text-ink-900",
        compact && "justify-center px-0",
      )}
    >
      {active ? (
        // The current page is a white pill that slides between items (transform only).
        <motion.span layoutId="admin-nav-active" transition={SLIDE} aria-hidden className="absolute inset-0 rounded-full bg-[var(--admin-panel)] shadow-[var(--admin-shadow)] ring-1 ring-[color:var(--admin-rule)]" />
      ) : (
        <span aria-hidden className="absolute inset-0 rounded-full bg-[var(--admin-panel)] opacity-0 transition-opacity duration-[var(--duration-admin-fast)] group-hover:opacity-70" />
      )}
      <span className={cn("relative shrink-0 [&_svg]:size-5", active ? "text-brand-700" : "text-ink-500 group-hover:text-ink-900")}>
        {item.icon}
        {compact && (item.attention || item.badge) ? (
          <span aria-hidden className="absolute -right-1 -top-1 size-2 rounded-full bg-accent-400 ring-2 ring-[var(--admin-frame)]" />
        ) : null}
      </span>
      <span className={cn("relative min-w-0 flex-1 truncate", compact && "sr-only")}>{item.label}</span>
      {compact && item.badge ? (
        <span className="sr-only">
          {typeof item.badge === "number" ? formatBadge(item.badge) : item.badge}
          {item.badgeNote ? ` ${item.badgeNote}` : ""}
        </span>
      ) : null}
      {!compact && item.badge ? (
        <span className="nums relative rounded-full bg-[var(--admin-deep)] px-2 py-0.5 text-2xs font-semibold text-[var(--admin-deep-ink)]">
          {typeof item.badge === "number" ? <Count value={item.badge} format={formatBadge} /> : item.badge}
          {item.badgeNote ? <span className="sr-only"> {item.badgeNote}</span> : null}
        </span>
      ) : !compact && item.attention ? (
        <span className="relative size-1.5 shrink-0 rounded-full bg-accent-400">
          <span className="sr-only">Needs you</span>
        </span>
      ) : null}
    </Link>
  );
}

function AccountMenu({
  account,
  menu,
  onSignOut,
}: {
  account: { name: string; email: string; subtitle?: string; photoUrl?: string | null };
  menu: AdminMenuLink[];
  onSignOut: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Named by its text, not an aria-label: the label never matched the initials a phone shows. */}
        <button type="button" className="apple-spring flex min-h-11 items-center gap-2.5 rounded-full text-left text-sm hover:bg-[var(--admin-panel)] md:pr-3">
          <AdminAvatar name={account.name} id={account.email} photoUrl={account.photoUrl} size="md" />
          <span className="hidden min-w-0 md:block">
            <span className="block max-w-[11rem] truncate font-semibold leading-tight text-ink-900">{account.name}</span>
            <span className="block max-w-[11rem] truncate text-xs leading-tight text-text-subtle">{account.email}</span>
          </span>
          <span className="sr-only">{account.name}, account menu</span>
          <ChevronDown className="hidden size-4 text-text-subtle md:block" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-2">
        <DropdownMenuLabel className="px-2 py-2 font-normal">
          <p className="truncate text-sm font-semibold text-ink-900">{account.name}</p>
          {account.subtitle ? <p className="truncate text-xs text-ink-600">{account.subtitle}</p> : null}
          <p className="truncate text-xs text-text-subtle">{account.email}</p>
        </DropdownMenuLabel>
        {menu.length ? <DropdownMenuSeparator /> : null}
        {menu.map((m) => (
          <DropdownMenuItem key={m.href} asChild>
            <Link href={m.href} className="flex min-h-10 cursor-pointer items-center gap-3 [&_svg]:size-4 [&_svg]:text-ink-500">
              {m.icon}
              {m.label}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut} className="flex min-h-10 cursor-pointer items-center gap-3 text-danger focus:bg-danger-soft focus:text-danger">
          <LogOut className="size-4" aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
