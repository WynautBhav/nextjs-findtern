"use client";

/**
 * Company profile editor.
 *
 * Writes to `PATCH /api/employer/:id`, which takes exactly the fields below.
 * The legacy build also had a logo upload endpoint; this covers the text
 * fields, and the logo is left out rather than faked — see the note on the
 * account page.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";

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
};

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

export function CompanyProfileForm({
  employerId,
  profile,
}: {
  employerId: string;
  profile: CompanyProfile;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(profile).map(([k, v]) => [k, v ?? ""])),
  );
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setState("idle");
    setValues((v) => ({ ...v, [key]: e.target.value }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setState("idle");
    try {
      const body = Object.fromEntries(
        Object.entries(values).filter(([, v]) => v.trim() !== ""),
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
        <p role="alert" className="rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {state === "saved" ? (
        <p role="status" className="rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-3 text-sm text-brand-800">
          Company details saved.
        </p>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-900">Company</legend>
        <Text id="companyName" label="Company name" value={values.companyName} onChange={set("companyName")} required />
        <Text id="companyEmail" label="Company email" type="email" value={values.companyEmail} onChange={set("companyEmail")} required />
        <Text
          id="websiteUrl"
          label="Website"
          value={values.websiteUrl}
          onChange={set("websiteUrl")}
          placeholder="findtern.com"
        />
        <div>
          <label htmlFor="companySize" className="block text-sm font-medium text-ink-800">
            Company size
          </label>
          <select
            id="companySize"
            value={values.companySize}
            onChange={set("companySize")}
            className="mt-1.5 h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-brand-600/20"
          >
            <option value="">Not set</option>
            {COMPANY_SIZES.map((s) => (
              <option key={s} value={s}>
                {s} people
              </option>
            ))}
          </select>
        </div>
        <Text id="gstNumber" label="GST number" value={values.gstNumber} onChange={set("gstNumber")} />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-900">Location</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Text id="country" label="Country" value={values.country} onChange={set("country")} />
          <Text id="state" label="State" value={values.state} onChange={set("state")} />
          <Text id="city" label="City" value={values.city} onChange={set("city")} />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-900">Primary contact</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Text id="primaryContactName" label="Name" value={values.primaryContactName} onChange={set("primaryContactName")} />
          <Text id="primaryContactRole" label="Role" value={values.primaryContactRole} onChange={set("primaryContactRole")} />
          <Text
            id="countryCode"
            label="Country code"
            value={values.countryCode}
            onChange={set("countryCode")}
            placeholder="+91"
          />
          <Text
            id="phoneNumber"
            label="Phone"
            type="tel"
            value={values.phoneNumber}
            onChange={set("phoneNumber")}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-900">
          Escalation contact
          <span className="ml-2 text-xs font-normal text-text-subtle">Optional</span>
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Text id="escalationContactName" label="Name" value={values.escalationContactName} onChange={set("escalationContactName")} />
          <Text id="escalationContactRole" label="Role" value={values.escalationContactRole} onChange={set("escalationContactRole")} />
          <Text
            id="escalationContactEmail"
            label="Email"
            type="email"
            value={values.escalationContactEmail}
            onChange={set("escalationContactEmail")}
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
            />
          </div>
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={busy}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
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
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
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
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="mt-1.5 h-10 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 outline-none transition-[border-color,box-shadow] placeholder:text-ink-400 focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-brand-600/20"
      />
    </div>
  );
}