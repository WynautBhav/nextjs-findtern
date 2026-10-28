"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Pencil, Plus, Trash2, UserPlus } from "lucide-react";

import { PERMISSIONS } from "@/lib/admin/permissions";
import { csrfFetch } from "@/lib/client-fetch";
import type { Admin } from "@/lib/db/schema";
import { Panel, PanelHeader } from "@/components/admin/panel";
import { Pill } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { PASSWORD_HINT } from "@/lib/password-policy";

const AREA_LABEL: Record<string, string> = {
  dashboard: "Dashboard",
  users: "Registered users",
  interns: "Candidates",
  companies: "Employers",
  transactions: "Finance",
  reports: "Reports",
  cms: "Website content",
  contact: "Messages",
  notifications: "Notifications",
  roles: "Staff and roles",
};

/** Permission rows grouped by area, in catalog order. */
const AREAS: { area: string; perms: (typeof PERMISSIONS)[number][] }[] = (() => {
  const out: { area: string; perms: (typeof PERMISSIONS)[number][] }[] = [];
  for (const p of PERMISSIONS) {
    const area = AREA_LABEL[p.key.split(":")[0]] ?? p.key.split(":")[0];
    const group = out.find((g) => g.area === area);
    if (group) group.perms.push(p);
    else out.push({ area, perms: [p] });
  }
  return out;
})();

export interface RoleDef {
  key: string;
  name: string;
  permissions: string[] | unknown;
}

type Staff = Omit<Admin, "password">;

const field =
  "mt-1.5 min-h-11 w-full rounded-apple-sm border border-ink-200 bg-white px-3.5 text-sm text-ink-900 outline-none placeholder:text-text-subtle focus-visible:border-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500/20";

const permsOf = (r: RoleDef): string[] => (Array.isArray(r.permissions) ? (r.permissions as string[]) : []);

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; error?: string; data?: Record<string, unknown> }> {
  try {
    const res = await csrfFetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
    return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? `Not saved (HTTP ${res.status})` };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
}

/**
 * Staff and roles (DESIGN.md §6.6): who can sign in, and an editable
 * permissions matrix, one column per role. Ticks are staged locally and saved
 * per role; the server refuses anything outside the editor's own access and
 * its message is shown as is.
 */
export function StaffRolesManager({
  initialStaff,
  initialRoles,
  currentAdminId,
}: {
  initialStaff: Staff[];
  initialRoles: RoleDef[];
  currentAdminId: string | null;
}) {
  const router = useRouter();
  const [staff, setStaff] = useState<Staff[]>(initialStaff);
  const [roles, setRoles] = useState<RoleDef[]>(initialRoles);
  const [seen, setSeen] = useState({ initialStaff, initialRoles });
  if (seen.initialStaff !== initialStaff || seen.initialRoles !== initialRoles) {
    setSeen({ initialStaff, initialRoles });
    setStaff(initialStaff);
    setRoles(initialRoles);
  }

  // Staged matrix edits: role key → permission list.
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [matrixBusy, setMatrixBusy] = useState(false);
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [matrixSaved, setMatrixSaved] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffNote, setStaffNote] = useState<string | null>(null);

  const [staffSheet, setStaffSheet] = useState(false);
  const [roleSheet, setRoleSheet] = useState<{ mode: "new" } | { mode: "rename"; key: string } | null>(null);

  const editable = roles.filter((r) => r.key !== "super_admin");
  const dirtyKeys = Object.keys(draft).filter((key) => {
    const role = roles.find((r) => r.key === key);
    if (!role) return false;
    const a = [...permsOf(role)].sort().join(",");
    const b = [...draft[key]].sort().join(",");
    return a !== b;
  });
  const members = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of staff) m.set(s.role ?? "", (m.get(s.role ?? "") ?? 0) + 1);
    return m;
  }, [staff]);

  function current(role: RoleDef): string[] {
    return draft[role.key] ?? permsOf(role);
  }

  function toggle(role: RoleDef, perm: string) {
    setMatrixSaved(null);
    const list = current(role);
    let next = list.includes(perm) ? list.filter((p) => p !== perm) : [...list, perm];
    // Write implies read, as in legacy: ticking "Handle" ticks "Read" too.
    if (!list.includes(perm) && perm.endsWith(":write")) {
      const read = perm.replace(/:write$/, ":read");
      if (PERMISSIONS.some((p) => p.key === read) && !next.includes(read)) next = [...next, read];
    }
    setDraft((prev) => ({ ...prev, [role.key]: next }));
  }

  async function saveMatrix() {
    setMatrixBusy(true);
    setMatrixError(null);
    const failed: string[] = [];
    const saved: string[] = [];
    for (const key of dirtyKeys) {
      const result = await call(`/api/admin/roles/${encodeURIComponent(key)}`, "PUT", { permissions: draft[key] });
      const name = roles.find((r) => r.key === key)?.name ?? key;
      if (result.ok) saved.push(key);
      else failed.push(`${name}: ${result.error}`);
    }
    setRoles((prev) => prev.map((r) => (saved.includes(r.key) ? { ...r, permissions: draft[r.key] } : r)));
    setDraft((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !saved.includes(k))));
    setMatrixBusy(false);
    if (failed.length) setMatrixError(failed.join(" "));
    if (saved.length) {
      setMatrixSaved(`Saved ${saved.length} ${saved.length === 1 ? "role" : "roles"}. Staff get the change within a minute.`);
      router.refresh();
    }
  }

  async function updateStaff(id: string, body: { role?: string; password?: string }) {
    setBusyId(id);
    setStaffError(null);
    setStaffNote(null);
    const result = await call("/api/admin/staff", "PATCH", { id, ...body });
    setBusyId(null);
    if (!result.ok) {
      setStaffError(result.error ?? "Not saved.");
      return;
    }
    if (body.role) setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, role: body.role! } : s)));
    if (body.password) setStaffNote("Password updated. Share it with them securely; they can change it under Your account.");
  }

  async function removeStaff(s: Staff) {
    if (!window.confirm(`Revoke console access for ${s.email}? They are signed out at their next request.`)) return;
    setBusyId(s.id);
    setStaffError(null);
    const result = await call("/api/admin/staff", "DELETE", { id: s.id });
    setBusyId(null);
    if (!result.ok) {
      setStaffError(result.error ?? "Not removed.");
      return;
    }
    setStaff((prev) => prev.filter((x) => x.id !== s.id));
    router.refresh();
  }

  async function deleteRole(role: RoleDef) {
    if (!window.confirm(`Delete the role "${role.name}"?`)) return;
    setMatrixError(null);
    const result = await call(`/api/admin/roles/${encodeURIComponent(role.key)}`, "DELETE");
    if (!result.ok) {
      setMatrixError(`${role.name}: ${result.error}`);
      return;
    }
    setRoles((prev) => prev.filter((r) => r.key !== role.key));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Staff */}
      <Panel>
        <PanelHeader
          title="Staff"
          description={`${staff.length} ${staff.length === 1 ? "person" : "people"} can sign in to this console. Change a role from the list; it applies within a minute.`}
          action={
            <button type="button" onClick={() => setStaffSheet(true)} className={buttonClass({ variant: "primary", size: "sm" })}>
              <UserPlus className="size-4" aria-hidden />
              Add staff
            </button>
          }
        />
        {staffError ? (
          <p role="alert" className="border-b border-danger/20 bg-danger-soft px-5 py-2.5 text-sm font-medium text-danger">
            {staffError}
          </p>
        ) : null}
        {staffNote ? (
          <p role="status" className="border-b border-brand-100 bg-brand-50 px-5 py-2.5 text-sm font-medium text-brand-800">
            {staffNote}
          </p>
        ) : null}
        <ul className="divide-y divide-ink-100">
          {staff.map((s) => {
            const self = s.id === currentAdminId;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
                  {(s.name || s.email).charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-auto">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[0.9375rem] font-medium text-ink-900">{s.name || "Staff member"}</span>
                    {self ? <Pill tone="new">You</Pill> : null}
                  </span>
                  <span className="block truncate text-sm text-ink-600">{s.email}</span>
                </span>
                <label className="sr-only" htmlFor={`role-${s.id}`}>
                  Role for {s.email}
                </label>
                <select
                  id={`role-${s.id}`}
                  value={s.role ?? ""}
                  disabled={busyId === s.id || self}
                  title={self ? "You can't change your own role" : undefined}
                  onChange={(e) => updateStaff(s.id, { role: e.target.value })}
                  className="h-9 min-w-0 flex-1 rounded-apple-sm border border-ink-200 bg-white px-2.5 text-sm text-ink-800 disabled:opacity-60 max-lg:h-11 sm:w-48 sm:flex-none"
                >
                  {roles.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name}
                    </option>
                  ))}
                </select>
                {!self ? (
                  <>
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() => {
                        const pw = window.prompt(`New password for ${s.email}. ${PASSWORD_HINT}`);
                        if (pw) void updateStaff(s.id, { password: pw });
                      }}
                      className={buttonClass({ variant: "ghost", size: "sm" })}
                    >
                      <KeyRound className="size-4" aria-hidden />
                      Reset password
                    </button>
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() => removeStaff(s)}
                      aria-label={`Revoke access for ${s.email}`}
                      className={cn(buttonClass({ variant: "ghost", size: "iconSm" }), "text-ink-600 hover:bg-danger-soft hover:text-danger max-lg:size-11")}
                    >
                      {busyId === s.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
                    </button>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Panel>

      {/* Permissions matrix */}
      <Panel>
        <PanelHeader
          title="What each role can do"
          description="Tick to grant, untick to take away, then save. Read lets staff see an area; Handle or Edit lets them change it. Super admin always has everything."
          action={
            <button type="button" onClick={() => setRoleSheet({ mode: "new" })} className={buttonClass({ variant: "outline", size: "sm" })}>
              <Plus className="size-4" aria-hidden />
              New role
            </button>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Permissions by role</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 border-b border-ink-100 bg-ink-50 px-4 py-2.5 text-left text-xs font-semibold text-ink-600">
                  Permission
                </th>
                {roles.map((r) => (
                  <th key={r.key} scope="col" className="min-w-36 border-b border-ink-100 bg-ink-50 px-3 py-2.5 text-center align-bottom">
                    <span className="block text-sm font-semibold text-ink-900">{r.name}</span>
                    <span className="nums block text-xs font-normal text-ink-600">
                      {members.get(r.key) ?? 0} {(members.get(r.key) ?? 0) === 1 ? "person" : "people"}
                    </span>
                    {r.key !== "super_admin" ? (
                      <span className="mt-1 flex justify-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setRoleSheet({ mode: "rename", key: r.key })}
                          aria-label={`Rename ${r.name}`}
                          className={cn(buttonClass({ variant: "ghost", size: "iconSm" }), "size-8 max-lg:size-11")}
                        >
                          <Pencil className="size-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteRole(r)}
                          aria-label={`Delete ${r.name}`}
                          className={cn(buttonClass({ variant: "ghost", size: "iconSm" }), "size-8 text-ink-600 hover:bg-danger-soft hover:text-danger max-lg:size-11")}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
                      </span>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AREAS.map((group) => (
                <Fragment key={group.area}>
                  <tr>
                    <th
                      scope="rowgroup"
                      colSpan={roles.length + 1}
                      className="border-b border-ink-100 bg-white px-4 pt-4 pb-1.5 text-left text-xs font-semibold text-ink-900"
                    >
                      {group.area}
                    </th>
                  </tr>
                  {group.perms.map((perm) => (
                    <tr key={perm.key} className="hover:bg-ink-50/60">
                      <th scope="row" className="sticky left-0 z-10 border-b border-ink-100 bg-white px-4 py-2 text-left font-normal text-ink-700">
                        {perm.label}
                      </th>
                      {roles.map((r) => {
                        const all = permsOf(r).includes("*");
                        const on = all || current(r).includes(perm.key);
                        const changed = draft[r.key] !== undefined && permsOf(r).includes(perm.key) !== on;
                        return (
                          <td key={r.key} className={cn("border-b border-ink-100 px-3 py-1 text-center", changed && "bg-accent-100/60")}>
                            <label className="inline-flex size-11 cursor-pointer items-center justify-center lg:size-9">
                              <input
                                type="checkbox"
                                checked={on}
                                disabled={all || matrixBusy}
                                onChange={() => toggle(r, perm.key)}
                                aria-label={`${r.name}: ${perm.label}`}
                                className="size-4 accent-brand-700 disabled:opacity-60"
                              />
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-ink-100 bg-white/95 px-5 py-3 backdrop-blur-sm">
          <p className="min-w-0 flex-1 text-sm text-ink-600" role="status">
            {matrixSaved ??
              (dirtyKeys.length
                ? `Unsaved changes on ${dirtyKeys.map((k) => roles.find((r) => r.key === k)?.name ?? k).join(", ")}.`
                : editable.length
                  ? "No unsaved changes."
                  : "Only the super admin role exists. Add a role to give staff narrower access.")}
          </p>
          <button
            type="button"
            disabled={!dirtyKeys.length || matrixBusy}
            onClick={() => {
              setDraft({});
              setMatrixError(null);
            }}
            className={buttonClass({ variant: "ghost", size: "sm" })}
          >
            Discard
          </button>
          <button type="button" disabled={!dirtyKeys.length || matrixBusy} onClick={saveMatrix} className={buttonClass({ variant: "primary", size: "sm" })}>
            {matrixBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Save changes
          </button>
          {matrixError ? (
            <p role="alert" className="w-full text-sm font-medium text-danger">
              {matrixError}
            </p>
          ) : null}
        </div>
      </Panel>

      <AddStaffSheet
        open={staffSheet}
        onOpenChange={setStaffSheet}
        roles={roles}
        onCreated={(s) => {
          setStaff((prev) => [s, ...prev]);
          router.refresh();
        }}
      />
      <RoleSheet
        state={roleSheet}
        roles={roles}
        onClose={() => setRoleSheet(null)}
        onSaved={(role, created) => {
          setRoles((prev) => (created ? [...prev, role] : prev.map((r) => (r.key === role.key ? { ...r, name: role.name } : r))));
          setRoleSheet(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function AddStaffSheet({
  open,
  onOpenChange,
  roles,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roles: RoleDef[];
  onCreated: (s: Staff) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(roles.find((r) => r.key !== "super_admin")?.key ?? roles[0]?.key ?? "admin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await call("/api/admin/staff", "POST", { name: name.trim(), email: email.trim(), password, role });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Not created.");
      return;
    }
    onCreated(result.data?.staff as Staff);
    setName("");
    setEmail("");
    setPassword("");
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-md">
        <form onSubmit={submit} className="space-y-4 p-5 sm:p-6">
          <SheetHeader className="p-0 text-left">
            <SheetTitle className="text-lg font-semibold text-ink-900">Add staff</SheetTitle>
            <SheetDescription className="text-sm text-ink-600">They can sign in to this console straight away with the email and password below.</SheetDescription>
          </SheetHeader>
          <div>
            <label htmlFor="staff-name" className="block text-sm font-medium text-ink-800">
              Full name
            </label>
            <input id="staff-name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="staff-email" className="block text-sm font-medium text-ink-800">
              Email
            </label>
            <input id="staff-email" type="email" required value={email} placeholder="name@findtern.in" onChange={(e) => setEmail(e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="staff-password" className="block text-sm font-medium text-ink-800">
              Temporary password
            </label>
            <input id="staff-password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
            <p className="mt-1 text-xs text-ink-600">{PASSWORD_HINT}</p>
          </div>
          <div>
            <label htmlFor="staff-role" className="block text-sm font-medium text-ink-800">
              Role
            </label>
            <select id="staff-role" value={role} onChange={(e) => setRole(e.target.value)} className={field}>
              {roles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => onOpenChange(false)} className={buttonClass({ variant: "ghost", size: "sm" })}>
              Cancel
            </button>
            <button type="submit" disabled={busy} className={buttonClass({ variant: "primary", size: "sm" })}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <UserPlus className="size-4" aria-hidden />}
              Add staff
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function RoleSheet({
  state,
  roles,
  onClose,
  onSaved,
}: {
  state: { mode: "new" } | { mode: "rename"; key: string } | null;
  roles: RoleDef[];
  onClose: () => void;
  onSaved: (role: RoleDef, created: boolean) => void;
}) {
  const renaming = state?.mode === "rename" ? roles.find((r) => r.key === state.key) ?? null : null;
  const [name, setName] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<typeof state>(null);
  if (opened !== state) {
    setOpened(state);
    setName(renaming?.name ?? "");
    setCopyFrom("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (renaming) {
      const result = await call(`/api/admin/roles/${encodeURIComponent(renaming.key)}`, "PUT", { name: name.trim() });
      setBusy(false);
      if (!result.ok) return setError(result.error ?? "Not saved.");
      onSaved({ ...renaming, name: name.trim() }, false);
      return;
    }
    const key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const permissions = copyFrom ? permsOf(roles.find((r) => r.key === copyFrom) ?? { key: "", name: "", permissions: [] }).filter((p) => p !== "*") : [];
    const result = await call("/api/admin/roles", "POST", { key, name: name.trim(), permissions });
    setBusy(false);
    if (!result.ok) return setError(result.error ?? "Not created.");
    onSaved({ key, name: name.trim(), permissions }, true);
  }

  return (
    <Sheet open={Boolean(state)} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-md">
        <form onSubmit={submit} className="space-y-4 p-5 sm:p-6">
          <SheetHeader className="p-0 text-left">
            <SheetTitle className="text-lg font-semibold text-ink-900">{renaming ? "Rename role" : "New role"}</SheetTitle>
            <SheetDescription className="text-sm text-ink-600">
              {renaming ? "Staff in this role keep their access." : "Name it, optionally copy another role's access, then adjust the ticks in the table."}
            </SheetDescription>
          </SheetHeader>
          <div>
            <label htmlFor="role-name" className="block text-sm font-medium text-ink-800">
              Name
            </label>
            <input id="role-name" required minLength={2} maxLength={60} value={name} placeholder="Finance executive" onChange={(e) => setName(e.target.value)} className={field} />
          </div>
          {!renaming ? (
            <div>
              <label htmlFor="role-copy" className="block text-sm font-medium text-ink-800">
                Start from
              </label>
              <select id="role-copy" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className={field}>
                <option value="">No access (tick what it needs)</option>
                {roles
                  .filter((r) => r.key !== "super_admin")
                  .map((r) => (
                    <option key={r.key} value={r.key}>
                      Same as {r.name}
                    </option>
                  ))}
              </select>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={buttonClass({ variant: "ghost", size: "sm" })}>
              Cancel
            </button>
            <button type="submit" disabled={busy || name.trim().length < 2} className={buttonClass({ variant: "primary", size: "sm" })}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {renaming ? "Save name" : "Create role"}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
