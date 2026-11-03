"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { ADMIN_PILL_PRIMARY } from "@/components/admin/surface";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";

const field =
  "mt-1.5 min-h-11 w-full rounded-full border border-ink-300 bg-[color:var(--admin-panel)] px-4 text-base sm:text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring placeholder:text-text-subtle";

/** Name and sign-in email of the signed-in admin (ADP-23). */
export function AdminProfileForm({ name: initialName, email: initialEmail }: { name: string; email: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The input the error is about (its id), so it is marked invalid and focused. */
  const [errorField, setErrorField] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const emailChanged = email.trim().toLowerCase() !== initialEmail.trim().toLowerCase();
  const dirty = name.trim() !== initialName.trim() || emailChanged;

  const bad = (id: string) => (errorField === id ? ({ "aria-invalid": true, "aria-describedby": "admin-account-error" } as const) : {});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrorField(null);
    setSaved(false);
    try {
      const res = await csrfFetch("/api/admin/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), currentPassword: emailChanged ? password : undefined }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        const message = data?.error ?? "Not saved. Try again.";
        // Only the two failures the API names by field; anything else stays a form-level alert.
        const field = res.status === 409 ? "admin-email" : /password/i.test(message) ? "admin-current" : null;
        setError(message);
        setErrorField(field);
        if (field) document.getElementById(field)?.focus();
        return;
      }
      setSaved(true);
      setPassword("");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="admin-name" className="block text-sm font-medium text-foreground">
          Name
        </label>
        <input id="admin-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={80} className={field} />
      </div>
      <div>
        <label htmlFor="admin-email" className="block text-sm font-medium text-foreground">
          Sign-in email
        </label>
        <input id="admin-email" {...bad("admin-email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required className={field} />
      </div>
      {emailChanged ? (
        <div>
          <label htmlFor="admin-current" className="block text-sm font-medium text-foreground">
            Current password
          </label>
          <input
            id="admin-current"
            {...bad("admin-current")}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className={field}
          />
          <p className="mt-1 text-xs text-text-subtle">Needed because the email is how you sign in.</p>
        </div>
      ) : null}
      {error ? (
        <p id="admin-account-error" role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-sm font-medium text-success">
          Saved.
        </p>
      ) : null}
      <button type="submit" disabled={busy || !dirty} className={buttonClass({ variant: "primary", size: "sm", className: ADMIN_PILL_PRIMARY })}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Save changes
      </button>
    </form>
  );
}
