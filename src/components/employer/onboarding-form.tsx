"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useProgressRouter } from "@/components/layout/navigation-progress";
import { ArrowLeft, ArrowRight, Save } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { FormNotice } from "@/components/employer/company-fields";
import { CompanyStage } from "@/components/employer/onboarding/company-stage";
import { parseDraft, readDraft, subscribeToNothing } from "@/components/employer/onboarding/draft";
import { Stepper } from "@/components/employer/onboarding/stepper";
import { companyErrors } from "@/components/employer/onboarding/validation";
import { ProjectFields, projectFormErrors, type ProjectBaseline } from "@/components/employer/project-fields";
import { csrfFetch } from "@/lib/client-fetch";
import { timezoneForLocation } from "@/lib/timezones";
import {
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

// Per account (v1 was one shared key, so a second company inherited the first one's draft).
const DRAFT_KEY = "findtern:employer-onboarding:v2";

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
  const router = useProgressRouter();
  const [stage, setStage] = useState<StageIndex>(initialStage);
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState<{ company?: CompanyDraft; project?: ProjectDraft }>({});
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const draftKey = `${DRAFT_KEY}:${employerId}`; // the id is stable and never blank; an email can be both
  const stored = useSyncExternalStore(subscribeToNothing, () => readDraft(draftKey), () => null);

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
    try {
      window.localStorage.removeItem("findtern:employer-onboarding:v1"); // the old shared draft: personal details left on shared PCs
    } catch {
      // Storage blocked: nothing there to remove.
    }
  }, []);

  useEffect(() => {
    if (!dirty) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(values));
    } catch {
      // Quota errors in private mode are non-fatal; state lives in memory too.
    }
  }, [values, dirty, draftKey]);

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
          projectName: initial.project.projectName,
          skills: initial.project.skills,
          preferredLocations: initial.project.preferredLocations,
          scopeOfWork: initial.project.scopeOfWork,
          city: initial.project.city,
          state: initial.project.state,
          locationType: initial.project.locationType,
        }
      : null;
    const problems = projectFormErrors(values.project, baseline, values.company.companyName);
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
        window.localStorage.removeItem(draftKey);
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
      <Stepper
        steps={STAGES}
        stage={stage}
        // Skipping ahead still saves the company first.
        onStep={(i) => (i === 1 && stage === 0 ? void onContinue() : goTo(i as StageIndex))}
      />

      <div className="rise rounded-[24px] border border-ink-200/70 bg-white p-5 shadow-tile sm:p-8">
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold text-ink-900 outline-none">
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

        <div role="status">
          {notice?.tone === "success" ? (
            <FormNotice tone="success" className="mt-8">
              {notice.text}
            </FormNotice>
          ) : null}
        </div>
        {notice?.tone === "error" ? (
          <FormNotice tone="error" className="mt-8">
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
      </div>
    </div>
  );
}
