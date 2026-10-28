"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";

const field =
  "mt-1.5 min-h-11 w-full rounded-apple-sm border border-ink-200 bg-white px-3.5 text-sm text-ink-900 outline-none placeholder:text-text-subtle focus-visible:border-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500/20";

/** Name and sign-in email of the signed-in admin (ADP-23). */
export function AdminProfileForm({ name: initialName, email: initialEmail }: { name: string; email: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const emailChanged = email.trim().toLowerCase() !== initialEmail.trim().toLowerCase();
  const dirty = name.trim() !== initialName.trim() || emailChanged;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await csrfFetch("/api/admin/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), currentPassword: emailChanged ? password : undefined }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Not saved. Try again.");
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
        <label htmlFor="admin-name" className="block text-sm font-medium text-ink-800">
          Name
        </label>
        <input id="admin-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={80} className={field} />
      </div>
      <div>
        <label htmlFor="admin-email" className="block text-sm font-medium text-ink-800">
          Sign-in email
        </label>
        <input id="admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required className={field} />
      </div>
      {emailChanged ? (
        <div>
          <label htmlFor="admin-current" className="block text-sm font-medium text-ink-800">
            Current password
          </label>
          <input
            id="admin-current"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className={field}
          />
          <p className="mt-1 text-xs text-ink-600">Needed because the email is how you sign in.</p>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-sm font-medium text-brand-700">
          Saved.
        </p>
      ) : null}
      <button type="submit" disabled={busy || !dirty} className={buttonClass({ variant: "primary", size: "sm" })}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Save changes
      </button>
    </form>
  );
}
