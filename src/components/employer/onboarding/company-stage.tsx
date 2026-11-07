"use client";

import { Globe2 } from "lucide-react";

import { FileUpload } from "@/components/app/file-upload";
import { FormSection, SelectField, TextField } from "@/components/employer/company-fields";
import { CityField, CountrySelect, StateField } from "@/components/employer/location-fields";
import { PhoneField } from "@/components/employer/phone-field";
import { companyDomainOf } from "@/components/employer/onboarding/validation";
import { isIndiaCountry } from "@/lib/data/countries";
import { dialCodeFor } from "@/lib/data/dial-codes";
import { timezoneForLocation } from "@/lib/timezones";
import { COMPANY_SIZE_OPTIONS, type CompanyDraft } from "@/lib/employer-onboarding";

export function CompanyStage({
  values,
  errors,
  setCompany,
}: {
  values: CompanyDraft;
  errors: Record<string, string>;
  setCompany: (patch: Partial<CompanyDraft>) => void;
}) {
  const domain = companyDomainOf(values.companyEmail);
  const india = isIndiaCountry(values.country);
  const zone = values.country ? timezoneForLocation(values) : null;
  return (
    <div className="space-y-10">
      <FormSection title="Company">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="companyName"
            label="Company name"
            required
            value={values.companyName}
            error={errors.companyName}
            onChange={(v) => setCompany({ companyName: v })}
          />
          <SelectField
            id="companySize"
            label="Company size"
            required
            value={values.companySize}
            options={COMPANY_SIZE_OPTIONS}
            error={errors.companySize}
            onChange={(v) => setCompany({ companySize: v })}
          />
          <TextField
            id="companyEmail"
            label="Company email"
            type="email"
            value={values.companyEmail}
            hint="Your sign-in email. It can't be changed here."
            readOnly
            onChange={() => {}}
          />
          <TextField
            id="websiteUrl"
            label="Website"
            required
            type="url"
            inputMode="url"
            placeholder={domain || "acme.com"}
            hint={domain ? `Must be on ${domain} (subdomains are fine).` : undefined}
            value={values.websiteUrl}
            error={errors.websiteUrl}
            onChange={(v) => setCompany({ websiteUrl: v })}
          />
        </div>
        <FileUpload
          kind="employer_logo"
          accept="image/jpeg,image/png,image/webp"
          label="Logo (optional)"
          noun="logo"
          hint="PNG, JPG or WebP up to 2 MB. Shown next to your project on a candidate's offer."
          current={values.logoUrl ? "Logo on file" : null}
          onUploaded={(r) => setCompany({ logoUrl: r.url })}
        />
      </FormSection>

      <FormSection title="Location and billing" hint="Your timezone for meetings and offers is set from here.">
        <div className="grid gap-5 sm:grid-cols-3">
          <CountrySelect
            id="country"
            label="Country"
            required
            value={values.country}
            error={errors.country}
            onChange={(v) => {
              // Phone codes still on the old country's follow the new one, and
              // a PIN only means something in India (QA-114).
              const before = dialCodeFor(values.country) ?? "+91";
              const next = dialCodeFor(v);
              const follow = (code: string) => (next && (!code || code === before) ? next : code);
              setCompany({
                country: v,
                state: "",
                city: "",
                primaryContactCountryCode: follow(values.primaryContactCountryCode),
                escalationContactCountryCode: follow(values.escalationContactCountryCode),
                ...(isIndiaCountry(v) ? {} : { billingPincode: "" }),
              });
            }}
          />
          <StateField
            id="state"
            label="State"
            required
            india={india}
            value={values.state}
            error={errors.state}
            onChange={(v) => setCompany({ state: v, ...(v !== values.state ? { city: "" } : {}) })}
          />
          <CityField
            id="city"
            label="City"
            required
            india={india}
            state={values.state}
            onStateChange={(v) => setCompany({ state: v })}
            value={values.city}
            error={errors.city}
            onChange={(v) => setCompany({ city: v })}
          />
        </div>
        {zone ? (
          <p className="flex items-start gap-2 text-sm text-ink-600">
            <Globe2 className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
            <span>
              Your timezone: <span className="font-medium text-ink-900">{zone}</span>
            </span>
          </p>
        ) : null}
        <div className="grid gap-5 sm:grid-cols-2">
          {india ? (
            <TextField
              id="billingPincode"
              label="Billing PIN code"
              required
              inputMode="numeric"
              maxLength={6}
              hint="Sets the GST on your invoice: CGST + SGST within Rajasthan, IGST elsewhere."
              value={values.billingPincode}
              error={errors.billingPincode}
              onChange={(v) => setCompany({ billingPincode: v.replace(/\D/g, "").slice(0, 6) })}
            />
          ) : null}
          <TextField
            id="gstNumber"
            label="GST number"
            optional
            hint="For a GST invoice if you're registered in India."
            value={values.gstNumber}
            error={errors.gstNumber}
            onChange={(v) => setCompany({ gstNumber: v.toUpperCase() })}
          />
        </div>
      </FormSection>

      <FormSection title="Primary contact" hint="The first person an intern or a Findtern coordinator calls.">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="primaryContactName"
            label="Full name"
            required
            autoComplete="name"
            value={values.primaryContactName}
            error={errors.primaryContactName}
            onChange={(v) => setCompany({ primaryContactName: v })}
          />
          <TextField
            id="primaryContactRole"
            label="Role"
            required
            placeholder="Talent acquisition"
            value={values.primaryContactRole}
            error={errors.primaryContactRole}
            onChange={(v) => setCompany({ primaryContactRole: v })}
          />
        </div>
        <PhoneField
          id="primaryContactPhone"
          required
          code={values.primaryContactCountryCode}
          onCodeChange={(v) => setCompany({ primaryContactCountryCode: v })}
          number={values.primaryContactPhone}
          error={errors.primaryContactPhone}
          onNumberChange={(v) => setCompany({ primaryContactPhone: v })}
        />
      </FormSection>

      <FormSection
        title="Escalation contact"
        hint="A second person, for when the primary contact can't be reached mid-internship. A different email and phone from the primary contact."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="escalationContactName"
            label="Full name"
            required
            value={values.escalationContactName}
            error={errors.escalationContactName}
            onChange={(v) => setCompany({ escalationContactName: v })}
          />
          <TextField
            id="escalationContactRole"
            label="Role"
            required
            value={values.escalationContactRole}
            error={errors.escalationContactRole}
            onChange={(v) => setCompany({ escalationContactRole: v })}
          />
        </div>
        <TextField
          id="escalationContactEmail"
          label="Email"
          required
          type="email"
          inputMode="email"
          placeholder={domain ? `name@${domain}` : undefined}
          hint={domain ? `On ${domain}, and not your sign-in email.` : undefined}
          value={values.escalationContactEmail}
          error={errors.escalationContactEmail}
          onChange={(v) => setCompany({ escalationContactEmail: v })}
        />
        <PhoneField
          id="escalationContactPhone"
          required
          code={values.escalationContactCountryCode}
          onCodeChange={(v) => setCompany({ escalationContactCountryCode: v })}
          number={values.escalationContactPhone}
          error={errors.escalationContactPhone}
          onNumberChange={(v) => setCompany({ escalationContactPhone: v })}
        />
      </FormSection>
    </div>
  );
}
