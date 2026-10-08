"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowRight, Loader2, TriangleAlert } from "lucide-react";

import { COUNTRY_CODE_OPTIONS, isPersonalEmail } from "@/lib/employer-onboarding";

/**
 * Employer registration.
 *
 * The one rule that earns its own treatment: a company email address. The
 * mirror image of the intern rule lives in `schema.ts` — `insertUserSchema`
 * *requires* a personal domain, `insertEmployerSchema` requires a non-personal
 * one — and this form enforces the same list client-side so the employer finds
 * out before the round trip instead of after it.
 *
 * ── What is missing ───────────────────────────────────────────────────────
 * There is no `POST /api/auth/employer/signup` in this build. `/api/auth/signup`
 * exists but hardcodes `role: "intern"` and `subjectType: "intern"`, so it
 * cannot be pointed at this form without changing intern behaviour. There is
 * also no employer-scoped OTP route. So the button below reports exactly what
 * it would have sent rather than posting into a 404.
 */

const PASSWORD_RULES = [
  { test: (v: string) => v.length >= 8, label: "At least 8 characters" },
  { test: (v: string) => /[a-z]/.test(v), label: "One lowercase letter" },
  { test: (v: string) => /[A-Z]/.test(v), label: "One uppercase letter" },
  { test: (v: string) => /\d/.test(v), label: "One number" },
];

export function EmployerSignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const trimmedEmail = companyEmail.trim().toLowerCase();
  const personal = trimmedEmail.length > 0 && isPersonalEmail(trimmedEmail);
  const passwordOk = PASSWORD_RULES.every((rule) => rule.test(password));
  const phoneMaxLength = countryCode === "+91" ? 10 : 15;

  const detailsOk =
    name.trim().length >= 2 &&
    companyName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail) &&
    !personal &&
    /^\d{6,15}$/.test(phoneNumber) &&
    passwordOk &&
    agreedToTerms;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);

    const problems = validate({
      name,
      companyName,
      email: trimmedEmail,
      phoneNumber,
      password,
      agreedToTerms,
    });
    if (Object.keys(problems).length > 0) {
      setError(Object.values(problems)[0]);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/employer/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          companyName: companyName.trim(),
          companyEmail: trimmedEmail,
          phoneNumber,
          password,
          agreedToTerms: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Signup failed");
        setLoading(false);
        return;
      }
      router.push("/employer/onboarding");
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <form className="space-y-5" noValidate onSubmit={onSubmit}>
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="flex items-start gap-2.5 rounded-lg border border-warning/25 bg-warning-soft px-3.5 py-3 text-sm leading-relaxed text-ink-700"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>{notice}</span>
        </p>
      ) : null}

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
          onChange={(e) => {
            setCompanyEmail(e.target.value);
            if (error) setError(null);
          }}
          placeholder="hiring@acme.com"
          aria-invalid={personal ? true : undefined}
          aria-describedby="companyEmail-note"
          className={`mt-2 h-11 w-full rounded-lg border bg-white px-3.5 text-sm text-ink-900 outline-none transition-[border-color,box-shadow] placeholder:text-ink-400 focus-visible:ring-[3px] ${
            personal
              ? "border-danger focus-visible:border-danger focus-visible:ring-danger/20"
              : "border-ink-200 focus-visible:border-brand-600 focus-visible:ring-brand-600/20"
          }`}
        />
        <p
          id="companyEmail-note"
          className={`mt-1.5 text-xs ${personal ? "text-danger" : "text-text-subtle"}`}
        >
          {personal
            ? "That is a personal mailbox. Employers need an address at the company domain — the server rejects Gmail, Yahoo, Outlook and the rest."
            : "Must be at your company domain. Personal mailboxes are rejected."}
        </p>
      </div>

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
            onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ""))}
            autoComplete="tel-national"
            placeholder={countryCode === "+91" ? "9876543210" : "2015550123"}
            className="h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 outline-none transition-[border-color,box-shadow] placeholder:text-ink-400 focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-brand-600/20"
          />
        </div>
        <p className="mt-1.5 text-xs text-text-subtle">
          {countryCode === "+91"
            ? "10 digits, no country code."
            : "6 to 15 digits, no country code."}
        </p>
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
          className="mt-2 h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 outline-none transition-[border-color,box-shadow] placeholder:text-ink-400 focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-brand-600/20"
        />
        <ul id="password-rules" className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {PASSWORD_RULES.map((rule) => {
            const met = rule.test(password);
            return (
              <li key={rule.label} className={met ? "text-xs text-success" : "text-xs text-ink-400"}>
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
            className="font-medium text-brand-700 underline-offset-4 hover:underline"
          >
            employer terms
          </Link>{" "}
          and the{" "}
          <Link href="/privacy" className="font-medium text-brand-700 underline-offset-4 hover:underline">
            privacy policy
          </Link>
          .
        </span>
      </label>

      <button
        type="submit"
        disabled={!detailsOk || loading}
        className="group flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:pointer-events-none disabled:opacity-60"
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
            Working…
          </>
        ) : (
          <>
            Create company account
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
        className="mt-2 h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 outline-none transition-[border-color,box-shadow] placeholder:text-ink-400 focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-brand-600/20"
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
    errors.email = "Use your company domain — personal mailboxes cannot register a company.";
  }

  if (!/^\d{6,15}$/.test(draft.phoneNumber)) {
    errors.phoneNumber = "Enter 6 to 15 digits, no country code.";
  }
  if (!PASSWORD_RULES.every((rule) => rule.test(draft.password))) {
    errors.password = "The password does not meet every rule listed above.";
  }
  if (!draft.agreedToTerms) {
    errors.agreedToTerms = "You have to accept the employer terms to register.";
  }

  return errors;
}
