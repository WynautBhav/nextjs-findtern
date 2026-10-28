"use client";

/**
 * Company profile editor.
 *
 * Writes to `PATCH /api/employer/:id`, which takes exactly the fields below
 * and applies the same rules. The logo uploads on its own (FileUpload
 * attaches it server-side).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe2, Loader2 } from "lucide-react";

import { FileUpload } from "@/components/app/file-upload";
import { buttonClass } from "@/components/ui/button";
import { FormNotice, FormSection, SelectField, TextField } from "@/components/employer/company-fields";
import { CityField, CountrySelect, StateField } from "@/components/employer/location-fields";
import { PhoneField } from "@/components/employer/phone-field";
import { csrfFetch } from "@/lib/client-fetch";
import { escalationEmailDomainError, websiteDomainError } from "@/lib/company-domain";
import { isIndiaCountry } from "@/lib/data/countries";
import { COMPANY_SIZE_OPTIONS, ESCALATION_FIELDS, REQUIRED_COMPANY_FIELDS, isPersonalEmail, needsBillingPincode } from "@/lib/employer-onboarding";
import { phoneChangeError } from "@/lib/phone";
import { timezoneForLocation } from "@/lib/timezones";

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

type Values = Record<keyof CompanyProfile, string>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The company domain the website must match, or "" for a personal-mailbox login. */
function companyDomainOf(email: string): string {
  const e = (email ?? "").trim();
  if (!e.includes("@") || isPersonalEmail(e)) return "";
  return e.split("@").pop()!.toLowerCase();
}

/**
 * Everything is mandatory except the logo and the GST number. The escalation
 * contact is mandatory (bug sheet 7 S1 r92) with a company email that is not
 * the sign-in email (r103, r136); the website must sit on the sign-in
 * email's domain (r91). Rules already satisfied by what's on file (an older
 * website, an older phone) are not re-applied, so an older account can still
 * save the rest. The server applies the same rules.
 */
function validate(v: Values, saved: CompanyProfile): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [key, label] of REQUIRED_COMPANY_FIELDS) {
    if (!v[key as keyof Values]?.trim()) errors[key] = `${label} is required.`;
  }
  if (!errors.websiteUrl && v.websiteUrl.trim() !== (saved.websiteUrl ?? "").trim()) {
    const domain = companyDomainOf(v.companyEmail);
    const problem = websiteDomainError(v.websiteUrl, v.companyEmail, { skipDomainCheck: !domain });
    if (problem) errors.websiteUrl = problem;
  }
  if (!errors.phoneNumber) {
    const problem = phoneChangeError(v.countryCode, v.phoneNumber, { countryCode: saved.countryCode, phone: saved.phoneNumber });
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
    else if (email.toLowerCase() === v.companyEmail.trim().toLowerCase()) {
      errors.escalationContactEmail = "Use a different email from the company sign-in email.";
    } else if (email.toLowerCase() !== (saved.escalationContactEmail ?? "").trim().toLowerCase()) {
      const problem = escalationEmailDomainError(email, v.companyEmail, { skipDomainCheck: !companyDomainOf(v.companyEmail) });
      if (problem) errors.escalationContactEmail = problem;
    }
  }
  if (!errors.escalationContactPhone) {
    const problem = phoneChangeError(v.escalationContactCountryCode || "+91", v.escalationContactPhone, {
      countryCode: saved.escalationContactCountryCode,
      phone: saved.escalationContactPhone,
    });
    if (problem) errors.escalationContactPhone = problem;
    else if (
      v.escalationContactCountryCode === v.countryCode &&
      v.escalationContactPhone.replace(/\D/g, "") === v.phoneNumber.replace(/\D/g, "")
    ) {
      errors.escalationContactPhone = "Use a different number from the primary contact's.";
    }
  }
  return errors;
}

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
  const [values, setValues] = useState<Values>(() => ({
    ...(Object.fromEntries(Object.entries(profile).map(([k, v]) => [k, v ?? ""])) as Values),
    countryCode: profile.countryCode || "+91",
    // Older rows have no escalation code; the dropdown starts on India.
    escalationContactCountryCode: profile.escalationContactCountryCode || "+91",
  }));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Functional merge: picking a city sets the city and then the state in the
  // same tick.
  const set = (patch: Partial<Values>) => {
    setSaved(false);
    setValues((v) => ({ ...v, ...patch }));
    setErrors((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(patch)) delete next[k];
      return next;
    });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problems = validate(values, profile);
    setErrors(problems);
    if (Object.keys(problems).length > 0) {
      setError("Some details need a look - see the highlighted fields.");
      setSaved(false);
      document.getElementById(Object.keys(problems)[0])?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      // A cleared optional field is sent as null so it actually clears. The
      // sign-in email is read-only (the route ignores it).
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
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't save the profile.");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the profile.");
    } finally {
      setBusy(false);
    }
  }

  const india = isIndiaCountry(values.country);
  const domain = companyDomainOf(values.companyEmail);

  return (
    <form className="space-y-10" noValidate onSubmit={submit}>
      <FormSection title="Company">
        <FileUpload
          kind="employer_logo"
          accept="image/jpeg,image/png,image/webp"
          label="Logo (optional)"
          noun="logo"
          hint="PNG, JPG or WebP up to 2 MB."
          current={hasLogo ? "Logo on file" : null}
          onUploaded={() => router.refresh()}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField id="companyName" label="Company name" required value={values.companyName} onChange={(v) => set({ companyName: v })} error={errors.companyName} />
          <SelectField
            id="companySize"
            label="Company size"
            required
            value={values.companySize}
            options={COMPANY_SIZE_OPTIONS}
            onChange={(v) => set({ companySize: v })}
            error={errors.companySize}
          />
          <TextField
            id="companyEmail"
            label="Sign-in email"
            type="email"
            value={values.companyEmail}
            onChange={() => {}}
            readOnly
            hint="Your sign-in email can't be changed here. Write to us if it has to change."
          />
          <TextField
            id="websiteUrl"
            label="Website"
            required
            type="url"
            inputMode="url"
            value={values.websiteUrl}
            onChange={(v) => set({ websiteUrl: v })}
            placeholder={domain || "acme.com"}
            error={errors.websiteUrl}
            hint={domain ? `Must be on ${domain} (subdomains are fine).` : undefined}
          />
        </div>
      </FormSection>

      <FormSection title="Location and billing">
        <div className="grid gap-5 sm:grid-cols-3">
          <CountrySelect
            id="country"
            label="Country"
            required
            value={values.country}
            onChange={(v) => set({ country: v, state: "", city: "" })}
            error={errors.country}
          />
          <StateField
            id="state"
            label="State"
            required
            india={india}
            value={values.state}
            onChange={(v) => set({ state: v, ...(v !== values.state ? { city: "" } : {}) })}
            error={errors.state}
          />
          <CityField
            id="city"
            label="City"
            required
            india={india}
            state={values.state}
            onStateChange={(v) => set({ state: v })}
            value={values.city}
            onChange={(v) => set({ city: v })}
            error={errors.city}
          />
        </div>
        {values.country ? (
          <p className="flex items-start gap-2 text-sm text-ink-600">
            <Globe2 className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
            <span>
              Your timezone for meetings and offers:{" "}
              <span className="font-medium text-ink-900">{timezoneForLocation(values)}</span>
            </span>
          </p>
        ) : null}
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="billingPincode"
            label="Billing PIN code"
            required={needsBillingPincode(values.country)}
            inputMode="numeric"
            maxLength={6}
            value={values.billingPincode}
            onChange={(v) => set({ billingPincode: v.replace(/\D/g, "").slice(0, 6) })}
            error={errors.billingPincode}
            hint={india ? "Sets CGST + SGST or IGST on your invoice." : "Only needed for an Indian billing address."}
          />
          <TextField
            id="gstNumber"
            label="GST number"
            optional
            value={values.gstNumber}
            onChange={(v) => set({ gstNumber: v.toUpperCase() })}
            error={errors.gstNumber}
            hint="For a GST invoice if you're registered in India."
          />
        </div>
      </FormSection>

      <FormSection title="Primary contact" hint="The first person an intern or a Findtern coordinator calls.">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField id="primaryContactName" label="Name" required value={values.primaryContactName} onChange={(v) => set({ primaryContactName: v })} error={errors.primaryContactName} />
          <TextField id="primaryContactRole" label="Role" required value={values.primaryContactRole} onChange={(v) => set({ primaryContactRole: v })} error={errors.primaryContactRole} />
        </div>
        <PhoneField
          id="phoneNumber"
          required
          code={values.countryCode}
          onCodeChange={(v) => set({ countryCode: v })}
          number={values.phoneNumber}
          onNumberChange={(v) => set({ phoneNumber: v })}
          error={errors.phoneNumber}
        />
      </FormSection>

      <FormSection title="Escalation contact" hint="A second person, for when the primary contact can't be reached.">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField id="escalationContactName" label="Name" required value={values.escalationContactName} onChange={(v) => set({ escalationContactName: v })} error={errors.escalationContactName} />
          <TextField id="escalationContactRole" label="Role" required value={values.escalationContactRole} onChange={(v) => set({ escalationContactRole: v })} error={errors.escalationContactRole} />
        </div>
        <TextField
          id="escalationContactEmail"
          label="Email"
          required
          type="email"
          inputMode="email"
          value={values.escalationContactEmail}
          onChange={(v) => set({ escalationContactEmail: v })}
          error={errors.escalationContactEmail}
          placeholder={domain ? `name@${domain}` : undefined}
          hint={domain ? `On ${domain}, and not your sign-in email.` : undefined}
        />
        <PhoneField
          id="escalationContactPhone"
          required
          code={values.escalationContactCountryCode}
          onCodeChange={(v) => set({ escalationContactCountryCode: v })}
          number={values.escalationContactPhone}
          onNumberChange={(v) => set({ escalationContactPhone: v })}
          error={errors.escalationContactPhone}
        />
      </FormSection>

      <div className="space-y-4 border-t border-ink-100 pt-6">
        {error ? <FormNotice tone="error">{error}</FormNotice> : null}
        {saved ? <FormNotice tone="success">Company details saved.</FormNotice> : null}
        <button type="submit" disabled={busy} className={buttonClass({ variant: "primary", size: "md" })}>
          {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          Save company details
        </button>
      </div>
    </form>
  );
}
