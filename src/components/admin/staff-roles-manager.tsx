"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Plus,
  Shield,
  ShieldAlert,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { formatDate } from "@/lib/format";
import type { Admin } from "@/lib/db/schema";
import { StatusBadge } from "@/components/admin/status-badge";
import { Panel } from "@/components/admin/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

const ALL_PERMISSIONS = [
  { key: "interns:read", label: "Read candidate profiles & assessments" },
  { key: "interns:write", label: "Approve, edit, or adjust intern records" },
  { key: "companies:read", label: "Inspect employer accounts & KYC" },
  { key: "companies:write", label: "Verify or suspend employer accounts" },
  { key: "projects:read", label: "View active and drafted projects" },
  { key: "projects:write", label: "Approve, moderate, or edit projects" },
  { key: "financials:read", label: "Audit payment ledgers and intern payouts" },
  { key: "cms:write", label: "Edit marketing content, skills, & FAQs" },
  { key: "messages:read", label: "Read inbound contact inquiries" },
  { key: "messages:write", label: "Reply and triage support messages" },
] as const;

export interface RoleDef {
  key: string;
  name: string;
  description?: string;
  permissions: string[] | unknown;
}

export function StaffRolesManager({
  initialStaff,
  initialRoles,
}: {
  initialStaff: Admin[];
  initialRoles: RoleDef[];
}) {
  const router = useRouter();
  const [staffList, setStaffList] = useState<Admin[]>(initialStaff);
  const [rolesList, setRolesList] = useState<RoleDef[]>(initialRoles);

  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);

  // Staff Form State
  const [staffName, setStaffName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffRole, setStaffRole] = useState(rolesList[0]?.key || "admin");
  const [staffSaving, setStaffSaving] = useState(false);
  const [staffError, setStaffError] = useState("");

  // Role Form State
  const [roleKey, setRoleKey] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState("");

  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleCreateStaff(e: React.FormEvent) {
    e.preventDefault();
    setStaffSaving(true);
    setStaffError("");
    try {
      const res = await csrfFetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: staffName.trim(),
          email: staffEmail.trim(),
          password: staffPassword,
          role: staffRole,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create staff member");
      if (data.staff) {
        setStaffList((prev) => [data.staff, ...prev]);
      }
      setStaffModalOpen(false);
      setStaffName("");
      setStaffEmail("");
      setStaffPassword("");
      router.refresh();
    } catch (err: unknown) {
      setStaffError(err instanceof Error ? err.message : "Error creating staff");
    } finally {
      setStaffSaving(false);
    }
  }

  async function handleDeleteStaff(id: string) {
    if (!confirm("Are you sure you want to revoke access for this staff member?")) return;
    setBusyId(id);
    try {
      const res = await csrfFetch("/api/admin/staff", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete staff member");
      setStaffList((prev) => prev.filter((s) => s.id !== id));
      router.refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error deleting staff");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault();
    setRoleSaving(true);
    setRoleError("");
    try {
      const cleanKey = roleKey.trim().toLowerCase().replace(/\s+/g, "_");
      const res = await csrfFetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: cleanKey,
          name: roleName.trim(),
          permissions: selectedPerms,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create role");
      const newRole: RoleDef = {
        key: cleanKey,
        name: roleName.trim(),
        description: roleDescription.trim(),
        permissions: selectedPerms,
      };
      setRolesList((prev) => [...prev, newRole]);
      setRoleModalOpen(false);
      setRoleKey("");
      setRoleName("");
      setRoleDescription("");
      setSelectedPerms([]);
      router.refresh();
    } catch (err: unknown) {
      setRoleError(err instanceof Error ? err.message : "Error creating role");
    } finally {
      setRoleSaving(false);
    }
  }

  function togglePerm(key: string) {
    setSelectedPerms((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  return (
    <div className="space-y-6">
      {/* Staff Directory Panel */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 p-5">
          <div>
            <h2 className="text-sm font-bold text-ink-900 flex items-center gap-2">
              <Users className="size-4 text-brand-700" />
              <span>Staff Account Directory</span>
            </h2>
            <p className="mt-0.5 text-xs text-text-subtle">
              Internal team members with administrative console access.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setStaffModalOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white shadow-2xs hover:bg-brand-600 transition-colors"
          >
            <UserPlus className="size-3.5" />
            <span>Provision Staff Member</span>
          </button>
        </div>

        <Table>
          <TableHeader className="bg-ink-50/90">
            <TableRow>
              <TableHead className="px-5 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-600">
                Staff member
              </TableHead>
              <TableHead className="px-5 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-600">
                Email
              </TableHead>
              <TableHead className="px-5 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-600">
                Role assignment
              </TableHead>
              <TableHead className="px-5 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-600">
                Provisioned date
              </TableHead>
              <TableHead className="px-5 py-3 text-right text-2xs font-semibold uppercase tracking-wider text-ink-600">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staffList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-xs text-text-subtle">
                  No staff accounts provisioned yet.
                </TableCell>
              </TableRow>
            ) : (
              staffList.map((staff) => (
                <TableRow key={staff.id} className="hover:bg-ink-50/60">
                  <TableCell className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-hidden
                        className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand-50 text-xs font-bold text-brand-800 border border-brand-200"
                      >
                        {(staff.name || staff.email).charAt(0).toUpperCase()}
                      </span>
                      <p className="font-semibold text-xs text-ink-900">{staff.name || "Staff Member"}</p>
                    </div>
                  </TableCell>
                  <TableCell className="px-5 py-3.5 text-xs font-medium text-ink-700">{staff.email}</TableCell>
                  <TableCell className="px-5 py-3.5">
                    <StatusBadge
                      tone="info"
                      label={staff.role ? staff.role.replace(/_/g, " ").toUpperCase() : "ADMIN"}
                    />
                  </TableCell>
                  <TableCell className="px-5 py-3.5 text-2xs text-text-subtle tabular-nums">
                    {staff.createdAt ? formatDate(staff.createdAt) : "—"}
                  </TableCell>
                  <TableCell className="px-5 py-3.5 text-right">
                    <button
                      type="button"
                      disabled={busyId === staff.id}
                      onClick={() => handleDeleteStaff(staff.id)}
                      title="Revoke staff member"
                      className="rounded-lg p-1.5 text-ink-400 hover:bg-danger-soft hover:text-danger transition-colors disabled:opacity-50"
                    >
                      {busyId === staff.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Panel>

      {/* Role Permissions Matrix Panel */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 p-5">
          <div>
            <h2 className="text-sm font-bold text-ink-900 flex items-center gap-2">
              <ShieldAlert className="size-4 text-brand-700" />
              <span>Role Permissions Matrix</span>
            </h2>
            <p className="mt-0.5 text-xs text-text-subtle">
              Granular access capabilities assigned to each security profile.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRoleModalOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3.5 text-xs font-semibold text-ink-800 shadow-2xs hover:bg-ink-50 transition-colors"
          >
            <Plus className="size-3.5" />
            <span>Define New Role</span>
          </button>
        </div>

        <div className="divide-y divide-ink-100">
          {rolesList.map((role) => {
            const perms = Array.isArray(role.permissions) ? (role.permissions as string[]) : [];
            return (
              <div key={role.key} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-ink-900">{role.name}</h3>
                    {role.description ? (
                      <p className="mt-0.5 text-2xs text-text-subtle">
                        {role.description}
                      </p>
                    ) : null}
                  </div>
                  <span className="font-mono text-3xs uppercase tracking-wider text-ink-600 bg-ink-100 rounded px-2 py-0.5">
                    Identifier: {role.key}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {perms.map((perm) => (
                    <span
                      key={perm}
                      className="inline-flex items-center rounded-md border border-ink-200 bg-ink-50 px-2 py-0.5 text-3xs font-mono font-medium text-ink-700"
                    >
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Provision Staff Sheet */}
      <Sheet open={staffModalOpen} onOpenChange={setStaffModalOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-6 bg-surface-alt">
          <SheetHeader className="text-left pb-4 border-b border-ink-100">
            <SheetTitle className="text-lg font-bold text-ink-900">
              Provision Staff Account
            </SheetTitle>
            <SheetDescription className="text-xs text-text-subtle">
              Create an administrative user with authenticated console access.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleCreateStaff} className="mt-6 space-y-4">
            {staffError ? (
              <p className="rounded-xl border border-danger/30 bg-danger-soft p-3 text-xs text-danger font-medium">
                {staffError}
              </p>
            ) : null}

            <div>
              <label className="block text-xs font-semibold text-ink-800">Full Name *</label>
              <input
                type="text"
                required
                value={staffName}
                placeholder="e.g. Romil Gupta"
                onChange={(e) => setStaffName(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs text-ink-900 shadow-2xs outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-800">Email Address *</label>
              <input
                type="email"
                required
                value={staffEmail}
                placeholder="name@findtern.in"
                onChange={(e) => setStaffEmail(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs text-ink-900 shadow-2xs outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-800">Temporary Password *</label>
              <input
                type="password"
                required
                minLength={8}
                value={staffPassword}
                placeholder="At least 8 characters"
                onChange={(e) => setStaffPassword(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs text-ink-900 shadow-2xs outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-800">Role Assignment *</label>
              <select
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs font-medium text-ink-900 shadow-2xs outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              >
                {rolesList.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name} ({r.key})
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setStaffModalOpen(false)}
                className="h-10 rounded-xl border border-ink-200 bg-white px-4 text-xs font-medium text-ink-700 hover:bg-ink-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={staffSaving}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-700 px-5 text-xs font-semibold text-white shadow-2xs hover:bg-brand-600 disabled:opacity-50"
              >
                {staffSaving ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
                <span>Create Staff Account</span>
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Define Role Sheet */}
      <Sheet open={roleModalOpen} onOpenChange={setRoleModalOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-6 bg-surface-alt">
          <SheetHeader className="text-left pb-4 border-b border-ink-100">
            <SheetTitle className="text-lg font-bold text-ink-900">
              Define New Role
            </SheetTitle>
            <SheetDescription className="text-xs text-text-subtle">
              Configure a role profile with granular security capabilities.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleCreateRole} className="mt-6 space-y-4">
            {roleError ? (
              <p className="rounded-xl border border-danger/30 bg-danger-soft p-3 text-xs text-danger font-medium">
                {roleError}
              </p>
            ) : null}

            <div>
              <label className="block text-xs font-semibold text-ink-800">Role Identifier Key *</label>
              <input
                type="text"
                required
                value={roleKey}
                placeholder="e.g. audit_lead"
                onChange={(e) => setRoleKey(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs font-mono text-ink-900 shadow-2xs outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-800">Display Name *</label>
              <input
                type="text"
                required
                value={roleName}
                placeholder="e.g. Financial Auditor"
                onChange={(e) => setRoleName(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs text-ink-900 shadow-2xs outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-800">Description</label>
              <textarea
                rows={2}
                value={roleDescription}
                placeholder="Brief summary of duties and permissions"
                onChange={(e) => setRoleDescription(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white p-3 text-xs text-ink-900 shadow-2xs outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-800 mb-2">
                Permissions Checklist ({selectedPerms.length} selected)
              </label>
              <div className="space-y-2 rounded-xl border border-ink-100 bg-white p-3.5 shadow-2xs max-h-56 overflow-y-auto">
                {ALL_PERMISSIONS.map((perm) => {
                  const on = selectedPerms.includes(perm.key);
                  return (
                    <label
                      key={perm.key}
                      className="flex items-start gap-2.5 p-1.5 rounded-lg hover:bg-surface-alt cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => togglePerm(perm.key)}
                        className="mt-0.5 size-4 rounded-xs text-brand-700"
                      />
                      <div className="text-xs">
                        <span className="font-mono font-medium text-ink-900 block">{perm.key}</span>
                        <span className="text-3xs text-text-subtle">{perm.label}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                className="h-10 rounded-xl border border-ink-200 bg-white px-4 text-xs font-medium text-ink-700 hover:bg-ink-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={roleSaving}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-700 px-5 text-xs font-semibold text-white shadow-2xs hover:bg-brand-600 disabled:opacity-50"
              >
                {roleSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Shield className="size-3.5" />}
                <span>Save Role Definition</span>
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
