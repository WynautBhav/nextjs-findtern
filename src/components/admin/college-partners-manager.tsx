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

export type CollegeAdminRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  gstin: string | null;
  aisheCode: string | null;
  /** Findtern college code students search by. */
  code: string | null;
  emailDomains: string[];
  isPartner: boolean;
  showOnWebsite: boolean;
  isActive: boolean;
  members: number;
  roster: number;
  drives: number;
  /** True once any seat batch is paid: the TPO login and the code are issued only after that. */
  hasPaidBatch: boolean;
  /** A withdrawal request is waiting for admin. */
  openRequest: boolean;
  /** The TPO's seat code and its seats (cap = paid seats); null until the first batch is paid. */
  seatCode: { code: string; maxUsages: number | null; usedCount: number } | null;
  officers: { id: string; name: string; email: string; lastLoginAt: string | null }[];
};

const input =
  "h-11 w-full rounded-apple-sm border border-ink-200 bg-surface px-3 text-base sm:text-sm text-ink-900 focus:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

async function send(url: string, method: string, body: unknown) {
  const res = await csrfFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const json = (await res?.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: Boolean(res?.ok), status: res?.status ?? 0, json: json ?? {} };
}

export function AddCollegeForm() {
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
          <Link href={`/admin/colleges?q=${encodeURIComponent(exists)}`} className="text-sm font-medium underline underline-offset-4">
            Find it and make it a partner
          </Link>
        ) : null}
      </div>
    </form>
  );
}

/** The college page's billing details: state and GSTIN for the tax invoice. */
export function BillingForm({ collegeId, state, gstin, canEdit }: { collegeId: string; state: string | null; gstin: string | null; canEdit: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const st = String(f.get("state") ?? "").trim();
        const g = String(f.get("gstin") ?? "").trim().toUpperCase();
        const bad = g ? (isGstinFormat(g) ? gstinStateError(g, st) : GSTIN_HINT) : null;
        if (bad) return setMsg({ ok: false, text: bad });
        const r = await send(`/api/admin/colleges/${collegeId}`, "PATCH", { state: st || null, gstin: g || null });
        if (!r.ok) return setMsg({ ok: false, text: String(r.json.error ?? "Couldn't save") });
        setMsg({ ok: true, text: "Saved" });
        router.refresh();
      }}
    >
      <label className="min-w-40 flex-1">
        <span className="text-sm font-medium text-foreground">State</span>
        <input name="state" defaultValue={state ?? ""} disabled={!canEdit} className={cn(input, "mt-1")} />
      </label>
      <label className="min-w-52 flex-1">
        <span className="text-sm font-medium text-foreground">GSTIN</span>
        <input name="gstin" defaultValue={gstin ?? ""} maxLength={15} disabled={!canEdit} className={cn(input, "mt-1 uppercase")} />
      </label>
      {canEdit ? <button className={buttonClass({ className: ADMIN_PILL_PRIMARY })}>Save billing details</button> : null}
      <p role="status" className={cn("w-full text-sm", msg?.ok ? "text-foreground" : "text-danger")}>{msg?.text}</p>
    </form>
  );
}

export function ContactsForm({ collegeId, contact, canEdit }: { collegeId: string; contact: { name: string | null; email: string | null; phone: string | null; address: string | null }; canEdit: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fields = [
    { name: "contactName", label: "Contact person", value: contact.name, type: "text", autoComplete: "name" },
    { name: "contactEmail", label: "Contact email", value: contact.email, type: "email", autoComplete: "email" },
    { name: "contactPhone", label: "Contact phone", value: contact.phone, type: "tel", autoComplete: "tel" },
  ] as const;
  return (
    <form
      className="grid gap-3 md:grid-cols-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const body = Object.fromEntries(["contactName", "contactEmail", "contactPhone", "address"].map((k) => [k, String(f.get(k) ?? "").trim() || null]));
        const r = await send(`/api/admin/colleges/${collegeId}`, "PATCH", body);
        if (!r.ok) return setMsg({ ok: false, text: String(r.json.error ?? "Couldn't save") });
        setMsg({ ok: true, text: "Saved" });
        router.refresh();
      }}
    >
      {fields.map((x) => (
        <label key={x.name}>
          <span className="text-sm font-medium text-foreground">{x.label}</span>
          <input name={x.name} type={x.type} autoComplete={x.autoComplete} defaultValue={x.value ?? ""} disabled={!canEdit} maxLength={x.name === "contactEmail" ? 254 : 120} className={cn(input, "mt-1")} />
        </label>
      ))}
      <label className="md:col-span-3">
        <span className="text-sm font-medium text-foreground">Address</span>
        <textarea name="address" defaultValue={contact.address ?? ""} disabled={!canEdit} maxLength={500} rows={2} className={cn(input, "mt-1 h-auto py-2")} />
      </label>
      <div className="flex flex-wrap items-center gap-3 md:col-span-3">
        {canEdit ? <button className={buttonClass({ className: ADMIN_PILL_PRIMARY })}>Save contact details</button> : null}
        <p role="status" className={cn("text-sm", msg?.ok ? "text-foreground" : "text-danger")}>{msg?.text}</p>
      </div>
    </form>
  );
}

/** `canEdit`: companies:write (the college routes). Seats and the code are managed on the college page. */
export function CollegeRowControls({ row, canEdit }: { row: CollegeAdminRow; canEdit: boolean }) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: "isPartner" | "showOnWebsite" | "isActive", value: boolean) {
    if (key === "isActive" && !value) {
      const ok = await ask({
        title: `Deactivate ${row.name}?`,
        body: "Its officers can no longer use the college console, and it drops out of the website strip and the college list.",
        confirmLabel: "Yes, deactivate",
      });
      if (!ok) return;
    }
    const r = await send(`/api/admin/colleges/${row.id}`, "PATCH", { [key]: value });
    if (!r.ok) setError(String(r.json.error ?? "Couldn't save"));
    router.refresh();
  }

  async function resetPassword(o: CollegeAdminRow["officers"][number]) {
    const ok = await ask({
      title: `Reset ${o.name}'s password?`,
      body: "They are signed out and the old password stops working. You get a new one to send them privately.",
      confirmLabel: "Yes, reset",
    });
    if (!ok) return;
    setError(null);
    const r = await send(`/api/admin/colleges/${row.id}/admins/${o.id}/reset-password`, "POST", {});
    if (!r.ok) return setError(String(r.json.error ?? "Couldn't reset the password"));
    setIssued({ email: String(r.json.email), password: String(r.json.password) });
  }

  const issueForm = (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setError(null);
        const r = await send(`/api/admin/colleges/${row.id}/admins`, "POST", { name: f.get("name"), email: f.get("email") });
        if (!r.ok) return setError(String(r.json.error ?? "Couldn't create the login"));
        setIssued({ email: String(r.json.email), password: String(r.json.password) });
        (e.target as HTMLFormElement).reset();
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
      <button className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-[color:var(--admin-panel-2)] px-5 text-sm font-medium text-foreground hover:bg-[color:var(--admin-bar-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        Issue login
      </button>
    </form>
  );

  return (
    <div className="space-y-3">
      {dialog}
      <div className="flex flex-wrap gap-2 text-sm">
        {(
          [
            ["isPartner", "Partner (has a console)", row.isPartner],
            ["showOnWebsite", "On website", row.showOnWebsite],
            ["isActive", "Active", row.isActive],
          ] as const
        ).map(([key, label, value]) => (
          <label key={key} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-[color:var(--admin-panel-2)] px-4 text-foreground hover:bg-[color:var(--admin-bar-tint)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring">
            <input type="checkbox" checked={value} disabled={!canEdit} onChange={(e) => toggle(key, e.target.checked)} className="size-4 accent-brand-700" />
            {label}
          </label>
        ))}
      </div>
      {row.officers.map((o) => (
        <div key={o.id} className="flex flex-wrap items-center gap-x-3 text-sm text-foreground">
          <span>{o.name} · {o.email}</span>
          {canEdit ? <button type="button" onClick={() => resetPassword(o)} aria-label={`Reset password for ${o.name}`} className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-[color:var(--admin-panel-2)] px-5 text-sm font-medium text-foreground hover:bg-[color:var(--admin-bar-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Reset password
          </button> : null}
        </div>
      ))}
      {/* Folded away once the college has an officer (an empty form sat
          under the existing one); shown outright when it has none. The summary
          stays visible while open: hiding it left a focusable control nobody
          could see. */}
      {!canEdit ? null : row.officers.length === 0 && !row.hasPaidBatch ? (
        <p className="text-sm text-text-subtle">Awaiting first payment. The placement officer login is issued once the first seat batch is paid.</p>
      ) : row.officers.length === 0 ? (
        issueForm
      ) : (
        <details>
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-full bg-[color:var(--admin-panel-2)] px-5 text-sm font-medium text-foreground hover:bg-[color:var(--admin-bar-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Issue another officer login
          </summary>
          <div className="pt-2">{issueForm}</div>
        </details>
      )}
      {row.isPartner ? (
        <p className="text-sm text-foreground">
          {row.seatCode ? (
            <>Seat code <code className="rounded bg-[color:var(--admin-panel)] px-1.5 py-0.5 font-mono">{row.seatCode.code}</code> · {row.seatCode.usedCount} used of {row.seatCode.maxUsages ?? 0} paid seats</>
          ) : (
            "Awaiting first payment. The seat code is activated once the first seat batch is paid."
          )}
        </p>
      ) : null}
      {row.isPartner && canEdit && <details>
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-full bg-[color:var(--admin-panel-2)] px-5 text-sm font-medium text-foreground hover:bg-[color:var(--admin-bar-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          Edit name, city, state, GSTIN, AISHE code
        </summary>
        <form
          className="flex flex-wrap items-end gap-2 pt-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setError(null);
            const state = String(f.get("state") ?? "").trim();
            const gstin = String(f.get("gstin") ?? "").trim().toUpperCase();
            const bad = gstin ? (isGstinFormat(gstin) ? gstinStateError(gstin, state) : GSTIN_HINT) : null;
            if (bad) return setError(bad);
            const r = await send(`/api/admin/colleges/${row.id}`, "PATCH", { name: f.get("name"), city: f.get("city"), state: state || null, gstin: gstin || null, aisheCode: String(f.get("aishe") ?? "").trim() || null });
            if (!r.ok) return setError(String(r.json.error ?? "Couldn't save"));
            router.refresh();
          }}
        >
          <label className="min-w-52 flex-1">
            <span className="text-sm font-medium text-foreground">College name</span>
            <input name="name" required minLength={3} defaultValue={row.name} className={cn(input, "mt-1")} />
          </label>
          <label className="min-w-32 flex-1">
            <span className="text-sm font-medium text-foreground">City</span>
            <input name="city" defaultValue={row.city ?? ""} className={cn(input, "mt-1")} />
          </label>
          <label className="min-w-32 flex-1">
            <span className="text-sm font-medium text-foreground">State</span>
            <input name="state" defaultValue={row.state ?? ""} className={cn(input, "mt-1")} />
          </label>
          <label className="min-w-40 flex-1">
            <span className="text-sm font-medium text-foreground">GSTIN</span>
            <input name="gstin" defaultValue={row.gstin ?? ""} maxLength={15} className={cn(input, "mt-1 uppercase")} />
          </label>
          <label className="min-w-32 flex-1">
            <span className="text-sm font-medium text-foreground">AISHE code</span>
            <input name="aishe" defaultValue={row.aisheCode ?? ""} className={cn(input, "mt-1")} />
          </label>
          <button className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-[color:var(--admin-panel-2)] px-5 text-sm font-medium text-foreground hover:bg-[color:var(--admin-bar-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Save
          </button>
        </form>
      </details>}
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
