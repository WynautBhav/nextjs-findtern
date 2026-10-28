"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, Lock, TriangleAlert } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import {
  experienceType,
  toDay,
  validateProfile,
  validateStep,
  type OnboardingDraft,
  type StoredDocument,
  type ValidationContext,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";

import { AboutStep } from "./onboarding/about-step";
import { AcademicsStep } from "./onboarding/academics-step";
import { ExperienceStep } from "./onboarding/experience-step";
import { ExtracurricularStep, LanguagesStep } from "./onboarding/languages-step";
import { LocationStep } from "./onboarding/location-step";
import { PreviewStep } from "./onboarding/preview-step";
import { SkillsStep } from "./onboarding/skills-step";
import { STEPS, type StepProps, type Update } from "./onboarding/types";

export { STEPS } from "./onboarding/types";

const DRAFT_KEY = "findtern:intern-onboarding:v2";
const STEP_KEY = "findtern:intern-onboarding:step";
const SAVED_AT = "__savedAt";
const LAST = STEPS.length - 1;

const STEP_VIEWS: React.ComponentType<StepProps>[] = [
  AboutStep,
  AcademicsStep,
  ExperienceStep,
  SkillsStep,
  LanguagesStep,
  ExtracurricularStep,
  LocationStep,
  PreviewStep,
];

/**
 * The eight-step intern profile.
 *
 * Errors are worked out live from the values, so a red message goes away the
 * moment its field is right (bug sheet 7, NC r21). A field's message shows
 * once it has been left (touched), and the whole step's once Continue was
 * pressed. The step rail only moves forward through steps that pass, and the
 * review is reachable only when every step before it does (INT-41).
 *
 * Saving (INT-04): a first-time intern can save a draft part-way. Once the
 * profile is onboarded (`isOnboarded`), the button is "Save changes" and runs
 * the full rules first, as the API does, so a live profile is never
 * overwritten by an incomplete one.
 */
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
  onboarded = false,
  submittedBefore = false,
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
  /** Rated or AI interview open - the skills step is read-only. */
  skillsLocked?: boolean;
  /** The stored profile is submitted: every save runs the full rules. */
  onboarded?: boolean;
  /** Submitted once before (or past the AI interview): steps that pass stay open. */
  submittedBefore?: boolean;
}) {
  const router = useRouter();
  const [chosenStep, setChosenStep] = useState<number | null>(null);
  const [edits, setEdits] = useState<Partial<OnboardingDraft>>({});
  const [dirty, setDirty] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [attempted, setAttempted] = useState<Set<number>>(() => new Set());
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  // Set once the final submit succeeds; the button stays locked while the
  // dashboard loads, so a second click cannot submit the profile again.
  const [submitted, setSubmitted] = useState(false);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formTop = useRef<HTMLDivElement>(null);

  const hasPanImage = panOnFile || uploaded.includes("pan");
  const hasAadhaarImage = aadhaarOnFile || uploaded.includes("aadhaar");
  const hasPhoto = photoOnFile || uploaded.includes("profile_photo");

  // One draft per account, so two people on one browser never see each other's.
  const draftKey = `${DRAFT_KEY}:${email}`;
  const stepKey = `${STEP_KEY}:${email}`;
  const stored = useSyncExternalStore(subscribeToNothing, () => readLocal(draftKey), () => null);
  const savedStep = useSyncExternalStore(subscribeToNothing, () => readLocal(stepKey), () => null);

  const values = useMemo<OnboardingDraft>(() => {
    const local = parseDraft(stored, serverUpdatedAt);
    // Academics is merged field by field: a draft saved by an older version of
    // this form lacks the newer keys, and must not blank them.
    return {
      ...initial,
      ...local,
      ...edits,
      // The emergency contact is an Indian number (INT-40).
      emergencyCountryCode: "+91",
      academics: { ...initial.academics, ...local.academics, ...edits.academics },
      bank: { ...initial.bank, ...edits.bank },
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

  const ctx: ValidationContext = useMemo(
    () => ({ hasPanImage, hasAadhaarImage, hasPhoto, ownPhone: account, storedAadhaar: initial.aadhaarNumber ?? "" }),
    [hasPanImage, hasAadhaarImage, hasPhoto, account, initial.aadhaarNumber],
  );

  // Which steps pass right now, and the first that does not.
  const stepErrors = useMemo(() => STEPS.map((_, i) => validateStep(values, i, ctx)), [values, ctx]);
  const passes = stepErrors.map((e) => Object.keys(e).length === 0);
  const firstOpen = passes.findIndex((ok) => !ok);
  // A step that already passes is always reachable, so a live profile that
  // lacks one item (often a card image legacy never asked for) can still be
  // edited; it read "0 of 7 steps" with everything locked behind step 1.
  // Review stays gated until every step before it passes (INT-41).
  const reachable = (i: number) => i <= (firstOpen === -1 ? LAST : firstOpen) || (submittedBefore && i < LAST && passes[i]);
  // The step to show: the one picked; else, while the profile is incomplete,
  // the first step that doesn't pass yet. The remembered step (INT-30) lives
  // in this browser only, so a reload elsewhere, or a cleared browser, opened
  // on step 1 over steps that were already filled (QA-107). A complete
  // profile reopens where it was left.
  const resumeAt = firstOpen === -1 ? clampStep(savedStep) : firstOpen;
  const step = chosenStep ?? resumeAt;

  const live = stepErrors[step];
  const shown: Record<string, string> = {};
  for (const [k, msg] of Object.entries(live)) if (attempted.has(step) || touched.has(k)) shown[k] = msg;
  const errors = { ...shown, ...serverErrors };

  const update: Update = (key, value) => {
    setEdits((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    if (Object.keys(serverErrors).length) setServerErrors({});
    // "Needs attention" is about what was there; the fields now speak for themselves.
    if (notice && !notice.ok) setNotice(null);
  };

  function goTo(next: number) {
    setChosenStep(next);
    setNotice(null);
    try {
      window.localStorage.setItem(stepKey, String(next));
    } catch {
      // no-op
    }
    window.requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      formTop.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    });
  }

  function focusFirst(problems: Record<string, string>) {
    const first = Object.keys(problems)[0];
    if (!first) return;
    window.requestAnimationFrame(() => {
      const el = document.getElementById(first);
      if (!el) return;
      el.focus({ preventScroll: true });
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function showStep(target: number, problems: Record<string, string>) {
    setAttempted((prev) => new Set(prev).add(target));
    if (target !== step) goTo(target);
    focusFirst(problems);
  }

  function onContinue() {
    if (Object.keys(live).length > 0) {
      showStep(step, live);
      setNotice({ text: "A few details on this step need attention.", ok: false });
      return;
    }
    goTo(Math.min(step + 1, LAST));
  }

  /** The full rules, client side; sends the candidate to the first step that fails. */
  function checkAll(): boolean {
    const failed = validateProfile(values, ctx);
    if (!failed) return true;
    showStep(failed.step, failed.errors);
    setNotice({ text: `Some details on "${STEPS[failed.step].title}" need attention.`, ok: false });
    return false;
  }

  async function save(final: boolean) {
    if (saving || submitted) return;
    if (final && !checkAll()) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await csrfFetch("/api/intern/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Bank details are not asked for here (bug sheet 8); Settings saves them.
        body: JSON.stringify({ ...values, bank: undefined, final }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; step?: number; fields?: Record<string, string> };
      if (!res.ok) {
        if (typeof data.step === "number") {
          setServerErrors(data.fields ?? {});
          showStep(data.step, data.fields ?? {});
        }
        setNotice({ text: data.error ?? "Your profile could not be saved. Try again.", ok: false });
        return;
      }
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // no-op
      }
      if (final && !onboarded) {
        setSubmitted(true);
        setNotice({ text: "Profile submitted. Taking you to your dashboard…", ok: true });
        try {
          window.localStorage.removeItem(stepKey);
        } catch {
          // no-op
        }
        router.replace("/intern/dashboard");
        return;
      }
      setNotice({
        text: final ? "Changes saved." : "Draft saved.",
        ok: true,
      });
      router.refresh();
    } catch {
      setNotice({ text: "Network error - your draft is kept on this device. Try again.", ok: false });
    } finally {
      setSaving(false);
    }
  }

  const StepView = STEP_VIEWS[step];
  // A step counts as done only once every step before it is done too, so an
  // optional step that passes empty does not show a tick ahead of the gate.
  const openAt = firstOpen === -1 ? LAST : firstOpen;
  // First time through, a step counts only once every step before it does
  // (an optional step passes empty); a profile submitted before counts what
  // passes.
  const done = passes.map((ok, i) => ok && (i < openAt || (submittedBefore && i < LAST)));
  const doneCount = done.slice(0, LAST).filter(Boolean).length;
  // Steps short of something, named once above the form.
  const needs = STEPS.slice(0, LAST)
    .map((s, i) => (passes[i] ? null : s.title))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  return (
    // Bottom room on phones so the chat launcher (fixed above the tab bar)
    // never sits on the step's buttons once scrolled to the end.
    <div ref={formTop} className="scroll-mt-24 pb-32 lg:pb-0">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[16rem_minmax(0,1fr)]">
        {/* ── Step rail (desktop) ─────────────────────────────────────── */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <Progress done={doneCount} total={LAST} />
            <StepRail step={step} passes={done} reachable={reachable} onSelect={goTo} />
          </div>
        </aside>

        <div className="min-w-0">
          {/* ── Progress (phones and tablets) ─────────────────────────── */}
          <MobileSteps step={step} passes={done} reachable={reachable} onSelect={goTo} />

          {submittedBefore && needs.length > 0 ? (
            <p className="mb-4 flex items-start gap-2 rounded-apple-md border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-ink-800">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent-500" />
              <span>
                {needs.length === 1 ? "One step still needs something: " : `${needs.length} steps still need something: `}
                <span className="font-medium">{needs.join(", ")}</span>.
              </span>
            </p>
          ) : null}

          <section aria-labelledby="step-title" className="rounded-apple-xl border border-ink-200/80 bg-white shadow-xs">
            <header className="border-b border-ink-200/70 px-5 py-5 sm:px-8 sm:py-6">
              <p className="nums text-2xs font-semibold uppercase tracking-[0.16em] text-brand-700">
                Step {step + 1} of {STEPS.length}
              </p>
              <h2 id="step-title" ref={headingRef} tabIndex={-1} className="mt-1.5 text-xl font-semibold tracking-[-0.015em] text-ink-900 outline-none">
                {STEPS[step].title}
              </h2>
              <p className="mt-1.5 max-w-2xl text-pretty text-sm leading-relaxed text-ink-600">{STEPS[step].blurb}</p>
            </header>

            <div
              className="px-5 py-6 sm:px-8 sm:py-8"
              onBlurCapture={(e) => {
                const el = e.target as HTMLElement;
                const key = el.dataset.field || el.id;
                if (key && !touched.has(key)) setTouched((prev) => new Set(prev).add(key));
              }}
            >
              <StepView
                values={values}
                update={update}
                errors={errors}
                documents={documents}
                email={email}
                account={account}
                hasPanImage={hasPanImage}
                hasAadhaarImage={hasAadhaarImage}
                skillsLocked={skillsLocked}
                onUploaded={(kind) => setUploaded((prev) => (prev.includes(kind) ? prev : [...prev, kind]))}
                onJumpStep={goTo}
              />
            </div>

            {notice ? (
              <div className="px-5 sm:px-8">
                <p
                  role="status"
                  className={cn(
                    "mb-5 flex items-start gap-2.5 rounded-apple-md border px-4 py-3 text-sm",
                    notice.ok ? "border-brand-200 bg-brand-50 text-brand-900" : "border-danger/30 bg-danger-soft text-ink-900",
                  )}
                >
                  {notice.ok ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                  ) : (
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                  )}
                  <span>{notice.text}</span>
                </p>
              </div>
            ) : null}

            {/* ── Actions ─────────────────────────────────────────────── */}
            <footer className="flex flex-col-reverse gap-3 rounded-b-apple-xl border-t border-ink-200/70 bg-ink-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <div className={cn("grid gap-3 sm:flex sm:items-center", onboarded && step === LAST ? "grid-cols-1" : "grid-cols-2")}>
                <button
                  type="button"
                  onClick={() => goTo(step - 1)}
                  disabled={step === 0}
                  className={buttonClass({ variant: "light", size: "md", className: "w-full sm:w-auto" })}
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  Back
                </button>
                {/* On the review step of a live profile the main button already saves. */}
                {onboarded && step === LAST ? null : (
                  <button
                    type="button"
                    onClick={() => void save(onboarded)}
                    disabled={saving || submitted}
                    className={buttonClass({ variant: "ghost", size: "md", className: "w-full sm:w-auto" })}
                  >
                    {saving && step !== LAST ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                    {onboarded ? "Save changes" : "Save draft"}
                  </button>
                )}
              </div>
              {step < LAST ? (
                <button type="button" onClick={onContinue} className={buttonClass({ variant: "primary", size: "md", className: "w-full sm:w-auto" })}>
                  Continue
                  <ArrowRight className="size-4" aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void save(true)}
                  disabled={saving || submitted}
                  className={buttonClass({ variant: "primary", size: "md", className: "w-full sm:w-auto" })}
                >
                  {saving || submitted ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
                  {submitted ? "Submitted" : onboarded ? "Save changes" : "Submit profile"}
                </button>
              )}
            </footer>
          </section>
          <p className="mt-4 text-center text-xs text-text-subtle lg:text-left">Signed in as {email}. Your progress on this device is kept as you type.</p>
        </div>
      </div>
    </div>
  );
}

/* ── Progress and step rail ─────────────────────────────────────────────── */

function Progress({ done, total }: { done: number; total: number }) {
  const pct = Math.round((done / total) * 100);
  return (
    <div className="mb-4 rounded-apple-xl border border-ink-200/80 bg-white p-4 shadow-xs">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-ink-700">Profile</p>
        <p className="nums text-sm text-ink-600">
          <span className="font-semibold text-ink-900">{done}</span> of {total} steps
        </p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Steps complete">
        <div className="h-full rounded-full bg-brand-600 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

type RailProps = { step: number; passes: boolean[]; reachable: (i: number) => boolean; onSelect: (i: number) => void };

function StepRail({ step, passes, reachable, onSelect }: RailProps) {
  return (
    <nav aria-label="Profile steps" className="rounded-apple-xl border border-ink-200/80 bg-white p-2 shadow-xs">
      <ol className="space-y-0.5">
        {STEPS.map((s, i) => {
          const current = i === step;
          const open = reachable(i);
          const done = passes[i] && i !== LAST;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                disabled={!open}
                aria-current={current ? "step" : undefined}
                title={open ? undefined : i === LAST ? "Finish every step to review" : "Finish the steps before this one first"}
                className={cn(
                  "apple-spring flex min-h-11 w-full items-center gap-3 rounded-apple-sm px-3 text-left text-sm",
                  current ? "bg-brand-50 font-semibold text-brand-900" : open ? "text-ink-700 hover:bg-ink-50" : "cursor-not-allowed text-text-subtle",
                )}
              >
                <StepDot index={i} current={current} done={done} open={open} />
                <span className="truncate">{s.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepDot({ index, current, done, open }: { index: number; current: boolean; done: boolean; open: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "nums grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
        current ? "bg-brand-700 text-white" : done ? "bg-brand-100 text-brand-700" : open ? "bg-ink-100 text-ink-600" : "bg-ink-50 text-text-subtle",
      )}
    >
      {done && !current ? <Check className="size-3.5" /> : !open ? <Lock className="size-3" /> : index + 1}
    </span>
  );
}

/** Phones and tablets: a segmented bar plus a disclosure listing the steps. */
function MobileSteps({ step, passes, reachable, onSelect }: RailProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4 lg:hidden">
      <div className="flex gap-1" aria-hidden>
        {STEPS.map((s, i) => (
          <span key={s.id} className={cn("h-1.5 flex-1 rounded-full", i === step ? "bg-brand-700" : passes[i] && i !== LAST ? "bg-brand-300" : "bg-ink-200")} />
        ))}
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-steps"
        className="mt-2 flex min-h-11 w-full items-center justify-between text-sm text-ink-700"
      >
        <span className="nums">
          Step <span className="font-semibold text-ink-900">{step + 1}</span> of {STEPS.length} · {STEPS[step].title}
        </span>
        <span className="font-medium text-brand-700">{open ? "Hide steps" : "All steps"}</span>
      </button>
      {open ? (
        <ol id="mobile-steps" className="mt-1 space-y-0.5 rounded-apple-xl border border-ink-200/80 bg-white p-2 shadow-xs">
          {STEPS.map((s, i) => {
            const current = i === step;
            const can = reachable(i);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={!can}
                  aria-current={current ? "step" : undefined}
                  onClick={() => {
                    setOpen(false);
                    onSelect(i);
                  }}
                  className={cn(
                    "apple-spring flex min-h-11 w-full items-center gap-3 rounded-apple-sm px-3 text-left text-sm",
                    current ? "bg-brand-50 font-semibold text-brand-900" : can ? "text-ink-700 hover:bg-ink-50" : "text-text-subtle",
                  )}
                >
                  <StepDot index={i} current={current} done={passes[i] && i !== LAST} open={can} />
                  {s.title}
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

/* ── Local draft ────────────────────────────────────────────────────────── */

function subscribeToNothing() {
  return () => {};
}

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function clampStep(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= LAST ? n : 0;
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
    // Drafts from before the date inputs held free text like "Jan 2025".
    // An earlier build also used other experience types and a "Conversational" level.
    if (Array.isArray(draft.experiences)) {
      draft.experiences = draft.experiences.map((e) => ({ ...e, type: experienceType(e.type ?? ""), from: toDay(e.from ?? ""), to: toDay(e.to ?? "") }));
    }
    if (Array.isArray(draft.languages)) {
      draft.languages = draft.languages.map((l) => ({ ...l, level: (l.level as string) === "Conversational" ? "Basic" : l.level }));
    }
    return draft;
  } catch {
    return {};
  }
}
