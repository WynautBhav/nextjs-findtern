"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { PERMISSIONS } from "@/lib/admin/permissions";

import { csrfFetch } from "@/lib/client-fetch";
import { formatDate } from "@/lib/format";
import type { Admin } from "@/lib/db/schema";
import { Panel } from "@/components/admin/panel";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const ALL_PERMISSIONS = PERMISSIONS;

const AREA_LABEL: Record<string, string> = {
  dashboard: "Dashboard",
  users: "Users",
  interns: "Candidates",
  companies: "Employers",
  transactions: "Finance",
  reports: "Reports",
  cms: "Website content",
  contact: "Messages",
  notifications: "Notifications",
  roles: "Staff and roles",
};

export interface RoleDef {
  key: string;
  name: string;
  /** Only the built-in placeholder roles carry one; admin_roles has no column for it. */
  description?: string;
  permissions: string[] | unknown;
}

/** "interns:write" → { area: "Candidates", verb: "Write" } */
function splitPerm(perm: string): { area: string; verb: string } {
  const [rawArea, rawVerb] = perm.split(":");
  return {
    area: AREA_LABEL[rawArea] ?? rawArea.charAt(0).toUpperCase() + rawArea.slice(1),
    verb: rawVerb ? rawVerb.charAt(0).toUpperCase() + rawVerb.slice(1) : "",
  };
}

const inputClass =
  "apple-spring mt-1.5 min-h-11 w-full rounded-[10px] border border-ink-200 bg-white px-3 text-[14px] text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

export function StaffRolesManager({
  initialStaff,
  initialRoles,
}: {
  initialStaff: Omit<Admin, "password">[];
  initialRoles: RoleDef[];
}) {
  const router = useRouter();
  const [staffList, setStaffList] = useState<Omit<Admin, "password">[]>(initialStaff);
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
  /** Set while the role sheet edits an existing role instead of creating one. */
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [roleName, setRoleName] = useState("");
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
      const cleanKey = editingRole ?? roleKey.trim().toLowerCase().replace(/\s+/g, "_");
      const res = editingRole
        ? await csrfFetch(`/api/admin/roles/${encodeURIComponent(editingRole)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: roleName.trim(), permissions: selectedPerms }),
          })
        : await csrfFetch("/api/admin/roles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: cleanKey,
              name: roleName.trim(),
              permissions: selectedPerms,
            }),
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save the role. Try again.");
      const newRole: RoleDef = {
        key: cleanKey,
        name: roleName.trim(),
        permissions: selectedPerms,
      };
      setRolesList((prev) => (editingRole ? prev.map((r) => (r.key === editingRole ? newRole : r)) : [...prev, newRole]));
      setEditingRole(null);
      setRoleModalOpen(false);
      setRoleKey("");
      setRoleName("");
      setSelectedPerms([]);
      router.refresh();
    } catch (err: unknown) {
      setRoleError(err instanceof Error ? err.message : "Couldn't save the role. Try again.");
    } finally {
      setRoleSaving(false);
    }
  }

  function editRole(role: RoleDef) {
    setEditingRole(role.key);
    setRoleKey(role.key);
    setRoleName(role.name);
    setSelectedPerms(Array.isArray(role.permissions) ? (role.permissions as string[]) : []);
    setRoleError("");
    setRoleModalOpen(true);
  }

  async function deleteRole(key: string) {
    if (!window.confirm("Delete this role?")) return;
    const res = await csrfFetch(`/api/admin/roles/${encodeURIComponent(key)}`, { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return window.alert(data.error ?? "Couldn't delete the role.");
    setRolesList((prev) => prev.filter((r) => r.key !== key));
  }

  async function updateStaff(id: string, body: { role?: string; password?: string }) {
    setBusyId(id);
    const res = await csrfFetch("/api/admin/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusyId(null);
    if (!res.ok) return window.alert(data.error ?? "Couldn't update.");
    if (body.role) setStaffList((prev) => prev.map((s) => (s.id === id ? { ...s, role: body.role! } : s)));
    if (body.password) window.alert("Password updated. Share it with them securely.");
  }

  function togglePerm(key: string) {
    setSelectedPerms((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  const membersOf = (key: string) => staffList.filter((s) => s.role === key).length;

  return (
    <div className="apple-admin space-y-4">
      {/* Staff directory */}
      <Panel className="bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-brand-200/60 bg-brand-50 text-brand-700"
            >
              <Users className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink-900">
                Staff
              </h2>
              <p className="text-[13px] text-text-subtle">
                {staffList.length} {staffList.length === 1 ? "member" : "members"} with console access
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStaffModalOpen(true)}
            className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-brand-700 px-4 text-[14px] font-semibold text-white hover:bg-brand-600"
          >
            <UserPlus className="size-4" />
            Add staff
          </button>
        </div>

        {staffList.length === 0 ? (
          <p className="px-5 py-10 text-center text-[14px] text-text-subtle">
            No staff accounts yet. Provision the first one to get started.
          </p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {staffList.map((staff) => (
              <li
                key={staff.id}
                className="apple-spring flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-ink-50/70"
              >
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-100 text-[13px] font-semibold text-brand-800"
                >
                  {(staff.name || staff.email).charAt(0).toUpperCase()}
                </span>
                {/* On phones the name block takes the first line and the
                    controls wrap to a second, so nothing is hidden. */}
                <span className="min-w-0 flex-1 basis-[calc(100%-3.25rem)] sm:basis-auto">
                  <span className="block truncate text-[15px] font-semibold tracking-[-0.01em] text-ink-900">
                    {staff.name || "Staff member"}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-text-subtle">
                    {staff.email}
                    {staff.role ? ` · ${staff.role.replace(/_/g, " ")}` : ""}
                    {staff.createdAt ? ` · since ${formatDate(staff.createdAt)}` : ""}
                  </span>
                </span>
                <select
                  aria-label={`Role for ${staff.email}`}
                  value={staff.role ?? ""}
                  disabled={busyId === staff.id}
                  onChange={(e) => updateStaff(staff.id, { role: e.target.value })}
                  className="block min-h-11 w-full min-w-0 flex-1 rounded-[10px] border border-ink-200 bg-white px-2 text-xs sm:w-auto sm:flex-none"
                >
                  {rolesList.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busyId === staff.id}
                  onClick={() => {
                    const pw = window.prompt(`New password for ${staff.email} (8+ characters)`);
                    if (pw) void updateStaff(staff.id, { password: pw });
                  }}
                  className="inline-flex min-h-11 items-center whitespace-nowrap rounded-[10px] px-2.5 text-xs font-medium text-ink-600 hover:bg-ink-100"
                >
                  Reset password
                </button>
                <button
                  type="button"
                  disabled={busyId === staff.id}
                  onClick={() => handleDeleteStaff(staff.id)}
                  title="Revoke access"
                  aria-label={`Revoke access for ${staff.email}`}
                  className="apple-spring apple-pressable inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-ink-600 hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                >
                  {busyId === staff.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Roles */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink-900">
            Roles
          </h2>
          <p className="mt-0.5 text-[13px] text-text-subtle">
            What each access profile can touch.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingRole(null);
            setRoleKey("");
            setRoleName("");
            setSelectedPerms([]);
            setRoleModalOpen(true);
          }}
          className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-4 text-[14px] font-semibold text-ink-800 hover:bg-ink-50"
        >
          <Plus className="size-4" />
          New role
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {rolesList.map((role) => {
          const perms = Array.isArray(role.permissions) ? (role.permissions as string[]) : [];
          // "*" is the super-admin wildcard, not an area; shown as one line
          // rather than a literal asterisk row.
          const fullAccess = perms.includes("*");
          const byArea = new Map<string, string[]>();
          for (const p of perms) {
            if (p === "*") continue;
            const { area, verb } = splitPerm(p);
            if (!byArea.has(area)) byArea.set(area, []);
            if (verb) byArea.get(area)?.push(verb);
          }
          const count = membersOf(role.key);
          return (
            <Panel key={role.key} className="bg-white p-5">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-brand-200/60 bg-brand-50 text-brand-700"
                >
                  {role.key === "admin" ? (
                    <ShieldCheck className="size-5" />
                  ) : (
                    <Shield className="size-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[17px] font-semibold tracking-[-0.02em] text-ink-900">
                    {role.name}
                  </h3>
                  <p className="mt-0.5 text-[13px] tabular-nums text-text-subtle">
                    {count} {count === 1 ? "member" : "members"} ·{" "}
                    <span className="font-mono text-[12px]">{role.key}</span>
                  </p>
                </div>
                {role.key !== "super_admin" ? (
                  <span className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => editRole(role)} className="min-h-9 rounded-lg px-2.5 text-xs font-medium text-ink-700 hover:bg-ink-100 max-lg:min-h-11">
                      Edit
                    </button>
                    <button type="button" onClick={() => deleteRole(role.key)} className="min-h-9 rounded-lg px-2.5 text-xs font-medium text-danger hover:bg-danger-soft max-lg:min-h-11">
                      Delete
                    </button>
                  </span>
                ) : null}
              </div>

              {role.description ? (
                <p className="mt-3 text-[14px] leading-relaxed text-ink-700">
                  {role.description}
                </p>
              ) : null}

              <div className="mt-4 space-y-2 border-t border-ink-100 pt-4">
                {fullAccess ? (
                  <p className="flex items-center gap-2 text-[13px] font-medium tracking-[-0.01em] text-ink-700">
                    <ShieldCheck className="size-4 text-brand-700" aria-hidden />
                    Full access to everything
                  </p>
                ) : null}
                {[...byArea.entries()].map(([area, verbs]) => (
                  <div key={area} className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-medium tracking-[-0.01em] text-ink-700">
                      {area}
                    </span>
                    <span className="flex gap-1.5">
                      {verbs.map((verb) => (
                        <span
                          key={verb}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold",
                            verb === "Write"
                              ? "bg-brand-50 text-brand-800"
                              : "bg-ink-100 text-ink-600",
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "size-1 rounded-full",
                              verb === "Write" ? "bg-brand-600" : "bg-ink-400",
                            )}
                          />
                          {verb}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          );
        })}
      </div>

      {/* Provision staff sheet */}
      <Sheet open={staffModalOpen} onOpenChange={setStaffModalOpen}>
        <SheetContent side="right" className="apple-admin w-full overflow-y-auto bg-ink-50 p-0 sm:max-w-md">
          <div className="space-y-4 p-4 sm:p-6">
            <SheetHeader className="apple-panel bg-white p-5 text-left">
              <SheetTitle className="text-[17px] font-semibold tracking-[-0.02em] text-ink-900">
                Add staff
              </SheetTitle>
              <SheetDescription className="text-[13px] text-text-subtle">
                They can sign in to this console immediately.
              </SheetDescription>
            </SheetHeader>

            <form onSubmit={handleCreateStaff} className="apple-panel space-y-4 bg-white p-5">
              {staffError ? (
                <p role="alert" className="rounded-[10px] border border-danger/30 bg-danger-soft p-3 text-[13px] font-medium text-danger">
                  {staffError}
                </p>
              ) : null}

              <div>
                <label htmlFor="staff-name" className="block text-[13px] font-semibold text-ink-800">
                  Full name
                </label>
                <input
                  id="staff-name"
                  type="text"
                  required
                  value={staffName}
                  placeholder="Aarav Sharma"
                  onChange={(e) => setStaffName(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="staff-email" className="block text-[13px] font-semibold text-ink-800">
                  Email
                </label>
                <input
                  id="staff-email"
                  type="email"
                  required
                  value={staffEmail}
                  placeholder="name@findtern.in"
                  onChange={(e) => setStaffEmail(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="staff-password" className="block text-[13px] font-semibold text-ink-800">
                  Temporary password
                </label>
                <input
                  id="staff-password"
                  type="password"
                  required
                  minLength={8}
                  value={staffPassword}
                  placeholder="At least 8 characters"
                  onChange={(e) => setStaffPassword(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="staff-role" className="block text-[13px] font-semibold text-ink-800">
                  Role
                </label>
                <select
                  id="staff-role"
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value)}
                  className={inputClass}
                >
                  {rolesList.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStaffModalOpen(false)}
                  className="apple-spring apple-pressable inline-flex min-h-11 items-center rounded-[10px] px-4 text-[14px] font-medium text-ink-700 hover:bg-ink-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={staffSaving}
                  className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-brand-700 px-5 text-[14px] font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  {staffSaving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <UserPlus className="size-4" />
                  )}
                  Add staff
                </button>
              </div>
            </form>
          </div>
        </SheetContent>
      </Sheet>

      {/* Define role sheet */}
      <Sheet open={roleModalOpen} onOpenChange={setRoleModalOpen}>
        <SheetContent side="right" className="apple-admin w-full overflow-y-auto bg-ink-50 p-0 sm:max-w-lg">
          <div className="space-y-4 p-4 sm:p-6">
            <SheetHeader className="apple-panel bg-white p-5 text-left">
              <SheetTitle className="text-[17px] font-semibold tracking-[-0.02em] text-ink-900">
                {editingRole ? "Edit role" : "New role"}
              </SheetTitle>
              <SheetDescription className="text-[13px] text-text-subtle">
                Pick exactly what this profile can touch.
              </SheetDescription>
            </SheetHeader>

            <form onSubmit={handleCreateRole} className="apple-panel space-y-4 bg-white p-5">
              {roleError ? (
                <p role="alert" className="rounded-[10px] border border-danger/30 bg-danger-soft p-3 text-[13px] font-medium text-danger">
                  {roleError}
                </p>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="role-key" className="block text-[13px] font-semibold text-ink-800">
                    Key
                  </label>
                  <input
                    id="role-key"
                    type="text"
                    required
                    value={roleKey}
                    readOnly={Boolean(editingRole)}
                    placeholder="audit_lead"
                    onChange={(e) => setRoleKey(e.target.value)}
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div>
                  <label htmlFor="role-name" className="block text-[13px] font-semibold text-ink-800">
                    Display name
                  </label>
                  <input
                    id="role-name"
                    type="text"
                    required
                    value={roleName}
                    placeholder="Financial Auditor"
                    onChange={(e) => setRoleName(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <fieldset>
                <legend className="text-[13px] font-semibold text-ink-800">
                  Permissions · {selectedPerms.length} selected
                </legend>
                <div className="apple-spring mt-1.5 max-h-64 space-y-1 overflow-y-auto rounded-[10px] border border-ink-200 bg-white p-2">
                  {ALL_PERMISSIONS.map((perm) => {
                    const on = selectedPerms.includes(perm.key);
                    return (
                      <label
                        key={perm.key}
                        className={cn(
                          "apple-spring flex cursor-pointer items-start gap-3 rounded-[10px] p-2.5",
                          on ? "bg-brand-50" : "hover:bg-ink-50",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => togglePerm(perm.key)}
                          className="mt-0.5 size-5 shrink-0 accent-brand-700"
                        />
                        <span>
                          <span className="block text-[14px] font-medium tracking-[-0.01em] text-ink-900">
                            {perm.label}
                          </span>
                          <span className="block font-mono text-[12px] text-text-subtle">
                            {perm.key}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRoleModalOpen(false)}
                  className="apple-spring apple-pressable inline-flex min-h-11 items-center rounded-[10px] px-4 text-[14px] font-medium text-ink-700 hover:bg-ink-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={roleSaving}
                  className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-brand-700 px-5 text-[14px] font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  {roleSaving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Shield className="size-4" />
                  )}
                  Save role
                </button>
              </div>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
