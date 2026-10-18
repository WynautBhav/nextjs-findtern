"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, Menu } from "lucide-react";

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { csrfFetch } from "@/lib/client-fetch";
import { AdminNav, AdminNavFooter, NavCloseButton, type NavGroup } from "./admin-nav";
import { CommandPalette } from "./command-palette";
import { Logo } from "@/components/brand/logo";

export function AdminShell({
  groups,
  email,
  role,
  unreadCount = 0,
  children,
}: {
  groups: NavGroup[];
  email: string;
  role?: string;
  unreadCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await csrfFetch("/api/auth/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  const crumbs = pathname
    .split("/")
    .filter(Boolean)
    .slice(1)
    .map((part) => part.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase()));

  return (
    <div className="apple-admin min-h-[100dvh] overflow-x-clip bg-ink-50 text-ink-900 lg:flex lg:items-stretch">
      <aside className="apple-material-sidebar sticky top-0 hidden h-[100dvh] w-[15.5rem] shrink-0 flex-col px-3 py-4 lg:flex">
        <Link href="/admin/dashboard" className="apple-spring apple-pressable mb-6 flex min-h-11 items-center justify-between gap-3 rounded-[10px] px-3 py-2">
          <Logo alt="Findtern Admin" priority className="h-7" />
          <span className="rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-brand-700">Admin</span>
        </Link>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">
          <AdminNav groups={groups} />
        </div>

        <AdminNavFooter email={email} role={role} onSignOut={signOut} />
      </aside>

      {/* Main content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="apple-material-bar sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ink-200/70 px-4 lg:hidden">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Open navigation drawer"
                  className="apple-spring flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[10px] p-2 text-ink-700 hover:bg-ink-100/70"
                >
                  <Menu className="size-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" showCloseButton={false} className="apple-admin flex w-72 flex-col bg-white p-4 text-ink-900">
                <SheetTitle className="flex items-center gap-3 px-3 py-2 text-[15px] font-semibold tracking-[-0.02em]">
                  <span className="grid size-8 place-items-center rounded-[10px] bg-brand-700 text-sm text-white">F</span>
                  Findtern <span className="text-[12px] font-medium text-text-subtle">Admin</span>
                </SheetTitle>
                <NavCloseButton onClick={() => setOpen(false)} />
                <div className="mt-6 flex-1 overflow-y-auto">
                  <AdminNav groups={groups} onNavigate={() => setOpen(false)} />
                </div>
                <AdminNavFooter email={email} role={role} onSignOut={signOut} />
              </SheetContent>
            </Sheet>

            <div className="min-w-0">
              <p className="text-[12px] font-medium text-text-subtle">Findtern</p>
              <p className="truncate text-[13px] font-semibold tracking-[-0.01em] text-ink-900">
                {crumbs[crumbs.length - 1] ?? "Dashboard"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/messages"
              className="apple-spring apple-pressable relative grid size-11 shrink-0 place-items-center rounded-[10px] text-ink-600 hover:bg-ink-100"
              title="Inbound Messages"
            >
              <Bell className="size-5" />
              {unreadCount > 0 ? (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-brand-950 ring-2 ring-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>
            <CommandPalette />
          </div>
        </header>

        <header className="apple-material-bar hidden h-14 items-center justify-between border-b border-ink-200/70 px-8 lg:flex">
          <nav aria-label="Breadcrumb navigation" className="flex items-center gap-1.5 text-[13px] text-text-subtle">
            <Link href="/admin/dashboard" className="apple-spring inline-flex min-h-7 items-center font-medium text-ink-600 hover:text-brand-700">
              Workspace
            </Link>
            {crumbs.map((crumb, index) => (
              <span key={`${crumb}-${index}`} className="flex items-center gap-1.5">
                <span aria-hidden className="text-ink-300">/</span>
                <span
                  className={
                    index === crumbs.length - 1 ? "font-semibold tracking-[-0.01em] text-ink-900" : "font-medium text-ink-600"
                  }
                >
                  {crumb}
                </span>
              </span>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/admin/messages"
              className="apple-spring apple-pressable relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] border border-ink-200 bg-white text-ink-700 shadow-2xs hover:border-ink-300 hover:bg-ink-50"
              title="Inbound Messages"
            >
              <Bell className="size-4 text-ink-600" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-brand-950 shadow-xs">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>
            <span className="text-[13px] text-text-subtle">Local workspace</span>
            <CommandPalette />
          </div>
        </header>

        <main className="mx-auto min-w-0 w-full max-w-[84rem] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
