"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { gstinStateError } from "@/lib/gst";
import { GSTIN_HINT, isGstinFormat } from "@/lib/gstin";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { ADMIN_PILL_PRIMARY } from "@/components/admin/surface";
import { useConfirm } from "@/components/app/use-confirm";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const input =
  "h-11 w-full rounded-apple-sm border border-ink-200 bg-surface px-3 text-base sm:text-sm text-ink-900 focus:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

async function send(url: string, method: string, body: unknown) {
  const res = await csrfFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const json = (await res?.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: Boolean(res?.ok), status: res?.status ?? 0, json: json ?? {} };
}

export function AddCollegeForm({ onDone }: { onDone?: () => void } = {}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exists, setExists] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3 md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const gstin = String(f.get("gstin") ?? "").trim().toUpperCase();
        const bad = gstin ? (isGstinFormat(gstin) ? gstinStateError(gstin, String(f.get("state"))) : GSTIN_HINT) : null;
        if (bad) return setError(bad);
        setBusy(true);
        setError(null);
        setExists(null);
        const r = await send("/api/admin/colleges", "POST", {
          name: f.get("name"),
          city: f.get("city"),
          state: f.get("state"),
          gstin,
          aisheCode: f.get("aishe"),
          emailDomains: String(f.get("domains") ?? "").split(/[\s,]+/).map((d) => d.replace(/^@/, "")).filter(Boolean),
          isPartner: true,
          showOnWebsite: f.get("website") === "on",
        });
        setBusy(false);
        if (!r.ok) {
          if (r.status === 409) setExists(String(f.get("aishe")).trim());
          return setError(String(r.json.error ?? "Couldn't add the college"));
        }
        (e.target as HTMLFormElement).reset();
        router.refresh();
        onDone?.();
      }}
    >
      <label className="md:col-span-2">
        <span className="text-sm font-medium text-foreground">College name</span>
        <input name="name" required minLength={3} className={cn(input, "mt-1")} placeholder="JK Lakshmipat University" />
      </label>
      <label>
        <span className="text-sm font-medium text-foreground">City</span>
        <input name="city" className={cn(input, "mt-1")} />
      </label>
      <label>
        <span className="text-sm font-medium text-foreground">State</span>
        <input name="state" className={cn(input, "mt-1")} />
      </label>
      <label>
        <span className="text-sm font-medium text-foreground">AISHE code</span>
        <input name="aishe" className={cn(input, "mt-1")} placeholder="U-0657" />
      </label>
      <label>
        <span className="text-sm font-medium text-foreground">GSTIN (optional)</span>
        <input name="gstin" className={cn(input, "mt-1 uppercase")} placeholder="08AAPFU0939F1ZV" maxLength={15} />
      </label>
      <label>
        <span className="text-sm font-medium text-foreground">Student email domains</span>
        <input name="domains" className={cn(input, "mt-1")} placeholder="jklu.edu.in" />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm text-foreground md:col-span-2">
        <input type="checkbox" name="website" className="size-4 accent-brand-700" /> Show in the website&apos;s College partners strip
      </label>
      <div className="flex items-center gap-3 md:col-span-2">
        <button disabled={busy} className={buttonClass({ className: cn(ADMIN_PILL_PRIMARY, "disabled:opacity-60") })}>
          {busy ? "Adding…" : "Add partner college"}
        </button>
        <span role="status" className="text-sm text-danger">
          {error}
        </span>
        {exists ? (
          <Link href={`/admin/colleges?q=${encodeURIComponent(exists)}`} onClick={() => onDone?.()} className="text-sm font-medium underline underline-offset-4">
            Find it and make it a partner
          </Link>
        ) : null}
      </div>
    </form>
  );
}


/** "Add college" on the list page: the form in a dialog, closed once the college is saved. */
export function AddCollegeButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass({ size: "sm", className: ADMIN_PILL_PRIMARY })}>
        Add college
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add a partner college</DialogTitle>
            <DialogDescription>Fill in what you have. The placement officer login and seat code come after the first seat batch is paid.</DialogDescription>
          </DialogHeader>
          <AddCollegeForm onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

const pill =
  "inline-flex min-h-11 cursor-pointer items-center rounded-full bg-[color:var(--admin-panel-2)] px-5 text-sm font-medium text-foreground hover:bg-[color:var(--admin-bar-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60";

/** Partner / On website / Active, in the college card. Switching Active off asks first. */
export function CollegeSwitches({ college, canEdit }: { college: { id: string; name: string; isPartner: boolean; showOnWebsite: boolean; isActive: boolean }; canEdit: boolean }) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: "isPartner" | "showOnWebsite" | "isActive", value: boolean) {
    if (key === "isActive" && !value) {
      const ok = await ask({
        title: `Deactivate ${college.name}?`,
        body: "Its officers can no longer use the college console, and it drops out of the website strip. It stays in the college list, marked Inactive.",
        confirmLabel: "Yes, deactivate",
      });
      if (!ok) return;
    }
    setError(null);
    const r = await send(`/api/admin/colleges/${college.id}`, "PATCH", { [key]: value });
    if (!r.ok) setError(String(r.json.error ?? "Couldn't save"));
    router.refresh();
  }

  const items = [
    ["isPartner", "Partner", "Has a college console", college.isPartner],
    ["showOnWebsite", "On website", "Shown in the College partners strip", college.showOnWebsite],
    ["isActive", "Active", "Officers can sign in", college.isActive],
  ] as const;
  return (
    <div className="space-y-2">
      {dialog}
      {items.map(([key, label, hint, value]) => (
        <label key={key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl bg-[color:var(--admin-panel-2)] px-4 py-2 text-foreground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:disabled]:cursor-default">
          <input type="checkbox" checked={value} disabled={!canEdit} onChange={(e) => toggle(key, e.target.checked)} className="size-4 shrink-0 accent-brand-700" />
          <span className="min-w-0 text-sm">
            <span className="block font-medium">{label}</span>
            <span className="block text-xs text-text-subtle">{hint}</span>
          </span>
        </label>
      ))}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

export type CollegeOfficer = { id: string; name: string; email: string; lastLoginAt: string | null };

/** The Logins tab: placement officers, Reset password, and Issue login (only once the first batch is paid). */
export function CollegeLogins({ collegeId, officers, hasPaidBatch, canEdit }: { collegeId: string; officers: CollegeOfficer[]; hasPaidBatch: boolean; canEdit: boolean }) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resetPassword(o: CollegeOfficer) {
    const ok = await ask({
      title: `Reset ${o.name}'s password?`,
      body: "They are signed out and the old password stops working. You get a new one to send them privately.",
      confirmLabel: "Yes, reset",
    });
    if (!ok) return;
    setError(null);
    const r = await send(`/api/admin/colleges/${collegeId}/admins/${o.id}/reset-password`, "POST", {});
    if (!r.ok) return setError(String(r.json.error ?? "Couldn't reset the password"));
    setIssued({ email: String(r.json.email), password: String(r.json.password) });
  }

  const issueForm = (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        setError(null);
        const r = await send(`/api/admin/colleges/${collegeId}/admins`, "POST", { name: f.get("name"), email: f.get("email") });
        if (!r.ok) return setError(String(r.json.error ?? "Couldn't create the login"));
        setIssued({ email: String(r.json.email), password: String(r.json.password) });
        form.reset();
        router.refresh();
      }}
    >
      <label className="min-w-40 flex-1">
        <span className="text-sm font-medium text-foreground">Officer name</span>
        <input name="name" required className={cn(input, "mt-1")} />
      </label>
      <label className="min-w-52 flex-1">
        <span className="text-sm font-medium text-foreground">Officer email</span>
        <input name="email" type="email" required className={cn(input, "mt-1")} />
      </label>
      <button className={pill}>Issue login</button>
    </form>
  );

  return (
    <div className="space-y-4">
      {dialog}
      {officers.length ? (
        <ul className="divide-y divide-[color:var(--admin-rule)]">
          {officers.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
              <div className="min-w-0 text-sm">
                <p className="font-medium text-foreground">{o.name}</p>
                <p className="text-text-subtle [overflow-wrap:anywhere]">{o.email} · {o.lastLoginAt ? `last signed in ${new Date(o.lastLoginAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : "never signed in"}</p>
              </div>
              {canEdit ? (
                <button type="button" onClick={() => resetPassword(o)} aria-label={`Reset password for ${o.name}`} className={pill}>
                  Reset password
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-subtle">No placement officer login yet.</p>
      )}
      {!canEdit ? null : !hasPaidBatch && officers.length === 0 ? (
        <p className="text-sm text-text-subtle">Awaiting first payment. The login can be issued once the first seat batch is paid (Seats tab).</p>
      ) : (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">{officers.length ? "Issue another officer login" : "Issue the officer login"}</h3>
          {issueForm}
        </div>
      )}
      <div role="status" aria-live="polite">
        {issued ? (
          <p className="rounded-[var(--radius-admin-card)] bg-success-soft px-4 py-3 text-sm text-foreground">
            Login for <strong>{issued.email}</strong>: password <code className="rounded bg-[color:var(--admin-panel)] px-1.5 py-0.5 font-mono">{issued.password}</code>. Shown once; send it privately. Sign in at /login?as=college.
          </p>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    </div>
  );
}

/**
 * The Details tab: one form for the college's own details. The API only lets partner colleges
 * change name, city and AISHE code (the directory import owns the rest), so those three are
 * read-only for a non-partner and only state and GSTIN are sent.
 */
export function CollegeDetailsForm({ college, canEdit }: { college: { id: string; name: string; city: string | null; state: string | null; gstin: string | null; aisheCode: string | null; isPartner: boolean }; canEdit: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = !college.isPartner;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const state = String(f.get("state") ?? "").trim();
        const gstin = String(f.get("gstin") ?? "").trim().toUpperCase();
        const bad = gstin ? (isGstinFormat(gstin) ? gstinStateError(gstin, state) : GSTIN_HINT) : null;
        if (bad) return setMsg({ ok: false, text: bad });
        setBusy(true);
        setMsg(null);
        const body = locked
          ? { state: state || null, gstin: gstin || null }
          : { name: f.get("name"), city: f.get("city"), state: state || null, gstin: gstin || null, aisheCode: String(f.get("aishe") ?? "").trim() || null };
        const r = await send(`/api/admin/colleges/${college.id}`, "PATCH", body);
        setBusy(false);
        if (!r.ok) return setMsg({ ok: false, text: String(r.json.error ?? "Couldn't save") });
        setMsg({ ok: true, text: "Saved" });
        router.refresh();
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <label className="md:col-span-2">
          <span className="text-sm font-medium text-foreground">College name</span>
          <input name="name" required minLength={3} defaultValue={college.name} disabled={!canEdit || locked} className={cn(input, "mt-1")} />
        </label>
        <label>
          <span className="text-sm font-medium text-foreground">City</span>
          <input name="city" defaultValue={college.city ?? ""} disabled={!canEdit || locked} className={cn(input, "mt-1")} />
        </label>
        <label>
          <span className="text-sm font-medium text-foreground">AISHE code</span>
          <input name="aishe" defaultValue={college.aisheCode ?? ""} disabled={!canEdit || locked} className={cn(input, "mt-1")} />
        </label>
        <label>
          <span className="text-sm font-medium text-foreground">State</span>
          <input name="state" defaultValue={college.state ?? ""} disabled={!canEdit} className={cn(input, "mt-1")} />
        </label>
        <label>
          <span className="text-sm font-medium text-foreground">GSTIN</span>
          <input name="gstin" defaultValue={college.gstin ?? ""} maxLength={15} disabled={!canEdit} className={cn(input, "mt-1 uppercase")} />
        </label>
      </div>
      <p className="text-sm text-text-subtle">
        State and GSTIN print on the seat invoice and decide CGST + SGST or IGST.
        {locked ? " Name, city and AISHE code can only be changed once the college is a partner." : ""}
      </p>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={busy} className={buttonClass({ className: cn(ADMIN_PILL_PRIMARY, "disabled:opacity-60") })}>{busy ? "Saving…" : "Save details"}</button>
          <p role="status" className={cn("text-sm", msg?.ok ? "text-foreground" : "text-danger")}>{msg?.text}</p>
        </div>
      ) : null}
    </form>
  );
}
