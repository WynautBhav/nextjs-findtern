"use client";

/**
 * Company profile editor.
 *
 * Writes to `PATCH /api/employer/:id`, which takes exactly the fields below.
 * The logo uploads on its own (FileUpload attaches it server-side).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { FileUpload } from "@/components/app/file-upload";
import { CityField, CountrySelect, StateField } from "@/components/employer/location-fields";
import { isIndiaCountry } from "@/lib/data/countries";

import { csrfFetch } from "@/lib/client-fetch";
import { phoneError } from "@/lib/phone";
import { websiteDomainError } from "@/lib/company-domain";
import { REQUIRED_COMPANY_FIELDS, isPersonalEmail, needsBillingPincode } from "@/lib/employer-onboarding";

export type CompanyProfile = {
  companyName: string;
  companyEmail: string;
  websiteUrl: string | null;
  companySize: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  primaryContactName: string | null;
  primaryContactRole: string | null;
  // The primary contact's phone lives on the account-level countryCode +
  // phoneNumber columns, not a separate pair.
  countryCode: string;
  phoneNumber: string;
  escalationContactName: string | null;
  escalationContactRole: string | null;
  escalationContactEmail: string | null;
  escalationContactCountryCode: string | null;
  escalationContactPhone: string | null;
  gstNumber: string | null;
  billingPincode: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The company domain the website must match, or "" for a personal-mailbox login. */
function companyDomainOf(email: string): string {
  const e = (email ?? "").trim();
  if (!e.includes("@") || isPersonalEmail(e)) return "";
  return e.split("@").pop()!.toLowerCase();
}

const ESCALATION_FIELDS = [
  ["escalationContactName", "Escalation contact name"],
  ["escalationContactRole", "Escalation contact role"],
  ["escalationContactEmail", "Escalation contact email"],
  ["escalationContactPhone", "Escalation contact phone"],
] as const;

/**
 * Everything is mandatory except what the form labels Optional: the logo and
 * the GST number. The escalation contact (name, role, email, phone) is
 * mandatory, and the website must sit on the login email's domain.
 * The billing PIN is mandatory for an Indian address. The server applies the
 * same rules (`PATCH /api/employer/:id`); this is so the employer sees which
 * field, not just the first error.
 */
function validate(v: Record<string, string>, savedWebsite = ""): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [key, label] of REQUIRED_COMPANY_FIELDS) {
    if (!v[key]?.trim()) errors[key] = `${label} is required.`;
  }
  // A website already on file is kept as is: the domain rule applies when it
  // is entered or changed, so older accounts can still save other fields.
  if (!errors.websiteUrl && v.websiteUrl.trim() !== savedWebsite.trim()) {
    const domain = companyDomainOf(v.companyEmail);
    const problem = websiteDomainError(v.websiteUrl, v.companyEmail, { skipDomainCheck: !domain });
    if (problem) errors.websiteUrl = problem;
  }
  if (!v.countryCode?.trim()) errors.countryCode = "Country code is required.";
  if (!errors.phoneNumber) {
    const problem = phoneError(v.countryCode, v.phoneNumber);
    if (problem) errors.phoneNumber = problem;
  }
  if (needsBillingPincode(v.country) && !/^[1-9]\d{5}$/.test(v.billingPincode?.trim() ?? "")) {
    errors.billingPincode = v.billingPincode?.trim()
      ? "Enter the 6-digit PIN code of your billing address."
      : "Required for GST invoices in India. Enter the 6-digit PIN code of your billing address.";
  }
  if (v.gstNumber?.trim() && !/^[0-9A-Z]{15}$/i.test(v.gstNumber.trim())) {
    errors.gstNumber = "A GST number is 15 characters, letters and digits only.";
  }
  for (const [k, label] of ESCALATION_FIELDS) {
    if (!v[k]?.trim()) errors[k] = `${label} is required.`;
  }
  if (!errors.escalationContactEmail) {
    const email = v.escalationContactEmail.trim();
    if (!EMAIL_RE.test(email)) errors.escalationContactEmail = "Enter a valid email address.";
    else if (isPersonalEmail(email)) errors.escalationContactEmail = "Use a company email for the escalation contact.";
  }
  if (!errors.escalationContactPhone) {
    const problem = phoneError(v.escalationContactCountryCode || "+91", v.escalationContactPhone);
    if (problem) errors.escalationContactPhone = problem;
  }
  return errors;
}

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

export function CompanyProfileForm({
  employerId,
  profile,
  hasLogo = false,
}: {
  employerId: string;
  profile: CompanyProfile;
  hasLogo?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(profile).map(([k, v]) => [k, v ?? ""])),
  );
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValue(key)(e.target.value);
  const setValue = (key: string) => (value: string) => {
    setState("idle");
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problems = validate(values, profile.websiteUrl ?? "");
    setErrors(problems);
    if (Object.keys(problems).length > 0) {
      setError("Some required details are missing - see the highlighted fields.");
      setState("idle");
      document.getElementById(Object.keys(problems)[0])?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    setState("idle");
    try {
      // A cleared optional field is sent as null so it actually clears. The
      // login email is read-only (the route ignores it).
      const body = Object.fromEntries(
        Object.entries(values)
          .filter(([k]) => k !== "companyEmail")
          .map(([k, v]) => [k, v.trim() === "" ? null : v.trim()]),
      );
      const res = await csrfFetch(`/api/employer/${encodeURIComponent(employerId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save the profile.");
      setState("saved");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the profile.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-6" noValidate onSubmit={submit}>
      {error ? (
        <p role="alert" className="rounded-[10px] border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {state === "saved" ? (
        <p role="status" className="rounded-[10px] border border-brand-200 bg-brand-50 px-3.5 py-3 text-sm text-brand-800">
          Company details saved.
        </p>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-900">Company</legend>
        <FileUpload
          kind="employer_logo"
          accept="image/jpeg,image/png,image/webp"
          label="Logo"
          hint="Optional. PNG, JPG or WebP up to 2 MB."
          current={hasLogo ? "Logo on file" : null}
          onUploaded={() => router.refresh()}
        />
        <Text id="companyName" label="Company name" value={values.companyName} onChange={set("companyName")} error={errors.companyName} required />
        <Text
          id="companyEmail"
          label="Company email"
          type="email"
          value={values.companyEmail}
          onChange={() => {}}
          readOnly
          hint="Your sign-up email. It cannot be changed here."
        />
        <Text
          id="websiteUrl"
          label="Website"
          value={values.websiteUrl}
          onChange={set("websiteUrl")}
          placeholder={companyDomainOf(values.companyEmail) || "acme.com"}
          error={errors.websiteUrl}
          hint={
            companyDomainOf(values.companyEmail)
              ? `Must be on ${companyDomainOf(values.companyEmail)} (subdomains are fine).`
              : undefined
          }
          required
        />
        <div>
          <label htmlFor="companySize" className="block text-sm font-medium text-ink-800">
            Company size <span aria-hidden className="text-danger">*</span>
          </label>
          <select
            id="companySize"
            value={values.companySize}
            onChange={set("companySize")}
            required
            aria-invalid={errors.companySize ? true : undefined}
            className={`apple-spring mt-1.5 min-h-11 w-full rounded-[10px] border bg-white px-3 text-[14px] text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 ${errors.companySize ? "border-danger" : "border-ink-200"}`}
          >
            <option value="">Select a size</option>
            {COMPANY_SIZES.map((s) => (
              <option key={s} value={s}>
                {s} people
              </option>
            ))}
          </select>
          {errors.companySize ? <p className="mt-1.5 text-xs text-danger">{errors.companySize}</p> : null}
        </div>
        <Text
          id="gstNumber"
          label="GST number"
          value={values.gstNumber}
          onChange={set("gstNumber")}
          error={errors.gstNumber}
          hint="Optional. Needed for a GST invoice if you are hiring in India."
        />
        <Text
          id="billingPincode"
          label="Billing PIN code"
          value={values.billingPincode}
          onChange={set("billingPincode")}
          error={errors.billingPincode}
          required={needsBillingPincode(values.country)}
          hint="Required for companies in India - it sets CGST + SGST or IGST on your invoice."
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-900">Location</legend>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <CountrySelect id="country" label="Country" value={values.country} onChange={setValue("country")} error={errors.country} required />
          <StateField
            id="state"
            label="State"
            india={isIndiaCountry(values.country)}
            value={values.state}
            onChange={setValue("state")}
            error={errors.state}
            required
          />
          <CityField
            id="city"
            label="City"
            india={isIndiaCountry(values.country)}
            state={values.state}
            onStateChange={setValue("state")}
            value={values.city}
            onChange={setValue("city")}
            error={errors.city}
            required
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-900">Primary contact</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Text id="primaryContactName" label="Name" value={values.primaryContactName} onChange={set("primaryContactName")} error={errors.primaryContactName} required />
          <Text id="primaryContactRole" label="Role" value={values.primaryContactRole} onChange={set("primaryContactRole")} error={errors.primaryContactRole} required />
          <Text
            id="countryCode"
            label="Country code"
            value={values.countryCode}
            onChange={set("countryCode")}
            placeholder="+91"
            error={errors.countryCode}
            required
          />
          <Text
            id="phoneNumber"
            label="Phone"
            type="tel"
            value={values.phoneNumber}
            onChange={set("phoneNumber")}
            error={errors.phoneNumber}
            required
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-900">Escalation contact</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Text id="escalationContactName" label="Name" value={values.escalationContactName} onChange={set("escalationContactName")} error={errors.escalationContactName} required />
          <Text id="escalationContactRole" label="Role" value={values.escalationContactRole} onChange={set("escalationContactRole")} error={errors.escalationContactRole} required />
          <Text
            id="escalationContactEmail"
            label="Email"
            type="email"
            value={values.escalationContactEmail}
            onChange={set("escalationContactEmail")}
            error={errors.escalationContactEmail}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Text
              id="escalationContactCountryCode"
              label="Code"
              value={values.escalationContactCountryCode}
              onChange={set("escalationContactCountryCode")}
              placeholder="+91"
            />
            <Text
              id="escalationContactPhone"
              label="Phone"
              type="tel"
              value={values.escalationContactPhone}
              onChange={set("escalationContactPhone")}
              error={errors.escalationContactPhone}
              required
            />
          </div>
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={busy}
        className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Save company details
      </button>
    </form>
  );
}

function Text({
  id,
  label,
  value,
  onChange,
  type = "text",
  required,
  readOnly,
  placeholder,
  error,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  required?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  error?: string;
  hint?: string;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
        {required ? <span aria-hidden className="text-danger"> *</span> : null}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        required={required}
        readOnly={readOnly}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`apple-spring mt-1.5 min-h-11 w-full rounded-[10px] border bg-white px-3.5 text-[14px] text-ink-900 outline-none placeholder:text-ink-400 read-only:bg-ink-50 read-only:text-ink-600 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 ${error ? "border-danger" : "border-ink-200"}`}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}