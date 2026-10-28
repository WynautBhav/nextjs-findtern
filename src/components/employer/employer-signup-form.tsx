"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, MailCheck } from "lucide-react";

import { COUNTRY_CODE_OPTIONS, isPersonalEmail } from "@/lib/employer-onboarding";
import { isValidPhone, phoneError, phoneHint } from "@/lib/phone";

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

const PASSWORD_RULES = [
  { test: (v: string) => v.length >= 8, label: "At least 8 characters" },
  { test: (v: string) => /[a-z]/.test(v), label: "One lowercase letter" },
  { test: (v: string) => /[A-Z]/.test(v), label: "One uppercase letter" },
  { test: (v: string) => /\d/.test(v), label: "One number" },
  { test: (v: string) => /[^A-Za-z0-9]/.test(v), label: "One special character" },
];

export function EmployerSignupForm({
  google = null,
}: {
  google?: { email: string; name: string } | null;
} = {}) {
  const router = useRouter();
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
  const passwordOk = PASSWORD_RULES.every((rule) => rule.test(password));
  const phoneMaxLength = countryCode === "+91" ? 10 : 15;

  const detailsOk =
    name.trim().length >= 2 &&
    companyName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail) &&
    !personal &&
    isValidPhone(countryCode, phoneNumber) &&
    !phoneTaken &&
    passwordOk &&
    agreedToTerms;

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
      });
      if (problem) setError(problem);
      else setStage("otp");
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
        if (/verify your email/i.test(problem) && !google) {
          setVerified(false);
          setOtp("");
        }
        setLoading(false);
        return;
      }
      router.push("/employer/onboarding");
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
      const problems = validate({
        name,
        companyName,
        email: trimmedEmail,
        countryCode,
        phoneNumber,
        password,
        agreedToTerms,
      });
      if (Object.keys(problems).length > 0) {
        setError(Object.values(problems)[0]);
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
              className="apple-spring mt-2 min-h-12 w-full rounded-apple-sm border border-ink-200 bg-white px-3.5 text-center font-mono text-lg tracking-[0.5em] text-ink-900 outline-none placeholder:text-ink-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
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
        autoComplete="name"
        placeholder="Priya Sharma"
      />

      <TextInput
        id="companyName"
        label="Company name"
        value={companyName}
        onChange={setCompanyName}
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
          placeholder="hiring@acme.com"
          aria-invalid={personal ? true : undefined}
          aria-describedby="companyEmail-note"
          className={`apple-spring mt-2 min-h-11 w-full rounded-apple-sm border px-3.5 text-[0.9375rem] text-ink-900 outline-none placeholder:text-text-subtle focus:ring-2 ${
            google ? "bg-ink-50 text-ink-700" : "bg-white"
          } ${
            personal
              ? "border-danger focus:border-danger focus:ring-danger/20"
              : "border-ink-200 focus:border-brand-500 focus:ring-brand-500/20"
          }`}
        />
        <p
          id="companyEmail-note"
          className={`mt-1.5 text-xs ${personal ? "text-danger" : "text-text-subtle"}`}
        >
          {google
            ? "Verified by Google."
            : personal
            ? "That is a personal mailbox. Employers need an address at the company domain - the server rejects Gmail, Yahoo, Outlook and the rest."
            : "Must be at your company domain. Personal mailboxes are rejected."}
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
            className="apple-spring min-h-11 w-28 shrink-0 rounded-apple-sm border border-ink-200 bg-white px-2.5 text-[0.9375rem] tabular-nums sm:w-36 text-ink-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
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
            aria-invalid={phoneTaken || undefined}
            onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ""))}
            autoComplete="tel-national"
            placeholder={countryCode === "+91" ? "9876543210" : "2015550123"}
            className="apple-spring min-h-11 w-full min-w-0 flex-1 rounded-apple-sm border border-ink-200 bg-white px-3.5 text-[0.9375rem] tabular-nums text-ink-900 outline-none placeholder:text-text-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
        {phoneTaken ? (
          <p className="mt-1.5 text-xs text-danger">
            That number is already registered, on an intern or a company account. One number
            can&apos;t be used for both. Use another, or sign in instead.
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-text-subtle">
            {phoneNumber && !isValidPhone(countryCode, phoneNumber)
              ? phoneError(countryCode, phoneNumber)
              : phoneHint(countryCode)}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-ink-800">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="••••••••"
          aria-describedby="password-rules"
          className="apple-spring mt-2 min-h-11 w-full rounded-apple-sm border border-ink-200 bg-white px-3.5 text-[0.9375rem] text-ink-900 outline-none placeholder:text-text-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
        <ul id="password-rules" className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {PASSWORD_RULES.map((rule) => {
            const met = rule.test(password);
            return (
              <li key={rule.label} className={met ? "text-xs text-success" : "text-xs text-ink-600"}>
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
          className="mt-0.5 size-4 shrink-0 rounded border-ink-300 accent-brand-700"
        />
        <span>
          I agree to the{" "}
          <Link
            href="/employer-terms-and-conditions"
            className="apple-spring font-medium text-brand-700 underline-offset-4 hover:underline"
          >
            employer terms
          </Link>{" "}
          and the{" "}
          <Link href="/privacy" className="apple-spring font-medium text-brand-700 underline-offset-4 hover:underline">
            privacy policy
          </Link>
          .
        </span>
      </label>

      <button
        type="submit"
        disabled={!detailsOk || loading}
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
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
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
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="apple-spring mt-2 min-h-11 w-full rounded-apple-sm border border-ink-200 bg-white px-3.5 text-[0.9375rem] text-ink-900 outline-none placeholder:text-text-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
      />
    </div>
  );
}

/**
 * Mirrors `insertEmployerSchema` in `schema.ts`.
 *
 * Deliberately not imported: that schema also enforces the company's
 * uniqueness on `company_email` and a uniqueness index on country code +
 * phone, which only the database can decide. Everything checkable in the
 * browser is checked here so a round trip is not spent finding out.
 */
function validate(draft: {
  name: string;
  companyName: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
  password: string;
  agreedToTerms: boolean;
}): Record<string, string> {
  const errors: Record<string, string> = {};

  if (draft.name.trim().length < 2) errors.name = "Your name is required.";
  if (draft.companyName.trim().length < 2) errors.companyName = "Company name is required.";

  if (!draft.email) {
    errors.email = "A company email address is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) {
    errors.email = "Enter a valid email address.";
  } else if (isPersonalEmail(draft.email)) {
    errors.email = "Use your company domain - personal mailboxes cannot register a company.";
  }

  const phoneProblem = phoneError(draft.countryCode, draft.phoneNumber);
  if (phoneProblem) errors.phoneNumber = phoneProblem;
  if (!PASSWORD_RULES.every((rule) => rule.test(draft.password))) {
    errors.password = "The password does not meet every rule listed above.";
  }
  if (!draft.agreedToTerms) {
    errors.agreedToTerms = "You have to accept the employer terms to register.";
  }

  return errors;
}
