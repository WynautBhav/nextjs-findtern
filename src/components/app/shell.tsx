"use client";

/**
 * The intern shell.
 *
 * Two decisions worth explaining, because both replace something that was
 * there before.
 *
 * **Navigation follows the stage.** The old shell listed ten destinations in a
 * flat array behind a hamburger, in the same order, whether you were looking
 * for work or already doing it. Someone whose first offer is sitting unread
 * does not need Earnings, Timesheets or Documents in front of them, and
 * someone three weeks into a role does not need Opportunities. The stage is
 * derived from the rows, not stored, so it can never disagree with the data.
 *
 * **Mobile gets a bottom bar, not a drawer.** Ten items in a hamburger is a
 * list you have to read before you can act. Five items can be scanned. A thumb
 * reaches the bottom of a phone, not the top left corner of it.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import {
  BadgeCheck,
  Bell,
  BriefcaseBusiness,
  CalendarCheck2,
  CircleUserRound,
  Compass,
  House,
  LayoutList,
  LogOut,
  ReceiptIndianRupee,
  ScrollText,
  Settings2,
  X,
} from "lucide-react";
import { FeedbackFab } from "@/components/app/feedback-fab";

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import type { Stage } from "@/lib/journey";
import { Logo } from "@/components/brand/logo";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Count shown as a quiet dot rather than a number. A badge of "3" on an
   *  unread count becomes a target. A dot is a fact, not a score. */
  attention?: boolean;
};

export const STAGE_NAV: Record<Stage, NavItem[]> = {
  seeking: [
    { href: "/intern/dashboard", label: "Home", icon: <House className="size-5" /> },
    { href: "/intern/opportunities", label: "Open roles", icon: <Compass className="size-5" /> },
    { href: "/intern/proposals", label: "Offers", icon: <BriefcaseBusiness className="size-5" />, attention: true },
    { href: "/intern/interviews", label: "Interviews", icon: <CalendarCheck2 className="size-5" /> },
    { href: "/intern/record", label: "Record", icon: <ScrollText className="size-5" /> },
  ],
  working: [
    { href: "/intern/dashboard", label: "Home", icon: <House className="size-5" /> },
    { href: "/intern/timesheets", label: "Timesheets", icon: <LayoutList className="size-5" />, attention: true },
    { href: "/intern/earnings", label: "Stipend", icon: <ReceiptIndianRupee className="size-5" /> },
    { href: "/intern/interviews", label: "Interviews", icon: <CalendarCheck2 className="size-5" /> },
    { href: "/intern/record", label: "Record", icon: <ScrollText className="size-5" /> },
  ],
};

/**
 * Everything that is not stage shaped. Reached from the profile sheet.
 * Bank details live inside Settings (the same form, under "Bank account"),
 * so they no longer get a second door in the sidebar; /intern/bank-details
 * redirects there for old links.
 */
export const SECONDARY_NAV: NavItem[] = [
  { href: "/intern/opportunities", label: "Open roles", icon: <Compass className="size-4" /> },
  { href: "/intern/proposals", label: "Offers", icon: <BriefcaseBusiness className="size-4" /> },
  { href: "/intern/interviews", label: "Interviews", icon: <CalendarCheck2 className="size-4" /> },
  { href: "/intern/timesheets", label: "Timesheets", icon: <LayoutList className="size-4" /> },
  { href: "/intern/earnings", label: "Stipend", icon: <ReceiptIndianRupee className="size-4" /> },
  { href: "/intern/documents", label: "Documents", icon: <BadgeCheck className="size-4" /> },
  { href: "/intern/profile", label: "Your profile", icon: <CircleUserRound className="size-4" /> },
  { href: "/intern/notifications", label: "Notifications", icon: <Bell className="size-4" /> },
  { href: "/intern/settings", label: "Settings", icon: <Settings2 className="size-4" /> },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  stage,
  attentionHrefs,
  name,
  email,
  photoUrl,
  unreadAlerts = 0,
  children,
}: {
  stage: Stage;
  attentionHrefs: string[];
  name: string;
  email: string;
  photoUrl?: string | null;
  unreadAlerts?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const nav = STAGE_NAV[stage].map((item) => ({
    ...item,
    attention: item.attention && attentionHrefs.some((h) => h.startsWith(item.href)),
  }));

  async function signOut() {
    await csrfFetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  const navList = (items: NavItem[]) => (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const isNotif = item.href === "/intern/notifications";
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "apple-spring apple-pressable flex min-h-11 items-center gap-3 rounded-[10px] px-3 py-2 text-[14px] tracking-[-0.01em]",
                active
                  ? "bg-white/12 font-semibold text-white"
                  : "text-on-dark-subtle hover:bg-white/6 hover:text-white",
              )}
            >
              <span className={cn("shrink-0", active ? "text-accent-300" : "text-on-dark-subtle")}>
                {item.icon}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {isNotif && unreadAlerts > 0 ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500/20 px-1.5 text-2xs font-bold text-accent-300">
                  {unreadAlerts > 99 ? "99+" : unreadAlerts}
                </span>
              ) : item.attention ? (
                <span className="size-1.5 shrink-0 rounded-full bg-accent-400" aria-label="Needs you" />
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="apple-admin min-h-[100dvh] overflow-x-clip bg-surface lg:flex">
      {/* ── Desktop rail ────────────────────────────────────────────── */}
      <aside aria-label="Sidebar" className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col bg-brand-950 px-4 py-6 lg:flex">
        <Link href="/intern/dashboard" className="flex items-center gap-2.5 px-2">
          <Logo variant="white" priority className="h-7" />
        </Link>

        <nav aria-label="Main" className="mt-8 min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
          {navList(nav)}
          <p className="mb-2 mt-7 px-3 text-2xs font-semibold uppercase tracking-[0.14em] text-on-dark-subtle">
            More
          </p>
          {navList(SECONDARY_NAV.filter((i) => !nav.some((n) => n.href === i.href)))}
        </nav>

        <div className="mt-4 shrink-0 border-t border-white/10 pt-3">
          <Link
            href="/intern/profile"
            className="apple-spring flex items-center gap-3 rounded-[10px] px-2 py-2 hover:bg-white/6"
          >
            <Avatar name={name} initials={initials} photoUrl={photoUrl} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">{name}</span>
              <span className="block truncate text-xs text-on-dark-subtle">{email}</span>
            </span>
          </Link>
          <FeedbackFab variant="link" className="mt-0.5" />
          <button
            type="button"
            onClick={signOut}
            className="apple-spring mt-0.5 flex min-h-11 w-full items-center gap-2.5 rounded-[10px] px-3 text-sm text-on-dark-subtle hover:bg-white/6 hover:text-white"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-100 bg-surface/85 px-4 py-3 backdrop-blur-md lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open navigation"
                className="apple-spring -ml-1 grid size-11 place-items-center rounded-[10px] text-ink-700 hover:bg-ink-100"
              >
                <svg viewBox="0 0 20 20" className="size-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M3 6h14M3 10h14M3 14h14" />
                </svg>
              </button>
            </SheetTrigger>
            <SheetContent side="left" showCloseButton={false} aria-modal="true" aria-label="Findtern Intern navigation" className="w-[19rem] border-r-0 bg-brand-950 p-4 text-white">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="apple-spring absolute top-4 right-4 grid size-11 place-items-center rounded-[10px] text-on-dark-subtle hover:bg-white/10 hover:text-white"
              >
                <X className="size-5" aria-hidden />
              </button>
              <div className="flex min-h-11 items-center px-2 py-2 pr-12">
                <Logo variant="white" className="h-6" />
              </div>
              <nav aria-label="Main (menu)" className="mt-6 max-h-[calc(100dvh-14rem)] overflow-y-auto overscroll-contain pb-4">
                {navList(nav)}
                <p className="mb-2 mt-7 px-3 text-2xs font-semibold uppercase tracking-[0.14em] text-on-dark-subtle">
                  Also here
                </p>
                {navList(SECONDARY_NAV.filter((i) => !nav.some((n) => n.href === i.href)))}
              </nav>
              <button
                type="button"
                onClick={signOut}
                className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-xl border border-white/12 px-3 text-sm text-on-dark-subtle"
              >
                <LogOut className="size-4" aria-hidden />
                Sign out
              </button>
            </SheetContent>
          </Sheet>
          <Link href="/intern/dashboard" className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-ink-900">
            Findtern
          </Link>
          <Link
            href="/intern/notifications"
            aria-label="Notifications"
            className="apple-spring relative grid size-11 shrink-0 place-items-center rounded-[10px] text-ink-600 hover:bg-ink-100"
          >
            <Bell className="size-5" />
            {unreadAlerts > 0 ? (
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-brand-950 ring-2 ring-white">
                {unreadAlerts > 99 ? "99+" : unreadAlerts}
              </span>
            ) : null}
          </Link>
          <Link href="/intern/profile" aria-label="Your profile" className="grid size-11 shrink-0 place-items-center">
            <Avatar name={name} initials={initials} photoUrl={photoUrl} />
          </Link>
        </header>

        <main id="main" tabIndex={-1} className="outline-none min-w-0 flex-1 pb-28 lg:pb-16">
          <div className="container-page pt-6 lg:pt-10">{children}</div>
        </main>

        {/* ── Mobile tab bar ───────────────────────────────────────── */}
        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
        >
          <ul className="grid grid-cols-5">
            {nav.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "apple-spring relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.6875rem] font-medium",
                      active ? "text-brand-700" : "text-ink-600 hover:text-ink-800",
                    )}
                  >
                    <span className="relative">
                      {item.icon}
                      {item.attention ? (
                        <span className="absolute -right-1.5 -top-0.5 size-2 rounded-full bg-accent-500 ring-2 ring-white" />
                      ) : null}
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
      </div>
    </div>
  );
}

/**
 * Avatar. Falls back to the candidate's own initials when no photo has been
 * uploaded yet, which is a fact about their account rather than a stand in for
 * a person. A missing photo must never render as a stranger's face.
 */
function Avatar({
  name,
  initials,
  photoUrl,
}: {
  name: string;
  initials: string;
  photoUrl?: string | null;
}) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        className="size-9 shrink-0 rounded-full object-cover ring-1 ring-white/15"
      />
    );
  }
  return (
    <span
      aria-hidden
      title={name}
      className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-400/20 text-xs font-semibold text-accent-300 ring-1 ring-white/10"
    >
      {initials || "?"}
    </span>
  );
}
