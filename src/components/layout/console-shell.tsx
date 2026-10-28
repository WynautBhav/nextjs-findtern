"use client";

/**
 * The one frame every signed-in page sits in: intern, employer and admin.
 *
 * Before this there were three shells (intern, employer, admin) that agreed
 * on almost nothing: three logos at three sizes, a text wordmark on the
 * employer's phone header, a light admin rail beside two dark ones, a desktop
 * top bar for two roles and not the third, three content paddings. The same
 * product read as three. This file is the only place the frame is decided.
 *
 * - The rail is the marketing hero's green, with the real logo, so signing in
 *   feels like walking further into the same site.
 * - It collapses to an icon rail (bug sheet 7, S2 r4). The choice lives in a
 *   cookie the server layout reads, so the first paint is already right.
 * - One breakpoint (lg) for every role: a tablet gets the same frame whether
 *   it belongs to a candidate or a company.
 */

import Link from "next/link";

import { RAIL_COOKIE } from "@/lib/rail";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import { Bell, ChevronDown, ChevronsLeft, ChevronsRight, CircleQuestionMark, LogOut, Mail, Menu, MessageCircle, MessageSquareText, X } from "lucide-react";

import { Logo, LogoMark } from "@/components/brand/logo";
import { FeedbackFab } from "@/components/app/feedback-fab";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { buttonClass } from "@/components/ui/button";
import { breadcrumbsFor } from "@/lib/breadcrumbs";
import { OPEN_CHAT_EVENT } from "@/lib/chat-events";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

export type ConsoleNavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** A count shown beside the label (unread, items waiting). */
  badge?: number | string;
  /** A quiet dot: this needs the user, without turning it into a score. */
  attention?: boolean;
  /** Other paths this item stands for (one "Legal texts" item for four pages). */
  also?: string[];
};

export type ConsoleNavGroup = { title?: string; items: ConsoleNavItem[] };

export type ConsoleMenuLink = { href: string; label: string; icon: React.ReactNode };

// The cookie name lives in `@/lib/rail`: this file is `"use client"`, and a
// server layout importing a constant from it would receive a client reference
// instead of the string (which is why the collapsed rail never persisted).

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
  /** Shown as a small chip beside the logo ("Employer", "Admin"). */
  roleLabel?: string;
  homeHref: string;
  groups: ConsoleNavGroup[];
  /** Phone bottom bar (up to 5). Without it, phones use the drawer only. */
  tabs?: ConsoleNavItem[];
  account: { name: string; email: string; subtitle?: string; photoUrl?: string | null };
  menu?: ConsoleMenuLink[];
  /** The bell. Consoles with no inbox (college) leave it out. */
  alerts?: { href: string; count: number; label?: string };
  /** Extra controls in the top bar (cart, command palette). */
  topActions?: React.ReactNode;
  /** FAQ / contact / email links under the nav. Staff consoles leave it out. */
  help?: { faqHref: string; contactHref: string; email: string };
  signOutTo: string;
  initialCollapsed?: boolean;
  crumbLabels?: Record<string, string>;
  /** Detail-page parent segments → the list they belong to; ids are then dropped. */
  crumbParents?: Record<string, { label: string; href: string }>;
  rootCrumb: { label: string; href: string };
  /** `reading` keeps prose screens to a comfortable measure; `wide` is for tables. */
  width?: "reading" | "wide";
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const allItems = groups.flatMap((g) => g.items);
  // The longest matching href wins, so /admin/interns/terms doesn't also
  // light up /admin/interns.
  const activeHref = allItems
    .flatMap((i) => [i.href, ...(i.also ?? [])].map((p) => ({ path: p.split("#")[0], href: i.href.split("#")[0] })))
    .filter(({ path }) => pathname === path || pathname.startsWith(`${path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]?.href;
  // The root crumb already names the home page; don't repeat it.
  const crumbs = breadcrumbsFor(
    pathname,
    { ...Object.fromEntries(allItems.map((i) => [i.href, i.label])), ...crumbLabels },
    crumbParents ? "" : "Details",
    crumbParents,
  ).filter(
    (c) => c.href !== rootCrumb.href,
  );

  function toggleRail() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${RAIL_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  async function signOut() {
    await csrfFetch("/api/auth/logout", { method: "POST" });
    router.replace(signOutTo);
    router.refresh();
  }

  const helpLinks: ConsoleNavItem[] = help
    ? [
        { href: help.faqHref, label: "FAQ", icon: <CircleQuestionMark className="size-5" aria-hidden /> },
        { href: help.contactHref, label: "Contact us", icon: <MessageSquareText className="size-5" aria-hidden /> },
        { href: `mailto:${help.email}`, label: "Email us", icon: <Mail className="size-5" aria-hidden /> },
      ]
    : [];

  const rail = (compact: boolean, onNavigate?: () => void) => (
    <>
      <nav aria-label="Main" className="mt-6 min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-color:transparent_transparent] [scrollbar-width:thin] hover:[scrollbar-color:var(--color-brand-700)_transparent]">
        {groups.map((group, i) => (
          <div key={group.title ?? i}>
            {group.title ? (
              compact ? (
                <div aria-hidden className="mx-auto mb-2 h-px w-6 bg-white/10" />
              ) : (
                <p className="mb-2 px-3 text-2xs font-semibold uppercase tracking-[0.14em] text-on-dark-subtle">{group.title}</p>
              )
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <RailLink item={item} active={activeHref === item.href.split("#")[0]} compact={compact} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
        {helpLinks.length ? <div>
          {compact ? (
            <div aria-hidden className="mx-auto mb-2 h-px w-6 bg-white/10" />
          ) : (
            <p className="mb-2 px-3 text-2xs font-semibold uppercase tracking-[0.14em] text-on-dark-subtle">Help</p>
          )}
          <ul className="flex flex-col gap-0.5">
            {helpLinks.map((item) => (
              <li key={item.href}>
                <RailLink item={item} active={false} compact={compact} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div> : null}
      </nav>

      <div className="mt-4 shrink-0 space-y-1 border-t border-white/10 pt-3">
        <FeedbackFab variant="link" deepLink={!onNavigate} className={cn("w-full", compact && "justify-center px-0 [&>span]:sr-only")} />
        <button
          type="button"
          onClick={signOut}
          title={compact ? "Sign out" : undefined}
          className={cn(
            "apple-spring flex min-h-11 w-full items-center gap-3 rounded-apple-sm px-3 text-sm text-on-dark-subtle hover:bg-white/8 hover:text-white",
            compact && "justify-center px-0",
          )}
        >
          <LogOut className="size-5 shrink-0" aria-hidden />
          <span className={cn(compact && "sr-only")}>Sign out</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="apple-admin min-h-[100dvh] overflow-x-clip bg-surface lg:flex">
      {/* ── Desktop rail ─────────────────────────────────────────────── */}
      <aside
        aria-label="Sidebar"
        className={cn(
          "relative sticky top-0 hidden h-[100dvh] shrink-0 flex-col bg-brand-950 px-3 py-5 transition-[width] duration-200 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none lg:flex",
          collapsed ? "w-[4.75rem]" : "w-64",
        )}
      >
        {/* The hero's wash, so the rail is the same green the site greets you with. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_45%_at_0%_0%,rgb(22_107_84/0.45)_0%,transparent_70%)]" />
        <div className={cn("relative flex min-h-12 items-center", collapsed ? "justify-center" : "justify-between gap-2 px-2")}>
          <Link href={homeHref} aria-label="Findtern home" className="flex min-w-0 items-center">
            {collapsed ? (
              <span className="grid size-11 place-items-center rounded-apple-md bg-white/[0.06] ring-1 ring-white/10">
                <LogoMark variant="white" alt="" className="size-7" />
              </span>
            ) : (
              <Logo variant="white" priority className="h-10" />
            )}
          </Link>
          {!collapsed && roleLabel ? <RoleChip label={roleLabel} /> : null}
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col">{rail(collapsed)}</div>
        <button
          type="button"
          onClick={toggleRail}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="apple-spring absolute -right-3.5 top-[4.25rem] z-10 grid size-7 place-items-center rounded-full border border-ink-200 bg-white text-ink-600 shadow-sm hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600"
        >
          {collapsed ? <ChevronsRight className="size-4" aria-hidden /> : <ChevronsLeft className="size-4" aria-hidden />}
        </button>
      </aside>

      {/* ── Content column ───────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-ink-200/70 bg-surface/85 backdrop-blur-md">
          <div className="flex h-16 items-center gap-2 px-[clamp(1rem,3vw,2rem)]">
            {/* Phone / tablet: drawer + logo */}
            <Sheet open={drawer} onOpenChange={setDrawer}>
              <SheetTrigger asChild>
                <button type="button" aria-label="Open navigation" className="apple-spring -ml-2 grid size-11 place-items-center rounded-apple-sm text-ink-700 hover:bg-ink-100 lg:hidden">
                  <Menu className="size-5" aria-hidden />
                </button>
              </SheetTrigger>
              <SheetContent side="left" showCloseButton={false} aria-modal="true" className="flex w-[19rem] flex-col border-r-0 bg-brand-950 p-4 text-white">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <div className="flex min-h-12 items-center justify-between gap-2 px-2">
                  <Logo variant="white" className="h-9" />
                  <button type="button" onClick={() => setDrawer(false)} aria-label="Close navigation" className="apple-spring grid size-11 place-items-center rounded-apple-sm text-on-dark-subtle hover:bg-white/10 hover:text-white">
                    <X className="size-5" aria-hidden />
                  </button>
                </div>
                {rail(false, () => setDrawer(false))}
              </SheetContent>
            </Sheet>
            <Link href={homeHref} aria-label="Findtern home" className="flex min-h-11 min-w-0 items-center lg:hidden">
              <Logo variant="green" priority className="h-8" />
            </Link>

            {/* Desktop: where you are */}
            <nav aria-label="Breadcrumb" className="hidden min-w-0 flex-1 items-center gap-1.5 text-sm lg:flex">
              <Link href={rootCrumb.href} className="apple-spring shrink-0 font-medium text-ink-600 hover:text-brand-700">
                {rootCrumb.label}
              </Link>
              {crumbs.map((crumb, index) => (
                <span key={crumb.href} className="flex min-w-0 items-center gap-1.5">
                  <span aria-hidden className="text-ink-300">/</span>
                  {index === crumbs.length - 1 ? (
                    <span aria-current="page" className="truncate font-semibold text-ink-900">{crumb.label}</span>
                  ) : crumb.link ? (
                    <Link href={crumb.href} className="apple-spring truncate font-medium text-ink-600 hover:text-brand-700">{crumb.label}</Link>
                  ) : (
                    <span className="truncate font-medium text-ink-600">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
              {/* Customer consoles (the ones with `help`) open the chat from
                  here on desktop rather than from a floating button that
                  covers tables and rails; phones keep the floating one. */}
              {help ? (
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event(OPEN_CHAT_EVENT))}
                  className={buttonClass({ variant: "outline", size: "sm", className: "mr-1 hidden lg:inline-flex" })}
                >
                  <MessageCircle className="size-4" aria-hidden />
                  Ask me
                </button>
              ) : null}
              {topActions}
              {alerts ? (
                <Link
                  href={alerts.href}
                  aria-label={alerts.count > 0 ? `${alerts.label ?? "Notifications"}, ${alerts.count} unread` : alerts.label ?? "Notifications"}
                  className="apple-spring relative grid size-11 place-items-center rounded-apple-sm text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                >
                  <Bell className="size-5" aria-hidden />
                  {alerts.count > 0 ? (
                    <span className="nums absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-2xs font-bold text-brand-950 ring-2 ring-surface">
                      {alerts.count > 99 ? "99+" : alerts.count}
                    </span>
                  ) : null}
                </Link>
              ) : null}
              <AccountMenu account={account} menu={menu} onSignOut={signOut} />
            </div>
          </div>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className={cn(
            "mx-auto w-full min-w-0 flex-1 px-[clamp(1rem,4vw,2.5rem)] pt-6 outline-none lg:pt-9",
            width === "reading" ? "max-w-[75rem]" : "max-w-[90rem]",
            tabs ? "pb-28 lg:pb-24" : "pb-24",
          )}
        >
          {children}
        </main>

        {tabs ? <TabBar tabs={tabs} pathname={pathname} /> : null}
      </div>
      {banner}
    </div>
  );
}

function RailLink({ item, active, compact, onNavigate }: { item: ConsoleNavItem; active: boolean; compact: boolean; onNavigate?: () => void }) {
  const external = item.href.startsWith("mailto:");
  const className = cn(
    // 44px on touch; 40px with a mouse, so a 900px-tall window shows the
    // whole employer nav without scrolling the rail.
    "apple-spring apple-pressable group relative flex min-h-11 items-center gap-3 rounded-apple-sm px-3 text-[0.9375rem] tracking-[-0.01em] [@media(pointer:fine)]:min-h-10",
    active ? "bg-white/[0.09] font-semibold text-white" : "text-on-dark-subtle hover:bg-white/[0.06] hover:text-white",
    compact && "justify-center px-0",
  );
  const body = (
    <>
      {active ? <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent-400" /> : null}
      <span className={cn("relative shrink-0 [&_svg]:size-5", active ? "text-accent-300" : "text-on-dark-subtle group-hover:text-white")}>
        {item.icon}
        {compact && (item.attention || item.badge) ? (
          <span aria-hidden className="absolute -right-1 -top-1 size-2 rounded-full bg-accent-400 ring-2 ring-brand-950" />
        ) : null}
      </span>
      <span className={cn("min-w-0 flex-1 truncate", compact && "sr-only")}>{item.label}</span>
      {!compact && item.badge ? (
        <span className="nums rounded-full bg-accent-500/20 px-2 py-0.5 text-2xs font-bold text-accent-300">{item.badge}</span>
      ) : !compact && item.attention ? (
        <span className="size-1.5 shrink-0 rounded-full bg-accent-400" aria-label="Needs you" />
      ) : null}
    </>
  );
  return external ? (
    <a href={item.href} title={compact ? item.label : item.href.slice(7)} className={className}>
      {body}
    </a>
  ) : (
    <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} title={compact ? item.label : undefined} className={className}>
      {body}
    </Link>
  );
}

function AccountMenu({
  account,
  menu,
  onSignOut,
}: {
  account: { name: string; email: string; subtitle?: string; photoUrl?: string | null };
  menu: ConsoleMenuLink[];
  onSignOut: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`${account.name}, account menu`} className="apple-spring flex min-h-11 items-center gap-2 rounded-apple-sm pl-1 pr-1 text-sm font-medium text-ink-800 hover:bg-ink-100 sm:pr-2">
          <Avatar name={account.name} photoUrl={account.photoUrl} />
          <span className="hidden max-w-[11rem] truncate md:block">{account.name}</span>
          <ChevronDown className="hidden size-4 text-ink-500 md:block" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-1.5">
        <DropdownMenuLabel className="px-2 py-2 font-normal">
          <p className="truncate text-sm font-semibold text-ink-900">{account.name}</p>
          {account.subtitle ? <p className="truncate text-xs text-ink-600">{account.subtitle}</p> : null}
          <p className="truncate text-xs text-text-subtle">{account.email}</p>
        </DropdownMenuLabel>
        {menu.length ? <DropdownMenuSeparator /> : null}
        {menu.map((m) => (
          <DropdownMenuItem key={m.href} asChild>
            <Link href={m.href} className="flex min-h-10 cursor-pointer items-center gap-2.5 [&_svg]:size-4 [&_svg]:text-ink-500">
              {m.icon}
              {m.label}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut} className="flex min-h-10 cursor-pointer items-center gap-2.5 text-danger focus:bg-danger-soft focus:text-danger">
          <LogOut className="size-4" aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TabBar({ tabs, pathname }: { tabs: ConsoleNavItem[]; pathname: string }) {
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "apple-spring relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.6875rem] font-medium [&_svg]:size-5",
                  active ? "text-brand-700" : "text-ink-600 hover:text-ink-800",
                )}
              >
                <span className="relative">
                  {item.icon}
                  {item.attention ? <span className="absolute -right-1.5 -top-0.5 size-2 rounded-full bg-accent-500 ring-2 ring-white" /> : null}
                </span>
                <span className="max-w-full truncate">{item.label}</span>
                {active ? (
                  <motion.span
                    layoutId="tab-indicator"
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-brand-700"
                    aria-hidden
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function RoleChip({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-full border border-accent-400/30 bg-accent-500/15 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-accent-300">
      {label}
    </span>
  );
}

/**
 * The person's own photo, or their initials. A missing photo never renders
 * as somebody else's face.
 */
function Avatar({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt="" className="size-9 shrink-0 rounded-full object-cover ring-1 ring-ink-200" />;
  }
  return (
    <span aria-hidden title={name} className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
      {initials || "?"}
    </span>
  );
}
