"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";

export type CollegeAdminRow = {
  id: string;
  name: string;
  city: string | null;
  aisheCode: string | null;
  emailDomains: string[];
  isPartner: boolean;
  showOnWebsite: boolean;
  isActive: boolean;
  members: number;
  roster: number;
  drives: number;
  officers: { name: string; email: string; lastLoginAt: string | null }[];
};

const input =
  "h-11 w-full rounded-apple-sm border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

async function send(url: string, method: string, body: unknown) {
  const res = await csrfFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const json = (await res?.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: Boolean(res?.ok), json: json ?? {} };
}

export function AddCollegeForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-3 md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        const r = await send("/api/admin/colleges", "POST", {
          name: f.get("name"),
          city: f.get("city"),
          state: f.get("state"),
          aisheCode: f.get("aishe"),
          emailDomains: String(f.get("domains") ?? "").split(/[\s,]+/).map((d) => d.replace(/^@/, "")).filter(Boolean),
          isPartner: true,
          showOnWebsite: f.get("website") === "on",
        });
        setBusy(false);
        if (!r.ok) return setError(String(r.json.error ?? "Couldn't add the college"));
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }}
    >
      <label className="md:col-span-2">
        <span className="text-sm font-medium text-ink-800">College name</span>
        <input name="name" required minLength={3} className={cn(input, "mt-1")} placeholder="JK Lakshmipat University" />
      </label>
      <label>
        <span className="text-sm font-medium text-ink-800">City</span>
        <input name="city" className={cn(input, "mt-1")} />
      </label>
      <label>
        <span className="text-sm font-medium text-ink-800">State</span>
        <input name="state" className={cn(input, "mt-1")} />
      </label>
      <label>
        <span className="text-sm font-medium text-ink-800">AISHE code</span>
        <input name="aishe" className={cn(input, "mt-1")} placeholder="U-0657" />
      </label>
      <label>
        <span className="text-sm font-medium text-ink-800">Student email domains</span>
        <input name="domains" className={cn(input, "mt-1")} placeholder="jklu.edu.in" />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm text-ink-800 md:col-span-2">
        <input type="checkbox" name="website" className="size-4 accent-brand-700" /> Show in the website&apos;s College partners strip
      </label>
      <div className="flex items-center gap-3 md:col-span-2">
        <button disabled={busy} className={buttonClass({ className: "disabled:opacity-60" })}>
          {busy ? "Adding…" : "Add partner college"}
        </button>
        <span role="status" className="text-sm text-danger">
          {error}
        </span>
      </div>
    </form>
  );
}

export function CollegeRowControls({ row }: { row: CollegeAdminRow }) {
  const router = useRouter();
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: "isPartner" | "showOnWebsite" | "isActive", value: boolean) {
    const r = await send(`/api/admin/colleges/${row.id}`, "PATCH", { [key]: value });
    if (!r.ok) setError(String(r.json.error ?? "Couldn't save"));
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-sm">
        {(
          [
            ["isPartner", "Partner (has a console)", row.isPartner],
            ["showOnWebsite", "On website", row.showOnWebsite],
            ["isActive", "Active", row.isActive],
          ] as const
        ).map(([key, label, value]) => (
          <label key={key} className="flex min-h-11 items-center gap-2 text-ink-800">
            <input type="checkbox" checked={value} onChange={(e) => toggle(key, e.target.checked)} className="size-4 accent-brand-700" />
            {label}
          </label>
        ))}
      </div>
      {/* Folded away once the college has an officer (an empty form sat
          under the existing one); open from the start when it has none. */}
      <details open={row.officers.length === 0} className="group">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-brand-700 hover:underline group-open:sr-only">
          Issue another officer login
        </summary>
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
          <span className="text-sm font-medium text-ink-800">Officer name</span>
          <input name="name" required className={cn(input, "mt-1")} />
        </label>
        <label className="min-w-52 flex-1">
          <span className="text-sm font-medium text-ink-800">Officer email</span>
          <input name="email" type="email" required className={cn(input, "mt-1")} />
        </label>
        <button className="inline-flex min-h-11 items-center rounded-apple-sm border border-ink-200 bg-white px-4 text-sm font-medium text-ink-800 hover:bg-ink-50">
          Issue login
        </button>
      </form>
      </details>
      <div role="status" aria-live="polite">
        {issued ? (
          <p className="rounded-apple-sm border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
            Login for <strong>{issued.email}</strong>: password <code className="rounded bg-white px-1.5 py-0.5 font-mono">{issued.password}</code>. Shown once; send it privately. Sign in at /login?as=college.
          </p>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    </div>
  );
}
