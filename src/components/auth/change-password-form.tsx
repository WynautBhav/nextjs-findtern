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

import { Label, FieldNote, controlClass, describedBy } from "@/components/intern/onboarding/fields";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import { PASSWORD_HINT } from "@/lib/password-policy";

/** Where to sign in again if this browser could not keep its session. */
function loginPathFor(endpoint: string): string {
  if (endpoint.startsWith("/api/admin")) return "/admin/login";
  if (endpoint.startsWith("/api/employer")) return "/login?as=employer";
  return "/login?as=intern";
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

  const done = state === "done";

  return (
    <>
      {/* Mounted from the start, so the success note is announced when it fills in. */}
      <p
        role="status"
        className={cn(done && "rounded-apple-sm border border-brand-200 bg-brand-50 px-3.5 py-3 text-sm leading-relaxed text-brand-800")}
      >
        {done ? "Password changed. Other sessions on this account were ended." : null}
      </p>
      {done ? null : (
    <form className="space-y-4" noValidate onSubmit={submit}>
      <div role="alert">
        {error ? (
          <p className="rounded-apple-sm border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm text-danger">{error}</p>
        ) : null}
      </div>

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
        hint={PASSWORD_HINT}
      />
      <Field
        id="confirm-password"
        label="Confirm new password"
        value={confirm}
        onChange={setConfirm}
        type={show ? "text" : "password"}
        autoComplete="new-password"
        error={mismatched ? "The two passwords differ." : undefined}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || !current || !next || mismatched}
          className={buttonClass({ variant: "primary", size: "md", className: "text-sm font-semibold" })}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Change password
        </button>
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-pressed={show}
          className={buttonClass({ variant: "ghost", size: "sm", className: "text-sm" })}
        >
          {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          Show passwords
        </button>
      </div>
    </form>
      )}
    </>
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
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
  autoComplete: string;
  hint?: string;
  error?: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={controlClass(error, "mt-1.5 sm:text-base")}
      />
      <FieldNote id={id} error={error} hint={hint} />
    </div>
  );
}
