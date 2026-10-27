"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, MailCheck } from "lucide-react";

import { isValidPhone, phoneError, phoneHint } from "@/lib/phone";
import { DIAL_CODES } from "@/lib/data/dial-codes";
import { isPersonalEmail } from "@/lib/employer-onboarding";

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
 *
 * With `google` set, the candidate is back from Google with a verified
 * address: the callback recorded that verification as a used OTP row, so step
 * 3 is called directly and the email is fixed to the Google one.
 */

type Stage = "details" | "otp" | "creating";

const PASSWORD_RULES = [
  { test: (v: string) => v.length >= 8, label: "At least 8 characters" },
  { test: (v: string) => /[a-z]/.test(v), label: "One lowercase letter" },
  { test: (v: string) => /[A-Z]/.test(v), label: "One uppercase letter" },
  { test: (v: string) => /\d/.test(v), label: "One number" },
  { test: (v: string) => /[^A-Za-z0-9]/.test(v), label: "One special character" },
];

/** Resend is allowed once a minute (the API refuses sooner). */
const RESEND_SECONDS = 60;

export function SignupForm({
  google = null,
  next,
}: {
  google?: { email: string; firstName: string; lastName: string } | null;
  /** Where to go after the account exists (from ?next=), else onboarding. */
  next?: string;
} = {}) {
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("details");
  const [firstName, setFirstName] = useState(google?.firstName ?? "");
  const [lastName, setLastName] = useState(google?.lastName ?? "");
  const [email, setEmail] = useState(google?.email ?? "");
  const [countryCode, setCountryCode] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneTaken, setPhoneTaken] = useState(false);
  const phoneCheckTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(phoneCheckTimer.current), []);
  const [password, setPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [otp, setOtp] = useState("");
  /** Seconds until "Resend code" is allowed again (INT-24). */
  const [resendIn, setResendIn] = useState(0);
  /** The server logs emails instead of sending them (a test deployment). */
  const [mailLogged, setMailLogged] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** Set only when the code itself was rejected, so the field is not announced
   *  as invalid merely for being unverified yet. */
  const [otpRejected, setOtpRejected] = useState(false);

  const passwordOk = PASSWORD_RULES.every((rule) => rule.test(password));
  const emailShapeOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  // Interns sign up with a personal address (INT-06); googlemail.com is Gmail.
  const emailPersonal = isPersonalEmail(email) || email.trim().toLowerCase().endsWith("@googlemail.com");
  const detailsOk =
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 2 &&
    emailShapeOk &&
    emailPersonal &&
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
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        remainingSeconds?: number;
        resendAfterSeconds?: number;
        delivery?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not send the code. Try again in a minute.");
        if (typeof data.remainingSeconds === "number") setResendIn(data.remainingSeconds);
        setOtpRejected(false);
        setLoading(false);
        return;
      }
      setResendIn(data.resendAfterSeconds ?? RESEND_SECONDS);
      setMailLogged(data.delivery === "log");
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
      // The code was the last thing asked of them: create the account now
      // instead of waiting for a second click on the same button.
      await createAccount();
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
        const message = await readError(res, "Could not create the account.");
        setError(
          google && /verify your email/i.test(message)
            ? "Your Google confirmation has expired (it lasts 15 minutes). Continue with Google again to finish."
            : message,
        );
        setStage(google ? "details" : "otp");
        return;
      }
      // Session cookie is set by the response; a refresh picks it up server-side.
      router.push(next || "/intern/onboarding");
      router.refresh();
    } catch {
      setError("Network error. Nothing was created.");
      setStage(google ? "details" : "otp");
    }
  }

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (stage === "details") void (google ? createAccount() : sendOtp());
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

      {stage === "details" || (google && stage === "creating") ? (
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

          {google ? (
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink-800">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                readOnly
                aria-describedby="email-google"
                className="mt-2 h-11 w-full rounded-lg border border-ink-200 bg-ink-50 px-3.5 text-sm text-ink-700 outline-none"
              />
              <p id="email-google" className="mt-1.5 flex items-center gap-1.5 text-xs text-success">
                <MailCheck className="size-3.5" aria-hidden />
                Verified by Google
              </p>
            </div>
          ) : (
            <TextInput
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              placeholder="you@gmail.com"
            />
          )}
          {!google && emailShapeOk && !emailPersonal ? (
            <p role="alert" className="-mt-3 text-xs text-danger">
              Use a personal email (Gmail, Yahoo, Outlook and the like). College and work
              addresses are not accepted.
            </p>
          ) : null}

          <div>
            <label htmlFor="phoneNumber" className="block text-sm font-medium text-ink-800">
              Phone number
            </label>
            <div className="mt-2 flex gap-2">
              <select
                value={countryCode}
                onChange={(e) => {
                  setCountryCode(e.target.value);
                  // A "taken" result was for the old code; let the server re-check.
                  setPhoneTaken(false);
                }}
                aria-label="Country code"
                className="h-11 w-36 shrink-0 rounded-lg border border-ink-200 bg-white px-2.5 text-sm text-ink-800 outline-none focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-brand-600/20"
              >
                {DIAL_CODES.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code} · {d.country}
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
                      const res = await fetch(`/api/users/exists/phone/${digits}?cc=${encodeURIComponent(countryCode)}`);
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
                That number is already registered, on an intern or a company account. One number
                can&apos;t be used for both. Use another, or sign in instead.
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
                    className={met ? "text-xs text-success" : "text-xs text-ink-600"}
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

          {google ? (
            <Submit
              disabled={!detailsOk || stage === "creating"}
              loading={stage === "creating"}
              pendingLabel="Creating account…"
            >
              Create account
            </Submit>
          ) : (
            <Submit disabled={!detailsOk || loading} loading={loading}>
              Send verification code
            </Submit>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <p className="flex items-start gap-2.5 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-3 text-sm text-ink-700">
            <MailCheck className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
            <span>
              We sent a 6-digit code to <strong className="font-semibold">{email}</strong>. It
              expires in 10 minutes. Check your spam folder if it is not in your inbox.
            </span>
          </p>
          {mailLogged ? (
            <p role="status" className="rounded-lg border border-warning/30 bg-warning-soft px-3.5 py-3 text-sm text-ink-800">
              This is a test server: emails are written to its log instead of being sent, so the
              code will not arrive in your inbox. Ask the Findtern team for it, or sign up on
              findtern.in.
            </p>
          ) : null}

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
            disabled={otp.length !== 6 || loading || stage === "creating"}
            loading={loading || stage === "creating"}
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
                disabled={loading || resendIn > 0}
                className="font-medium text-brand-700 underline-offset-4 hover:underline disabled:no-underline disabled:opacity-60"
              >
                {resendIn > 0 ? (
                  <>
                    Resend code in <span className="tabular-nums">0:{String(resendIn).padStart(2, "0")}</span>
                  </>
                ) : (
                  "Resend code"
                )}
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