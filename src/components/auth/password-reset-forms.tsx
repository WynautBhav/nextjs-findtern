"use client";

import { useState } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { PASSWORD_HINT } from "@/lib/password-policy";

/**
 * Password reset forms.
 *
 * Both POST to real endpoints - `/api/auth/forgot-password` and
 * `/api/auth/reset-password` - which write `password_reset_tokens`, mail a
 * single-use link through `sendSmtpMail`, and hash the new password with the
 * same `hashPassword` the login routes verify against.
 *
 * `role` selects which account table the token is issued against (interns live
 * in `users`, employers in `employers`) and which reset page the emailed link
 * points back to. It defaults to intern so the existing pages are unchanged.
 * Note: neither endpoint is session-guarded, so these forms use plain `fetch`
 * rather than `csrfFetch` - there is no session cookie to protect and no
 * double-submit to satisfy.
 */

export function ForgotPasswordForm({ role = "intern" }: { role?: "intern" | "employer" }) {
  const loginHref = `/login?as=${role}`;
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to send reset email");
      } else {
        setSent(true);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-5" noValidate onSubmit={onSubmit}>
      {sent ? (
        <Notice>If an account exists for that email, a reset link has been sent.</Notice>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink-800">
          Account email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@gmail.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 outline-none transition-[border-color,box-shadow] placeholder:text-ink-500 focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-brand-600/20"
        />
      </div>

      <button
        type="submit"
        disabled={loading || !email}
        className="h-11 w-full rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:pointer-events-none disabled:opacity-60"
      >
        {loading ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-center text-xs text-text-subtle">
        <Link
          href={loginHref}
          className="font-medium text-brand-700 underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({
  token,
  role = "intern",
}: {
  token: string | null;
  role?: "intern" | "employer";
}) {
  const loginHref = `/login?as=${role}`;
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatched = confirm.length > 0 && password !== confirm;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mismatched) { setError("Passwords do not match"); return; }
    if (!token) { setError("Missing token"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "Reset failed");
      else setDone(true);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-5" noValidate onSubmit={onSubmit}>
      {done ? (
        <Notice>
          Password updated.{" "}
          <Link href={loginHref} className="font-medium underline underline-offset-4">
            Sign in
          </Link>
          .
        </Notice>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}

      {token ? (
        <p className="break-all rounded-lg bg-ink-50 px-3.5 py-3 font-mono text-2xs leading-relaxed text-ink-600">
          Token from link: {token}
        </p>
      ) : (
        <p className="rounded-lg border border-warning/25 bg-warning-soft px-3.5 py-3 text-sm text-ink-700">
          This link has no <code className="font-mono">token</code> query parameter, so there is
          nothing to redeem even once the endpoint exists.
        </p>
      )}

      <div>
        <label htmlFor="newPassword" className="block text-sm font-medium text-ink-800">
          New password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="password-rules"
          className="mt-2 h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 outline-none transition-[border-color,box-shadow] focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-brand-600/20"
        />
        <p id="password-rules" className="mt-1.5 text-xs text-text-subtle">
          {PASSWORD_HINT}
        </p>
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-ink-800">
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatched ? true : undefined}
          className="mt-2 h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 outline-none transition-[border-color,box-shadow] focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-brand-600/20 aria-invalid:border-danger aria-invalid:ring-danger/20"
        />
        {mismatched ? <p className="mt-1.5 text-xs text-danger">The two passwords differ.</p> : null}
      </div>

      <button
        type="submit"
        disabled={loading || !password || mismatched || !token}
        className="h-11 w-full rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:pointer-events-none disabled:opacity-60"
      >
        {loading ? "Updating…" : "Set new password"}
      </button>

      <p className="text-center text-xs text-text-subtle">
        <Link
          href={loginHref}
          className="font-medium text-brand-700 underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-lg border border-warning/25 bg-warning-soft px-3.5 py-3 text-sm leading-relaxed text-ink-700"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div>{children}</div>
    </div>
  );
}