"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Briefcase,
  Check,
  CheckCircle2,
  GraduationCap,
  Languages,
  Loader2,
  MapPin,
  Plus,
  Save,
  Sparkles,
  Trash2,
  TriangleAlert,
  User,
  X,
} from "lucide-react";
import { FileUpload } from "@/components/app/file-upload";
import { Pill } from "@/components/app/primitives";

import Link from "next/link";

import { NON_TECH_SKILLS, TECH_SKILLS, suggestSkills } from "@/lib/data/skills";
import { STATES, stateForDistrict, suggestDistricts } from "@/lib/data/districts";
import { DIAL_CODES, DIAL_CODE_VALUES } from "@/lib/data/dial-codes";
import { suggestColleges } from "@/lib/data/colleges";
import { csrfFetch } from "@/lib/client-fetch";
import {
  DEGREES,
  EMERGENCY_RELATIONS,
  EXPERIENCE_TYPES,
  QUALIFICATION_LEVELS,
  cascadeWorkModes,
  degreeOption,
  monthLabel,
  toMonth,
  validateProfile,
  validateStep,
  widestWorkMode,
  type ExtracurricularEntry,
  type ExperienceEntry,
  type LanguageEntry,
  type OnboardingDraft,
  type QualificationEntry,
  type SkillWithRating,
  type StoredDocument,
} from "@/lib/onboarding";

const DRAFT_KEY = "findtern:intern-onboarding:v2";
const SAVED_AT = "__savedAt";
const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
const MB = 1024 * 1024;

export const STEPS = [
  { id: "personal", title: "About Me", blurb: "Basic details, passport photo, and contact information." },
  { id: "academics", title: "Academics", blurb: "Degree, institution, specialization, and academic marks." },
  { id: "experience", title: "Experience", blurb: "Internships, freelance work, jobs or major projects." },
  { id: "skills", title: "Skills", blurb: "Select 4 to 7 skills and rate your proficiency level." },
  { id: "languages", title: "Languages", blurb: "Languages you are comfortable with for work and communication." },
  { id: "extracurricular", title: "Extra-Curricular", blurb: "Activities outside academics highlighting leadership and teamwork." },
  { id: "preferences", title: "Location & Setup", blurb: "Internship work modes, preferred cities, and hardware status." },
  { id: "preview", title: "Profile Preview", blurb: "Review how your internship profile will look to hiring companies." },
] as const;

type Update = <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) => void;

type StepProps = {
  values: OnboardingDraft;
  update: Update;
  errors: Record<string, string>;
  documents: StoredDocument[];
  email: string;
  onJumpStep?: (step: number) => void;
  onSave?: () => Promise<void>;
  saving?: boolean;
  /** The number on the account (captured at signup). */
  account: { countryCode: string; phoneNumber: string } | null;
  hasPanImage: boolean;
  hasAadhaarImage: boolean;
  /** Skills are frozen: rated, or an AI interview is queued. */
  skillsLocked?: boolean;
  onUploaded: (kind: string) => void;
};

export function OnboardingForm({
  initial,
  documents,
  email,
  serverUpdatedAt = null,
  account = null,
  hasPanImage: panOnFile = false,
  hasAadhaarImage: aadhaarOnFile = false,
  hasPhoto: photoOnFile = false,
  skillsLocked = false,
}: {
  initial: OnboardingDraft;
  documents: StoredDocument[];
  email: string;
  /** When the saved profile last changed (ISO). A local draft older than this is stale. */
  serverUpdatedAt?: string | null;
  account?: { countryCode: string; phoneNumber: string } | null;
  /** A PAN card image is already on file. */
  hasPanImage?: boolean;
  /** An Aadhaar card image is already on file. */
  hasAadhaarImage?: boolean;
  /** A profile photo is already on file. */
  hasPhoto?: boolean;
  /** Rated or AI interview queued - the skills step is read-only. */
  skillsLocked?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [edits, setEdits] = useState<Partial<OnboardingDraft>>({});
  const [dirty, setDirty] = useState(false);
  // What the last Continue / Submit flagged. What is shown (`errors`, below)
  // is this list re-checked against the current values, so a message goes
  // away as soon as the field it is about is fixed.
  const [flagged, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  // Set once the final submit succeeds; the button stays locked while the
  // dashboard loads, so a second click cannot submit the profile again.
  const [submitted, setSubmitted] = useState(false);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const hasPanImage = panOnFile || uploaded.includes("pan");
  const hasAadhaarImage = aadhaarOnFile || uploaded.includes("aadhaar");
  const hasPhoto = photoOnFile || uploaded.includes("profile_photo");
  const blurbRef = useRef<HTMLParagraphElement>(null);

  // One draft per account, so two people on one browser never see each other's.
  const draftKey = `${DRAFT_KEY}:${email}`;
  const stored = useSyncExternalStore(subscribeToNothing, () => readDraft(draftKey), () => null);

  const values = useMemo<OnboardingDraft>(() => {
    const local = parseDraft(stored, serverUpdatedAt);
    // Academics is merged field by field: a draft saved by an older version of
    // this form lacks the newer keys, and must not blank them.
    return {
      ...initial,
      ...local,
      ...edits,
      academics: { ...initial.academics, ...local.academics, ...edits.academics },
    };
  }, [initial, stored, serverUpdatedAt, edits]);

  useEffect(() => {
    if (!dirty) return;
    try {
      // Bank details never go into localStorage.
      const { bank: _bank, ...rest } = values;
      void _bank;
      window.localStorage.setItem(draftKey, JSON.stringify({ ...rest, [SAVED_AT]: Date.now() }));
    } catch {
      // Quota errors in private mode are non-fatal
    }
  }, [values, dirty, draftKey]);

  const update: Update = (key, value) => {
    setEdits((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  function goTo(next: number) {
    setStep(next);
    setNotice(null);
    blurbRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const ctx = { hasPanImage, hasAadhaarImage, hasPhoto, ownPhone: account };

  const errors = useMemo(() => {
    const keys = Object.keys(flagged);
    if (keys.length === 0) return flagged;
    const now = validateStep(values, step, {
      hasPanImage,
      hasAadhaarImage,
      hasPhoto,
      ownPhone: account,
    });
    const still: Record<string, string> = {};
    for (const k of keys) if (now[k]) still[k] = now[k];
    return still;
  }, [flagged, values, step, hasPanImage, hasAadhaarImage, hasPhoto, account]);

  function showProblems(problems: Record<string, string>) {
    setErrors(problems);
    // Move focus to the first field that needs attention.
    const first = Object.keys(problems)[0];
    if (first) {
      window.requestAnimationFrame(() => document.getElementById(first)?.focus());
    }
  }

  function onContinue() {
    const problems = validateStep(values, step, ctx);
    if (Object.keys(problems).length > 0) return showProblems(problems);
    setErrors({});
    goTo(Math.min(step + 1, STEPS.length - 1));
  }

  function onSubmit() {
    if (saving || submitted) return;
    // Every step, not just this one: a skipped step is caught here, and the
    // candidate is taken to it rather than told something is wrong somewhere.
    const failed = validateProfile(values, ctx);
    if (failed) {
      if (failed.step !== step) goTo(failed.step);
      setNotice({ text: `Some details on "${STEPS[failed.step].title}" need attention before you submit.`, ok: false });
      setErrors(failed.errors);
      return;
    }
    void onSave(true);
  }

  async function onSave(final = false) {
    setSaving(true);
    setNotice(null);
    try {
      const res = await csrfFetch("/api/intern/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Bank details are not part of this form any more (they are entered
        // from Settings), so a stale copy in the draft is never sent.
        body: JSON.stringify({
          ...values,
          bank: undefined,
          final,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (typeof data.step === "number" && data.fields) {
          goTo(data.step);
          setErrors(data.fields);
        }
        setNotice({ text: data.error ?? "Failed to save profile. Please try again.", ok: false });
        return;
      }
      setNotice({ text: final ? "Profile submitted. Taking you to your dashboard…" : "Draft saved.", ok: true });
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // no-op
      }
      if (final) {
        setSubmitted(true);
        router.replace("/intern/dashboard");
        return;
      }
      router.refresh();
    } catch {
      setNotice({ text: "Network error - your draft is preserved locally.", ok: false });
    } finally {
      setSaving(false);
    }
  }

  // Calculate readiness score
  const readinessScore = useMemo(() => {
    let score = 0;
    if (values.bio?.length >= 20) score += 15;
    if (values.city) score += 10;
    if (values.academics.institution && values.academics.degree) score += 20;
    if (values.skills.length >= 4) score += 20;
    if (values.languages.length >= 1) score += 10;
    if (values.locationTypes.length >= 1) score += 10;
    if (values.experiences.length >= 1) score += 10;
    if (values.extracurriculars.length >= 1) score += 5;
    return Math.min(100, score);
  }, [values]);

  const StepView = STEP_VIEWS[step];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      {/* Sidebar Rail */}
      <div className="min-w-0 space-y-4">
        <div className="rounded-[20px] border border-ink-200/70 bg-white p-4 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold uppercase tracking-wider text-text-subtle">
              Readiness Index
            </span>
            <span className="text-sm font-bold tabular-nums text-brand-700">
              {readinessScore}%
            </span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-ink-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-600 transition-all duration-300"
              style={{ width: `${readinessScore}%` }}
            />
          </div>
        </div>

        <StepRail step={step} onSelect={goTo} />
      </div>

      {/* Main Content Area */}
      <div className="min-w-0">
        <div className="rounded-[20px] border border-ink-200/70 bg-white p-6 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)] sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-4">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                Step {step + 1} of {STEPS.length}
              </p>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-ink-900">
                {STEPS[step].title}
              </h2>
            </div>
            <Pill tone={step === STEPS.length - 1 ? "live" : "neutral"} className="whitespace-nowrap">
              {STEPS[step].title}
            </Pill>
          </div>

          <p ref={blurbRef} tabIndex={-1} className="mt-3 text-xs leading-relaxed text-text-subtle outline-none">
            {STEPS[step].blurb}
          </p>

          <div className="mt-6">
            <StepView
              values={values}
              update={update}
              errors={errors}
              documents={documents}
              email={email}
              onJumpStep={goTo}
              onSave={onSave}
              saving={saving}
              account={account}
              hasPanImage={hasPanImage}
              hasAadhaarImage={hasAadhaarImage}
              skillsLocked={skillsLocked}
              onUploaded={(kind) => setUploaded((prev) => (prev.includes(kind) ? prev : [...prev, kind]))}
            />
          </div>
        </div>

        {notice ? (
          <p
            role="status"
            className={`mt-4 flex items-start gap-2.5 rounded-xl border p-4 text-xs font-medium ${
              notice.ok
                ? "border-brand-200 bg-brand-50 text-brand-800"
                : "border-warning/30 bg-warning-soft text-ink-800"
            }`}
          >
            {notice.ok ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-600" />
            ) : (
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            )}
            <span>{notice.text}</span>
          </p>
        ) : null}

        {/* Action Controls */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => goTo(step - 1)}
                className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-4 text-sm font-medium text-ink-800 shadow-2xs hover:bg-ink-50"
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                Back
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving || submitted}
              className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-4 text-sm font-medium text-ink-700 shadow-2xs hover:bg-ink-50 disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5 text-ink-500" />}
              Save Draft
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-text-subtle hidden sm:inline">Signed in as {email}</span>
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={onContinue}
                className="apple-spring apple-pressable group inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-primary px-5 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover"
              >
                Continue
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={saving || submitted}
                className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-primary px-6 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover disabled:opacity-60"
              >
                {saving || submitted ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                {submitted ? "Submitted" : "Complete & Submit Profile"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Step rail ──────────────────────────────────────────────────────────── */

function StepRail({ step, onSelect }: { step: number; onSelect: (next: number) => void }) {
  return (
    <nav aria-label="Onboarding steps" className="rounded-[20px] border border-ink-200/70 bg-white p-2 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
      <ol className="-mx-2 flex snap-x gap-1 overflow-x-auto px-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
        {STEPS.map((s, i) => {
          const state = i === step ? "current" : i < step ? "done" : "todo";
          return (
            <li key={s.id} className="shrink-0 snap-start lg:shrink">
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={state === "current" ? "step" : undefined}
                className={[
                  "apple-spring flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-xs",
                  state === "current"
                    ? "bg-brand-50 font-semibold text-brand-800"
                    : "text-ink-600 hover:bg-ink-50",
                ].join(" ")}
              >
                <span
                  className={[
                    "apple-spring grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                    state === "current"
                      ? "bg-brand-700 text-white"
                      : state === "done"
                      ? "bg-brand-100 text-brand-700"
                      : "bg-ink-100 text-ink-600",
                  ].join(" ")}
                >
                  {state === "done" ? <Check className="size-3" aria-hidden /> : i + 1}
                </span>
                <span className="truncate">{s.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ── Step 1: About Me (Personal + Passport Photo) ────────────────────────── */

function PersonalStep({ values, update, errors, documents, account, onUploaded }: StepProps) {
  // Legacy rows can hold a state spelled differently from the list; it stays selectable.
  const states = values.state && !STATES.includes(values.state) ? [values.state, ...STATES] : STATES;
  const onFile = (label: string) => (documents.find((d) => d.label === label) ? `${label} on file` : null);
  // A locally cached draft can carry an empty photoUrl; the stored avatar wins.
  const photoSrc = values.photoUrl || (documents.some((d) => d.label === "Profile photo") ? "/api/intern/avatar" : "");
  return (
    <div className="space-y-8">
      {/* Passport Photo Upload Slot */}
      <div className="rounded-xl border border-dashed border-ink-200 bg-ink-50/50 p-4.5 text-center sm:text-left">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="grid size-20 place-items-center rounded-xl bg-white border border-ink-200 shadow-2xs overflow-hidden shrink-0">
            {photoSrc ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={photoSrc} alt="Passport photo" className="size-full object-cover" />
            ) : (
              <User className="size-8 text-ink-400" />
            )}
          </div>
          <div className="flex-1">
            <h3 id="photo" tabIndex={-1} className="text-xs font-semibold text-ink-900 focus:outline-none">
              Profile Photo (Passport Size 2x2&quot;) *
            </h3>
            <p className="mt-0.5 text-xs text-text-subtle">
              JPG, PNG or WebP, up to 5 MB. A clear, front-facing photo.
            </p>
            <FileUpload
              className="mt-2.5"
              kind="profile_photo"
              accept="image/jpeg,image/png,image/webp"
              label="Photo"
              maxBytes={5 * MB}
              current={documents.find((d) => d.label === "Profile photo") ? "Photo on file" : null}
              onUploaded={() => update("photoUrl", `/api/intern/avatar?v=${Date.now()}`)}
            />
            {errors.photo ? (
              <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
                {errors.photo}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <TextArea
          id="bio"
          label="Professional Bio *"
          hint="Summarize your technical strengths, goals, and passions in 2-3 sentences."
          value={values.bio}
          error={errors.bio}
          onChange={(v) => update("bio", v)}
        />
        <Field
          id="linkedinUrl"
          label="LinkedIn Profile (optional)"
          type="url"
          placeholder="https://linkedin.com/in/username"
          value={values.linkedinUrl}
          error={errors.linkedinUrl}
          onChange={(v) => update("linkedinUrl", v)}
        />
      </div>

      <Group
        title="Identity documents"
        hint="Used to verify you and to pay your stipend. Never shown to employers."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="aadhaarNumber"
            label="Aadhaar Number *"
            hint="12 digits. Spaces are removed for you."
            placeholder="2345 6789 0123"
            inputMode="numeric"
            // No maxLength: it cut a pasted "1234 5678 9012" before the
            // spaces were stripped. onChange keeps the 12-digit cap.
            value={values.aadhaarNumber || ""}
            error={errors.aadhaarNumber}
            onChange={(v) => update("aadhaarNumber", v.replace(/\D/g, "").slice(0, 12))}
          />
          <Field
            id="panNumber"
            label="PAN *"
            hint="Required for stipend payouts. Format ABCDE1234F."
            placeholder="ABCDE1234F"
            maxLength={10}
            value={values.panNumber || ""}
            error={errors.panNumber}
            onChange={(v) => update("panNumber", v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <UploadSlot id="panImage" title="PAN card image *" error={errors.panImage}>
            <FileUpload
              kind="pan"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              label="PAN card image"
              noun="PAN card image"
              maxBytes={10 * MB}
              hint="Photo or scan of the front. JPG, PNG, WebP or PDF, up to 10 MB."
              current={onFile("PAN")}
              onUploaded={() => onUploaded("pan")}
            />
          </UploadSlot>
          <UploadSlot id="aadhaarImage" title="Aadhaar card image (optional)" error={errors.aadhaarImage}>
            <FileUpload
              kind="aadhaar"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              label="Aadhaar card image"
              noun="Aadhaar card image"
              maxBytes={10 * MB}
              hint="Photo or scan of the front. JPG, PNG, WebP or PDF, up to 10 MB."
              current={onFile("Aadhaar")}
              onUploaded={() => onUploaded("aadhaar")}
            />
          </UploadSlot>
        </div>
      </Group>

      <Group title="Where you live">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            id="city"
            label="Current City *"
            placeholder="e.g. Bengaluru"
            value={values.city}
            error={errors.city}
            list="city-options"
            autoComplete="off"
            onChange={(v) => {
              update("city", v);
              // Picking a district from the list fills its state.
              const state = stateForDistrict(v);
              if (state) update("state", state);
            }}
          />
          <datalist id="city-options">
            {suggestDistricts(values.city, 8).map((d) => (
              <option key={`${d.district}-${d.state}`} value={d.district}>
                {d.state}
              </option>
            ))}
          </datalist>
          <SelectField
            id="state"
            label="State *"
            value={values.state}
            error={errors.state}
            onChange={(v) => update("state", v)}
            options={[{ value: "", label: "Choose your state…" }, ...states.map((st) => ({ value: st, label: st }))]}
          />
          <Field
            id="pinCode"
            label="PIN Code *"
            inputMode="numeric"
            maxLength={6}
            placeholder="560001"
            value={values.pinCode}
            error={errors.pinCode}
            onChange={(v) => update("pinCode", v.replace(/\D/g, ""))}
          />
        </div>
      </Group>

      <Group
        title="Your contact number"
        hint="The number you signed up with. Interview and offer updates go here."
      >
        {account ? (
          <PhoneField
            id="ownPhone"
            label="Mobile number"
            code={account.countryCode}
            number={account.phoneNumber}
            disabled
            hint={
              <>
                To change it, go to{" "}
                <Link href="/intern/settings" className="font-medium text-brand-700 underline-offset-4 hover:underline">
                  Settings
                </Link>
                .
              </>
            }
          />
        ) : (
          <p className="text-sm text-ink-600">
            There is no number on your account yet.{" "}
            <Link href="/intern/settings" className="font-medium text-brand-700 underline-offset-4 hover:underline">
              Add one in Settings
            </Link>
            .
          </p>
        )}
      </Group>

      <Group
        title="Emergency contact"
        hint="Someone we can reach if we cannot reach you. Only Findtern sees this."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="emergencyName"
            label="Name *"
            placeholder="e.g. Sunita Sharma"
            value={values.emergencyName ?? ""}
            error={errors.emergencyName}
            autoComplete="off"
            onChange={(v) => update("emergencyName", v)}
          />
          <SelectField
            id="emergencyRelation"
            label="Relationship"
            value={values.emergencyRelation ?? ""}
            onChange={(v) => update("emergencyRelation", v)}
            options={[{ value: "", label: "Choose…" }, ...EMERGENCY_RELATIONS.map((r) => ({ value: r, label: r }))]}
          />
        </div>
        <PhoneField
          id="emergencyPhone"
          label="Emergency phone number *"
          code={values.emergencyCountryCode || "+91"}
          number={values.emergencyPhone}
          error={errors.emergencyPhone}
          onCode={(v) => update("emergencyCountryCode", v)}
          onNumber={(v) => update("emergencyPhone", v)}
          hint="Not your own number. Digits only, without the country code."
        />
      </Group>

      <Group
        title="Second contact (optional)"
        hint="Another person we can try if your emergency contact does not answer. Only Findtern sees this."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="secondPocName"
            label="Name"
            placeholder="e.g. Arjun Mehta"
            value={values.secondPocName ?? ""}
            error={errors.secondPocName}
            autoComplete="off"
            onChange={(v) => update("secondPocName", v)}
          />
          <SelectField
            id="secondPocRelation"
            label="Relationship"
            value={values.secondPocRelation ?? ""}
            onChange={(v) => update("secondPocRelation", v)}
            options={[{ value: "", label: "Choose…" }, ...EMERGENCY_RELATIONS.map((r) => ({ value: r, label: r }))]}
          />
        </div>
        <PhoneField
          id="secondPocPhone"
          label="Phone number"
          code={values.secondPocCountryCode || "+91"}
          number={values.secondPocPhone ?? ""}
          error={errors.secondPocPhone}
          onCode={(v) => update("secondPocCountryCode", v)}
          onNumber={(v) => update("secondPocPhone", v)}
          hint="Different from your own and your emergency contact's number."
        />
      </Group>
    </div>
  );
}

/* ── Step 2: Academics ──────────────────────────────────────────────────── */

function AcademicsStep({ values, update, errors }: StepProps) {
  const academics = values.academics;
  const set = (patch: Partial<OnboardingDraft["academics"]>) =>
    update("academics", { ...academics, ...patch });
  const option = degreeOption(academics.degree);
  // Kept while typing, so a custom name that happens to match a list entry
  // ("B.A" on the way to "B.Arch") does not swap the text box out mid-word.
  const [typingOther, setTypingOther] = useState(option === "Other");
  const showOther = typingOther || option === "Other";
  const completed = academics.status === "Completed";
  const level = academics.qualificationLevel || "Bachelor's";
  const levels = QUALIFICATION_LEVELS.some((l) => l.value === level)
    ? [...QUALIFICATION_LEVELS]
    : [...QUALIFICATION_LEVELS, { value: level, label: level === "High School" ? "High School / 12th" : level }];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="qualificationLevel"
          label="Highest Qualification Level *"
          value={level}
          onChange={(v) => set({ qualificationLevel: v })}
          options={levels}
        />
        <SelectField
          id="academicStatus"
          label="Academic Status *"
          value={academics.status || "Pursuing"}
          onChange={(v) => set({ status: v })}
          options={[
            { value: "Pursuing", label: "Currently pursuing" },
            { value: "Completed", label: "Graduated / completed" },
          ]}
        />
      </div>

      <Field
        id="institution"
        label="College / University Institution *"
        hint="Start typing to pick from the list, or type your college's full name if it is not there."
        placeholder="e.g. JECRC University, IIT Bombay, Anna University"
        value={academics.institution}
        error={errors.institution}
        list="college-options"
        autoComplete="off"
        onChange={(v) => set({ institution: v })}
      />
      <datalist id="college-options">
        {suggestColleges(academics.institution).map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <SelectField
            id={showOther ? "degreeSelect" : "degree"}
            label="Degree *"
            value={showOther ? "Other" : option}
            error={showOther ? undefined : errors.degree}
            onChange={(v) => {
              if (v === "Other") {
                setTypingOther(true);
                set({ degree: option === "Other" ? academics.degree : "Other" });
              } else {
                setTypingOther(false);
                set({ degree: v });
              }
            }}
            options={[
              { value: "", label: "Choose your degree…" },
              ...DEGREES.map((d) => ({ value: d.value, label: d.value })),
              { value: "Other", label: "Other" },
            ]}
          />
          {showOther ? (
            <Field
              id="degree"
              label="Degree name *"
              placeholder="e.g. B.Arch, LLB, B.Pharm"
              value={academics.degree === "Other" ? "" : academics.degree}
              error={errors.degree}
              onChange={(v) => set({ degree: v || "Other" })}
            />
          ) : null}
        </div>
        <Field
          id="branch"
          label="Specialization / Branch *"
          placeholder="e.g. Computer Science, Marketing"
          value={academics.branch}
          error={errors.branch}
          onChange={(v) => set({ branch: v })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="startYear"
          label="Start Year *"
          placeholder="e.g. 2022"
          inputMode="numeric"
          maxLength={4}
          value={academics.startYear}
          error={errors.startYear}
          onChange={(v) => set({ startYear: v.replace(/\D/g, "") })}
        />
        <Field
          id="yearOfGraduation"
          label={completed ? "End Year *" : "Expected End Year *"}
          hint={completed ? `The year you graduated - ${new Date().getFullYear()} or earlier.` : "A future year is fine."}
          placeholder="e.g. 2026"
          inputMode="numeric"
          maxLength={4}
          value={academics.yearOfGraduation}
          error={errors.yearOfGraduation}
          onChange={(v) => set({ yearOfGraduation: v.replace(/\D/g, "") })}
        />
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-ink-800">
          {completed ? "Final score *" : "Score so far *"}
        </legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
          <div role="radiogroup" aria-label="Score type" className="flex gap-2">
            {(
              [
                ["cgpa", "CGPA"],
                ["percentage", "Percentage"],
              ] as const
            ).map(([value, label]) => {
              const active = academics.scoreType === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => set({ scoreType: value })}
                  className={`apple-spring apple-pressable inline-flex min-h-11 items-center rounded-[10px] border px-4 text-sm font-semibold sm:min-h-10 ${
                    active
                      ? "border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-600/30"
                      : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div>
            <input
              id="cgpa"
              name="cgpa"
              inputMode="decimal"
              aria-label={academics.scoreType === "cgpa" ? "CGPA out of 10" : "Percentage out of 100"}
              placeholder={academics.scoreType === "cgpa" ? "e.g. 8.4 (out of 10)" : "e.g. 84 (out of 100)"}
              value={academics.cgpa}
              onChange={(e) => set({ cgpa: e.target.value.replace(/[^\d.]/g, "").slice(0, 6) })}
              aria-invalid={errors.cgpa ? true : undefined}
              aria-describedby={errors.cgpa ? "cgpa-error" : undefined}
              className={`${CONTROL} w-full ${errors.cgpa ? FIELD_BAD : FIELD_OK}`}
            />
            {errors.cgpa ? (
              <p id="cgpa-error" className="mt-1 text-xs text-danger">
                {errors.cgpa}
              </p>
            ) : (
              <p className="mt-1 text-xs text-text-subtle">
                {academics.scoreType === "cgpa" ? "Out of 10." : "Out of 100."}
              </p>
            )}
          </div>
        </div>
      </fieldset>

      <FileUpload
        kind="marksheet"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        label="Marksheet"
        maxBytes={25 * MB}
        hint="Latest semester or final marksheet. Image or PDF, up to 25 MB. You can upload more than one."
      />

      <QualificationList
        title="Professional qualifications"
        hint="CA, CS, CMA, CFA, ACCA and similar. Optional."
        addLabel="Add qualification"
        prefix="professional"
        namePlaceholder="e.g. CA Intermediate"
        issuerPlaceholder="e.g. ICAI"
        rows={academics.professional ?? []}
        errors={errors}
        onChange={(rows) => set({ professional: rows })}
      />

      <QualificationList
        title="Certifications"
        hint="Courses and certificates with a named issuer. Optional."
        addLabel="Add certification"
        prefix="certifications"
        namePlaceholder="e.g. Google Data Analytics"
        issuerPlaceholder="e.g. Coursera, NPTEL, AWS"
        rows={academics.certifications ?? []}
        errors={errors}
        onChange={(rows) => set({ certifications: rows })}
      />
    </div>
  );
}

function QualificationList({
  title,
  hint,
  addLabel,
  prefix,
  namePlaceholder,
  issuerPlaceholder,
  rows,
  errors,
  onChange,
}: {
  title: string;
  hint: string;
  addLabel: string;
  prefix: string;
  namePlaceholder: string;
  issuerPlaceholder: string;
  rows: QualificationEntry[];
  errors: Record<string, string>;
  onChange: (rows: QualificationEntry[]) => void;
}) {
  const patch = (id: string, next: Partial<QualificationEntry>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...next } : r)));
  // Local date, so the picker cannot offer tomorrow late in the evening.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const add = () =>
    onChange([...rows, { id: `${prefix}-${Date.now()}`, name: "", issuer: "", completionDate: "", credentialUrl: "" }]);

  return (
    <Group
      title={title}
      hint={hint}
      action={
        <button
          type="button"
          onClick={add}
          className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-brand-200 bg-brand-50 px-3 text-sm font-semibold text-brand-700 hover:bg-brand-100"
        >
          <Plus className="size-3.5" aria-hidden />
          {addLabel}
        </button>
      }
    >
      {rows.length === 0 ? (
        <p className="text-xs text-text-subtle">None added.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, i) => {
            const k = `${prefix}.${row.id}`;
            return (
              <div key={row.id} className="space-y-3 rounded-xl border border-ink-100 bg-ink-50 p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-semibold uppercase tracking-wider text-brand-700">
                    {title.replace(/s$/, "")} {i + 1}
                  </span>
                  <RemoveButton label={`Remove ${title.toLowerCase().replace(/s$/, "")} ${i + 1}`} onClick={() => onChange(rows.filter((r) => r.id !== row.id))} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    id={`${k}.name`}
                    label="Name *"
                    placeholder={namePlaceholder}
                    value={row.name}
                    error={errors[`${k}.name`]}
                    onChange={(v) => patch(row.id, { name: v })}
                  />
                  <Field
                    id={`${k}.issuer`}
                    label="Issued by *"
                    placeholder={issuerPlaceholder}
                    value={row.issuer}
                    error={errors[`${k}.issuer`]}
                    onChange={(v) => patch(row.id, { issuer: v })}
                  />
                  <Field
                    id={`${k}.completionDate`}
                    label="Completion date *"
                    type="date"
                    max={today}
                    value={row.completionDate}
                    error={errors[`${k}.completionDate`]}
                    onChange={(v) => patch(row.id, { completionDate: v })}
                  />
                  <Field
                    id={`${k}.credentialUrl`}
                    label="Credential link (optional)"
                    type="url"
                    placeholder="https://"
                    value={row.credentialUrl}
                    error={errors[`${k}.credentialUrl`]}
                    onChange={(v) => patch(row.id, { credentialUrl: v })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Group>
  );
}

/* ── Step 3: Experience ─────────────────────────────────────────────────── */

function ExperienceStep({ values, update, errors }: StepProps) {
  const experiences = values.experiences || [];

  function addExperience() {
    const newItem: ExperienceEntry = {
      id: `exp-${Date.now()}`,
      type: "Internship",
      company: "",
      role: "",
      from: "",
      to: "",
      current: false,
      description: "",
    };
    update("experiences", [...experiences, newItem]);
  }

  function updateExperience(id: string, patch: Partial<ExperienceEntry>) {
    update(
      "experiences",
      experiences.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function removeExperience(id: string) {
    update(
      "experiences",
      experiences.filter((item) => item.id !== id),
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-text-subtle">
          Optional, but every entry you add needs all of its details.
        </p>
        <button
          type="button"
          onClick={addExperience}
          className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-100 border border-brand-200"
        >
          <Plus className="size-3.5" />
          <span>Add Experience</span>
        </button>
      </div>

      {experiences.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-200 p-8 text-center bg-ink-50/50">
          <Briefcase className="mx-auto size-8 text-ink-400" />
          <h3 className="mt-2 text-xs font-semibold text-ink-800">No experience records yet</h3>
          <p className="mt-1 text-xs text-text-subtle">
            Freshers can add academic capstone projects, open-source work, or freelance contracts.
          </p>
          <button
            type="button"
            onClick={addExperience}
            className="apple-spring apple-pressable mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-white border border-ink-200 px-3 py-1.5 text-sm font-medium text-ink-700 shadow-2xs hover:bg-ink-50"
          >
            <Plus className="size-3.5 text-brand-600" />
            <span>Add First Project / Role</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {experiences.map((exp, idx) => {
            const k = `exp.${exp.id}`;
            const isProject = exp.type === "Project";
            return (
              <div
                key={exp.id}
                className="rounded-xl border border-ink-100 bg-ink-50 p-4.5 shadow-2xs space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-semibold uppercase tracking-wider text-brand-700">
                    Experience {idx + 1}
                  </span>
                  <RemoveButton label={`Remove experience ${idx + 1}`} onClick={() => removeExperience(exp.id)} />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <SelectField
                    id={`${k}.type`}
                    label="Type *"
                    value={exp.type}
                    error={errors[`${k}.type`]}
                    onChange={(v) => updateExperience(exp.id, { type: v })}
                    options={[...EXPERIENCE_TYPES]}
                  />
                  <Field
                    id={`${k}.company`}
                    label={isProject ? "Organisation / College *" : "Company *"}
                    placeholder={isProject ? "e.g. College, client, or Self" : "e.g. Infosys"}
                    value={exp.company}
                    error={errors[`${k}.company`]}
                    onChange={(v) => updateExperience(exp.id, { company: v })}
                  />
                  <Field
                    id={`${k}.role`}
                    label="Role / Title *"
                    placeholder="e.g. Marketing Intern"
                    value={exp.role}
                    error={errors[`${k}.role`]}
                    onChange={(v) => updateExperience(exp.id, { role: v })}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <MonthYearField
                    id={`${k}.from`}
                    label="Start date *"
                    value={exp.from}
                    error={errors[`${k}.from`]}
                    onChange={(v) => updateExperience(exp.id, { from: v })}
                  />
                  <div>
                    {exp.current ? (
                      <div>
                        <span className="block text-sm font-medium text-ink-800">End date</span>
                        <p
                          aria-live="polite"
                          className={`${CONTROL} mt-2 flex w-full items-center gap-2 border-brand-200 bg-brand-50 font-medium text-brand-800`}
                        >
                          <span className="size-2 shrink-0 rounded-full bg-brand-600" aria-hidden />
                          Present
                          <span className="font-normal text-brand-700/80">· ongoing</span>
                        </p>
                      </div>
                    ) : (
                      <MonthYearField
                        id={`${k}.to`}
                        label="End date *"
                        value={exp.to}
                        error={errors[`${k}.to`]}
                        onChange={(v) => updateExperience(exp.id, { to: v })}
                      />
                    )}
                    <label className="mt-1 inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-ink-800 sm:min-h-9">
                      <input
                        type="checkbox"
                        checked={exp.current}
                        onChange={(e) => updateExperience(exp.id, { current: e.target.checked, to: e.target.checked ? "" : exp.to })}
                        className="size-4 shrink-0 rounded border-ink-300 accent-brand-700"
                      />
                      I currently work here
                    </label>
                  </div>
                </div>

                <TextArea
                  id={`${k}.description`}
                  label="What you did *"
                  hint="Your work, the tools you used, and a result if you have one."
                  value={exp.description}
                  error={errors[`${k}.description`]}
                  onChange={(v) => updateExperience(exp.id, { description: v })}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Step 4: Skills with Proficiency Ratings ────────────────────────────── */

function SkillsStep({ values, update, errors, skillsLocked }: StepProps) {
  const [draft, setDraft] = useState("");
  const skills = values.skills || [];
  const skillsWithRatings = values.skillsWithRatings || [];

  // Legacy rule: once rated (or an AI interview is queued) the interview is
  // built on these skills, so they stop being editable. The API enforces it.
  if (skillsLocked) {
    return (
      <div className="space-y-4">
        <p className="rounded-[10px] border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-700">
          Your skills are locked because your AI interview is based on them. Write to us if one is wrong.
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <li key={skill} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
              {skill}
              {skillsWithRatings.find((s) => s.name === skill)?.rating
                ? ` · ${skillsWithRatings.find((s) => s.name === skill)?.rating}`
                : ""}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  function addSkill(name: string) {
    const clean = name.trim();
    if (!clean || skills.includes(clean) || skills.length >= 7) return;
    const nextSkills = [...skills, clean];
    const nextRatings: SkillWithRating[] = [
      ...skillsWithRatings,
      { name: clean, rating: "Intermediate" },
    ];
    update("skills", nextSkills);
    update("skillsWithRatings", nextRatings);
    setDraft("");
  }

  function removeSkill(name: string) {
    update(
      "skills",
      skills.filter((s) => s !== name),
    );
    update(
      "skillsWithRatings",
      skillsWithRatings.filter((s) => s.name.toLowerCase() !== name.toLowerCase()),
    );
  }

  function updateRating(name: string, rating: "Beginner" | "Intermediate" | "Advanced") {
    const nextRatings = skillsWithRatings.map((item) =>
      item.name.toLowerCase() === name.toLowerCase() ? { ...item, rating } : item,
    );
    update("skillsWithRatings", nextRatings);
  }

  return (
    <div className="space-y-5">
      {/* The old site's skills notice (bug sheet 21 Oct), word for word. */}
      <div className="flex gap-2.5 rounded-[10px] border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-ink-800">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <div>
          <p className="font-semibold">Important Note</p>
          <p className="mt-1 text-pretty">
            The self-evaluated skill ratings you provide will directly influence the difficulty level of your AI
            interview. Giving honest and accurate ratings will ensure you are assessed fairly, helping you achieve a
            better score and improving your chances of being shortlisted by employers.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-pretty">
            <li>Your AI interview questions are based on the skills you provide, allowing employers to assess you accurately.</li>
            <li>
              Once submitted, skills cannot be changed as this impacts your vetting status. To update skills after
              completion of your AI Interview, please contact Findtern Support; note that additional charges and terms
              apply.
            </li>
          </ol>
        </div>
      </div>

      <div>
        <label htmlFor="skills" className="block text-sm font-medium text-ink-800">
          Select Key Skills (4–7) *
        </label>
        <p className="mt-0.5 text-xs text-text-subtle">
          Rank skills in order of strength. Rate each skill to help employers match project requirements.
        </p>

        <div className="mt-2.5 flex gap-2">
          <input
            id="skills"
            value={draft}
            placeholder="Type a skill, e.g. React, Sales, Excel…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSkill(draft);
              }
            }}
            className="apple-spring h-11 min-w-0 flex-1 rounded-[10px] border border-ink-200 bg-white px-3 text-[14px] text-ink-900 shadow-2xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 sm:h-10"
          />
          <button
            type="button"
            disabled={!draft.trim() || skills.length >= 7}
            onClick={() => addSkill(draft)}
            className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover disabled:opacity-50"
          >
            <Plus className="size-3.5" />
            <span>Add</span>
          </button>
        </div>

        {errors.skills ? <p className="mt-1 text-xs text-danger">{errors.skills}</p> : null}

        {/* Autocomplete suggestions */}
        {draft.trim() ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestSkills(draft, 5)
              .filter((s) => !skills.includes(s))
              .map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => addSkill(suggestion)}
                  className="apple-spring rounded-[10px] bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-brand-50 hover:text-brand-700"
                >
                  + {suggestion}
                </button>
              ))}
          </div>
        ) : null}
      </div>

      {/* One-tap picks, technical and non-technical, so nobody has to guess the exact word. */}
      {skills.length < 7 ? (
        <div className="space-y-4">
          <SkillChips title="Technical" options={TECH_SKILLS} initial={12} have={skills} onPick={addSkill} />
          <SkillChips title="Non-technical" options={NON_TECH_SKILLS} initial={12} have={skills} onPick={addSkill} />
        </div>
      ) : null}

      {/* Selected skills with ratings cards */}
      <div className="space-y-2.5 pt-2">
        {skills.map((skill, index) => {
          const item = skillsWithRatings.find(
            (r) => r.name.toLowerCase() === skill.toLowerCase(),
          );
          const currentRating = item?.rating || "Intermediate";

          return (
            <div
              key={skill}
              className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 bg-white p-3 shadow-2xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-2xs font-bold text-brand-700 border border-brand-200/60">
                  #{index + 1}
                </span>
                <span className="font-semibold text-xs text-ink-900 truncate">{skill}</span>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={currentRating}
                  onChange={(e) =>
                    updateRating(skill, e.target.value as "Beginner" | "Intermediate" | "Advanced")
                  }
                  aria-label={`Proficiency rating for ${skill}`}
                  className="apple-spring h-8 rounded-[10px] border border-ink-200 bg-ink-50 px-2 text-xs font-semibold text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>

                <button
                  type="button"
                  onClick={() => removeSkill(skill)}
                  aria-label={`Remove skill ${skill}`}
                  className="apple-spring rounded-md p-1.5 text-ink-600 hover:bg-ink-100 hover:text-danger"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A labelled group of one-tap skill picks with a show more / fewer toggle. */
function SkillChips({
  title,
  options,
  initial,
  have,
  onPick,
}: {
  title: string;
  options: string[];
  initial: number;
  have: string[];
  onPick: (skill: string) => void;
}) {
  const [all, setAll] = useState(false);
  const taken = (s: string) => have.some((h) => h.toLowerCase() === s.toLowerCase());
  const shown = (all ? options : options.slice(0, initial)).filter((s) => !taken(s));
  const hidden = options.length - initial;
  return (
    <div>
      <p className="text-xs font-medium text-ink-700">{title}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {shown.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => onPick(s)}
              className="apple-spring inline-flex min-h-11 items-center sm:min-h-9 rounded-[10px] border border-ink-200 bg-white px-2.5 text-xs font-medium text-ink-700 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
            >
              + {s}
            </button>
          </li>
        ))}
        {hidden > 0 ? (
          <li>
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              aria-expanded={all}
              className="inline-flex min-h-11 items-center sm:min-h-9 px-2 text-xs font-medium text-brand-700 underline-offset-4 hover:underline"
            >
              {all ? "Show fewer" : `${hidden} more`}
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/* ── Step 5: Languages ──────────────────────────────────────────────────── */

function LanguagesStep({ values, update }: StepProps) {
  const languages = values.languages || [];

  function addLanguage() {
    const newItem: LanguageEntry = {
      id: `lang-${Date.now()}`,
      language: "",
      level: "Professional",
      read: true,
      write: true,
      speak: true,
    };
    update("languages", [...languages, newItem]);
  }

  function updateLang(id: string, patch: Partial<LanguageEntry>) {
    update(
      "languages",
      languages.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );
  }

  function removeLang(id: string) {
    update(
      "languages",
      languages.filter((l) => l.id !== id),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-subtle">
          Languages you are comfortable using in day-to-day work and standup meetings.
        </p>
        <button
          type="button"
          onClick={addLanguage}
          className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-100 border border-brand-200"
        >
          <Plus className="size-3.5" />
          <span>Add Language</span>
        </button>
      </div>

      <div className="space-y-3">
        {languages.map((lang) => (
          <div
            key={lang.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100 bg-white p-3.5 shadow-2xs"
          >
            <div className="flex items-center gap-2 flex-1 min-w-44">
              <Languages className="size-4 text-brand-600 shrink-0" />
              <input
                type="text"
                value={lang.language}
                placeholder="e.g. English, Hindi, Tamil, German"
                onChange={(e) => updateLang(lang.id, { language: e.target.value })}
                className="apple-spring h-8.5 w-full rounded-[10px] border border-ink-200 bg-ink-50 px-2.5 text-[14px] font-medium text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            <div className="flex items-center gap-3">
              <select
                value={lang.level}
                onChange={(e) =>
                  updateLang(lang.id, {
                    level: e.target.value as LanguageEntry["level"],
                  })
                }
                className="apple-spring h-8.5 rounded-[10px] border border-ink-200 bg-ink-50 px-2.5 text-xs font-semibold text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="Native">Native / Bilingual</option>
                <option value="Professional">Professional Working</option>
                <option value="Conversational">Conversational</option>
                <option value="Basic">Basic</option>
              </select>

              <div className="flex items-center gap-2 text-xs text-ink-600 font-medium">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lang.read !== false}
                    onChange={(e) => updateLang(lang.id, { read: e.target.checked })}
                    className="size-3.5 rounded-xs"
                  />
                  <span>Read</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lang.speak !== false}
                    onChange={(e) => updateLang(lang.id, { speak: e.target.checked })}
                    className="size-3.5 rounded-xs"
                  />
                  <span>Speak</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lang.write !== false}
                    onChange={(e) => updateLang(lang.id, { write: e.target.checked })}
                    className="size-3.5 rounded-xs"
                  />
                  <span>Write</span>
                </label>
              </div>

              {languages.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeLang(lang.id)}
                  className="apple-spring rounded-md p-1.5 text-ink-600 hover:text-danger hover:bg-ink-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Step 6: Extra-Curricular Activities ─────────────────────────────────── */

function ExtracurricularStep({ values, update }: StepProps) {
  const extracurriculars = values.extracurriculars || [];

  function addActivity() {
    const newItem: ExtracurricularEntry = {
      id: `act-${Date.now()}`,
      activity: "",
      level: "Intermediate",
      category: "Leadership",
      description: "",
    };
    update("extracurriculars", [...extracurriculars, newItem]);
  }

  function updateActivity(id: string, patch: Partial<ExtracurricularEntry>) {
    update(
      "extracurriculars",
      extracurriculars.map((act) => (act.id === id ? { ...act, ...patch } : act)),
    );
  }

  function removeActivity(id: string) {
    update(
      "extracurriculars",
      extracurriculars.filter((act) => act.id !== id),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-subtle">
          Competitions, clubs, open-source communities, hackathons, or volunteering work.
        </p>
        <button
          type="button"
          onClick={addActivity}
          className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-100 border border-brand-200"
        >
          <Plus className="size-3.5" />
          <span>Add Activity</span>
        </button>
      </div>

      {extracurriculars.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-200 p-8 text-center bg-ink-50/50">
          <Award className="mx-auto size-8 text-ink-400" />
          <h3 className="mt-2 text-xs font-semibold text-ink-800">No extracurriculars listed yet</h3>
          <p className="mt-1 text-xs text-text-subtle">
            Optional but highly recommended - highlights your teamwork, initiative, and drive beyond marks.
          </p>
          <button
            type="button"
            onClick={addActivity}
            className="apple-spring apple-pressable mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-white border border-ink-200 px-3 py-1.5 text-sm font-medium text-ink-700 shadow-2xs hover:bg-ink-50"
          >
            <Plus className="size-3.5 text-brand-600" />
            <span>Add Extracurricular</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {extracurriculars.map((act) => (
            <div
              key={act.id}
              className="rounded-xl border border-ink-100 bg-ink-50 p-3.5 shadow-2xs space-y-2.5"
            >
              <div className="flex items-center justify-between gap-3">
                <input
                  type="text"
                  placeholder="e.g. Hackathon Finalist, NSS Volunteer, Coding Club Lead"
                  value={act.activity}
                  onChange={(e) => updateActivity(act.id, { activity: e.target.value })}
                  className="apple-spring h-9 flex-1 rounded-[10px] border border-ink-200 bg-white px-3 text-[14px] font-semibold text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />

                <select
                  value={act.level}
                  onChange={(e) =>
                    updateActivity(act.id, {
                      level: e.target.value as ExtracurricularEntry["level"],
                    })
                  }
                  className="apple-spring h-9 rounded-[10px] border border-ink-200 bg-white px-2.5 text-xs font-semibold text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="Beginner">Participant</option>
                  <option value="Intermediate">Lead / Core Team</option>
                  <option value="Advanced">Winner / Head Organizer</option>
                </select>

                <button
                  type="button"
                  onClick={() => removeActivity(act.id)}
                  className="apple-spring rounded-md p-1.5 text-ink-600 hover:text-danger hover:bg-ink-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>

              <input
                type="text"
                placeholder="Brief achievement notes e.g. Managed 200 participants, won 2nd place out of 50 teams"
                value={act.description || ""}
                onChange={(e) => updateActivity(act.id, { description: e.target.value })}
                className="apple-spring h-8.5 w-full rounded-[10px] border border-ink-200 bg-white px-3 text-xs text-ink-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Step 7: Location Preferences & Hardware ────────────────────────────── */

function LocationPreferencesStep({ values, update, errors }: StepProps) {
  const [cityDraft, setCityDraft] = useState("");
  const locationTypes = values.locationTypes || [];
  // Legacy rows can repeat a city; show and save each one once.
  const preferredLocations = Array.from(new Set(values.preferredLocations || []));
  // One pick; the stored set is that mode plus every less on-site one.
  const picked = widestWorkMode(locationTypes);

  const needsCities = picked === "onsite" || picked === "hybrid";

  function pickMode(mode: (typeof WORK_MODES)[number]) {
    update("locationTypes", cascadeWorkModes([], mode));
  }

  function addCity(city: string) {
    const clean = city.trim();
    if (!clean || preferredLocations.includes(clean) || preferredLocations.length >= 5) return;
    update("preferredLocations", [...preferredLocations, clean]);
    setCityDraft("");
  }

  function removeCity(city: string) {
    update(
      "preferredLocations",
      preferredLocations.filter((c) => c !== city),
    );
  }

  return (
    <div className="space-y-6">
      {/* Work Modes */}
      <div>
        <p id="locationTypes-label" className="block text-sm font-medium text-ink-800">
          Work mode *
        </p>
        <p id="locationTypes-help" className="mt-0.5 text-xs text-text-subtle">
          Pick the most on-site option you can do. Onsite also covers hybrid and remote; hybrid also covers remote.
        </p>
        <div
          id="locationTypes"
          role="radiogroup"
          tabIndex={-1}
          aria-labelledby="locationTypes-label"
          aria-describedby="locationTypes-help"
          className="mt-2.5 flex flex-wrap gap-2.5 outline-none"
        >
          {WORK_MODES.map((mode) => {
            const active = picked === mode;
            // Onsite brings hybrid and remote with it, hybrid brings remote:
            // those light up too, a step quieter than the one picked.
            const included = !active && locationTypes.includes(mode);
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => pickMode(mode)}
                className={`apple-spring apple-pressable inline-flex min-h-11 items-center gap-2 rounded-[10px] border px-4 py-2.5 text-sm font-semibold capitalize ${
                  active
                    ? "border-brand-600 bg-brand-50 text-brand-800 shadow-2xs ring-1 ring-brand-600/30"
                    : included
                      ? "border-brand-300 bg-brand-50/60 text-brand-800"
                      : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                }`}
              >
                <span
                  className={`size-2 rounded-full ${active ? "bg-brand-600" : included ? "bg-brand-400" : "bg-ink-300"}`}
                />
                <span>{mode}</span>
                {included ? <span className="text-2xs font-medium normal-case text-brand-700">· included</span> : null}
              </button>
            );
          })}
        </div>
        {errors.locationTypes ? (
          <p className="mt-1 text-xs text-danger">{errors.locationTypes}</p>
        ) : null}
      </div>

      {/* Preferred Locations (up to 5) */}
      <div>
        <label htmlFor="preferredLocations" className="block text-sm font-medium text-ink-800">
          Preferred Work Cities {needsCities ? "* (1 to 5)" : "(Up to 5)"}
        </label>
        <p className="mt-0.5 text-xs text-text-subtle">
          {needsCities
            ? "Required for onsite or hybrid work: the cities you can work from in person."
            : "Where you are open to relocating or working on-site/hybrid."}
        </p>

        <div className="mt-2.5 flex gap-2">
          <input
            id="preferredLocations"
            value={cityDraft}
            placeholder="Type city e.g. Bengaluru, Pune, Delhi, Mumbai..."
            aria-invalid={errors.preferredLocations ? true : undefined}
            aria-describedby={errors.preferredLocations ? "preferredLocations-error" : undefined}
            onChange={(e) => setCityDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCity(cityDraft);
              }
            }}
            className="apple-spring h-10 flex-1 rounded-[10px] border border-ink-200 bg-white px-3 text-[14px] text-ink-900 shadow-2xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
          <button
            type="button"
            disabled={!cityDraft.trim() || preferredLocations.length >= 5}
            onClick={() => addCity(cityDraft)}
            className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover disabled:opacity-50"
          >
            <Plus className="size-3.5" />
            <span>Add</span>
          </button>
        </div>

        {/* City suggestions */}
        {cityDraft.trim() ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestDistricts(cityDraft, 5)
              .map((d) => `${d.district}, ${d.state}`)
              .filter((c) => !preferredLocations.includes(c))
              .map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => addCity(suggestion)}
                  className="apple-spring rounded-[10px] bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-brand-50 hover:text-brand-700"
                >
                  + {suggestion}
                </button>
              ))}
          </div>
        ) : null}

        {errors.preferredLocations ? (
          <p id="preferredLocations-error" className="mt-1 text-xs text-danger">
            {errors.preferredLocations}
          </p>
        ) : null}

        {preferredLocations.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {preferredLocations.map((loc) => (
              <li
                key={loc}
                className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50/80 px-3 py-1.5 text-xs font-medium text-brand-800"
              >
                <MapPin className="size-3 text-brand-600 shrink-0" />
                <span>{loc}</span>
                <button
                  type="button"
                  onClick={() => removeCity(loc)}
                  className="rounded-xs p-0.5 hover:text-danger"
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Hardware / Laptop Radio */}
      <div>
        <label className="block text-sm font-medium text-ink-800">
          Hardware Availability *
        </label>
        <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
          <label
            className={`apple-spring flex items-start gap-3 rounded-[10px] border p-3.5 cursor-pointer ${
              values.hasLaptop === true
                ? "border-brand-600 bg-brand-50/60 ring-1 ring-brand-600/30"
                : "border-ink-200 bg-white hover:bg-ink-50"
            }`}
          >
            <input
              type="radio"
              name="hasLaptop"
              checked={values.hasLaptop === true}
              onChange={() => update("hasLaptop", true)}
              className="mt-0.5 size-4 text-brand-700"
            />
            <div>
              <span className="block text-xs font-semibold text-ink-900">
                Yes, I have a dedicated work laptop
              </span>
              <span className="mt-0.5 block text-xs text-text-subtle">
                Ready for remote software development or work immediately.
              </span>
            </div>
          </label>

          <label
            className={`apple-spring flex items-start gap-3 rounded-[10px] border p-3.5 cursor-pointer ${
              values.hasLaptop === false
                ? "border-brand-600 bg-brand-50/60 ring-1 ring-brand-600/30"
                : "border-ink-200 bg-white hover:bg-ink-50"
            }`}
          >
            <input
              type="radio"
              name="hasLaptop"
              checked={values.hasLaptop === false}
              onChange={() => update("hasLaptop", false)}
              className="mt-0.5 size-4 text-brand-700"
            />
            <div>
              <span className="block text-xs font-semibold text-ink-900">
                No, I will require company laptop provisioning
              </span>
              <span className="mt-0.5 block text-xs text-text-subtle">
                Companies can provide a system or on-site desktop workstation.
              </span>
            </div>
          </label>
        </div>
        {errors.hasLaptop ? (
          <p id="hasLaptop-error" className="mt-1 text-xs text-danger">
            {errors.hasLaptop}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ── Step 8: Live WYSIWYG Profile Preview ────────────────────────────────── */

function ProfilePreviewStep({ values, update, errors, email, onJumpStep }: StepProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-brand-800">
          <Sparkles className="size-4 text-brand-600" />
          <span>Live Candidate Profile Preview</span>
        </div>
        <p className="mt-1 text-xs text-brand-700/90 leading-relaxed">
          This is exactly how your verified dossier appears in employer search results and candidate comparison matrices.
        </p>
      </div>

      {/* Preview Card */}
      <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-xs">
        {/* Header Ribbon */}
        <div className="bg-gradient-to-r from-brand-900 to-brand-800 p-6 text-white">
          <div className="flex items-start gap-4">
            <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-white/10 text-xl font-bold backdrop-blur-xs border border-white/20">
              {values.photoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={values.photoUrl} alt="Photo" className="size-full rounded-2xl object-cover" />
              ) : (
                <span>{(values.city?.[0] || "I").toUpperCase()}</span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold text-white">
                Candidate Profile
              </h3>
              <p className="text-xs text-white/80">
                {values.academics.degree || "Student"} {values.academics.branch ? `· ${values.academics.branch}` : ""}{email ? ` · ${email}` : ""}
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs text-white/70">
                <MapPin className="size-3" />
                <span>{values.city || "Location not stated"}</span>
                {values.locationTypes.length > 0 ? (
                  <>
                    <span>·</span>
                    <span className="capitalize">{values.locationTypes.join(", ")}</span>
                  </>
                ) : null}
              </p>
            </div>
          </div>
        </div>

        {/* Content Details */}
        <div className="p-6 space-y-5">
          {/* Bio */}
          {values.bio ? (
            <div>
              <h4 className="text-2xs font-semibold uppercase tracking-wider text-text-subtle">
                About Me
              </h4>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-800 whitespace-pre-wrap">
                {values.bio}
              </p>
            </div>
          ) : null}

          {/* Academics Tile */}
          <div className="rounded-xl border border-ink-100 bg-ink-50 p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-900">
                <GraduationCap className="size-4 text-brand-600" />
                <span>Academic Record</span>
              </span>
              {onJumpStep ? (
                <button
                  type="button"
                  onClick={() => onJumpStep(1)}
                  className="apple-spring text-xs font-medium text-brand-700 hover:underline"
                >
                  Edit
                </button>
              ) : null}
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 text-xs">
              <div>
                <span className="text-xs text-text-subtle block">Institution</span>
                <span className="font-semibold text-ink-900">
                  {values.academics.institution || "Not specified"}
                </span>
              </div>
              <div>
                <span className="text-xs text-text-subtle block">Degree & Major</span>
                <span className="font-semibold text-ink-900">
                  {[values.academics.degree, values.academics.branch].filter(Boolean).join(" - ") || "-"}
                </span>
              </div>
              <div>
                <span className="text-xs text-text-subtle block">Years</span>
                <span className="font-semibold text-ink-900">
                  {[values.academics.startYear, values.academics.yearOfGraduation].filter(Boolean).join(" – ") || "-"}{" "}
                  <span className="font-normal text-text-subtle">
                    ({values.academics.status === "Completed" ? "Completed" : "Pursuing"})
                  </span>
                </span>
              </div>
              <div>
                <span className="text-xs text-text-subtle block">
                  {values.academics.scoreType === "percentage" ? "Percentage" : "CGPA"}
                </span>
                <span className="font-semibold tabular-nums text-ink-900">
                  {values.academics.cgpa
                    ? values.academics.scoreType === "percentage"
                      ? `${values.academics.cgpa}%`
                      : `${values.academics.cgpa} / 10`
                    : "-"}
                </span>
              </div>
            </div>
          </div>

          {[...(values.academics.professional ?? []), ...(values.academics.certifications ?? [])].length > 0 ? (
            <div>
              <h4 className="text-2xs font-semibold uppercase tracking-wider text-text-subtle">
                Qualifications &amp; Certifications
              </h4>
              <ul className="mt-2 space-y-1 text-xs text-ink-800">
                {[...(values.academics.professional ?? []), ...(values.academics.certifications ?? [])].map((q) => (
                  <li key={q.id}>
                    <span className="font-semibold">{q.name || "Untitled"}</span>
                    {q.issuer ? <span className="text-text-subtle"> · {q.issuer}</span> : null}
                    {q.completionDate ? <span className="text-text-subtle"> · {formatDay(q.completionDate)}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Skills with Ratings Tile */}
          {values.skills.length > 0 ? (
            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-2xs font-semibold uppercase tracking-wider text-text-subtle">
                  Verified Skills ({values.skills.length})
                </h4>
                {onJumpStep ? (
                  <button
                    type="button"
                    onClick={() => onJumpStep(3)}
                    className="apple-spring text-xs font-medium text-brand-700 hover:underline"
                  >
                    Edit
                  </button>
                ) : null}
              </div>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {values.skills.map((s) => {
                  const rating =
                    values.skillsWithRatings.find(
                      (r) => r.name.toLowerCase() === s.toLowerCase(),
                    )?.rating || "Intermediate";
                  return (
                    <li
                      key={s}
                      className="inline-flex items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-800"
                    >
                      <span>{s}</span>
                      <span className="rounded-xs bg-ink-100 px-1 py-0.5 text-xs font-normal text-ink-600">
                        {rating}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {/* Experience Tile */}
          {values.experiences.length > 0 ? (
            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-2xs font-semibold uppercase tracking-wider text-text-subtle">
                  Experience & Projects ({values.experiences.length})
                </h4>
                {onJumpStep ? (
                  <button
                    type="button"
                    onClick={() => onJumpStep(2)}
                    className="apple-spring text-xs font-medium text-brand-700 hover:underline"
                  >
                    Edit
                  </button>
                ) : null}
              </div>
              <div className="mt-2 space-y-2">
                {values.experiences.map((exp) => (
                  <div key={exp.id} className="rounded-[10px] border border-ink-100 p-3 text-xs">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-semibold text-ink-900">{exp.role || "Role"}</span>
                        <span className="text-text-subtle"> at {exp.company || "Project"}</span>
                      </div>
                      <span className="text-xs font-medium text-text-subtle">
                        {monthLabel(exp.from)} – {exp.current ? "Present" : monthLabel(exp.to)}
                      </span>
                    </div>
                    {exp.description ? (
                      <p className="mt-1 text-xs text-ink-600 line-clamp-2">{exp.description}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Languages & Preferences footer */}
          <div className="grid gap-4 sm:grid-cols-2 pt-3 border-t border-ink-100 text-xs">
            <div>
              <span className="text-2xs font-semibold uppercase tracking-wider text-text-subtle block">
                Languages
              </span>
              <p className="mt-1 font-medium text-ink-800">
                {values.languages.map((l) => `${l.language} (${l.level})`).join(", ") || "English"}
              </p>
            </div>
            <div>
              <span className="text-2xs font-semibold uppercase tracking-wider text-text-subtle block">
                Hardware
              </span>
              <p className="mt-1 font-medium text-ink-800">
                {values.hasLaptop === true ? "Dedicated Laptop Ready" : "Requires Laptop Support"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`rounded-xl border p-4 ${errors.ndaAccepted ? "border-danger/40 bg-danger-soft" : "border-ink-200 bg-white"}`}
      >
        <label className="flex items-start gap-2.5 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={Boolean(values.ndaAccepted)}
            onChange={(e) => update("ndaAccepted", e.target.checked)}
            aria-describedby={errors.ndaAccepted ? "nda-error" : undefined}
            className="mt-0.5 size-4 shrink-0 rounded border-ink-300 accent-brand-700"
          />
          <span>
            I have read and accept the{" "}
            <a
              href="/intern-nda"
              target="_blank"
              rel="noopener"
              className="font-medium text-brand-700 underline-offset-4 hover:underline"
            >
              Internship Acceptance &amp; Non-Bypass Agreement
            </a>
            . Accepting a proposal is binding, and contact details stay on Findtern.
          </span>
        </label>
        {errors.ndaAccepted ? (
          <p id="nda-error" className="mt-2 text-xs text-danger">
            {errors.ndaAccepted}
          </p>
        ) : null}
      </div>
    </div>
  );
}

const STEP_VIEWS = [
  PersonalStep,
  AcademicsStep,
  ExperienceStep,
  SkillsStep,
  LanguagesStep,
  ExtracurricularStep,
  LocationPreferencesStep,
  ProfilePreviewStep,
] as const;

/* ── Form primitives ────────────────────────────────────────────────────── */

/** One control size for inputs and selects: 44px on touch-first widths, 40px from sm up. */
const CONTROL =
  "apple-spring h-11 rounded-[10px] border bg-white px-3.5 text-[14px] text-ink-900 outline-none placeholder:text-ink-400 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-600 sm:h-10";
const FIELD_BASE = `${CONTROL} mt-2 w-full`;
const FIELD_OK = "border-ink-200 focus-visible:border-brand-600 focus-visible:ring-brand-600/20";
const FIELD_BAD = "border-danger focus-visible:border-danger focus-visible:ring-danger/20";

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
  min,
  max,
  autoComplete,
  list,
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
  min?: string;
  max?: string;
  autoComplete?: string;
  /** id of a <datalist> to suggest from; free text is still accepted. */
  list?: string;
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
        inputMode={inputMode}
        maxLength={maxLength}
        min={min}
        max={max}
        autoComplete={autoComplete}
        list={list}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`${FIELD_BASE} ${error ? FIELD_BAD : FIELD_OK}`}
      />
      <FieldNote id={id} error={error} hint={hint} />
    </div>
  );
}

function TextArea({
  id,
  label,
  value,
  onChange,
  error,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      <textarea
        id={id}
        name={id}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`apple-spring mt-2 w-full rounded-[10px] border bg-white px-3.5 py-2.5 text-[14px] leading-relaxed text-ink-900 outline-none focus-visible:ring-[3px] ${
          error ? FIELD_BAD : FIELD_OK
        }`}
      />
      <FieldNote id={id} error={error} hint={hint} />
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  error,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  error?: string;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      <select
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`${FIELD_BASE} pr-8 ${error ? FIELD_BAD : FIELD_OK}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldNote id={id} error={error} hint={hint} />
    </div>
  );
}

/**
 * The line under a control: the error when there is one, otherwise the hint.
 * Hints sit below the input, never between label and input, so two fields
 * side by side keep their inputs on the same line whichever has a hint.
 */
function FieldNote({ id, error, hint }: { id: string; error?: string; hint?: React.ReactNode }) {
  if (error) {
    return (
      <p id={`${id}-error`} className="mt-1 text-xs text-danger">
        {error}
      </p>
    );
  }
  return hint ? (
    <p id={`${id}-hint`} className="mt-1 text-xs text-text-subtle">
      {hint}
    </p>
  ) : null;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Month + year as two selects, stored as `YYYY-MM` (the legacy shape and what
 * validation reads). A half-picked value is kept as "YYYY-" or "-MM" so the
 * other select does not reset; validation reports it as incomplete.
 */
/** YYYY-MM-DD as DD/MM/YYYY, the format the rest of the form shows. */
function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

function MonthYearField({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const match = /^(\d{4})?-(\d{2})?$/.exec(value);
  const year = match?.[1] ?? "";
  const month = match?.[2] ?? "";
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 41 }, (_, i) => String(thisYear - i));
  if (year && !years.includes(year)) years.push(year);
  const set = (y: string, m: string) => onChange(y || m ? `${y}-${m}` : "");
  const describedBy = error ? `${id}-error` : `${id}-hint`;
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-ink-800">{label}</legend>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2">
        <select
          id={id}
          aria-label={`${label.replace(/\s*\*$/, "")}: month`}
          value={month}
          onChange={(e) => set(year, e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${CONTROL} w-full pr-7 ${error ? FIELD_BAD : FIELD_OK}`}
        >
          <option value="">MM</option>
          {MONTH_NAMES.map((name, i) => {
            const mm = String(i + 1).padStart(2, "0");
            return (
              <option key={mm} value={mm}>
                {mm} · {name}
              </option>
            );
          })}
        </select>
        <select
          aria-label={`${label.replace(/\s*\*$/, "")}: year`}
          value={year}
          onChange={(e) => set(e.target.value, month)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${CONTROL} w-full pr-7 tabular-nums ${error ? FIELD_BAD : FIELD_OK}`}
        >
          <option value="">YYYY</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <FieldNote id={id} error={error} hint="MM / YYYY" />
    </fieldset>
  );
}

/** Country code + number, the same split the signup form uses. */
function PhoneField({
  id,
  label,
  code,
  number,
  onCode,
  onNumber,
  error,
  hint,
  disabled = false,
}: {
  id: string;
  label: string;
  code: string;
  number: string;
  onCode?: (value: string) => void;
  onNumber?: (value: string) => void;
  error?: string;
  hint?: React.ReactNode;
  disabled?: boolean;
}) {
  const codes = DIAL_CODE_VALUES.includes(code) ? DIAL_CODES : [{ code, country: "" }, ...DIAL_CODES];
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      <div className="mt-2 flex gap-2">
        <select
          aria-label={`${label}: country code`}
          value={code}
          disabled={disabled}
          onChange={(e) => onCode?.(e.target.value)}
          className={`${CONTROL} w-36 shrink-0 pr-7 ${FIELD_OK}`}
        >
          {codes.map((c) => (
            <option key={c.code} value={c.code}>
              {c.country ? `${c.code} · ${c.country}` : c.code}
            </option>
          ))}
        </select>
        <input
          id={id}
          name={id}
          inputMode="numeric"
          autoComplete={disabled ? undefined : "off"}
          maxLength={code === "+91" ? 10 : 15}
          placeholder="9876543210"
          value={number}
          disabled={disabled}
          onChange={(e) => onNumber?.(e.target.value.replace(/\D/g, ""))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={`${CONTROL} w-full min-w-0 tabular-nums ${error ? FIELD_BAD : FIELD_OK}`}
        />
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A titled group of fields inside a step. */
function Group({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-t border-ink-100 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
          {hint ? <p className="mt-0.5 text-xs text-text-subtle">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** One upload with its own title and error, inside a group. */
function UploadSlot({
  id,
  title,
  error,
  children,
}: {
  id?: string;
  title: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      tabIndex={id ? -1 : undefined}
      className={`rounded-xl border p-4 outline-none ${error ? "border-danger/40 bg-danger-soft" : "border-ink-200/70"}`}
    >
      <p className="text-sm font-medium text-ink-800">{title}</p>
      <div className="mt-2">{children}</div>
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="apple-spring -mr-2 grid size-11 place-items-center rounded-[10px] text-ink-400 hover:bg-ink-100 hover:text-danger"
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  );
}

function subscribeToNothing() {
  return () => {};
}

function readDraft(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** A local draft only wins over the server when it was written after the last save. */
function parseDraft(raw: string | null, serverUpdatedAt: string | null): Partial<OnboardingDraft> {
  if (!raw) return {};
  try {
    const { [SAVED_AT]: savedAt, bank: _bank, ...draft } = JSON.parse(raw) as Partial<OnboardingDraft> & {
      [SAVED_AT]?: number;
    };
    void _bank;
    if (serverUpdatedAt) {
      const serverAt = Date.parse(serverUpdatedAt);
      if (typeof savedAt !== "number" || (Number.isFinite(serverAt) && savedAt < serverAt)) return {};
    }
    // Drafts from before the month pickers held free text like "Jan 2025".
    if (Array.isArray(draft.experiences)) {
      draft.experiences = draft.experiences.map((e) => ({ ...e, from: toMonth(e.from ?? ""), to: toMonth(e.to ?? "") }));
    }
    return draft;
  } catch {
    return {};
  }
}