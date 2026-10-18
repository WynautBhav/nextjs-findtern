"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Users,
  Search,
  UserCheck,
  Building2,
  Shield,
  Download,
  Mail,
  Phone,
  ExternalLink,
} from "lucide-react";

import { Panel } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { formatDate } from "@/lib/format";
import { downloadCsv } from "@/lib/admin/csv";

export interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  countryCode: string;
  role: string;
  status: string;
  emailVerified: boolean;
  createdAt: string | Date | null | undefined;
}

export function AdminUsersView({ initialUsers }: { initialUsers: UserRow[] }) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const counts = useMemo(() => {
    let interns = 0;
    let employers = 0;
    let admins = 0;
    for (const u of initialUsers) {
      if (u.role === "employer") employers++;
      else if (u.role === "admin" || u.role === "superadmin") admins++;
      else interns++;
    }
    return { total: initialUsers.length, interns, employers, admins };
  }, [initialUsers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialUsers.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) {
        if (roleFilter === "intern" && (u.role === "employer" || u.role === "admin" || u.role === "superadmin")) {
          return false;
        }
        if (roleFilter === "admin" && u.role !== "admin" && u.role !== "superadmin") {
          return false;
        }
      }
      if (!q) return true;
      const fullName = `${u.firstName} ${u.lastName}`.toLowerCase();
      const phone = `${u.countryCode}${u.phoneNumber}`.toLowerCase();
      return (
        fullName.includes(q) ||
        u.email.toLowerCase().includes(q) ||
        phone.includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    });
  }, [initialUsers, search, roleFilter]);

  const exportCsv = () => {
    downloadCsv("platform-users", filtered, [
      { header: "ID", value: (u) => u.id },
      { header: "First Name", value: (u) => u.firstName },
      { header: "Last Name", value: (u) => u.lastName },
      { header: "Email", value: (u) => u.email },
      { header: "Country Code", value: (u) => u.countryCode },
      { header: "Phone", value: (u) => u.phoneNumber },
      { header: "Role", value: (u) => u.role },
      { header: "Status", value: (u) => u.status },
      { header: "Verified", value: (u) => (u.emailVerified ? "Yes" : "No") },
      { header: "Created At", value: (u) => (u.createdAt ? formatDate(u.createdAt) : "") },
    ]);
  };

  return (
    <div className="space-y-6">
      <StatGrid cols={4}>
        <StatCard
          label="Total Users"
          value={counts.total.toLocaleString()}
          hint="All registered platform accounts"
          icon={Users}
          tone="brand"
        />
        <StatCard
          label="Candidates"
          value={counts.interns.toLocaleString()}
          hint="Talent pool signups"
          icon={UserCheck}
          tone="info"
        />
        <StatCard
          label="Hiring Partners"
          value={counts.employers.toLocaleString()}
          hint="Corporate employer organizations"
          icon={Building2}
          tone="accent"
        />
        <StatCard
          label="Staff & Admins"
          value={counts.admins.toLocaleString()}
          hint="System operators & staff"
          icon={Shield}
          tone="success"
        />
      </StatGrid>

      <Panel>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between border-b border-ink-100">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
              <input
                type="text"
                placeholder="Search user by name, email, or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-ink-200 bg-white py-2 pl-9 pr-3 text-xs text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div className="flex items-center gap-1 rounded-xl border border-ink-200 bg-ink-50/50 p-0.5 text-xs">
              {[
                { id: "all", label: "All" },
                { id: "intern", label: "Candidates" },
                { id: "employer", label: "Employers" },
                { id: "admin", label: "Admins" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRoleFilter(tab.id)}
                  className={`rounded-lg px-2.5 py-1 text-2xs font-medium transition-colors ${
                    roleFilter === tab.id
                      ? "bg-white font-semibold text-brand-700 shadow-2xs"
                      : "text-ink-600 hover:text-ink-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 hover:text-ink-900"
            >
              <Download className="size-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-ink-100 bg-ink-50/60 text-2xs font-semibold uppercase tracking-wider text-text-subtle">
              <tr>
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Registered</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100/70">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-text-subtle">
                    No users matching criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((user) => {
                  const isIntern = user.role === "intern";
                  const isEmployer = user.role === "employer";
                  const profileUrl = isIntern
                    ? `/admin/interns/${user.id}`
                    : isEmployer
                    ? `/admin/companies/${user.id}`
                    : undefined;

                  return (
                    <tr key={user.id} className="hover:bg-ink-50/40">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
                            {(user.firstName || user.email || "?")[0]?.toUpperCase()}
                          </span>
                          <div>
                            <p className="font-semibold text-ink-900">
                              {user.firstName} {user.lastName}
                            </p>
                            <p className="flex items-center gap-1 text-2xs text-text-subtle">
                              <Mail className="size-3" />
                              <span>{user.email}</span>
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 text-text-subtle">
                          <Phone className="size-3" />
                          <span>
                            {user.countryCode} {user.phoneNumber}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider ${
                            isIntern
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : isEmployer
                              ? "bg-purple-50 text-purple-700 border border-purple-200"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium ${
                            user.status === "active"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-ink-100 text-ink-600"
                          }`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${
                              user.status === "active" ? "bg-emerald-500" : "bg-ink-400"
                            }`}
                          />
                          <span className="capitalize">{user.status}</span>
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-text-subtle tabular-nums">
                        {user.createdAt ? formatDate(user.createdAt) : "-"}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {profileUrl ? (
                          <Link
                            href={profileUrl}
                            className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-2xs font-semibold text-ink-700 hover:bg-brand-50 hover:text-brand-800"
                          >
                            <span>Inspect</span>
                            <ExternalLink className="size-3" />
                          </Link>
                        ) : (
                          <span className="text-2xs text-text-subtle">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
