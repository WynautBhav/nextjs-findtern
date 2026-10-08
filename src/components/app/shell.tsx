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
} from "lucide-react";

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import type { Stage } from "@/lib/journey";

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

/** Everything that is not stage shaped. Reached from the profile sheet. */
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
  children,
}: {
  stage: Stage;
  attentionHrefs: string[];
  name: string;
  email: string;
  photoUrl?: string | null;
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
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors duration-[var(--dur-instant)]",
                active
                  ? "bg-white/12 font-semibold text-white"
                  : "text-on-dark-subtle hover:bg-white/6 hover:text-white",
              )}
            >
              <span className={cn("shrink-0", active ? "text-accent-300" : "text-on-dark-subtle")}>
                {item.icon}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.attention ? (
                <span className="size-1.5 shrink-0 rounded-full bg-accent-400" aria-label="Needs you" />
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="min-h-[100dvh] bg-surface lg:flex">
      {/* ── Desktop rail ────────────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col bg-brand-950 px-4 py-6 lg:flex">
        <Link href="/intern/dashboard" className="flex items-center gap-2.5 px-2">
          <span className="grid size-8 place-items-center rounded-full bg-white/10">
            <BadgeCheck className="size-4 text-accent-300" aria-hidden />
          </span>
          <span className="text-base font-semibold tracking-tight text-white">Findtern</span>
        </Link>

        <nav className="mt-8 flex-1">
          {navList(nav)}
          <p className="mb-2 mt-7 px-3 text-2xs font-semibold uppercase tracking-[0.14em] text-on-dark-subtle/55">
            More
          </p>
          {navList(SECONDARY_NAV.filter((i) => !nav.some((n) => n.href === i.href)))}
        </nav>

        <div className="mt-4 shrink-0 border-t border-white/10 pt-3">
          <Link
            href="/intern/profile"
            className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-[var(--dur-instant)] hover:bg-white/6"
          >
            <Avatar name={name} initials={initials} photoUrl={photoUrl} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">{name}</span>
              <span className="block truncate text-xs text-on-dark-subtle">{email}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="mt-0.5 flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm text-on-dark-subtle transition-colors duration-[var(--dur-instant)] hover:bg-white/6 hover:text-white"
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
                className="-ml-1 grid size-11 place-items-center rounded-xl text-ink-700 transition-colors duration-[var(--dur-instant)] hover:bg-ink-100"
              >
                <svg viewBox="0 0 20 20" className="size-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M3 6h14M3 10h14M3 14h14" />
                </svg>
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[19rem] border-r-0 bg-brand-950 p-4 text-white">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex items-center gap-2.5 px-2 py-2">
                <span className="grid size-8 place-items-center rounded-full bg-white/10">
                  <BadgeCheck className="size-4 text-accent-300" aria-hidden />
                </span>
                <span className="text-base font-semibold tracking-tight text-white">Findtern</span>
              </div>
              <nav className="mt-6 max-h-[calc(100dvh-14rem)] overflow-y-auto pb-4">
                {navList(nav)}
                <p className="mb-2 mt-7 px-3 text-2xs font-semibold uppercase tracking-[0.14em] text-on-dark-subtle/70">
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
          <Link href="/intern/profile" aria-label="Your profile" className="grid size-11 shrink-0 place-items-center">
            <Avatar name={name} initials={initials} photoUrl={photoUrl} />
          </Link>
        </header>

        <main className="min-w-0 flex-1 pb-28 lg:pb-16">
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
                      "relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.6875rem] font-medium transition-colors duration-[var(--dur-instant)]",
                      active ? "text-brand-700" : "text-ink-500 hover:text-ink-800",
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
