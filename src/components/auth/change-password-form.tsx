"use client";

/**
 * Change password, shared by intern settings, the employer account page and
 * the admin account page.
 *
 * Both roles have a working endpoint (`/api/users/:id/change-password` and
 * `/api/employer/:id/change-password`) that verifies the current password
 * before hashing the new one, so this form only has to gather three fields and
 * report the server's answer honestly - including "wrong current password",
 * which is the one most implementations swallow.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";

/** Where to sign in again if this browser could not keep its session. */
function loginPathFor(endpoint: string): string {
  if (endpoint.startsWith("/api/admin")) return "/admin/login";
  if (endpoint.startsWith("/api/employer")) return "/employer/login";
  return "/login";
}

export function ChangePasswordForm({
  endpoint,
  onDone,
}: {
  endpoint: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const mismatched = confirm.length > 0 && next !== confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mismatched) {
      setError("The two new passwords differ.");
      return;
    }
    setBusy(true);
    try {
      const res = await csrfFetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not change the password.");
      // The change ended every session on the account, this one included
      // (INT-26). Re-issue this browser's session with the new password so
      // only the other devices are signed out.
      const kept = await csrfFetch("/api/auth/reauth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: next }),
      }).catch(() => null);
      if (!kept?.ok) {
        window.location.assign(loginPathFor(endpoint));
        return;
      }
      setState("done");
      setCurrent("");
      setNext("");
      setConfirm("");
      onDone?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "done") {
    return (
      <p className="rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-3 text-sm leading-relaxed text-brand-800">
        Password changed. Other sessions on this account were ended.
      </p>
    );
  }

  return (
    <form className="space-y-4" noValidate onSubmit={submit}>
      {error ? (
        <p role="alert" className="rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Field
        id="current-password"
        label="Current password"
        value={current}
        onChange={setCurrent}
        type={show ? "text" : "password"}
        autoComplete="current-password"
      />
      <Field
        id="new-password"
        label="New password"
        value={next}
        onChange={setNext}
        type={show ? "text" : "password"}
        autoComplete="new-password"
        hint="At least 8 characters, with a lowercase letter, an uppercase letter, a number and a special character."
      />
      <Field
        id="confirm-password"
        label="Confirm new password"
        value={confirm}
        onChange={setConfirm}
        type={show ? "text" : "password"}
        autoComplete="new-password"
        invalid={mismatched}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || !current || !next || mismatched}
          className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Change password
        </button>
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="apple-spring inline-flex min-h-11 items-center gap-1.5 px-2 text-xs font-medium text-text-subtle underline-offset-4 hover:underline"
        >
          {show ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
          {show ? "Hide" : "Show"} passwords
        </button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type,
  autoComplete,
  hint,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
  autoComplete: string;
  hint?: string;
  invalid?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        className="apple-spring mt-1.5 min-h-11 w-full rounded-[10px] border border-ink-200 bg-white px-3.5 text-[14px] text-ink-900 outline-none focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-brand-600/20 aria-invalid:border-danger"
      />
      {hint ? <p className="mt-1.5 text-xs text-text-subtle">{hint}</p> : null}
      {invalid ? <p className="mt-1.5 text-xs text-danger">The two passwords differ.</p> : null}
    </div>
  );
}