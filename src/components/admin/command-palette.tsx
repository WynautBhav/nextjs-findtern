"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutDashboard,
  Users,
  Building2,
  ArrowLeftRight,
  BarChart3,
  Shield,
  Tag,
  MessageSquare,
  Globe,
  Briefcase,
  Send,
  CreditCard,
  Bell,
} from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type CommandItem = {
  title: string;
  category: string;
  href: string;
  icon: typeof LayoutDashboard;
};

const COMMANDS: CommandItem[] = [
  { title: "Dashboard", category: "Overview", href: "/admin/dashboard", icon: LayoutDashboard },
  { title: "Proposal pipeline", category: "Overview", href: "/admin/proposal-tracker", icon: Send },
  { title: "Messages", category: "Overview", href: "/admin/messages", icon: MessageSquare },
  { title: "Candidates", category: "People and work", href: "/admin/interns", icon: Users },
  { title: "Companies", category: "People and work", href: "/admin/companies", icon: Building2 },
  { title: "Projects", category: "People and work", href: "/admin/projects", icon: Briefcase },
  { title: "Transactions", category: "Finance", href: "/admin/transactions", icon: ArrowLeftRight },
  { title: "Payouts", category: "Finance", href: "/admin/payouts", icon: CreditCard },
  { title: "Promo codes", category: "Finance", href: "/admin/promo-codes", icon: Tag },
  { title: "Reports", category: "Finance", href: "/admin/reports", icon: BarChart3 },
  { title: "Website content", category: "Publishing", href: "/admin/cms", icon: Globe },
  { title: "Send notification", category: "Publishing", href: "/admin/notifications", icon: Bell },
  { title: "Roles and access", category: "Settings", href: "/admin/roles", icon: Shield },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q === "" ? COMMANDS : COMMANDS.filter((cmd) => cmd.title.toLowerCase().includes(q) || cmd.category.toLowerCase().includes(q));
  const current = Math.min(active, Math.max(filtered.length - 1, 0));

  // Keep the highlighted option on screen as the arrow keys move past the visible rows.
  useEffect(() => {
    if (open) document.getElementById(`admin-command-${current}`)?.scrollIntoView({ block: "nearest" });
  }, [open, current]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    // A fresh search each time; Radix returns focus to the trigger on close.
    if (!next) {
      setQuery("");
      setActive(0);
    }
  };

  const navigateTo = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!filtered.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((current + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((current - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      navigateTo(filtered[current].href);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="apple-spring flex min-h-11 items-center gap-2.5 rounded-apple-sm border border-ink-200 bg-white px-3 py-1.5 text-sm text-ink-600 shadow-xs hover:border-brand-500 hover:text-ink-800"
      >
        <Search className="size-3.5" aria-hidden />
        {/* No aria-label: the name comes from the visible words plus the hidden hint, so the two can
            never disagree (WCAG 2.5.3, and engines differ on which of two spans they count as visible). */}
        <span className="hidden sm:inline">Search admin portal</span>
        <span className="sm:hidden">Search</span>
        <span className="sr-only"> (Command K)</span>
        <kbd aria-hidden className="ml-2 hidden rounded bg-ink-100 px-1.5 py-0.5 text-2xs font-semibold text-ink-600 sm:inline">
          ⌘K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="top-[12%] translate-y-0 gap-0 overflow-hidden rounded-apple-xl border-ink-200/80 bg-white p-0 shadow-tile sm:max-w-lg"
        >
          <DialogTitle className="sr-only">Search the admin portal</DialogTitle>
          <DialogDescription className="sr-only">Type to filter, use the arrow keys to move and Enter to open.</DialogDescription>
          <div className="flex items-center border-b border-ink-100 py-1 pl-3.5 pr-14">
            <Search className="mr-2.5 size-4 shrink-0 text-ink-600" aria-hidden />
            <input
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls="admin-command-list"
              aria-activedescendant={filtered.length ? `admin-command-${current}` : undefined}
              aria-autocomplete="list"
              aria-label="Search the admin portal"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Jump to any section..."
              autoComplete="off"
              className="min-h-11 w-full bg-transparent text-base text-ink-900 placeholder:text-ink-600 focus:outline-hidden sm:text-sm"
            />
          </div>

          <div id="admin-command-list" role="listbox" aria-label="Destinations" className="max-h-72 space-y-1 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p role="status" className="px-3 py-6 text-center text-sm text-ink-600">
                No matching destinations found
              </p>
            ) : (
              filtered.map((item, i) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.href}
                    id={`admin-command-${i}`}
                    role="option"
                    aria-selected={i === current}
                    tabIndex={-1}
                    onClick={() => navigateTo(item.href)}
                    onMouseMove={() => setActive(i)}
                    className={cn(
                      "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-apple-sm px-3 py-2 text-left text-sm font-medium",
                      i === current ? "bg-brand-50 text-brand-800" : "text-ink-700",
                    )}
                  >
                    <span aria-hidden className="grid size-6 place-items-center rounded-apple-sm bg-ink-100 text-ink-600">
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 text-ink-900">{item.title}</span>
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 text-2xs text-ink-600">{item.category}</span>
                  </div>
                );
              })
            )}
          </div>

          <div aria-hidden className="flex items-center justify-between border-t border-ink-100 bg-ink-50/50 px-3.5 py-2 text-2xs text-ink-600">
            <span>↑↓ to move · Enter to open</span>
            <span>Esc to close</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
