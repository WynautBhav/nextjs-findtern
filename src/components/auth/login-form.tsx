"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";

import { ButtonAnchor, buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LAST_DOOR_COOKIE } from "@/lib/auth-doors";

export function LoginForm({
  endpoint,
  redirectTo,
  forgotHref,
  googleHref,
  googleLabel,
  verifyHref,
  rememberAs,
  emailPlaceholder = "you@company.com",
}: {
  endpoint: string;
  redirectTo: string;
  forgotHref?: string;
  googleHref?: string;
  /** New accounts can start from the same button (bug sheet 7, S1 r21). */
  googleLabel?: string;
  /** Where an unverified account goes to verify; shown with that error. */
  verifyHref?: string;
  /** Account type /login opens on next time (see LAST_DOOR_COOKIE). */
  rememberAs?: string;
  emailPlaceholder?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Validate on blur and on submit (SPECS §6); the message sits under the field.
  // Leaving a field still empty (to tap a tab, say) is not yet a mistake, so blur only checks a touched field.
  function check(field: "email" | "password", value: string, onBlur = false): string | undefined {
    if (onBlur && !value && !fieldErrors[field]) return undefined;
    const msg =
      field === "email"
        ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? undefined : "Enter a valid email address."
        : value ? undefined : "Enter your password.";
    setFieldErrors((f) => ({ ...f, [field]: msg }));
    return msg;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Read the fields, not state: typing or a password manager's autofill
    // before hydration never fires onChange, so state would still be empty.
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const sent = { email: String(form.get("email") ?? "").trim(), password: String(form.get("password") ?? "") };
    setEmail(sent.email);
    const emailProblem = check("email", sent.email);
    const passwordProblem = check("password", sent.password);
    if (emailProblem || passwordProblem) {
      (emailProblem ? emailRef : passwordRef).current?.focus();
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sent),
        // A stalled request (cold start, dropped connection) must not leave the button spinning forever.
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(signInError(res.status, data.error, rememberAs));
        setLoading(false);
        return;
      }
      if (rememberAs) document.cookie = `${LAST_DOOR_COOKIE}=${rememberAs}; path=/; max-age=31536000; samesite=lax`;
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "TimeoutError"
          ? "Sign-in is taking too long. Please try again in a moment."
          : "Network error. Please try again.",
      );
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {/* Error sits above the fields, not at the bottom where it is missed. */}
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {error}
            {verifyHref && error === "Email not verified" ? (
              <>
                {" "}
                <Link href={`${verifyHref}${verifyHref.includes("?") ? "&" : "?"}email=${encodeURIComponent(email)}`} className="font-semibold underline underline-offset-4">
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
          placeholder={emailPlaceholder}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
          }}
          onBlur={(e) => check("email", e.target.value, true)}
          ref={emailRef}
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          className="h-11 border-ink-200 bg-white px-3.5 placeholder:text-text-subtle"
        />
        {fieldErrors.email ? (
          <p id="email-error" className="text-sm text-danger">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="password" className="block text-sm font-medium text-ink-800">
            Password
          </label>
          {forgotHref ? (
            <Link
              href={forgotHref}
              // 44px hit area without moving the row: padding paid back by negative margin.
              className="-my-3 -mx-1 inline-flex items-center px-1 py-3 text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
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
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
            }}
            onBlur={(e) => check("password", e.target.value, true)}
            ref={passwordRef}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={fieldErrors.password ? "password-error" : undefined}
            className="h-11 border-ink-200 bg-white px-3.5 pr-11 placeholder:text-text-subtle"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-md text-text-subtle transition-colors [@media(any-hover:hover)]:hover:text-ink-800"
          >
            {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
        {fieldErrors.password ? (
          <p id="password-error" className="text-sm text-danger">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>

      {/* Label stays "Sign in" while loading (SPECS §6); the spinner replaces the arrow. */}
      <button
        type="submit"
        disabled={loading}
        aria-busy={loading || undefined}
        className={buttonClass({ variant: "primary", block: true, className: "group h-11 text-sm font-semibold" })}
      >
        Sign in
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
        )}
      </button>

      {googleHref ? (
        <>
          <p className="text-center text-sm text-ink-600">or</p>
          <GoogleButton href={googleHref} label={googleLabel} />
        </>
      ) : null}
    </form>
  );
}

/** What the sign-in routes' terse errors mean to the person typing. */
function signInError(status: number, error: string | undefined, door?: string): string {
  if (status === 400) return "Enter a valid email address and your password.";
  if (status === 401) {
    // The account types sign in separately, so the commonest miss is the wrong tab.
    const other = door === "employer" ? " If this is an intern or college account, switch the account type above." : door ? " If this is a company account, switch to Company above." : "";
    return `Wrong email or password.${other}`;
  }
  if (status === 429) return "Too many sign-in attempts. Try again later, or reset your password.";
  return error ?? "Sign in failed. Check your details and try again.";
}

/** The one Google button, shared by sign in and sign up. */
export function GoogleButton({ href, label = "Continue with Google" }: { href: string; label?: string }) {
  return (
    <ButtonAnchor href={href} variant="outline" block className="h-11 text-sm text-ink-800">
      <GoogleGlyph />
      {label}
    </ButtonAnchor>
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