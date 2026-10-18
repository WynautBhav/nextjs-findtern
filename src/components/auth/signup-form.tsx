"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, MailCheck } from "lucide-react";

import { isValidPhone, phoneError, phoneHint } from "@/lib/phone";

/**
 * Intern signup: three real API calls, in order.
 *
 *   1. POST /api/auth/signup/send-otp     → emails a 6-digit code
 *   2. POST /api/auth/signup/verify-otp   → consumes it
 *   3. POST /api/auth/signup              → creates the user and sets the session
 *
 * The OTP is required, not decorative: step 3 refuses any email without a
 * verified code from step 2 (`hasVerifiedSignupOtp`), so calling it directly
 * does not skip verification. `countryCode` is persisted with the number.
 */

type Stage = "details" | "otp" | "creating";

const PASSWORD_RULES = [
  { test: (v: string) => v.length >= 8, label: "At least 8 characters" },
  { test: (v: string) => /[a-z]/.test(v), label: "One lowercase letter" },
  { test: (v: string) => /[A-Z]/.test(v), label: "One uppercase letter" },
  { test: (v: string) => /\d/.test(v), label: "One number" },
];

export function SignupForm() {
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("details");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneTaken, setPhoneTaken] = useState(false);
  const phoneCheckTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(phoneCheckTimer.current), []);
  const [password, setPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [otp, setOtp] = useState("");

  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** Set only when the code itself was rejected, so the field is not announced
   *  as invalid merely for being unverified yet. */
  const [otpRejected, setOtpRejected] = useState(false);

  const passwordOk = PASSWORD_RULES.every((rule) => rule.test(password));
  const detailsOk =
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    isValidPhone(countryCode, phoneNumber) &&
    !phoneTaken &&
    passwordOk &&
    agreedToTerms;

  async function readError(res: Response, fallback: string): Promise<string> {
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    return data.error ?? data.message ?? fallback;
  }

  async function sendOtp() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!res.ok) {
        setError(await readError(res, "Could not send the code. Try again in a minute."));
        setOtpRejected(false);
        setLoading(false);
        return;
      }
      setStage("otp");
      setOtpRejected(false);
      setLoading(false);
    } catch {
      setError("Network error. Check your connection and try again.");
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp }),
      });
      if (!res.ok) {
        setError(await readError(res, "That code is not valid."));
        setOtpRejected(true);
        setLoading(false);
        return;
      }
      setVerified(true);
      setOtpRejected(false);
      setLoading(false);
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
    }
  }

  async function createAccount() {
    setStage("creating");
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          phoneNumber: phoneNumber.trim(),
          password,
          agreedToTerms: true,
          countryCode,
        }),
      });
      if (!res.ok) {
        setError(await readError(res, "Could not create the account."));
        setStage("otp");
        return;
      }
      // Session cookie is set by the response; a refresh picks it up server-side.
      router.push("/intern/onboarding");
      router.refresh();
    } catch {
      setError("Network error. Nothing was created.");
      setStage("otp");
    }
  }

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (stage === "details") void sendOtp();
        else if (stage === "otp") void (verified ? createAccount() : verifyOtp());
      }}
    >
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      {stage === "details" ? (
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <TextInput
              id="firstName"
              label="First name"
              value={firstName}
              onChange={setFirstName}
              autoComplete="given-name"
            />
            <TextInput
              id="lastName"
              label="Last name"
              value={lastName}
              onChange={setLastName}
              autoComplete="family-name"
            />
          </div>

          <TextInput
            id="email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            placeholder="you@gmail.com"
          />

          <div>
            <label htmlFor="phoneNumber" className="block text-sm font-medium text-ink-800">
              Phone number
            </label>
            <div className="mt-2 flex gap-2">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                aria-label="Country code"
                className="h-11 shrink-0 rounded-lg border border-ink-200 bg-white px-2.5 text-sm text-ink-800 outline-none focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-brand-600/20"
              >
                {["+91", "+1", "+44", "+61", "+49", "+65", "+971"].map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              <input
                id="phoneNumber"
                inputMode="numeric"
                maxLength={countryCode === "+91" ? 10 : 15}
                value={phoneNumber}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  setPhoneNumber(digits);
                  // Duplicate check, 400ms after they stop typing - the legacy
                  // behaviour. Without it a candidate fills the form, hits
                  // create, and is told the number is taken with no idea which
                  // field was the problem.
                  if (!isValidPhone(countryCode, digits)) {
                    setPhoneTaken(false);
                    return;
                  }
                  window.clearTimeout(phoneCheckTimer.current);
                  phoneCheckTimer.current = window.setTimeout(async () => {
                    try {
                      const res = await fetch(`/api/users/exists/phone/${digits}`);
                      const data = await res.json().catch(() => ({ exists: false }));
                      setPhoneTaken(Boolean(data.exists));
                    } catch {
                      // Never block signup on a failed check: the unique index
                      // on (country_code, phone_number) is the real guard.
                      setPhoneTaken(false);
                    }
                  }, 400);
                }}
                autoComplete="tel-national"
                placeholder="9876543210"
                aria-invalid={phoneTaken || undefined}
                className="h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 outline-none transition-[border-color,box-shadow] placeholder:text-ink-400 focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-brand-600/20 aria-invalid:border-danger"
              />
            </div>
            {phoneTaken ? (
              <p className="mt-1.5 text-xs text-danger">
                That number is already registered. Use another, or sign in instead.
              </p>
            ) : phoneNumber && !isValidPhone(countryCode, phoneNumber) ? (
              <p className="mt-1.5 text-xs text-danger">{phoneError(countryCode, phoneNumber)}</p>
            ) : (
              <p className="mt-1.5 text-xs text-text-subtle">{phoneHint(countryCode)}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-ink-800">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
              aria-describedby="password-rules"
              className="mt-2 h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 outline-none transition-[border-color,box-shadow] placeholder:text-ink-400 focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-brand-600/20"
            />
            <ul id="password-rules" className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {PASSWORD_RULES.map((rule) => {
                const met = rule.test(password);
                return (
                  <li
                    key={rule.label}
                    className={met ? "text-xs text-success" : "text-xs text-ink-400"}
                  >
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          </div>

          <label className="flex items-start gap-2.5 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 rounded border-ink-300 text-brand-700 accent-brand-700"
            />
            <span>
              I agree to the{" "}
              <Link
                href="/intern-terms-and-conditions"
                className="font-medium text-brand-700 underline-offset-4 hover:underline"
              >
                intern terms
              </Link>{" "}
              and the{" "}
              <Link
                href="/privacy"
                className="font-medium text-brand-700 underline-offset-4 hover:underline"
              >
                privacy policy
              </Link>
              .
            </span>
          </label>

          <Submit disabled={!detailsOk || loading} loading={loading}>
            Send verification code
          </Submit>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="flex items-start gap-2.5 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-3 text-sm text-ink-700">
            <MailCheck className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
            <span>
              We sent a 6-digit code to <strong className="font-semibold">{email}</strong>. It
              expires in 10 minutes.
            </span>
          </p>

          <div>
            <label htmlFor="otp" className="block text-sm font-medium text-ink-800">
              Verification code
            </label>
            <input
              id="otp"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, ""));
                if (otpRejected) setOtpRejected(false);
              }}
              autoComplete="one-time-code"
              placeholder="000000"
              aria-invalid={otpRejected ? true : undefined}
              aria-describedby={otpRejected ? "otp-error" : undefined}
              className={`mt-2 h-12 w-full rounded-lg border bg-white px-3.5 text-center font-mono text-lg tracking-[0.5em] text-ink-900 outline-none transition-[border-color,box-shadow] placeholder:text-ink-300 focus-visible:ring-[3px] ${
                otpRejected
                  ? "border-danger focus-visible:border-danger focus-visible:ring-danger/20"
                  : "border-ink-200 focus-visible:border-brand-600 focus-visible:ring-brand-600/20"
              }`}
            />
            {otpRejected ? (
              <p id="otp-error" className="mt-1.5 text-xs text-danger">
                That code was not accepted. Check the digits, or send a new one.
              </p>
            ) : null}
          </div>

          {verified ? (
            <p className="rounded-lg border border-success/25 bg-success-soft px-3.5 py-3 text-sm text-ink-700">
              Code accepted. Creating your account…
            </p>
          ) : null}

          <Submit
            disabled={otp.length !== 6 || loading}
            loading={loading && stage !== "creating"}
            pendingLabel={stage === "creating" ? "Creating account…" : "Working…"}
          >
            {verified ? "Create account" : "Verify code"}
          </Submit>

          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                setStage("details");
                setOtp("");
                setVerified(false);
                setOtpRejected(false);
                setError(null);
              }}
              className="inline-flex items-center gap-1.5 font-medium text-ink-600 hover:text-ink-900"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Change email
            </button>
            {!verified ? (
              <button
                type="button"
                onClick={() => void sendOtp()}
                disabled={loading}
                className="font-medium text-brand-700 underline-offset-4 hover:underline disabled:opacity-60"
              >
                Resend code
              </button>
            ) : null}
          </div>
        </div>
      )}
    </form>
  );
}

function TextInput({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
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
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 outline-none transition-[border-color,box-shadow] placeholder:text-ink-400 focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-brand-600/20"
      />
    </div>
  );
}

function Submit({
  children,
  disabled,
  loading,
  pendingLabel = "Working…",
}: {
  children: React.ReactNode;
  disabled: boolean;
  loading: boolean;
  pendingLabel?: string;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="group flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:pointer-events-none disabled:opacity-60"
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          {pendingLabel}
        </>
      ) : (
        <>
          {children}
          <ArrowRight
            className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
            aria-hidden
          />
        </>
      )}
    </button>
  );
}