"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  Building2,
  ChevronDown,
  HelpCircle,
  KeyRound,
  LogOut,
  Menu,
  Receipt,
  ShoppingBag,
  X,
} from "lucide-react";
import { FeedbackFab } from "@/components/app/feedback-fab";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { breadcrumbsFor } from "@/lib/breadcrumbs";
import { csrfFetch } from "@/lib/client-fetch";
import { Logo } from "@/components/brand/logo";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number | string;
};

export type NavGroup = {
  title?: string;
  items: NavItem[];
};

export interface AppShellProps {
  brand: string;
  nav?: NavItem[];
  groups?: NavGroup[];
  companyName?: string;
  email?: string;
  unreadAlerts?: number;
  children: React.ReactNode;
}

/**
 * High-craft App Shell for Findtern Employer workspace.
 * Features a sticky 100dvh sidebar, desktop breadcrumbs, quick Cart & Alerts
 * shortcuts, account dropdown menu, and mobile drawer.
 */
export function AppShell({
  brand,
  nav,
  groups,
  companyName = "Employer Console",
  email,
  unreadAlerts = 0,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleSignOut() {
    await csrfFetch("/api/auth/logout", { method: "POST" });
    router.replace("/employer/login");
    router.refresh();
  }

  // Support both flat `nav` and categorized `groups`
  const resolvedGroups: NavGroup[] = groups ?? [
    {
      items: nav ?? [],
    },
  ];

  const crumbs = breadcrumbsFor(
    pathname,
    Object.fromEntries(resolvedGroups.flatMap((g) => g.items.map((i) => [i.href, i.label]))),
  );

  const navContent = (
    <div className="flex flex-col gap-6">
      {resolvedGroups.map((group, groupIdx) => (
        <div key={group.title ?? groupIdx} className="space-y-1.5">
          {group.title ? (
            <p className="px-3 text-2xs font-semibold uppercase tracking-wider text-on-dark-subtle/70">
              {group.title}
            </p>
          ) : null}
          <nav className="flex flex-col gap-1">
            {group.items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/employer/dashboard" && pathname.startsWith(item.href + "/"));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`apple-spring apple-pressable group flex min-h-11 items-center justify-between rounded-[10px] px-3 py-2 text-[14px] font-medium tracking-[-0.01em] ${
                    active
                      ? "bg-brand-700/80 text-white shadow-2xs font-semibold"
                      : "text-on-dark-subtle hover:bg-white/8 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`apple-spring ${
                        active ? "text-accent-400" : "text-on-dark-subtle group-hover:text-white"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>
                  {item.badge ? (
                    <span className="rounded-full bg-accent-500/20 px-2 py-0.5 text-2xs font-semibold text-accent-400">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </div>
  );

  return (
    <div className="apple-admin flex min-h-[100dvh] overflow-x-clip bg-ink-50">
      {/* Desktop sticky sidebar */}
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col bg-brand-950 px-4 py-6 lg:flex border-r border-white/5">
        <Link href="/employer/dashboard" className="px-3 flex items-center justify-between gap-2.5">
          <Logo variant="white" priority className="h-7" />
          <span className="text-2xs font-bold uppercase tracking-wider text-accent-400 bg-accent-500/15 border border-accent-400/30 px-2 py-0.5 rounded-full">
            {brand}
          </span>
        </Link>

        {/* Scrollable nav items */}
        <div className="mt-8 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin] [scrollbar-color:var(--color-brand-800)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-brand-800 [&::-webkit-scrollbar-track]:bg-transparent">
          {navContent}
        </div>

        {/* Footer profile & sign out */}
        <div className="mt-auto pt-4 border-t border-white/10">
          <div className="flex items-center justify-between px-2">
            <div className="min-w-0 pr-2">
              <p className="truncate text-xs font-semibold text-white">{companyName}</p>
              {email ? (
                <p className="truncate text-2xs text-on-dark-subtle/80">{email}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="apple-spring apple-pressable grid size-11 shrink-0 place-items-center rounded-[10px] text-on-dark-subtle hover:bg-white/10 hover:text-white"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content container */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-200/80 bg-white/95 px-4 py-3 backdrop-blur-md lg:hidden">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Open navigation menu"
                  className="apple-spring flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[10px] text-ink-700 hover:bg-ink-100"
                >
                  <Menu className="size-5" />
                </button>
              </SheetTrigger>
              <SheetContent
                side="left"
                showCloseButton={false}
                className="flex w-72 flex-col bg-brand-950 p-5 text-white border-r border-white/10"
              >
                <SheetHeader className="flex flex-row items-center justify-between">
                  <SheetTitle className="flex items-center gap-2.5 text-white">
                    <Logo variant="white" alt={`Findtern ${brand}`} className="h-6" />
                    <span className="rounded-full border border-accent-400/30 bg-accent-500/15 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-accent-400">
                      {brand}
                    </span>
                  </SheetTitle>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close navigation"
                    className="apple-spring grid size-11 shrink-0 place-items-center rounded-[10px] text-on-dark-subtle hover:bg-white/10 hover:text-white"
                  >
                    <X className="size-5" />
                  </button>
                </SheetHeader>
                <div className="mt-6 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                  {navContent}
                </div>
                <div className="pt-4 border-t border-white/10">
                  <FeedbackFab variant="link" />
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="apple-spring flex min-h-11 w-full items-center gap-2 rounded-[10px] px-3 py-2 text-[13px] font-medium text-on-dark-subtle hover:bg-white/10 hover:text-white"
                  >
                    <LogOut className="size-4" />
                    Sign out
                  </button>
                </div>
              </SheetContent>
            </Sheet>

            <Link href="/employer/dashboard" className="text-sm font-semibold tracking-tight text-ink-900">
              Findtern <span className="text-brand-700">{brand}</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/employer/cart"
              aria-label="View Cart"
              className="apple-spring relative grid size-11 shrink-0 place-items-center rounded-[10px] text-ink-600 hover:bg-ink-100"
            >
              <ShoppingBag className="size-5" />
            </Link>
            <Link
              href="/employer/alerts"
              aria-label="View Alerts"
              className="apple-spring relative grid size-11 shrink-0 place-items-center rounded-[10px] text-ink-600 hover:bg-ink-100"
            >
              <Bell className="size-5" />
              {unreadAlerts > 0 ? (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-brand-950 ring-2 ring-white">
                  {unreadAlerts > 99 ? "99+" : unreadAlerts}
                </span>
              ) : null}
            </Link>
          </div>
        </header>

        {/* Desktop top bar with breadcrumbs and user shortcuts */}
        <header className="sticky top-0 z-20 hidden items-center justify-between border-b border-ink-200/80 bg-white/95 px-8 py-3.5 backdrop-blur-md lg:flex shadow-2xs">
          <nav aria-label="Breadcrumb navigation" className="flex min-w-0 items-center gap-1.5 text-[13px] text-text-subtle">
            <Link
              href="/employer/dashboard"
              className="apple-spring inline-flex min-h-7 shrink-0 items-center font-medium text-ink-600 hover:text-brand-700"
            >
              Console
            </Link>
            {crumbs.map((crumb, index) => (
              <span key={crumb.href} className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden className="text-ink-300">
                  /
                </span>
                {index === crumbs.length - 1 ? (
                  <span className="truncate font-semibold text-ink-900">{crumb.label}</span>
                ) : !crumb.link ? (
                  <span className="truncate font-medium text-ink-600">{crumb.label}</span>
                ) : (
                  <Link href={crumb.href} className="apple-spring truncate font-medium text-ink-600 hover:text-brand-700">
                    {crumb.label}
                  </Link>
                )}
              </span>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            <Link
              href="/employer/cart"
              className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3 text-[13px] font-medium text-ink-700 shadow-2xs hover:border-ink-300 hover:bg-ink-50"
            >
              <ShoppingBag className="size-3.5 text-brand-700" />
              <span>Cart</span>
            </Link>

            <Link
              href="/employer/alerts"
              className="apple-spring apple-pressable relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] border border-ink-200 bg-white text-ink-700 shadow-2xs hover:border-ink-300 hover:bg-ink-50"
              title="Notifications & Alerts"
            >
              <Bell className="size-3.5 text-ink-600" />
              {unreadAlerts > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-brand-950 shadow-xs">
                  {unreadAlerts > 99 ? "99+" : unreadAlerts}
                </span>
              ) : null}
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="apple-spring flex min-h-11 items-center gap-2 rounded-[10px] border border-ink-200 bg-white px-3 text-[13px] font-medium text-ink-800 shadow-2xs outline-none hover:bg-ink-50"
                >
                  <Building2 className="size-3.5 text-brand-700" />
                  <span className="max-w-[140px] truncate">{companyName}</span>
                  <ChevronDown className="size-3 text-ink-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1.5">
                <DropdownMenuLabel className="px-2 py-1.5">
                  <p className="text-xs font-semibold text-ink-900 truncate">{companyName}</p>
                  {email ? (
                    <p className="text-2xs text-text-subtle truncate font-normal">{email}</p>
                  ) : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/employer/account" className="flex items-center gap-2 cursor-pointer">
                    <Building2 className="size-3.5 text-ink-500" />
                    <span>Company Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/employer/orders" className="flex items-center gap-2 cursor-pointer">
                    <Receipt className="size-3.5 text-ink-500" />
                    <span>Orders & Invoices</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/employer/account#security" className="flex items-center gap-2 cursor-pointer">
                    <KeyRound className="size-3.5 text-ink-500" />
                    <span>Change Password</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a
                    href="mailto:communicate@findtern.in"
                    className="flex items-center gap-2 cursor-pointer text-ink-600"
                  >
                    <HelpCircle className="size-3.5 text-ink-500" />
                    <span>Help & Support</span>
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="flex items-center gap-2 cursor-pointer text-danger focus:text-danger focus:bg-danger-soft"
                >
                  <LogOut className="size-3.5" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content body. Bottom padding clears the floating chat launcher so
            the last row of a table or a right-aligned CTA is never under it. */}
        <main className="mx-auto min-w-0 w-full max-w-[84rem] flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-24 lg:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}
