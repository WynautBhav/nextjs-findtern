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

import { suggestSkills } from "@/lib/data/skills";
import { suggestDistricts } from "@/lib/data/districts";
import { csrfFetch } from "@/lib/client-fetch";
import type {
  ExtracurricularEntry,
  ExperienceEntry,
  LanguageEntry,
  OnboardingDraft,
  SkillWithRating,
  StoredDocument,
} from "@/lib/onboarding";

const DRAFT_KEY = "findtern:intern-onboarding:v2";
const SAVED_AT = "__savedAt";
const WORK_MODES = ["remote", "hybrid", "onsite"] as const;

export const STEPS = [
  { id: "personal", title: "About Me", blurb: "Basic details, passport photo, and contact information." },
  { id: "academics", title: "Academics", blurb: "Degree, institution, specialization, and academic marks." },
  { id: "experience", title: "Experience", blurb: "Internships, freelance work, side projects, and roles." },
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
};

export function OnboardingForm({
  initial,
  documents,
  email,
  serverUpdatedAt = null,
}: {
  initial: OnboardingDraft;
  documents: StoredDocument[];
  email: string;
  /** When the saved profile last changed (ISO). A local draft older than this is stale. */
  serverUpdatedAt?: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [edits, setEdits] = useState<Partial<OnboardingDraft>>({});
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const blurbRef = useRef<HTMLParagraphElement>(null);

  // One draft per account, so two people on one browser never see each other's.
  const draftKey = `${DRAFT_KEY}:${email}`;
  const stored = useSyncExternalStore(subscribeToNothing, () => readDraft(draftKey), () => null);

  const values = useMemo<OnboardingDraft>(() => {
    return { ...initial, ...parseDraft(stored, serverUpdatedAt), ...edits };
  }, [initial, stored, serverUpdatedAt, edits]);

  useEffect(() => {
    if (!dirty) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify({ ...values, [SAVED_AT]: Date.now() }));
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

  function onContinue() {
    const problems = validate(values, step);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    goTo(Math.min(step + 1, STEPS.length - 1));
  }

  function onSubmit() {
    const problems = validate(values, STEPS.length - 1);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    void onSave();
  }

  async function onSave() {
    setSaving(true);
    setNotice(null);
    try {
      const res = await csrfFetch("/api/intern/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Bank details are edited in Settings; sending them from here would
        // overwrite a newer copy saved there.
        body: JSON.stringify({ ...values, bank: undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ text: data.error ?? "Failed to save profile. Please try again.", ok: false });
        return;
      }
      setNotice({ text: "Profile saved.", ok: true });
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // no-op
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
              onClick={onSave}
              disabled={saving}
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
                disabled={saving}
                className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-primary px-6 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover disabled:opacity-60"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Complete & Submit Profile
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
                      : "bg-ink-100 text-ink-500",
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

function PersonalStep({ values, update, errors, documents }: StepProps) {
  const onFile = (label: string) => (documents.find((d) => d.label === label) ? `${label} on file` : null);
  return (
    <div className="space-y-5">
      {/* Passport Photo Upload Slot */}
      <div className="rounded-xl border border-dashed border-ink-200 bg-ink-50/50 p-4.5 text-center sm:text-left">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="grid size-20 place-items-center rounded-xl bg-white border border-ink-200 shadow-2xs overflow-hidden shrink-0">
            {values.photoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={values.photoUrl} alt="Passport photo" className="size-full object-cover" />
            ) : (
              <User className="size-8 text-ink-400" />
            )}
          </div>
          <div className="flex-1">
            <h4 className="text-xs font-semibold text-ink-900">
              Profile Photo (Passport Size 2x2&quot;)
            </h4>
            <p className="mt-0.5 text-xs text-text-subtle">
              JPG, PNG or WebP, up to 5 MB. A clear, front-facing photo.
            </p>
            <FileUpload
              className="mt-2.5"
              kind="profile_photo"
              accept="image/jpeg,image/png,image/webp"
              label="Photo"
              current={documents.find((d) => d.label === "Profile photo") ? "Photo on file" : null}
              onUploaded={() => update("photoUrl", `/api/intern/avatar?v=${Date.now()}`)}
            />
          </div>
        </div>
      </div>

      <TextArea
        id="bio"
        label="Professional Bio *"
        hint="Summarize your technical strengths, goals, and passions in 2-3 sentences."
        value={values.bio}
        error={errors.bio}
        onChange={(v) => update("bio", v)}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Field
          id="linkedinUrl"
          label="LinkedIn Profile"
          type="url"
          placeholder="https://linkedin.com/in/username"
          value={values.linkedinUrl}
          error={errors.linkedinUrl}
          onChange={(v) => update("linkedinUrl", v)}
        />
        <Field
          id="aadhaarNumber"
          label="Aadhaar Number (12 digits)"
          placeholder="1234 5678 9012"
          inputMode="numeric"
          maxLength={14}
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

      <div className="grid gap-4 rounded-xl border border-ink-200/70 p-4 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
        <FileUpload kind="aadhaar" accept="image/jpeg,image/png,image/webp,application/pdf" label="Aadhaar" hint="Image or PDF, up to 10 MB." current={onFile("Aadhaar")} />
        <FileUpload kind="pan" accept="image/jpeg,image/png,image/webp,application/pdf" label="PAN" hint="Image or PDF, up to 10 MB." current={onFile("PAN")} />
        <FileUpload kind="intro_video" accept="video/mp4,video/webm,video/quicktime" label="Intro video" hint="Optional. Up to 50 MB." current={onFile("Intro video")} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          id="city"
          label="Current City *"
          placeholder="e.g. Bengaluru"
          value={values.city}
          error={errors.city}
          onChange={(v) => update("city", v)}
        />
        <Field
          id="state"
          label="State"
          placeholder="Karnataka"
          value={values.state}
          onChange={(v) => update("state", v)}
        />
        <Field
          id="pinCode"
          label="PIN Code"
          inputMode="numeric"
          maxLength={6}
          placeholder="560001"
          value={values.pinCode}
          error={errors.pinCode}
          onChange={(v) => update("pinCode", v.replace(/\D/g, ""))}
        />
      </div>

      <Field
        id="emergencyPhone"
        label="Contact / Emergency Phone Number"
        hint="10-digit primary mobile number for interview communications."
        inputMode="tel"
        maxLength={10}
        placeholder="9876543210"
        value={values.emergencyPhone}
        error={errors.emergencyPhone}
        onChange={(v) => update("emergencyPhone", v.replace(/\D/g, ""))}
      />
    </div>
  );
}

/* ── Step 2: Academics ──────────────────────────────────────────────────── */

function AcademicsStep({ values, update, errors }: StepProps) {
  const academics = values.academics;
  const set = (patch: Partial<OnboardingDraft["academics"]>) =>
    update("academics", { ...academics, ...patch });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="qualificationLevel" className="block text-sm font-medium text-ink-800">
            Highest Qualification Level *
          </label>
          <select
            id="qualificationLevel"
            value={academics.qualificationLevel || "Bachelor's"}
            onChange={(e) => set({ qualificationLevel: e.target.value })}
            className="apple-spring mt-2 h-10 w-full rounded-[10px] border border-ink-200 bg-white px-3 text-[14px] font-medium text-ink-900 shadow-2xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="Bachelor's">Bachelor&apos;s Degree</option>
            <option value="Master's">Master&apos;s Degree</option>
            <option value="Diploma">Diploma / Polytechnic</option>
            <option value="High School">High School / 12th</option>
          </select>
        </div>

        <div>
          <label htmlFor="academicStatus" className="block text-sm font-medium text-ink-800">
            Academic Status *
          </label>
          <select
            id="academicStatus"
            value={academics.status || "Pursuing"}
            onChange={(e) => set({ status: e.target.value })}
            className="apple-spring mt-2 h-10 w-full rounded-[10px] border border-ink-200 bg-white px-3 text-[14px] font-medium text-ink-900 shadow-2xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="Pursuing">Currently Pursuing / Enrolled</option>
            <option value="Completed">Graduated / Completed</option>
          </select>
        </div>
      </div>

      <Field
        id="institution"
        label="College / University Institution *"
        placeholder="e.g. JECRC University, IIT Bombay, Anna University"
        value={academics.institution}
        error={errors.institution}
        onChange={(v) => set({ institution: v })}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="degree"
          label="Degree *"
          placeholder="e.g. B.Tech, B.Sc, BCA, MCA"
          value={academics.degree}
          error={errors.degree}
          onChange={(v) => set({ degree: v })}
        />
        <Field
          id="branch"
          label="Specialization / Branch"
          placeholder="e.g. Computer Science, Artificial Intelligence"
          value={academics.branch}
          onChange={(v) => set({ branch: v })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="yearOfGraduation"
          label="Graduation Year"
          placeholder="e.g. 2026"
          inputMode="numeric"
          maxLength={4}
          value={academics.yearOfGraduation}
          error={errors.yearOfGraduation}
          onChange={(v) => set({ yearOfGraduation: v.replace(/\D/g, "") })}
        />
        <Field
          id="cgpa"
          label="CGPA or Percentage"
          placeholder="e.g. 8.4 / 10 or 84%"
          value={academics.cgpa}
          onChange={(v) => set({ cgpa: v })}
        />
      </div>
      <FileUpload
        kind="marksheet"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        label="Marksheet"
        hint="Latest semester or final marksheet. Image or PDF, up to 25 MB. You can upload more than one."
      />
    </div>
  );
}

/* ── Step 3: Experience ─────────────────────────────────────────────────── */

function ExperienceStep({ values, update }: StepProps) {
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
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-subtle">
          Add any past internships, freelance gigs, or major software projects.
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
          <h4 className="mt-2 text-xs font-semibold text-ink-800">No experience records yet</h4>
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
          {experiences.map((exp, idx) => (
            <div
              key={exp.id}
              className="rounded-xl border border-ink-100 bg-ink-50 p-4.5 shadow-2xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xs font-semibold uppercase tracking-wider text-brand-700">
                  Experience #{idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeExperience(exp.id)}
                  className="apple-spring rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-danger"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-ink-700">Type</label>
                  <select
                    value={exp.type}
                    onChange={(e) => updateExperience(exp.id, { type: e.target.value })}
                    className="apple-spring mt-1 h-9 w-full rounded-[10px] border border-ink-200 bg-white px-2.5 text-[14px] text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  >
                    <option value="Internship">Internship</option>
                    <option value="Project">Personal / Academic Project</option>
                    <option value="Freelance">Freelance Contract</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Full-time">Full-time</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-700">Company / Organization</label>
                  <input
                    type="text"
                    value={exp.company}
                    placeholder="e.g. Findtern or Stealth Startup"
                    onChange={(e) => updateExperience(exp.id, { company: e.target.value })}
                    className="apple-spring mt-1 h-9 w-full rounded-[10px] border border-ink-200 bg-white px-2.5 text-[14px] text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-700">Role / Title</label>
                  <input
                    type="text"
                    value={exp.role}
                    placeholder="e.g. React Frontend Intern"
                    onChange={(e) => updateExperience(exp.id, { role: e.target.value })}
                    className="apple-spring mt-1 h-9 w-full rounded-[10px] border border-ink-200 bg-white px-2.5 text-[14px] text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-ink-700">Timeline (From - To)</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="text"
                      placeholder="e.g. Jan 2025"
                      value={exp.from}
                      onChange={(e) => updateExperience(exp.id, { from: e.target.value })}
                      className="apple-spring h-9 flex-1 rounded-[10px] border border-ink-200 bg-white px-2.5 text-[14px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    />
                    <span className="text-xs text-ink-400">to</span>
                    <input
                      type="text"
                      placeholder={exp.current ? "Present" : "e.g. Jun 2025"}
                      disabled={exp.current}
                      value={exp.current ? "Present" : exp.to}
                      onChange={(e) => updateExperience(exp.id, { to: e.target.value })}
                      className="apple-spring h-9 flex-1 rounded-[10px] border border-ink-200 bg-white px-2.5 text-[14px] disabled:bg-ink-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    />
                  </div>
                </div>
                <div className="flex items-end pb-1.5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-ink-700">
                    <input
                      type="checkbox"
                      checked={exp.current}
                      onChange={(e) => updateExperience(exp.id, { current: e.target.checked })}
                      className="size-4 rounded-xs border-ink-300 text-brand-700"
                    />
                    <span>I currently work here / ongoing</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink-700">Key Deliverables & Stack</label>
                <textarea
                  rows={2}
                  value={exp.description}
                  placeholder="Built customer analytics dashboard in Next.js, optimized SQL queries by 40%..."
                  onChange={(e) => updateExperience(exp.id, { description: e.target.value })}
                  className="apple-spring mt-1 w-full rounded-[10px] border border-ink-200 bg-white p-2.5 text-[14px] leading-relaxed focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Step 4: Skills with Proficiency Ratings ────────────────────────────── */

function SkillsStep({ values, update, errors }: StepProps) {
  const [draft, setDraft] = useState("");
  const skills = values.skills || [];
  const skillsWithRatings = values.skillsWithRatings || [];

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
      <div>
        <label className="block text-sm font-medium text-ink-800">
          Select Key Skills (4–7) *
        </label>
        <p className="mt-0.5 text-xs text-text-subtle">
          Rank skills in order of strength. Rate each skill to help employers match project requirements.
        </p>

        <div className="mt-2.5 flex gap-2">
          <input
            value={draft}
            placeholder="Type skill e.g. React, Python, UI/UX..."
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSkill(draft);
              }
            }}
            className="apple-spring h-10 flex-1 rounded-[10px] border border-ink-200 bg-white px-3 text-[14px] text-ink-900 shadow-2xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
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
                  className="apple-spring rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-danger"
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
                  className="apple-spring rounded-md p-1.5 text-ink-400 hover:text-danger hover:bg-ink-100"
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
          <h4 className="mt-2 text-xs font-semibold text-ink-800">No extracurriculars listed yet</h4>
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
                  className="apple-spring rounded-md p-1.5 text-ink-400 hover:text-danger hover:bg-ink-100"
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
  const preferredLocations = values.preferredLocations || [];

  function toggleMode(mode: string) {
    const next = locationTypes.includes(mode)
      ? locationTypes.filter((m) => m !== mode)
      : [...locationTypes, mode];
    update("locationTypes", next);
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
        <label className="block text-sm font-medium text-ink-800">
          Internship Work Modes * (Select at least one)
        </label>
        <div className="mt-2.5 flex flex-wrap gap-2.5">
          {WORK_MODES.map((mode) => {
            const active = locationTypes.includes(mode);
            return (
              <button
                key={mode}
                type="button"
                onClick={() => toggleMode(mode)}
                className={`apple-spring apple-pressable inline-flex min-h-11 items-center gap-2 rounded-[10px] border px-4 py-2.5 text-sm font-semibold capitalize ${
                  active
                    ? "border-brand-600 bg-brand-50 text-brand-800 shadow-2xs ring-1 ring-brand-600/30"
                    : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                }`}
              >
                <span
                  className={`size-2 rounded-full ${active ? "bg-brand-600" : "bg-ink-300"}`}
                />
                <span>{mode}</span>
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
        <label className="block text-sm font-medium text-ink-800">
          Preferred Work Cities (Up to 5)
        </label>
        <p className="mt-0.5 text-xs text-text-subtle">
          Where you are open to relocating or working on-site/hybrid.
        </p>

        <div className="mt-2.5 flex gap-2">
          <input
            value={cityDraft}
            placeholder="Type city e.g. Bengaluru, Pune, Delhi, Mumbai..."
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
                <span className="text-xs text-text-subtle block">Graduation</span>
                <span className="font-semibold text-ink-900">
                  {values.academics.yearOfGraduation || "-"} ({values.academics.status || "Pursuing"})
                </span>
              </div>
              <div>
                <span className="text-xs text-text-subtle block">CGPA / Marks</span>
                <span className="font-semibold tabular-nums text-ink-900">
                  {values.academics.cgpa || "-"}
                </span>
              </div>
            </div>
          </div>

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
                        {exp.from} – {exp.current ? "Present" : exp.to}
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

const FIELD_BASE =
  "apple-spring mt-2 h-10 w-full rounded-[10px] border bg-white px-3.5 text-[14px] text-ink-900 outline-none placeholder:text-ink-400 focus-visible:ring-[3px]";
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
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${FIELD_BASE} ${error ? FIELD_BAD : FIELD_OK}`}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : null}
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
      {hint ? <p className="mt-0.5 text-xs text-text-subtle">{hint}</p> : null}
      <textarea
        id={id}
        name={id}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`apple-spring mt-2 w-full rounded-[10px] border bg-white px-3.5 py-2.5 text-[14px] leading-relaxed text-ink-900 outline-none focus-visible:ring-[3px] ${
          error ? FIELD_BAD : FIELD_OK
        }`}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ── Validation ─────────────────────────────────────────────────────────── */

function validate(values: OnboardingDraft, step: number): Record<string, string> {
  const errors: Record<string, string> = {};

  if (step === 0) {
    if (values.bio.trim().length < 20) {
      errors.bio = "Write at least a sentence or two - 20 characters minimum.";
    }
    if (values.linkedinUrl?.trim() && !/^https?:\/\/\S+\.\S+/.test(values.linkedinUrl.trim())) {
      errors.linkedinUrl = "That does not look like a valid URL.";
    }
    if (!values.city.trim()) errors.city = "City is required.";
    if (values.pinCode && !/^\d{6}$/.test(values.pinCode)) {
      errors.pinCode = "PIN code must be 6 digits.";
    }
    if (values.aadhaarNumber && !/^\d{12}$/.test(values.aadhaarNumber.replace(/\s/g, ""))) {
      errors.aadhaarNumber = "Aadhaar number must be exactly 12 digits.";
    }
    if (!values.panNumber?.trim()) {
      errors.panNumber = "PAN is required for stipend payouts.";
    } else if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(values.panNumber.trim())) {
      errors.panNumber = "PAN must look like ABCDE1234F - 5 letters, 4 digits, 1 letter.";
    }
  }

  if (step === 1) {
    if (!values.academics.institution.trim()) errors.institution = "Institution name is required.";
    if (!values.academics.degree.trim()) errors.degree = "Degree is required.";
    if (values.academics.yearOfGraduation && !/^\d{4}$/.test(values.academics.yearOfGraduation)) {
      errors.yearOfGraduation = "Use a 4-digit graduation year.";
    }
  }

  if (step === 3) {
    if (values.skills.length < 4) errors.skills = "Add at least 4 key skills (up to 7).";
  }

  if (step === 6) {
    if (values.locationTypes.length === 0) errors.locationTypes = "Pick at least one work mode.";
  }

  if (step === 7 && !values.ndaAccepted) {
    errors.ndaAccepted = "Accept the Non-Bypass Agreement to submit your profile.";
  }

  return errors;
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
    return draft;
  } catch {
    return {};
  }
}