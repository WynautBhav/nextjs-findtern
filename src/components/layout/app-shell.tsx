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
import { csrfFetch } from "@/lib/client-fetch";

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

  const crumbs = pathname
    .split("/")
    .filter(Boolean)
    .slice(1)
    .map((part) => part.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase()));

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
                  className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    active
                      ? "bg-brand-700/80 text-white shadow-2xs font-semibold"
                      : "text-on-dark-subtle hover:bg-white/8 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`transition-colors ${
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
    <div className="flex min-h-[100dvh] bg-ink-50">
      {/* Desktop sticky sidebar */}
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col bg-brand-950 px-4 py-6 md:flex border-r border-white/5">
        <Link href="/employer/dashboard" className="px-3 flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-lg bg-brand-700 text-white font-bold text-sm">
            F
          </span>
          <span className="text-base font-semibold tracking-tight text-white">
            Findtern <span className="text-accent-400 font-bold">{brand}</span>
          </span>
        </Link>

        {/* Scrollable nav items */}
        <div className="mt-8 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:var(--color-brand-800)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-brand-800 [&::-webkit-scrollbar-track]:bg-transparent">
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
              className="rounded-lg p-2 text-on-dark-subtle hover:bg-white/10 hover:text-white transition-colors"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content container */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-200/80 bg-white/95 px-4 py-3 backdrop-blur-md md:hidden">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Open navigation menu"
                  className="rounded-lg p-2 text-ink-700 hover:bg-ink-100 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
                >
                  <Menu className="size-5" />
                </button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="flex w-72 flex-col bg-brand-950 p-5 text-white border-r border-white/10"
              >
                <SheetHeader className="flex flex-row items-center justify-between">
                  <SheetTitle className="text-white text-base font-semibold flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded bg-brand-700 text-white font-bold text-xs">
                      F
                    </span>
                    <span>
                      Findtern <span className="text-accent-400">{brand}</span>
                    </span>
                  </SheetTitle>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg p-1 text-on-dark-subtle hover:bg-white/10 hover:text-white"
                  >
                    <X className="size-5" />
                  </button>
                </SheetHeader>
                <div className="mt-6 flex-1 overflow-y-auto pr-1">
                  {navContent}
                </div>
                <div className="pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-on-dark-subtle hover:bg-white/10 hover:text-white"
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
              className="rounded-lg p-2 text-ink-600 hover:bg-ink-100 relative transition-colors"
            >
              <ShoppingBag className="size-5" />
            </Link>
            <Link
              href="/employer/alerts"
              aria-label="View Alerts"
              className="rounded-lg p-2 text-ink-600 hover:bg-ink-100 relative transition-colors"
            >
              <Bell className="size-5" />
            </Link>
          </div>
        </header>

        {/* Desktop top bar with breadcrumbs and user shortcuts */}
        <header className="sticky top-0 z-20 hidden items-center justify-between border-b border-ink-200/80 bg-white/95 px-8 py-3.5 backdrop-blur-md md:flex shadow-2xs">
          <nav aria-label="Breadcrumb navigation" className="flex items-center gap-1.5 text-xs text-text-subtle">
            <Link
              href="/employer/dashboard"
              className="font-medium text-ink-600 hover:text-brand-700 transition-colors"
            >
              Console
            </Link>
            {crumbs.map((crumb, index) => (
              <span key={`${crumb}-${index}`} className="flex items-center gap-1.5">
                <span aria-hidden className="text-ink-300">
                  /
                </span>
                <span
                  className={
                    index === crumbs.length - 1
                      ? "font-semibold text-ink-900"
                      : "font-medium text-ink-600"
                  }
                >
                  {crumb}
                </span>
              </span>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/employer/cart"
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50 transition-colors shadow-2xs"
            >
              <ShoppingBag className="size-3.5 text-brand-700" />
              <span>Cart</span>
            </Link>

            <Link
              href="/employer/alerts"
              className="inline-flex items-center justify-center rounded-lg border border-ink-200 bg-white p-2 text-ink-700 hover:border-ink-300 hover:bg-ink-50 transition-colors shadow-2xs"
              title="Notifications & Alerts"
            >
              <Bell className="size-3.5 text-ink-600" />
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-800 hover:bg-ink-50 transition-colors shadow-2xs outline-none"
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
                    href="mailto:support@findtern.in"
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

        {/* Content body */}
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
