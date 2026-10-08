"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  FileText,
  ShieldCheck,
  Building2,
  ScrollText,
  Shield,
  Briefcase,
  Send,
  BarChart3,
  ArrowLeftRight,
  ShoppingBag,
  CreditCard,
  Receipt,
  Tag,
  Globe,
  Bell,
  History,
  LogOut,
  X,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type NavLink = {
  href: string;
  label: string;
  badge?: string | number;
  icon?: LucideIcon;
};

export type NavGroup = {
  label: string;
  items: NavLink[];
};

const ICON_MAP: Record<string, LucideIcon> = {
  "/admin/dashboard": LayoutDashboard,
  "/admin/messages": MessageSquare,
  "/admin/interns": Users,
  "/admin/interns/terms": FileText,
  "/admin/interns/non-disclosure": ShieldCheck,
  "/admin/companies": Building2,
  "/admin/companies/terms": ScrollText,
  "/admin/roles": Shield,
  "/admin/projects": Briefcase,
  "/admin/proposal-tracker": Send,
  "/admin/reports": BarChart3,
  "/admin/transactions": ArrowLeftRight,
  "/admin/orders": ShoppingBag,
  "/admin/payouts": CreditCard,
  "/admin/intern-invoices": Receipt,
  "/admin/promo-codes": Tag,
  "/admin/cms": Globe,
  "/admin/notifications": Bell,
  "/admin/notification-history": History,
};

export function AdminNav({
  groups,
  onNavigate,
}: {
  groups: NavGroup[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/admin/dashboard") {
      return pathname === "/admin/dashboard" || pathname === "/admin";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav className="flex flex-col gap-6" aria-label="Admin Navigation">
      {groups.map((group) => (
        <div key={group.label} className="space-y-1">
          <p className="px-3 pb-1 text-2xs font-semibold tracking-wider text-on-dark-subtle/70 uppercase">
            {group.label}
          </p>

          <div className="flex flex-col space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(item.href);
              const IconComponent = item.icon || ICON_MAP[item.href] || FileText;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150",
                    active
                      ? "bg-white/12 text-white shadow-xs font-semibold"
                      : "text-on-dark-subtle hover:bg-white/6 hover:text-white"
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-6 place-items-center rounded-md transition-colors",
                      active
                        ? "bg-brand-500/30 text-accent-400"
                        : "text-on-dark-subtle/80 group-hover:text-white"
                    )}
                  >
                    <IconComponent className="size-3.5" />
                  </span>

                  <span className="truncate">{item.label}</span>

                  {item.badge !== undefined ? (
                    <span className="ml-auto rounded-full bg-accent-400/20 px-1.5 py-0.5 text-2xs font-semibold text-accent-400 tabular-nums">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function AdminNavFooter({
  email,
  role,
  onSignOut,
}: {
  email: string;
  role?: string;
  onSignOut?: () => void;
}) {
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="border-t border-white/10 pt-4">
      <div className="flex items-center gap-3 rounded-lg px-3 py-2 bg-white/4">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-500/25 text-xs font-bold text-accent-400"
        >
          {email.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-white">{email}</p>
          {role ? (
            <p className="truncate text-2xs text-on-dark-subtle capitalize">
              {role.replace(/_/g, " ")}
            </p>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          setSigningOut(true);
          onSignOut?.();
        }}
        disabled={signingOut}
        className="mt-2 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-on-dark-subtle transition-colors hover:bg-white/6 hover:text-white disabled:opacity-50"
      >
        <LogOut className="size-3.5" aria-hidden />
        <span>{signingOut ? "Signing out..." : "Sign out"}</span>
      </button>
    </div>
  );
}

export function NavCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close navigation"
      className="absolute top-4 right-4 rounded-lg p-2 text-on-dark-subtle transition-colors hover:bg-white/10 hover:text-white"
    >
      <X className="size-5" />
    </button>
  );
}
