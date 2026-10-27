"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";

export function LoginForm({
  endpoint,
  redirectTo,
  forgotHref,
  googleHref,
  googleLabel,
  verifyHref,
}: {
  endpoint: string;
  redirectTo: string;
  forgotHref?: string;
  googleHref?: string;
  /** New accounts can start from the same button (bug sheet 7, S1 r21). */
  googleLabel?: string;
  /** Where an unverified account goes to verify; shown with that error. */
  verifyHref?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Sign in failed. Check your details and try again.");
        setLoading(false);
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {/* Error sits above the fields, not at the bottom where it is missed. */}
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {error}
            {verifyHref && error === "Email not verified" ? (
              <>
                {" "}
                <Link href={`${verifyHref}?email=${encodeURIComponent(email)}`} className="font-semibold underline underline-offset-4">
                  Verify it now
                </Link>
              </>
            ) : null}
          </span>
        </div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium text-ink-800">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder={endpoint.includes("/employer/") || endpoint.includes("/admin/") ? "you@company.com" : "you@gmail.com"}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 border-ink-200 bg-white px-3.5 placeholder:text-ink-400"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="password" className="block text-sm font-medium text-ink-800">
            Password
          </label>
          {forgotHref ? (
            <Link
              href={forgotHref}
              className="text-xs font-medium text-brand-700 underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          ) : null}
        </div>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 border-ink-200 bg-white px-3.5 pr-11 placeholder:text-ink-400"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-ink-500 transition-colors [@media(any-hover:hover)]:hover:text-ink-800"
          >
            {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="group flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-brand-600 active:translate-y-px disabled:pointer-events-none disabled:opacity-60"
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Signing in…
          </>
        ) : (
          <>
            Sign in
            <ArrowRight
              className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden
            />
          </>
        )}
      </button>

      {googleHref ? (
        <>
          <div className="relative py-1">
            <span className="absolute inset-0 flex items-center" aria-hidden>
              <span className="w-full border-t border-ink-100" />
            </span>
            <span className="relative mx-auto block w-fit bg-white px-3 text-xs uppercase tracking-[0.12em] text-ink-600">
              or
            </span>
          </div>
          <GoogleButton href={googleHref} label={googleLabel} />
        </>
      ) : null}
    </form>
  );
}

/** The one Google button, shared by sign in and sign up. */
export function GoogleButton({ href, label = "Continue with Google" }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-ink-200 bg-white px-4 text-sm font-medium text-ink-800 transition-colors [@media(any-hover:hover)]:hover:bg-ink-50"
    >
      <GoogleGlyph />
      {label}
    </a>
  );
}

function GoogleGlyph() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.5-3.5A12 12 0 0 0 1.3 6.6l4 3.1C6.2 6.9 8.9 4.8 12 4.8Z"
      />
    </svg>
  );
}