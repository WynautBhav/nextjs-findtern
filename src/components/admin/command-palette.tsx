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
  X,
} from "lucide-react";

type CommandItem = {
  title: string;
  category: string;
  href: string;
  icon: typeof LayoutDashboard;
};

const COMMANDS: CommandItem[] = [
  { title: "Dashboard Overview", category: "Navigation", href: "/admin/dashboard", icon: LayoutDashboard },
  { title: "Intern Candidates Directory", category: "People", href: "/admin/interns", icon: Users },
  { title: "Hiring Partners and Companies", category: "People", href: "/admin/companies", icon: Building2 },
  { title: "Financial Transactions and Ledger", category: "Finance", href: "/admin/transactions", icon: ArrowLeftRight },
  { title: "Intern Payout Disbursements", category: "Finance", href: "/admin/payouts", icon: CreditCard },
  { title: "Analytics and Placement Reports", category: "Finance", href: "/admin/reports", icon: BarChart3 },
  { title: "Roles and Team Governance", category: "People", href: "/admin/roles", icon: Shield },
  { title: "Promotional Discount Codes", category: "Finance", href: "/admin/promo-codes", icon: Tag },
  { title: "Inbound Support Messages", category: "Overview", href: "/admin/messages", icon: MessageSquare },
  { title: "Marketing Website CMS", category: "Content", href: "/admin/cms", icon: Globe },
  { title: "Active Employer Projects", category: "Work", href: "/admin/projects", icon: Briefcase },
  { title: "Proposal Pipeline Tracker", category: "Work", href: "/admin/proposal-tracker", icon: Send },
  { title: "Send Broadcast Notification", category: "Content", href: "/admin/notifications", icon: Bell },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const filtered = query.trim() === ""
    ? COMMANDS
    : COMMANDS.filter((cmd) =>
        cmd.title.toLowerCase().includes(query.toLowerCase()) ||
        cmd.category.toLowerCase().includes(query.toLowerCase())
      );

  const navigateTo = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="apple-spring flex min-h-11 items-center gap-2.5 rounded-[10px] border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-500 shadow-xs hover:border-brand-500 hover:text-ink-800"
        aria-label="Search navigation"
      >
        <Search className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">Search admin portal...</span>
        <span className="sm:hidden">Search</span>
        <kbd className="ml-2 hidden rounded bg-ink-100 px-1.5 py-0.5 text-2xs font-semibold text-ink-600 sm:inline">
          ⌘K
        </kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/40 backdrop-blur-xs p-4">
          <div
            className="apple-panel w-full max-w-lg overflow-hidden bg-white animate-in fade-in-0 zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
            aria-label="Command Menu"
          >
            <div className="flex items-center border-b border-ink-100 px-3.5 py-2.5">
              <Search className="size-4 text-ink-400 mr-2.5 shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Jump to any section or command..."
                autoFocus
                className="w-full bg-transparent text-sm text-ink-900 placeholder:text-ink-400 focus:outline-hidden"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto p-2 space-y-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-ink-500">
                  No matching destinations found
                </p>
              ) : (
                filtered.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.href}
                      type="button"
                      onClick={() => navigateTo(item.href)}
                      className="apple-spring apple-pressable flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-[13px] font-medium text-ink-700 hover:bg-brand-50 hover:text-brand-800"
                    >
                      <span className="grid size-6 place-items-center rounded-[8px] bg-ink-100 text-ink-600">
                        <Icon className="size-3.5" />
                      </span>
                      <span className="flex-1 truncate text-ink-900">{item.title}</span>
                      <span className="rounded bg-ink-100 px-1.5 py-0.5 text-2xs text-ink-500">
                        {item.category}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between border-t border-ink-100 bg-ink-50/50 px-3.5 py-2 text-2xs text-ink-500">
              <span>Navigate with arrow keys or click</span>
              <span>Press Escape to close</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
