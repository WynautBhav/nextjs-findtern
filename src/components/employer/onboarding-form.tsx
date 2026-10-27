"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Globe2, Save } from "lucide-react";

import { Surface } from "@/components/app/primitives";
import { FileUpload } from "@/components/app/file-upload";
import { buttonClass } from "@/components/ui/button";
import { FormNotice, FormSection, SelectField, TextField } from "@/components/employer/company-fields";
import { CityField, CountrySelect, StateField } from "@/components/employer/location-fields";
import { PhoneField } from "@/components/employer/phone-field";
import { ProjectFields, projectFormErrors, type ProjectBaseline } from "@/components/employer/project-fields";
import { csrfFetch } from "@/lib/client-fetch";
import { escalationEmailDomainError, websiteDomainError } from "@/lib/company-domain";
import { isIndiaCountry } from "@/lib/data/countries";
import { phoneChangeError } from "@/lib/phone";
import { timezoneForLocation } from "@/lib/timezones";
import { cn } from "@/lib/utils";
import {
  COMPANY_SIZE_OPTIONS,
  isPersonalEmail,
  type CompanyDraft,
  type OnboardingDraft,
  type ProjectDraft,
} from "@/lib/employer-onboarding";

/**
 * Employer onboarding: company, then project.
 *
 * Two stages rather than the legacy flow's five-plus-one. "Save and
 * continue" saves the company (`PATCH /api/employer/:id`) before moving on,
 * and creating the project finishes onboarding and opens the dashboard; the
 * hiring screens send an employer back here until both exist
 * (lib/employer-setup). A localStorage draft means a half-finished setup
 * survives a refresh.
 *
 * The project stage is the same `ProjectFields` the Projects page uses, so
 * the rules (4-7 skills, nothing pre-selected, an Indian city for on-site
 * roles) are the same in both places.
 */

const DRAFT_KEY = "findtern:employer-onboarding:v1";

const STAGES = [
  { id: "company", title: "Your company", blurb: "Who you are, and who we call when an intern needs an answer." },
  { id: "project", title: "Your first project", blurb: "The role you're hiring for. Candidates are matched on it." },
] as const;

type StageIndex = 0 | 1;

type Props = {
  initial: OnboardingDraft;
  hasExistingProject: boolean;
  employerId: string;
  existingProjectId?: string;
  /** 1 when the company is already complete and only the project is missing. */
  initialStage?: StageIndex;
};

export function EmployerOnboardingForm({
  initial,
  hasExistingProject,
  employerId,
  existingProjectId,
  initialStage = 0,
}: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<StageIndex>(initialStage);
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState<{ company?: CompanyDraft; project?: ProjectDraft }>({});
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const stored = useSyncExternalStore(subscribeToNothing, readDraft, () => null);

  // Merged per stage, not with a top-level spread: `{ ...initial, ...draft }`
  // would let a draft that only has `company` blank out `project` entirely.
  const values = useMemo<OnboardingDraft>(() => {
    const draft = parseDraft(stored);
    return {
      // The company email is the sign-up login: always the server's value.
      company: {
        ...initial.company,
        ...draft.company,
        ...edits.company,
        companyEmail: initial.company.companyEmail,
      },
      project: { ...initial.project, ...draft.project, ...edits.project },
    };
  }, [initial, stored, edits]);

  useEffect(() => {
    if (!dirty) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
    } catch {
      // Quota errors in private mode are non-fatal; state lives in memory too.
    }
  }, [values, dirty]);

  // Patches merge onto the latest pending edit, not the render's snapshot:
  // picking a city sets the city and then the state in one tick, and the
  // second patch used to overwrite the first.
  function setCompany(patch: Partial<CompanyDraft>) {
    setEdits((prev) => {
      const before = prev.company ?? values.company;
      const company = { ...before, ...patch };
      // The first project's timezone follows the company's location until
      // the employer picks one themselves (bug sheet 7, S2 r3).
      const project = prev.project ?? values.project;
      const followTimezone =
        !hasExistingProject && ("country" in patch || "state" in patch) && project.timezone === timezoneForLocation(before);
      return {
        ...prev,
        company,
        ...(followTimezone ? { project: { ...project, timezone: timezoneForLocation(company) } } : {}),
      };
    });
    clearErrors(Object.keys(patch));
    setDirty(true);
  }

  function setProject(patch: Partial<ProjectDraft>) {
    setEdits((prev) => ({ ...prev, project: { ...(prev.project ?? values.project), ...patch } }));
    clearErrors(Object.keys(patch));
    setDirty(true);
  }

  function clearErrors(keys: string[]) {
    setErrors((prev) => {
      if (!keys.some((k) => k in prev)) return prev;
      const next = { ...prev };
      for (const k of keys) delete next[k];
      return next;
    });
  }

  function goTo(next: StageIndex) {
    setStage(next);
    setNotice(null);
    setErrors({});
    window.requestAnimationFrame(() => headingRef.current?.focus());
  }

  function focusFirst(problems: Record<string, string>) {
    const first = Object.keys(problems)[0];
    if (!first) return;
    const el =
      document.getElementById(first) ??
      document.getElementById(`onboard-${first}`) ??
      document.querySelector<HTMLElement>(`[name="${first}"]`);
    el?.focus();
  }

  async function saveCompany(): Promise<boolean> {
    const problems = companyErrors(values.company, initial.company);
    setErrors(problems);
    if (Object.keys(problems).length > 0) {
      setNotice({ tone: "error", text: "A few details need a look - see the highlighted fields." });
      focusFirst(problems);
      return false;
    }
    setNotice(null);
    setBusy(true);
    try {
      // The primary contact's number is stored as the account's own country
      // code + phone number. companyEmail is read-only (the route ignores it).
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { primaryContactCountryCode, primaryContactPhone, companyEmail, ...company } = values.company;
      const res = await csrfFetch(`/api/employer/${employerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...company, countryCode: primaryContactCountryCode, phoneNumber: primaryContactPhone }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setNotice(res.ok ? { tone: "success", text: "Company details saved." } : { tone: "error", text: data.error ?? "Couldn't save. Try again." });
      return res.ok;
    } catch {
      setNotice({ tone: "error", text: "Couldn't reach the server. Your answers are kept in this browser; try again." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onContinue() {
    // Continuing saves first: the project stage is no use without a company.
    if (await saveCompany()) goTo(1);
  }

  async function saveProject() {
    const baseline: ProjectBaseline | null = hasExistingProject
      ? {
          skills: initial.project.skills,
          preferredLocations: initial.project.preferredLocations,
          scopeOfWork: initial.project.scopeOfWork,
          city: initial.project.city,
          state: initial.project.state,
          locationType: initial.project.locationType,
        }
      : null;
    const problems = projectFormErrors(values.project, baseline);
    setErrors(problems);
    if (Object.keys(problems).length > 0) {
      setNotice({ tone: "error", text: "A few details need a look - see the highlighted fields." });
      return;
    }
    setNotice(null);
    setBusy(true);
    const p = values.project;
    const remote = p.locationType === "remote";
    try {
      const res = await csrfFetch(
        hasExistingProject ? `/api/employer/projects/${existingProjectId}` : `/api/employer/${employerId}/projects`,
        {
          method: hasExistingProject ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...p,
            projectName: p.projectName.trim(),
            city: remote ? null : p.city.trim() || null,
            state: remote ? null : p.state.trim() || null,
            preferredLocations: remote ? [] : p.preferredLocations,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setNotice({ tone: "error", text: data.error ?? "Couldn't save the project. Try again." });
        return;
      }
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        // Private mode - nothing was stored.
      }
      router.push("/employer/dashboard");
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "Couldn't reach the server. Your answers are kept in this browser; try again." });
    } finally {
      setBusy(false);
    }
  }

  const current = STAGES[stage];

  return (
    <div className="mx-auto max-w-4xl">
      <nav aria-label="Setup steps" className="mb-6">
        <ol className="grid grid-cols-2 gap-3">
          {STAGES.map((item, i) => {
            const state = i === stage ? "current" : i < stage ? "done" : "todo";
            return (
              <li key={item.id}>
                <button
                  type="button"
                  // Skipping ahead still saves the company first.
                  onClick={() => (i === 1 && stage === 0 ? void onContinue() : goTo(i as StageIndex))}
                  aria-current={state === "current" ? "step" : undefined}
                  className={cn(
                    "apple-spring flex w-full items-center gap-3 rounded-apple-lg border px-4 py-3 text-left",
                    state === "current"
                      ? "border-brand-300 bg-white shadow-xs"
                      : "border-transparent bg-ink-100/60 hover:bg-ink-100",
                  )}
                >
                  <span
                    className={cn(
                      "nums grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold",
                      state === "current" && "bg-brand-700 text-white",
                      state === "done" && "bg-brand-100 text-brand-800",
                      state === "todo" && "bg-white text-ink-600 ring-1 ring-inset ring-ink-200",
                    )}
                  >
                    {state === "done" ? <Check className="size-4" aria-hidden /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-ink-600">Step {i + 1} of 2</span>
                    <span className={cn("block truncate text-sm font-semibold", state === "current" ? "text-ink-900" : "text-ink-700")}>
                      {item.title}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <Surface className="p-5 sm:p-8">
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold tracking-[-0.015em] text-ink-900 outline-none">
          {current.title}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-600">{current.blurb}</p>

        <div className="mt-8">
          {stage === 0 ? (
            <CompanyStage values={values.company} errors={errors} setCompany={setCompany} />
          ) : (
            <ProjectFields
              values={values.project}
              set={setProject}
              errors={errors}
              companyPlace={{ city: values.company.city, state: values.company.state }}
              idPrefix="onboard"
              showPincode
            />
          )}
        </div>

        {notice ? (
          <FormNotice tone={notice.tone} className="mt-8">
            {notice.text}
          </FormNotice>
        ) : null}

        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-ink-100 pt-6 sm:flex-row sm:items-center">
          {stage > 0 ? (
            <button type="button" onClick={() => goTo(0)} className={buttonClass({ variant: "light", size: "md" })}>
              <ArrowLeft className="size-4" aria-hidden />
              Back
            </button>
          ) : (
            <button type="button" onClick={saveCompany} disabled={busy} className={buttonClass({ variant: "outline", size: "md" })}>
              <Save className="size-4" aria-hidden />
              Save for later
            </button>
          )}
          <p className="text-xs text-ink-600 sm:mr-auto sm:pl-1">Unsaved answers are kept in this browser.</p>
          {stage === 0 ? (
            <button type="button" onClick={onContinue} disabled={busy} className={buttonClass({ variant: "primary", size: "md" })}>
              {busy ? "Saving…" : "Save and continue"}
              <ArrowRight className="size-4" aria-hidden />
            </button>
          ) : (
            <button type="button" onClick={saveProject} disabled={busy} className={buttonClass({ variant: "primary", size: "md" })}>
              {busy ? "Saving…" : hasExistingProject ? "Save project" : "Create project and finish"}
              <ArrowRight className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </Surface>
    </div>
  );
}

/* ── Stage 1: company ────────────────────────────────────────────────────── */

function CompanyStage({
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
            onChange={(v) => setCompany({ country: v, state: "", city: "" })}
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
          <TextField
            id="billingPincode"
            label="Billing PIN code"
            required={india}
            inputMode="numeric"
            maxLength={6}
            hint={india ? "Sets the GST on your invoice: CGST + SGST within Rajasthan, IGST elsewhere." : "Only needed for an Indian billing address."}
            value={values.billingPincode}
            error={errors.billingPincode}
            onChange={(v) => setCompany({ billingPincode: v.replace(/\D/g, "").slice(0, 6) })}
          />
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

/* ── Validation ──────────────────────────────────────────────────────────── */

/** The company domain the website must match, or "" for a personal-mailbox login. */
function companyDomainOf(email: string): string {
  const e = email.trim();
  if (!e.includes("@") || isPersonalEmail(e)) return "";
  return e.split("@").pop()!.toLowerCase();
}

function companyErrors(c: CompanyDraft, saved: CompanyDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const email = c.companyEmail.trim();
  if (c.companyName.trim().length < 2) errors.companyName = "Company name is required.";
  if (!c.companySize) errors.companySize = "Pick a company size.";
  if (!c.websiteUrl.trim()) {
    errors.websiteUrl = "Website is required.";
  } else if (c.websiteUrl.trim() !== saved.websiteUrl.trim()) {
    // A website already on file is kept; the domain rule applies when it is
    // entered or changed (the route checks the same).
    const problem = websiteDomainError(c.websiteUrl, email, { skipDomainCheck: !companyDomainOf(email) });
    if (problem) errors.websiteUrl = problem;
  }
  if (!c.country.trim()) errors.country = "Country is required.";
  if (!c.state.trim()) errors.state = "State is required.";
  if (!c.city.trim()) errors.city = "City is required.";
  if (isIndiaCountry(c.country) && !/^[1-9]\d{5}$/.test(c.billingPincode.trim())) {
    errors.billingPincode = "Enter the 6-digit PIN code of your billing address.";
  }
  if (c.gstNumber.trim() && !/^[0-9A-Z]{15}$/.test(c.gstNumber.trim())) {
    errors.gstNumber = "A GST number is 15 characters, letters and digits only.";
  }
  if (c.primaryContactName.trim().length < 2) errors.primaryContactName = "A primary contact name is required.";
  if (c.primaryContactRole.trim().length < 2) errors.primaryContactRole = "Their role is required, e.g. Talent acquisition.";
  const primaryPhone = phoneChangeError(c.primaryContactCountryCode, c.primaryContactPhone, {
    countryCode: saved.primaryContactCountryCode,
    phone: saved.primaryContactPhone,
  });
  if (primaryPhone) errors.primaryContactPhone = primaryPhone;

  // The escalation contact is mandatory (bug sheet 7 S1 r92): name, role,
  // email and phone, a different person from the primary contact.
  if (!c.escalationContactName.trim()) errors.escalationContactName = "An escalation contact name is required.";
  if (!c.escalationContactRole.trim()) errors.escalationContactRole = "Their role is required.";
  const escalationEmail = c.escalationContactEmail.trim();
  if (!escalationEmail) {
    errors.escalationContactEmail = "An escalation contact email is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(escalationEmail)) {
    errors.escalationContactEmail = "Enter a valid email address.";
  } else if (isPersonalEmail(escalationEmail)) {
    errors.escalationContactEmail = "Use a company email for the escalation contact.";
  } else if (escalationEmail.toLowerCase() === email.toLowerCase()) {
    errors.escalationContactEmail = "Use a different email from your sign-in email.";
  } else if (escalationEmail.toLowerCase() !== saved.escalationContactEmail.trim().toLowerCase()) {
    const problem = escalationEmailDomainError(escalationEmail, email, { skipDomainCheck: !companyDomainOf(email) });
    if (problem) errors.escalationContactEmail = problem;
  }
  if (!c.escalationContactPhone.trim()) {
    errors.escalationContactPhone = "An escalation contact phone is required.";
  } else {
    const problem = phoneChangeError(c.escalationContactCountryCode, c.escalationContactPhone, {
      countryCode: saved.escalationContactCountryCode,
      phone: saved.escalationContactPhone,
    });
    if (problem) errors.escalationContactPhone = problem;
    else if (
      c.escalationContactCountryCode === c.primaryContactCountryCode &&
      c.escalationContactPhone.replace(/\D/g, "") === c.primaryContactPhone.replace(/\D/g, "")
    ) {
      errors.escalationContactPhone = "Use a different number from the primary contact's.";
    }
  }
  return errors;
}

/* ── Draft persistence ───────────────────────────────────────────────────── */

/** localStorage is not observable, so there is nothing to subscribe to. */
function subscribeToNothing() {
  return () => {};
}

/* Returns the raw string, not a parsed object: useSyncExternalStore compares
 * snapshots with Object.is, and JSON.parse would hand back a fresh object on
 * every call - an unconditional re-render loop. */
function readDraft(): string | null {
  try {
    return window.localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}

type DraftPatch = {
  company?: Partial<CompanyDraft>;
  project?: Partial<ProjectDraft>;
};

function parseDraft(raw: string | null): DraftPatch {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const record = parsed as Record<string, unknown>;
    // Whitelisted keys only; the form re-validates on submit anyway.
    return {
      company: pick(record.company, COMPANY_KEYS) as Partial<CompanyDraft>,
      project: pick(record.project, PROJECT_KEYS) as Partial<ProjectDraft>,
    };
  } catch {
    // A corrupt draft is not worth an error state - the form still works.
    return {};
  }
}

/** Keep only the keys this form wrote, so a hand-edited draft cannot inject fields. */
function pick(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (record[key] !== undefined) out[key] = record[key];
  }
  return out;
}

// companyEmail is deliberately absent: it is read-only and always the server's.
const COMPANY_KEYS = [
  "companyName",
  "websiteUrl",
  "logoUrl",
  "companySize",
  "country",
  "state",
  "city",
  "primaryContactName",
  "primaryContactRole",
  "primaryContactCountryCode",
  "primaryContactPhone",
  "escalationContactName",
  "escalationContactRole",
  "escalationContactEmail",
  "escalationContactCountryCode",
  "escalationContactPhone",
  "gstNumber",
  "billingPincode",
] as const;

const PROJECT_KEYS = [
  "projectName",
  "skills",
  "scopeOfWork",
  "fullTimeOffer",
  "locationType",
  "preferredLocations",
  "pincode",
  "city",
  "state",
  "timezone",
] as const;
