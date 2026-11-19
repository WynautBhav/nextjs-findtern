"use client";

import { useEffect, useState } from "react";
import { useProgressRouter } from "@/components/layout/navigation-progress";
import { NewTabLink } from "@/components/ui/new-tab-link";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, MailCheck } from "lucide-react";

import { COUNTRY_CODE_OPTIONS, isPersonalEmail } from "@/lib/employer-onboarding";
import { isValidPhone, phoneError, phoneHint } from "@/lib/phone";
import { employerSignupErrors } from "@/lib/signup-field-errors";
import { PASSWORD_RULES } from "@/lib/password-policy";
import { fieldClass } from "@/components/employer/ui-tokens";
import { cn } from "@/lib/utils";
import { controlClass } from "@/components/employer/company-fields";
import { PasswordInput } from "@/components/auth/password-input";

/**
 * Employer registration.
 *
 * The one rule that earns its own treatment: a company email address. The
 * mirror image of the intern rule lives in `schema.ts` - `insertUserSchema`
 * *requires* a personal domain, `insertEmployerSchema` requires a non-personal
 * one - and this form enforces the same list client-side so the employer finds
 * out before the round trip instead of after it.
 *
 * Same three calls as the intern form: send-otp → verify-otp → create, with
 * `subjectType: "employer"`. The create route refuses an email that has not
 * been verified, so the OTP step cannot be skipped by calling it directly.
 *
 * Once the code is accepted it is spent, so `verified` is remembered: a failed
 * create (phone taken, network) retries only the create call, and the
 * employer can go back and fix details without being asked for a new code.
 *
 * With `google` set, the employer is back from Google with a verified company
 * address: the email is locked, the code step is skipped, and the create call
 * passes on the proof cookie the OAuth callback set.
 */


export function EmployerSignupForm({
  google = null,
  next,
}: {
  google?: { email: string; name: string } | null;
  /** Where to go once the account exists (from ?next=, e.g. a college drive link), else onboarding. */
  next?: string;
} = {}) {
  const router = useProgressRouter();
  const [name, setName] = useState(google?.name ?? "");
  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState(google?.email ?? "");
  const [countryCode, setCountryCode] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
  // The number a "taken" answer was for, so an edit drops a stale answer.
  const [takenNumber, setTakenNumber] = useState<string | null>(null);
  const phoneTaken = takenNumber === `${countryCode}${phoneNumber}`;
  const [password, setPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<"details" | "otp">("details");
  const [otp, setOtp] = useState("");
  /** The code for `trimmedEmail` was accepted (or Google vouched for it). */
  const [verified, setVerified] = useState(Boolean(google));

  const trimmedEmail = companyEmail.trim().toLowerCase();
  const personal = trimmedEmail.length > 0 && isPersonalEmail(trimmedEmail);
  const phoneMaxLength = countryCode === "+91" ? 10 : 15;

  // Messages show once a field is left or a submit is tried; the button stays enabled (B-20).
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const fieldErrors = employerSignupErrors({ name, companyName, email: trimmedEmail, countryCode, phoneNumber, password, agreedToTerms });
  const shown = (key: keyof typeof fieldErrors) => (touched[key] || submitted ? fieldErrors[key] : undefined);
  const touch = (key: string) => setTouched((t) => (t[key] ? t : { ...t, [key]: true }));

  // Same 400ms duplicate check as the intern form. Without it a number that
  // is already on an intern account is only refused after the email code.
  useEffect(() => {
    if (!isValidPhone(countryCode, phoneNumber)) return;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/exists/phone/${phoneNumber}?cc=${encodeURIComponent(countryCode)}`,
        );
        const data = await res.json().catch(() => ({ exists: false }));
        if (data.exists) setTakenNumber(`${countryCode}${phoneNumber}`);
      } catch {
        // Never block signup on a failed check; the signup route is the guard.
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [countryCode, phoneNumber]);

  async function post(url: string, body: unknown): Promise<string | null> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return data.error ?? "Something went wrong";
  }

  async function sendOtp() {
    setError(null);
    setLoading(true);
    try {
      const problem = await post("/api/auth/signup/send-otp", {
        email: trimmedEmail,
        subjectType: "employer",
        countryCode,
        phoneNumber,
      });
      if (problem) {
        setError(problem);
        if (/phone number already/i.test(problem)) setTakenNumber(`${countryCode}${phoneNumber}`);
      } else setStage("otp");
    } catch {
      setError("Network error");
    }
    setLoading(false);
  }

  async function createAccount() {
    setError(null);
    setLoading(true);
    try {
      const problem = await post("/api/auth/employer/signup", {
        name: name.trim(),
        companyName: companyName.trim(),
        companyEmail: trimmedEmail,
        countryCode,
        phoneNumber,
        password,
        agreedToTerms: true,
      });
      if (problem) {
        setError(
          /verify your email/i.test(problem)
            ? google
              ? "Your Google confirmation has expired (it lasts 15 minutes). Continue with Google again to finish."
              : "Your verification has expired (it lasts 15 minutes). Send a new code to finish."
            : problem,
        );
        if (/phone number already/i.test(problem)) {
          // Back to the form with the code still valid, so only the number changes.
          setTakenNumber(`${countryCode}${phoneNumber}`);
          setStage("details");
        }
        if (/verify your email/i.test(problem) && !google) {
          setVerified(false);
          setOtp("");
        }
        setLoading(false);
        return;
      }
      router.push(next || "/employer/onboarding");
      router.refresh();
    } catch {
      setError("Network error. Nothing was created.");
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setError(null);
    setLoading(true);
    try {
      const otpProblem = await post("/api/auth/signup/verify-otp", {
        email: trimmedEmail,
        otp,
        subjectType: "employer",
      });
      if (otpProblem) {
        setError(otpProblem);
        setLoading(false);
        return;
      }
    } catch {
      setError("Network error");
      setLoading(false);
      return;
    }
    setVerified(true);
    // The code was the last thing asked for: create the account straight away.
    await createAccount();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    if (stage === "details") {
      if (Object.keys(fieldErrors).length > 0 || phoneTaken) {
        setSubmitted(true);
        setError(null);
        const first = (["name", "companyName", "email", "phoneNumber", "password", "agreedToTerms"] as const).find((k) => fieldErrors[k]);
        document.getElementById(first === "email" ? "companyEmail" : (first ?? "phoneNumber"))?.focus();
        return;
      }
      if (verified) await createAccount();
      else await sendOtp();
      return;
    }

    if (verified) await createAccount();
    else await verifyOtp();
  }

  return (
    <form className="space-y-5" noValidate onSubmit={onSubmit}>
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-apple-sm border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      {stage === "otp" ? (
        <div className="space-y-5">
          <p className="flex items-start gap-2.5 rounded-apple-sm border border-brand-200 bg-brand-50 px-3.5 py-3 text-sm text-ink-700">
            <MailCheck className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
            {verified ? (
              <span>
                <strong className="font-semibold">{trimmedEmail}</strong> is verified. If creating the
                account failed, fix the details or try again - no new code is needed.
              </span>
            ) : (
              <span>
                We sent a 6-digit code to <strong className="font-semibold">{trimmedEmail}</strong>. It
                expires in 10 minutes.
              </span>
            )}
          </p>
          {verified ? null : (
          <div>
            <label htmlFor="otp" className="block text-sm font-medium text-ink-800">
              Verification code
            </label>
            <input
              id="otp"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              autoComplete="one-time-code"
              placeholder="000000"
              className={cn(fieldClass, "mt-2 min-h-12 px-3.5 text-center font-mono text-lg md:text-lg tracking-[0.5em] placeholder:text-ink-500")}
            />
          </div>
          )}
          <button
            type="submit"
            disabled={(!verified && otp.length !== 6) || loading}
            className="apple-spring apple-pressable flex min-h-11 w-full items-center justify-center gap-2 rounded-apple-sm bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:pointer-events-none disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
                Working…
              </>
            ) : verified ? (
              "Create account"
            ) : (
              "Verify and create account"
            )}
          </button>
          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                setStage("details");
                if (!verified) setOtp("");
                setError(null);
              }}
              className="inline-flex items-center gap-1.5 font-medium text-ink-600 hover:text-ink-900"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Change details
            </button>
            {verified ? null : (
              <button
                type="button"
                onClick={() => void sendOtp()}
                disabled={loading}
                className="font-medium text-brand-700 underline-offset-4 hover:underline disabled:opacity-60"
              >
                Resend code
              </button>
            )}
          </div>
        </div>
      ) : (
      <>

      <TextInput
        id="name"
        label="Your name"
        value={name}
        onChange={setName}
        onBlur={() => touch("name")}
        error={shown("name")}
        autoComplete="name"
        placeholder="John Doe"
      />

      <TextInput
        id="companyName"
        label="Company name"
        value={companyName}
        onChange={setCompanyName}
        onBlur={() => touch("companyName")}
        error={shown("companyName")}
        autoComplete="organization"
        placeholder="Acme Labs"
      />

      <div>
        <label htmlFor="companyEmail" className="block text-sm font-medium text-ink-800">
          Company email
        </label>
        <input
          id="companyEmail"
          name="companyEmail"
          type="email"
          autoComplete="email"
          required
          value={companyEmail}
          readOnly={Boolean(google)}
          onChange={(e) => {
            if (google) return;
            setCompanyEmail(e.target.value);
            // A different address needs its own code.
            if (e.target.value.trim().toLowerCase() !== trimmedEmail) setVerified(false);
            if (error) setError(null);
          }}
          onBlur={() => touch("email")}
          placeholder="hiring@acme.com"
          aria-invalid={personal || shown("email") ? true : undefined}
          aria-describedby="companyEmail-note"
          className={controlClass(personal || Boolean(shown("email")), cn("mt-2", google && "bg-ink-50 text-ink-700"))}
        />
        <p
          id="companyEmail-note"
          className={`mt-1.5 text-xs ${personal || shown("email") ? "text-danger" : "text-text-subtle"}`}
        >
          {google
            ? "Verified by Google."
            : personal
            ? "That is a personal mailbox. Employers need an address at the company domain - the server rejects Gmail, Yahoo, Outlook and the rest."
            : shown("email") ?? "Must be at your company domain. Personal mailboxes are rejected."}
        </p>
      </div>

      <div>
        <label htmlFor="phoneNumber" className="block text-sm font-medium text-ink-800">
          Phone number
        </label>
        {/* The select is a fixed width: left to size itself it takes the longest
            country name and squeezes the number to ~50 px on a phone (QA-101). */}
        <div className="mt-2 flex gap-2">
          <select
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            aria-label="Country code"
            className={controlClass(false, "w-28 shrink-0 px-2.5 tabular-nums sm:w-36")}
          >
            {COUNTRY_CODE_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.code} · {option.country}
              </option>
            ))}
          </select>
          <input
            id="phoneNumber"
            name="phoneNumber"
            inputMode="numeric"
            maxLength={phoneMaxLength}
            value={phoneNumber}
            aria-invalid={phoneTaken || shown("phoneNumber") ? true : undefined}
            aria-describedby="phoneNumber-note"
            onBlur={() => touch("phoneNumber")}
            onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ""))}
            autoComplete="tel-national"
            placeholder={countryCode === "+91" ? "9876543210" : "2015550123"}
            className={controlClass(false, "min-w-0 flex-1 tabular-nums")}
          />
        </div>
        {phoneTaken ? (
          <p id="phoneNumber-note" className="mt-1.5 text-xs text-danger">
            That number is already registered, on an intern or a company account. One number
            can&apos;t be used for both. Use another, or sign in instead.
          </p>
        ) : (
          <p
            id="phoneNumber-note"
            className={`mt-1.5 text-xs ${(phoneNumber && !isValidPhone(countryCode, phoneNumber)) || shown("phoneNumber") ? "text-danger" : "text-text-subtle"}`}
          >
            {phoneNumber && !isValidPhone(countryCode, phoneNumber)
              ? phoneError(countryCode, phoneNumber)
              : shown("phoneNumber") ?? phoneHint(countryCode)}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-ink-800">
          Password
        </label>
        <PasswordInput
          id="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => touch("password")}
          autoComplete="new-password"
          placeholder="••••••••"
          aria-invalid={shown("password") ? true : undefined}
          aria-describedby="password-error password-rules"
          className={controlClass(Boolean(shown("password")), "mt-2")}
        />
        {shown("password") ? (
          <p id="password-error" className="mt-1.5 text-xs text-danger">{shown("password")}</p>
        ) : null}
        <ul id="password-rules" className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {PASSWORD_RULES.map((rule) => {
            const met = rule.test(password);
            return (
              <li key={rule.item} className={met ? "text-xs text-success" : "text-xs text-ink-600"}>
                {rule.item}
              </li>
            );
          })}
        </ul>
      </div>

      <label className="flex items-start gap-2.5 text-sm text-ink-700">
        <input
          id="agreedToTerms"
          type="checkbox"
          checked={agreedToTerms}
          onChange={(e) => setAgreedToTerms(e.target.checked)}
          aria-invalid={shown("agreedToTerms") ? true : undefined}
          aria-describedby={shown("agreedToTerms") ? "agreedToTerms-error" : undefined}
          className="mt-0.5 size-4 shrink-0 rounded border-ink-300 accent-brand-700"
        />
        <span>
          I agree to the{" "}
          <NewTabLink
            href="/employer-terms-and-conditions"
            className="apple-spring font-medium text-brand-700 underline-offset-4 hover:underline"
          >
            employer terms
          </NewTabLink>{" "}
          and the{" "}
          <NewTabLink href="/privacy" className="apple-spring font-medium text-brand-700 underline-offset-4 hover:underline">
            privacy policy
          </NewTabLink>
          .
        </span>
      </label>
      {shown("agreedToTerms") ? (
        <p id="agreedToTerms-error" className="-mt-3 text-xs text-danger">{shown("agreedToTerms")}</p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="apple-spring apple-pressable group flex min-h-11 w-full items-center justify-center gap-2 rounded-apple-sm bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:pointer-events-none disabled:opacity-60"
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
            Working…
          </>
        ) : (
          <>
            {verified ? "Create account" : "Send verification code"}
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
              aria-hidden
            />
          </>
        )}
      </button>

      <p className="text-xs leading-relaxed text-text-subtle">
        Creating the account does not start hiring. You will be taken to the two-stage company
        setup, and nothing is charged until a candidate accepts.
      </p>
      </>
      )}
    </form>
  );
}

function TextInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  onBlur,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  onBlur?: () => void;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={controlClass(Boolean(error), "mt-2")}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
