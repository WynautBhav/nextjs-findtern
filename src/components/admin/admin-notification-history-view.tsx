"use client";

import { useState, useMemo } from "react";
import {
  Bell,
  Building2,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  RotateCcw,
  Search,
} from "lucide-react";

import { formatDate } from "@/lib/format";

export type AdminNotificationItem = {
  id: string;
  recipientType: string;
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string | null;
};

export function AdminNotificationHistoryView({
  notifications,
}: {
  notifications: AdminNotificationItem[];
}) {
  const [search, setSearch] = useState("");
  const [recipientFilter, setRecipientFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        n.title.toLowerCase().includes(q) ||
        n.message.toLowerCase().includes(q) ||
        n.recipientName.toLowerCase().includes(q) ||
        n.recipientEmail.toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q);

      const matchRecipient =
        recipientFilter === "all" || n.recipientType === recipientFilter;
      const matchType = typeFilter === "all" || n.type === typeFilter;

      return matchSearch && matchRecipient && matchType;
    });
  }, [notifications, search, recipientFilter, typeFilter]);

  const uniqueTypes = useMemo(() => {
    return Array.from(new Set(notifications.map((n) => n.type))).filter(Boolean);
  }, [notifications]);

  const handleReset = () => {
    setSearch("");
    setRecipientFilter("all");
    setTypeFilter("all");
  };

  return (
    <div className="space-y-6">
      {/* Search & Filters (matches 25-admin-notification-history.png) */}
      <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipient, title, message, sender..."
              className="w-full rounded-xl border border-ink-200 bg-white pl-9 pr-4 py-2 text-xs focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          <select
            value={recipientFilter}
            onChange={(e) => setRecipientFilter(e.target.value)}
            aria-label="Filter by recipient type"
            className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs text-ink-700 focus:border-brand-500 focus:outline-hidden"
          >
            <option value="all">All Recipients</option>
            <option value="intern">Interns</option>
            <option value="employer">Employers</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by notification type"
            className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs text-ink-700 focus:border-brand-500 focus:outline-hidden"
          >
            <option value="all">All Types</option>
            {uniqueTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleReset}
            className="apple-spring inline-flex items-center gap-1.5 rounded-xl border border-ink-200 px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50"
          >
            <RotateCcw className="size-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Notifications Table */}
      <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white shadow-2xs">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-ink-100 bg-ink-50/70 font-semibold text-ink-700">
            <tr>
              <th className="w-10 px-3 py-3 text-center"></th>
              <th className="px-5 py-3">Sender</th>
              <th className="px-5 py-3">Recipient</th>
              <th className="px-5 py-3">Title & Message</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3 text-right">Sent At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-ink-500">
                  <Bell className="mx-auto size-8 text-ink-300 mb-2" />
                  <p className="font-medium text-xs">No notifications recorded</p>
                  <p className="text-2xs text-text-subtle mt-0.5">Dispatched broadcast updates will log in this ledger.</p>
                </td>
              </tr>
            ) : (
              filtered.map((item) => {
                const isExpanded = expandedId === item.id;
                const isCompany = item.recipientType === "employer";

                return (
                  <tr
                    key={item.id}
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="cursor-pointer hover:bg-ink-50/40 transition-colors"
                  >
                    <td className="px-3 py-3.5 text-center text-ink-400">
                      {isExpanded ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="grid size-6 place-items-center rounded-full bg-brand-50 text-brand-700 text-2xs font-bold">
                          S
                        </span>
                        <span className="font-medium text-ink-800">System</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        {isCompany ? (
                          <Building2 className="size-4 text-brand-600 shrink-0" />
                        ) : (
                          <GraduationCap className="size-4 text-blue-600 shrink-0" />
                        )}
                        <div>
                          <p className="font-bold text-ink-900">{item.recipientName}</p>
                          <p className="text-2xs text-text-subtle">{item.recipientEmail}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-ink-900">{item.title}</p>
                      <p className="text-2xs text-text-subtle truncate max-w-sm">{item.message}</p>
                      {isExpanded && (
                        <div className="mt-2 rounded-xl bg-ink-50 p-3 text-xs text-ink-800 leading-relaxed border border-ink-100/60">
                          {item.message}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center rounded-md bg-ink-100 px-2 py-0.5 font-mono text-2xs font-semibold text-ink-700 uppercase">
                        {item.type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-text-subtle">
                      {item.createdAt ? formatDate(item.createdAt) : "-"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
