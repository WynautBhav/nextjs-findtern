"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { csrfFetch } from "@/lib/client-fetch";
import { AdminNav, AdminNavFooter, NavCloseButton, type NavGroup } from "./admin-nav";
import { CommandPalette } from "./command-palette";

export function AdminShell({
  groups,
  email,
  role,
  children,
}: {
  groups: NavGroup[];
  email: string;
  role?: string;
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
    <div className="flex min-h-[100dvh] bg-ink-50">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col bg-brand-950 px-4 py-6 md:flex border-r border-white/5">
        <Link href="/admin/dashboard" className="px-3 flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-lg bg-brand-700 text-white font-bold text-sm">
            F
          </span>
          <span className="text-base font-semibold tracking-tight text-white">
            Findtern <span className="text-accent-400 font-bold">Portal</span>
          </span>
        </Link>

        <div className="mt-6 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:var(--color-brand-800)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-brand-800 [&::-webkit-scrollbar-track]:bg-transparent">
          <AdminNav groups={groups} />
        </div>

        <AdminNavFooter email={email} role={role} onSignOut={signOut} />
      </aside>

      {/* Main content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar and drawer */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-200 bg-white/95 px-4 py-3 backdrop-blur-md md:hidden">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Open navigation drawer"
                  className="rounded-lg p-2 text-ink-700 transition-colors hover:bg-ink-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <Menu className="size-5" />
                </button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="flex w-72 flex-col bg-brand-950 p-5 text-white border-r border-white/10"
              >
                <SheetTitle className="px-3 text-base font-semibold text-white flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded bg-brand-700 text-white font-bold text-xs">
                    F
                  </span>
                  <span>Findtern <span className="text-accent-400">Portal</span></span>
                </SheetTitle>
                <NavCloseButton onClick={() => setOpen(false)} />
                <div className="mt-6 flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--color-brand-800)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-brand-800 [&::-webkit-scrollbar-track]:bg-transparent">
                  <AdminNav groups={groups} onNavigate={() => setOpen(false)} />
                </div>
                <AdminNavFooter email={email} role={role} onSignOut={signOut} />
              </SheetContent>
            </Sheet>

            <div className="min-w-0">
              <p className="text-2xs text-text-subtle font-medium">Findtern</p>
              <p className="truncate text-xs font-semibold text-ink-900">
                {crumbs[crumbs.length - 1] ?? "Dashboard"}
              </p>
            </div>
          </div>

          <CommandPalette />
        </header>

        {/* Desktop top bar with breadcrumbs and Command Palette */}
        <header className="hidden items-center justify-between border-b border-ink-200 bg-white px-8 py-3 md:flex sticky top-0 z-20 shadow-2xs">
          <nav aria-label="Breadcrumb navigation" className="flex items-center gap-1.5 text-xs text-text-subtle">
            <Link href="/admin/dashboard" className="font-medium text-ink-600 hover:text-brand-700 transition-colors">
              Portal
            </Link>
            {crumbs.map((crumb, index) => (
              <span key={`${crumb}-${index}`} className="flex items-center gap-1.5">
                <span aria-hidden className="text-ink-300">/</span>
                <span
                  className={
                    index === crumbs.length - 1 ? "font-semibold text-ink-900" : "font-medium text-ink-600"
                  }
                >
                  {crumb}
                </span>
              </span>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-2xs font-medium text-brand-700 border border-brand-200/60">
              <span className="size-1.5 rounded-full bg-brand-600 animate-pulse" />
              <span>Production Node</span>
            </div>
            <CommandPalette />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
