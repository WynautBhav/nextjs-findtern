"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { FileUpload } from "@/components/app/file-upload";
import { CityField, CountrySelect, StateField, districtOptions } from "@/components/employer/location-fields";
import { isIndiaCountry } from "@/lib/data/countries";

import { suggestSkills } from "@/lib/data/skills";
import { csrfFetch } from "@/lib/client-fetch";
import { phoneError } from "@/lib/phone";
import { websiteDomainError } from "@/lib/company-domain";
import { MAX_PROJECT_LOCATIONS, projectLocationsError } from "@/lib/project-locations";
import { TIMEZONES, timezoneForLocation } from "@/lib/timezones";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  FolderKanban,
  Info,
  Plus,
  Save,
  TriangleAlert,
  X,
} from "lucide-react";

import {
  COMPANY_SIZE_OPTIONS,
  COUNTRY_CODE_OPTIONS,
  LOCATION_TYPES,
  SCOPE_OPTIONS,
  TIMEZONE_OPTIONS,
  isPersonalEmail,
  type CompanyDraft,
  type OnboardingDraft,
  type ProjectDraft,
} from "@/lib/employer-onboarding";

/**
 * Employer onboarding: company, then project.
 *
 * Two stages rather than the legacy flow's five-plus-one. The legacy
 * `company-setup.tsx` was a 1,247-line react-hook-form file whose only job was
 * to validate a flat object, and `employer-onboarding.tsx` was a second
 * 1,329-line file doing the same for a project. Both send the same shape their
 * form collected, so the stepper here carries all of the state and the two
 * record shapes live in `lib/employer-onboarding.ts`.
 *
 * "Continue" saves the company (`PATCH /api/employer/:id`) before moving on,
 * and creating the project finishes onboarding and opens the dashboard - the
 * hiring screens send an employer back here until both exist
 * (lib/employer-setup). A localStorage draft means a half-finished setup
 * survives a refresh.
 *
 * Motion is CSS-only: globals.css collapses transitions under
 * `prefers-reduced-motion`, and nothing here listens to scroll.
 */

const DRAFT_KEY = "findtern:employer-onboarding:v1";

const STAGES = [
  {
    id: "company",
    title: "Company",
    blurb: "Who you are and who we call when an intern needs an answer.",
    icon: Building2,
  },
  {
    id: "project",
    title: "Project",
    blurb: "The role you are hiring for. Candidates are matched on this.",
    icon: FolderKanban,
  },
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
  const [edits, setEdits] = useState<Partial<OnboardingDraft>>({});
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [skillDraft, setSkillDraft] = useState("");
  const [placeDraft, setPlaceDraft] = useState("");
  const blurbRef = useRef<HTMLParagraphElement>(null);

  const stored = useSyncExternalStore(subscribeToNothing, readDraft, () => null);

  // Merged per stage, not with a top-level spread: `{ ...initial, ...draft }`
  // would let a draft that only has `company` blank out `project` entirely.
  const values = useMemo<OnboardingDraft>(() => {
    const draft = parseDraft(stored);
    return {
      // The company email is the sign-up login: always the server's value,
      // never a browser draft or an edit.
      company: {
        ...initial.company,
        ...draft.company,
        ...edits.company,
        companyEmail: initial.company.companyEmail,
      },
      project: { ...initial.project, ...draft.project, ...edits.project },
    };
  }, [initial, stored, edits]);

  // Persisting is the one thing an effect is for here: writing the latest value
  // out to an external store. Without the `dirty` guard, the first run after
  // loading a saved draft would overwrite it with the server's values.
  useEffect(() => {
    if (!dirty) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
    } catch {
      // Quota errors in private mode are non-fatal; state lives in memory too.
    }
  }, [values, dirty]);

  function setCompany(patch: Partial<CompanyDraft>) {
    const company = { ...values.company, ...patch };
    // The first project's timezone follows the company's country and state
    // until the employer picks one themselves (bug sheet 26 Oct).
    const followTimezone =
      !hasExistingProject &&
      ("country" in patch || "state" in patch) &&
      values.project.timezone === timezoneForLocation(values.company);
    setEdits((prev) => ({
      ...prev,
      company,
      ...(followTimezone ? { project: { ...values.project, timezone: timezoneForLocation(company) } } : {}),
    }));
    setDirty(true);
  }

  function setProject(patch: Partial<ProjectDraft>) {
    setEdits((prev) => ({ ...prev, project: { ...values.project, ...patch } }));
    setDirty(true);
  }

  function goTo(next: number) {
    setStage(next === 1 ? 1 : 0);
    setNotice(null);
    setErrors({});
    blurbRef.current?.focus();
  }

  async function onContinue() {
    // Continuing used to only validate, so an employer could reach the
    // project stage (and then the dashboard) with no company saved at all.
    if (await onSaveCompany()) goTo(1);
  }

  async function onSaveCompany(): Promise<boolean> {
    const problems = validateStage(values, 0);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return false;

    setNotice(null);
    setBusy(true);
    try {
      // The form names the primary contact's number after the contact; the
      // table stores it as the account's own country code + phone number.
      // companyEmail is read-only (the route ignores it), so it is not sent.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { primaryContactCountryCode, primaryContactPhone, companyEmail, ...company } = values.company;
      const res = await csrfFetch(`/api/employer/${employerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...company,
          countryCode: primaryContactCountryCode,
          phoneNumber: primaryContactPhone,
        }),
      });
      const data = await res.json().catch(() => ({}));
      setNotice(res.ok ? "Company saved." : (data.error ?? "Save failed"));
      return res.ok;
    } catch {
      setNotice("Network error - answers still held in this browser.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onSaveProject() {
    const problems = validateStage(values, 1, hasExistingProject ? initial.project.preferredLocations : []);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;

    setNotice(null);
    setBusy(true);
    try {
      const url = hasExistingProject
        ? `/api/employer/projects/${existingProjectId}`
        : `/api/employer/${employerId}/projects`;
      const res = await csrfFetch(url, {
        method: hasExistingProject ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values.project),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(data.error ?? "Save failed");
        return;
      }
      // Setup is done: drop the browser draft and open the dashboard.
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        // Private mode - nothing was stored.
      }
      router.push("/employer/dashboard");
      router.refresh();
    } catch {
      setNotice("Network error - answers still held in this browser.");
    } finally {
      setBusy(false);
    }
  }

  const Stage = STAGES[stage];

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="Onboarding stages">
        <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
          {STAGES.map((item, i) => {
            const state = i === stage ? "current" : i < stage ? "done" : "todo";
            return (
              <li key={item.id} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  // Skipping ahead still saves the company - the project stage
                  // is no use without one.
                  onClick={() => (i === 1 && stage === 0 ? void onContinue() : goTo(i))}
                  aria-current={state === "current" ? "step" : undefined}
                  className={[
                    "apple-spring apple-pressable flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm",
                    state === "current"
                      ? "bg-brand-50 font-semibold text-brand-700"
                      : "text-ink-600 hover:bg-ink-100",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums",
                      state === "current"
                        ? "bg-brand-700 text-white"
                        : state === "done"
                          ? "bg-brand-100 text-brand-700"
                          : "bg-ink-100 text-ink-600",
                    ].join(" ")}
                  >
                    {state === "done" ? (
                      <Check className="size-3.5" aria-hidden />
                    ) : (
                      <item.icon className="size-3.5" aria-hidden />
                    )}
                  </span>
                  <span className="whitespace-nowrap">{item.title}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="min-w-0">
        <div className="rounded-[20px] border border-ink-200/70 bg-white p-6 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)] sm:p-8">
          <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Stage {stage + 1} of {STAGES.length}
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink-900">
            {Stage.title}
          </h2>
          <p ref={blurbRef} tabIndex={-1} className="mt-1 text-sm text-text-subtle outline-none">
            {Stage.blurb}
          </p>

          <div className="mt-6">
            {stage === 0 ? (
              <CompanyStage values={values.company} errors={errors} setCompany={setCompany} />
            ) : (
              <ProjectStage
                values={values.project}
                errors={errors}
                setProject={setProject}
                skillDraft={skillDraft}
                setSkillDraft={setSkillDraft}
                placeDraft={placeDraft}
                setPlaceDraft={setPlaceDraft}
                india={isIndiaCountry(values.company.country)}
              />
            )}
          </div>
        </div>

        {notice ? (
          <p
            role="status"
            className="mt-4 flex items-start gap-2.5 rounded-[10px] border border-warning/25 bg-warning-soft px-4 py-3 text-sm text-ink-700"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>{notice}</span>
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {stage > 0 ? (
            <button
              type="button"
              onClick={() => goTo(stage - 1)}
              className="apple-spring apple-pressable inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-ink-200 bg-white px-4 text-sm font-medium text-ink-800 hover:bg-ink-50 sm:w-auto"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back
            </button>
          ) : null}

          {stage === 0 ? (
            <>
              <button
                type="button"
                onClick={onContinue}
                disabled={busy}
                className="apple-spring apple-pressable group inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                Save and continue
                <ArrowRight
                  className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                  aria-hidden
                />
              </button>
              <button
                type="button"
                onClick={onSaveCompany}
                disabled={busy}
                className="apple-spring apple-pressable inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-ink-200 bg-white px-4 text-sm font-medium text-ink-800 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                <Save className="size-4" aria-hidden />
                Save company details
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onSaveProject}
              disabled={busy}
              className="apple-spring apple-pressable inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              <Save className="size-4" aria-hidden />
              {hasExistingProject ? "Save project" : "Create project"}
            </button>
          )}

          <p className="text-xs text-text-subtle">
            Unsaved changes are kept in this browser until you save.
          </p>
        </div>
      </div>
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
  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="companyName"
          label="Company name"
          value={values.companyName}
          error={errors.companyName}
          onChange={(v) => setCompany({ companyName: v })}
        />
        <SelectField
          id="companySize"
          label="Company size"
          value={values.companySize}
          options={COMPANY_SIZE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          error={errors.companySize}
          onChange={(v) => setCompany({ companySize: v })}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="companyEmail"
          label="Company email"
          type="email"
          value={values.companyEmail}
          error={errors.companyEmail}
          hint="Your sign-up email. It cannot be changed here."
          readOnly
          onChange={() => {}}
        />
        <Field
          id="websiteUrl"
          label="Website"
          type="url"
          placeholder={companyDomainOf(values.companyEmail) || "acme.com"}
          hint={
            companyDomainOf(values.companyEmail)
              ? `Must be on ${companyDomainOf(values.companyEmail)} (subdomains are fine).`
              : undefined
          }
          value={values.websiteUrl}
          error={errors.websiteUrl}
          onChange={(v) => setCompany({ websiteUrl: v })}
        />
      </div>

      <div>
        <p className="text-sm font-medium text-ink-800">Company logo</p>
        <FileUpload
          className="mt-2"
          kind="employer_logo"
          accept="image/jpeg,image/png,image/webp"
          label="Logo"
          hint="Optional. PNG, JPG or WebP up to 2 MB. Shown next to your project on a candidate's offer."
          current={values.logoUrl ? "Logo on file" : null}
          onUploaded={(r) => setCompany({ logoUrl: r.url })}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <CountrySelect
          id="country"
          label="Country"
          value={values.country}
          error={errors.country}
          onChange={(v) => setCompany({ country: v })}
        />
        <StateField
          id="state"
          label="State"
          india={isIndiaCountry(values.country)}
          value={values.state}
          error={errors.state}
          onChange={(v) => setCompany({ state: v })}
        />
        <CityField
          id="city"
          label="City"
          india={isIndiaCountry(values.country)}
          state={values.state}
          onStateChange={(v) => setCompany({ state: v })}
          value={values.city}
          error={errors.city}
          onChange={(v) => setCompany({ city: v })}
        />
      </div>

      <Field
        id="gstNumber"
        label="GST number"
        hint="Optional. Needed for an invoice if you are hiring in India."
        value={values.gstNumber}
        error={errors.gstNumber}
        onChange={(v) => setCompany({ gstNumber: v.toUpperCase() })}
      />

      <Field
        id="billingPincode"
        label="Billing PIN code"
        hint="Required for companies in India. It sets the GST on your invoice: CGST + SGST within Rajasthan, IGST elsewhere."
        value={values.billingPincode}
        error={errors.billingPincode}
        onChange={(v) => setCompany({ billingPincode: v.replace(/\D/g, "").slice(0, 6) })}
      />

      <fieldset className="rounded-[10px] border border-ink-200/70 bg-ink-50/60 p-5">
        <legend className="px-1 text-sm font-semibold text-ink-900">Primary contact</legend>
        <p className="mt-0.5 text-xs text-text-subtle">
          The first person an intern or a Findtern coordinator calls.
        </p>
        <div className="mt-4 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id="primaryContactName"
              label="Full name"
              value={values.primaryContactName}
              error={errors.primaryContactName}
              onChange={(v) => setCompany({ primaryContactName: v })}
            />
            <Field
              id="primaryContactRole"
              label="Role"
              placeholder="Talent acquisition"
              value={values.primaryContactRole}
              error={errors.primaryContactRole}
              onChange={(v) => setCompany({ primaryContactRole: v })}
            />
          </div>
          <PhoneField
            id="primaryContactPhone"
            code={values.primaryContactCountryCode}
            onCodeChange={(v) => setCompany({ primaryContactCountryCode: v })}
            number={values.primaryContactPhone}
            error={errors.primaryContactPhone}
            onNumberChange={(v) => setCompany({ primaryContactPhone: v })}
          />
        </div>
      </fieldset>

      <fieldset className="rounded-[10px] border border-ink-200/70 bg-ink-50/60 p-5">
        <legend className="px-1 text-sm font-semibold text-ink-900">
          Escalation contact
        </legend>
        <p className="mt-0.5 text-xs text-text-subtle">
          Required. Used when the primary contact is unreachable mid-internship.
        </p>
        <div className="mt-4 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id="escalationContactName"
              label="Full name"
              value={values.escalationContactName}
              error={errors.escalationContactName}
              onChange={(v) => setCompany({ escalationContactName: v })}
            />
            <Field
              id="escalationContactRole"
              label="Role"
              value={values.escalationContactRole}
              error={errors.escalationContactRole}
              onChange={(v) => setCompany({ escalationContactRole: v })}
            />
          </div>
          <Field
            id="escalationContactEmail"
            label="Email"
            type="email"
            value={values.escalationContactEmail}
            error={errors.escalationContactEmail}
            onChange={(v) => setCompany({ escalationContactEmail: v })}
          />
          <PhoneField
            id="escalationContactPhone"
            code={values.escalationContactCountryCode}
            onCodeChange={(v) => setCompany({ escalationContactCountryCode: v })}
            number={values.escalationContactPhone}
            error={errors.escalationContactPhone}
            onNumberChange={(v) => setCompany({ escalationContactPhone: v })}
          />
        </div>
      </fieldset>
    </div>
  );
}

/* ── Stage 2: project ────────────────────────────────────────────────────── */

function ProjectStage({
  values,
  errors,
  setProject,
  skillDraft,
  setSkillDraft,
  placeDraft,
  setPlaceDraft,
  india,
}: {
  values: ProjectDraft;
  errors: Record<string, string>;
  setProject: (patch: Partial<ProjectDraft>) => void;
  skillDraft: string;
  setSkillDraft: (v: string) => void;
  placeDraft: string;
  setPlaceDraft: (v: string) => void;
  /** The company is in India: state/city pickers apply to the project too. */
  india: boolean;
}) {
  function toggleWorkMode(mode: string) {
    setProject({
      locationType: values.locationType === mode ? "" : mode,
      // An on-site role has no remote day split, and preferred locations are
      // meaningless when nothing is on-site.
      preferredLocations: mode === "remote" ? [] : values.preferredLocations,
    });
  }

  return (
    <div className="space-y-6">
      <Field
        id="projectName"
        label="Project name"
        placeholder="Backend engineering - payments"
        value={values.projectName}
        error={errors.projectName}
        hint="Candidates see this verbatim. Name the work, not the requisition number."
        onChange={(v) => setProject({ projectName: v })}
      />

      <ChipInput
        id="skills"
        label="Skills"
        hint="Up to 7. Start typing to search the shared skills vocabulary - the same list candidates pick from."
        placeholder="TypeScript"
        entries={values.skills}
        max={7}
        draft={skillDraft}
        onDraftChange={setSkillDraft}
        onAdd={(skill) => setProject({ skills: [...values.skills, skill] })}
        onRemove={(skill) =>
          setProject({ skills: values.skills.filter((s) => s !== skill) })
        }
        error={errors.skills}
        suggest={suggestSkills}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          id="scopeOfWork"
          label="Scope of work"
          value={values.scopeOfWork}
          options={SCOPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          error={errors.scopeOfWork}
          onChange={(v) => setProject({ scopeOfWork: v })}
        />
        <SelectField
          id="timezone"
          label="Timezone"
          value={values.timezone}
          options={[
            ...TIMEZONE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
            // Zones a company's country can default to that the legacy list lacks.
            ...TIMEZONES.filter((t) => !t.group && !TIMEZONE_OPTIONS.some((o) => o.value === t.id)).map((t) => ({
              value: t.id,
              label: t.label,
            })),
          ]}
          error={errors.timezone}
          onChange={(v) => setProject({ timezone: v })}
        />
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-ink-800">Work mode</legend>
        <p className="mt-1 text-xs text-text-subtle">
          How the intern works. This filters the candidate pool.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {LOCATION_TYPES.map((mode) => (
            <ToggleChip
              key={mode.value}
              label={mode.label}
              active={values.locationType === mode.value}
              onClick={() => toggleWorkMode(mode.value)}
            />
          ))}
        </div>
        {errors.locationType ? (
          <p className="mt-2 text-xs text-danger">{errors.locationType}</p>
        ) : null}
      </fieldset>

      {values.locationType && values.locationType !== "remote" ? (
        <div className="grid gap-5 sm:grid-cols-3">
          <StateField
            id="projectState"
            label="State"
            india={india}
            value={values.state}
            onChange={(v) => setProject({ state: v })}
          />
          <CityField
            id="projectCity"
            label="City"
            india={india}
            state={values.state}
            onStateChange={(v) => setProject({ state: v })}
            value={values.city}
            error={errors.projectCity}
            onChange={(v) => setProject({ city: v })}
          />
          <Field
            id="projectPincode"
            label="PIN code"
            inputMode="numeric"
            maxLength={6}
            value={values.pincode}
            error={errors.projectPincode}
            onChange={(v) => setProject({ pincode: v.replace(/\D/g, "") })}
          />
        </div>
      ) : null}

      <ChipInput
        id="preferredLocations"
        label="Preferred locations"
        hint={`Optional. Up to ${MAX_PROJECT_LOCATIONS} cities - pick from the suggestions or type your own.`}
        placeholder="Bengaluru"
        suggest={(q) => districtOptions(q).map((d) => d.district)}
        entries={values.preferredLocations}
        max={MAX_PROJECT_LOCATIONS}
        draft={placeDraft}
        onDraftChange={setPlaceDraft}
        onAdd={(place) => setProject({ preferredLocations: [...values.preferredLocations, place] })}
        onRemove={(place) =>
          setProject({
            preferredLocations: values.preferredLocations.filter((p) => p !== place),
          })
        }
        error={errors.preferredLocations}
      />

      <label className="flex items-start gap-2.5 rounded-[10px] border border-ink-200/70 bg-ink-50/60 px-4 py-3.5 text-sm text-ink-700">
        <input
          type="checkbox"
          checked={values.fullTimeOffer}
          onChange={(e) => setProject({ fullTimeOffer: e.target.checked })}
          className="mt-0.5 size-4 shrink-0 rounded border-ink-300 accent-brand-700"
        />
        <span>
          <span className="font-medium text-ink-900">Full-time offer on completion</span>
          <span className="mt-0.5 block text-xs text-text-subtle">
            Flagged on the proposal as a conversion path. It does not change the internship
            terms shown to the candidate.
          </span>
        </span>
      </label>

      <p className="flex items-start gap-2 rounded-[10px] bg-ink-50 px-3.5 py-3 text-xs leading-relaxed text-ink-600">
        <Info className="mt-0.5 size-3.5 shrink-0 text-ink-400" aria-hidden />
        <span>
          Every field here maps to a real column on <code className="font-mono">projects</code>
          . Compensation is not one of them - it is set per proposal, because it depends on the
          candidate&apos;s Findtern Score.
        </span>
      </p>
    </div>
  );
}

function ToggleChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        "apple-spring apple-pressable min-h-11 rounded-full border px-4 py-1.5 text-sm font-medium",
        active
          ? "border-brand-700 bg-brand-700 text-white"
          : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

/* ── Form primitives ─────────────────────────────────────────────────────── */

const FIELD_BASE =
  "apple-spring mt-2 min-h-11 w-full rounded-[10px] border bg-white px-3.5 text-[14px] text-ink-900 outline-none placeholder:text-ink-400 focus:ring-2";
const FIELD_OK = "border-ink-200 focus:border-brand-500 focus:ring-brand-500/20";
const FIELD_BAD = "border-danger focus:border-danger focus:ring-danger/20";

function Field({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  type = "text",
  placeholder,
  inputMode,
  maxLength,
  readOnly,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  type?: string;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email" | "url";
  maxLength?: number;
  readOnly?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-text-subtle">{hint}</p> : null}
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        readOnly={readOnly}
        aria-readonly={readOnly || undefined}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${FIELD_BASE} ${error ? FIELD_BAD : FIELD_OK} ${readOnly ? "cursor-not-allowed bg-ink-50 text-ink-600" : ""}`}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  error,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-text-subtle">{hint}</p> : null}
      <select
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={`${FIELD_BASE} ${error ? FIELD_BAD : FIELD_OK}`}
      >
        <option value="">Select…</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function PhoneField({
  id,
  code,
  onCodeChange,
  number,
  onNumberChange,
  error,
}: {
  id: string;
  code: string;
  onCodeChange: (value: string) => void;
  number: string;
  onNumberChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        Phone number
      </label>
      <div className="mt-2 flex gap-2">
        <select
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          aria-label={`${id} country code`}
          className={`apple-spring min-h-11 shrink-0 rounded-[10px] border bg-white px-2.5 text-[14px] text-ink-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 ${
            error ? FIELD_BAD : FIELD_OK
          }`}
        >
          {COUNTRY_CODE_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>
              {option.code} · {option.country}
            </option>
          ))}
        </select>
        <input
          id={id}
          name={id}
          inputMode="numeric"
          maxLength={15}
          value={number}
          onChange={(e) => onNumberChange(e.target.value.replace(/\D/g, ""))}
          placeholder="9876543210"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${FIELD_BASE} ${error ? FIELD_BAD : FIELD_OK}`}
        />
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ChipInput({
  id,
  label,
  hint,
  placeholder,
  entries,
  max,
  draft,
  onDraftChange,
  onAdd,
  onRemove,
  error,
  suggest,
}: {
  id: string;
  label: string;
  hint?: string;
  placeholder?: string;
  entries: string[];
  max: number;
  draft: string;
  onDraftChange: (value: string) => void;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  error?: string;
  /** Vocabulary to offer while typing. Free text is still accepted. */
  suggest?: (query: string) => string[];
}) {
  const [focused, setFocused] = useState(false);
  const full = entries.length >= max;
  const options = suggest && focused && !full && draft.trim() ? suggest(draft) : [];

  function commit(value?: string) {
    const next = (value ?? draft).trim();
    if (!next || full || entries.some((entry) => entry.toLowerCase() === next.toLowerCase())) {
      return;
    }
    onAdd(next);
    onDraftChange("");
  }

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-text-subtle">{hint}</p> : null}
      <div className="mt-2 flex gap-2">
        <input
          id={id}
          value={draft}
          placeholder={placeholder}
          disabled={full}
          onChange={(e) => onDraftChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // Otherwise Enter submits the surrounding form and reloads the page.
            e.preventDefault();
            commit();
          }}
          className={`${FIELD_BASE} ${FIELD_OK} disabled:bg-ink-50 disabled:text-ink-400`}
        />
        <button
          type="button"
          onClick={() => commit()}
          disabled={full}
          className="apple-spring apple-pressable inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-4 text-sm font-medium text-ink-800 hover:bg-ink-50 disabled:pointer-events-none disabled:opacity-60"
        >
          <Plus className="size-4" aria-hidden />
          Add
        </button>
      </div>
      {options.length > 0 ? (
        <ul className="mt-2 overflow-hidden rounded-[10px] border border-ink-200 bg-white shadow-xs">
          {options.map((option) => (
            <li key={option}>
              <button
                type="button"
                // onMouseDown so the click lands before the input's blur.
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(option);
                }}
                className="apple-spring flex min-h-11 w-full items-center px-3 py-2 text-left text-sm text-ink-800 hover:bg-ink-50"
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {full ? (
        <p className="mt-1.5 text-xs text-text-subtle">
          {entries.length > max
            ? `Saved under an older limit. You can keep these, but adding a new one needs ${entries.length - max + 1} removed.`
            : `${entries.length} of ${max} used. Remove one to swap it out.`}
        </p>
      ) : null}

      {entries.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {entries.map((entry) => (
            <li
              key={entry}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-3 pr-1 text-xs font-medium text-brand-700"
            >
              {entry}
              <button
                type="button"
                onClick={() => onRemove(entry)}
                aria-label={`Remove ${entry}`}
                className="apple-spring grid size-7 shrink-0 place-items-center rounded-full hover:bg-brand-100"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="mt-1.5 text-xs text-danger">{error}</p> : null}
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

function validateStage(
  values: OnboardingDraft,
  stage: number,
  storedLocations: readonly string[] = [],
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (stage === 0) {
    const c = values.company;
    if (c.companyName.trim().length < 2) errors.companyName = "Company name is required.";
    // The email is the read-only sign-up login, so it is not validated here;
    // the website must sit on its domain (the route checks the same rule).
    const email = c.companyEmail.trim();
    if (!c.websiteUrl.trim()) {
      errors.websiteUrl = "Website is required.";
    } else {
      const problem = websiteDomainError(c.websiteUrl, email, { skipDomainCheck: !companyDomainOf(email) });
      if (problem) errors.websiteUrl = problem;
    }

    if (!c.companySize) errors.companySize = "Select a company size.";
    if (!c.city.trim()) errors.city = "City is required.";
    if (!c.state.trim()) errors.state = "State is required.";
    if (!c.country.trim()) errors.country = "Country is required.";

    const inIndia = !c.country.trim() || /^(india|in)$/i.test(c.country.trim());
    if (inIndia && !/^[1-9]\d{5}$/.test(c.billingPincode.trim())) {
      errors.billingPincode = "Enter the 6-digit PIN code of your billing address.";
    }

    if (c.gstNumber.trim() && !/^[0-9A-Z]{15}$/.test(c.gstNumber.trim())) {
      errors.gstNumber = "A GST number is 15 characters, letters and digits only.";
    }

    if (c.primaryContactName.trim().length < 2) {
      errors.primaryContactName = "A primary contact name is required.";
    }
    if (c.primaryContactRole.trim().length < 2) {
      errors.primaryContactRole = "Their role is required, e.g. Talent acquisition.";
    }
    const primaryPhoneProblem = phoneError(c.primaryContactCountryCode, c.primaryContactPhone);
    if (primaryPhoneProblem) errors.primaryContactPhone = primaryPhoneProblem;

    // The escalation contact is mandatory: name, role, email and phone.
    if (!c.escalationContactName.trim()) {
      errors.escalationContactName = "An escalation contact name is required.";
    }
    if (!c.escalationContactRole.trim()) {
      errors.escalationContactRole = "Their role is required.";
    }
    const escalationEmail = c.escalationContactEmail.trim();
    if (!escalationEmail) {
      errors.escalationContactEmail = "An escalation contact email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(escalationEmail)) {
      errors.escalationContactEmail = "Enter a valid email address.";
    } else if (isPersonalEmail(escalationEmail)) {
      errors.escalationContactEmail = "Use a company email for the escalation contact.";
    } else if (escalationEmail.toLowerCase() === email.toLowerCase()) {
      errors.escalationContactEmail = "That is already the primary contact email.";
    }
    if (!c.escalationContactPhone.trim()) {
      errors.escalationContactPhone = "An escalation contact phone is required.";
    } else {
      const escalationPhoneProblem = phoneError(c.escalationContactCountryCode, c.escalationContactPhone);
      if (escalationPhoneProblem) errors.escalationContactPhone = escalationPhoneProblem;
    }
  }

  if (stage === 1) {
    const p = values.project;
    if (p.projectName.trim().length < 2) {
      errors.projectName = "Project name must be at least 2 characters.";
    }
    if (p.skills.length === 0) errors.skills = "Add at least one skill.";
    if (!p.scopeOfWork) errors.scopeOfWork = "Select a scope of work.";
    if (!p.locationType) errors.locationType = "Pick a work mode.";
    if (!p.timezone) errors.timezone = "Select a timezone.";

    if (p.locationType && p.locationType !== "remote") {
      if (!p.city.trim()) errors.projectCity = "City is required for an on-site or hybrid role.";
      if (p.pincode && !/^\d{6}$/.test(p.pincode)) {
        errors.projectPincode = "A PIN code is 6 digits.";
      }
    }
    // An existing project saved under the old limit of five keeps its list.
    const locationProblem = projectLocationsError(p.preferredLocations, storedLocations);
    if (locationProblem) errors.preferredLocations = locationProblem;
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
 * every call - an unconditional re-render loop. Parsing happens once, upstream,
 * in the useMemo. */
function readDraft(): string | null {
  try {
    return window.localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}

/** Stage-level partials, not a shallow `Partial<OnboardingDraft>`. */
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
    // Cast rather than validated: the whitelists above already cap what can
    // come back, and the form re-validates on submit anyway.
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
