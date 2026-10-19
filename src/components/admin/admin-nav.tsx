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
  UserCheck,
  Settings,
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
  "/admin/users": UserCheck,
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
  "/admin/cms/terms": ScrollText,
  "/admin/notifications": Bell,
  "/admin/notification-history": History,
  "/admin/settings": Settings,
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
    <nav className="apple-admin flex flex-col gap-6" aria-label="Admin navigation">
      {groups.map((group) => (
        <div key={group.label} className="space-y-1.5">
          <p className="px-3 text-[12px] font-semibold tracking-[0.02em] text-text-subtle">
            {group.label}
          </p>

          <div className="flex flex-col gap-0.5">
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
                    "apple-spring apple-pressable group flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[14px] font-medium tracking-[-0.01em]",
                    active
                      ? "bg-brand-50 text-brand-800"
                      : "text-ink-600 hover:bg-ink-100/70 hover:text-ink-900"
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-6 place-items-center",
                      active
                        ? "text-brand-700"
                        : "text-ink-600 group-hover:text-ink-700"
                    )}
                  >
                    <IconComponent className="size-4" />
                  </span>

                  <span className="truncate">{item.label}</span>

                  {item.badge !== undefined ? (
                    <span className="ml-auto rounded-full bg-warning-soft px-1.5 py-0.5 text-[11px] font-semibold text-warning tabular-nums">
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
    <div className="apple-admin border-t border-ink-200/70 pt-4">
      <div className="flex items-center gap-3 rounded-[10px] px-3 py-2">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800"
        >
          {email.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium tracking-[-0.01em] text-ink-800">{email}</p>
          {role ? (
            <p className="truncate text-[12px] text-text-subtle capitalize">
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
        className="apple-spring apple-pressable mt-2 flex min-h-11 w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px] font-medium text-text-subtle hover:bg-ink-100/70 hover:text-danger disabled:opacity-50"
      >
        <LogOut className="size-4" aria-hidden />
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
      className="apple-spring absolute top-4 right-4 flex min-h-11 min-w-11 items-center justify-center rounded-[10px] p-2 text-ink-600 hover:bg-ink-100 hover:text-ink-900"
    >
      <X className="size-5" />
    </button>
  );
}
