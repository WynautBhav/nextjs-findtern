"use client";

import { useState } from "react";
import { useProgressRouter } from "@/components/layout/navigation-progress";
import { CheckCircle2, Circle } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { FormNotice } from "@/components/employer/company-fields";
import { ProjectFields, WORK_MODES, projectFormErrors, type ProjectBaseline } from "@/components/employer/project-fields";
import { csrfFetch } from "@/lib/client-fetch";
import { scopeLabel, scopeValue } from "@/lib/db/schema";
import { emptyProject, type ProjectDraft } from "@/lib/employer-onboarding";
import { MAX_SKILLS_PER_PROJECT, submitReadiness } from "@/lib/projects/lifecycle";

// Keys are what submitReadiness reports; labels are what the employer sees on the form.
const CHECKS: [key: string, label: string][] = [
  ["title", "Project name"],
  ["description", "Scope of work"],
  ["skills", "Skills"],
  ["locationType", "Work mode"],
];
const labelOf = (key: string) => CHECKS.find(([k]) => key === k || key.startsWith(k))?.[1] ?? key;

export function ProjectForm({
  employerId,
  projectId,
  initial,
  companyName,
  companyPlace,
  defaultTimezone,
  lockedFields = false,
  readOnly = false,
}: {
  employerId: string;
  /** Present when editing. */
  projectId?: string;
  initial?: ProjectDraft;
  companyName?: string | null;
  companyPlace?: { city?: string | null; state?: string | null };
  defaultTimezone?: string;
  /** Published: only scope, preferred locations and the full-time flag may change. */
  lockedFields?: boolean;
  /** The project is taken down by Findtern: every field is read-only and there is nothing to save. */
  readOnly?: boolean;
}) {
  const router = useProgressRouter();
  const [form, setForm] = useState<ProjectDraft>(initial ?? { ...emptyProject(), timezone: defaultTimezone ?? "Asia/Kolkata" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const baseline: ProjectBaseline | null = initial
    ? { ...initial, skills: initial.skills, preferredLocations: initial.preferredLocations }
    : null;

  const missing = submitReadiness(form);
  const set = (patch: Partial<ProjectDraft>) => setForm((f) => ({ ...f, ...patch }));

  async function save(thenSubmit: boolean) {
    setError(null);
    const found = projectFormErrors(form, baseline, companyName);
    setErrors(found);
    if (Object.keys(found).length) return;
    if (thenSubmit && missing.length) return setError(`Complete these first: ${missing.map(labelOf).join(", ")}.`);
    setBusy(thenSubmit ? "submit" : "draft");
    try {
      const res = await csrfFetch(projectId ? `/api/employer/projects/${projectId}` : `/api/employer/${employerId}/projects`, {
        method: projectId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.error ?? "Could not save. Try again.");
      const id: string = projectId ?? body.project?.id;
      if (thenSubmit) {
        const t = await csrfFetch(`/api/employer/projects/${id}/transition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: "published" }),
        });
        const tb = await t.json().catch(() => ({}));
        if (!t.ok) return setError(tb.error ?? "Saved as a draft, but it could not be published.");
      }
      router.push("/employer/projects");
      router.refresh();
    } catch {
      setError("Network problem. Your changes are still here; try again.");
    } finally {
      setBusy(null);
    }
  }

  const head = (title: string, hint?: string, aside?: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink-300 pb-2">
      <div className="min-w-0">
        <h2 className="font-display text-lg font-semibold text-ink-900">{title}</h2>
        {hint ? <p className="mt-0.5 text-sm text-ink-700">{hint}</p> : null}
      </div>
      {aside}
    </div>
  );
  const errorList = Object.values(errors);
  const overSkills = form.skills.length > MAX_SKILLS_PER_PROJECT;
  const doneCount = CHECKS.length - CHECKS.filter(([key]) => missing.some((m) => m === key || m.startsWith(key))).length;
  const mode = WORK_MODES.find((m) => m.value === form.locationType)?.label ?? null;
  const place = form.locationType && form.locationType !== "remote" ? [form.city, form.state].filter(Boolean).join(", ") : "";

  return (
    <form
      className="max-w-6xl"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (readOnly) return;
        void save(false);
      }}
    >
      <fieldset disabled={readOnly} aria-describedby={readOnly ? "takedown-readonly-note" : undefined} className={`m-0 min-w-0 border-0 p-0${readOnly ? " opacity-70" : ""}`}>
      <div className={lockedFields ? "max-w-2xl" : "lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-14"}>
        <div className="min-w-0 space-y-6">
          {lockedFields && !readOnly && (
            <FormNotice tone="info">This project is live. You can change how long it runs, preferred locations and the full-time offer.</FormNotice>
          )}
          <p className="text-sm text-text-subtle">
            Fields marked <span aria-hidden className="text-danger">*</span>
            <span className="sr-only">with an asterisk</span> are required.
          </p>
          {errorList.length > 0 && (
            <div role="alert" className="rounded-md bg-danger-soft p-4 text-sm text-ink-900">
              <p className="font-semibold">Fix {errorList.length === 1 ? "this" : `these ${errorList.length} things`} to continue</p>
              <ul className="mt-1 list-disc pl-5">
                {errorList.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          <fieldset disabled={busy !== null} className="min-w-0 space-y-10">
            <section aria-label="Basics" className="space-y-5">
              {head("Basics", "Name the work and how long it runs.")}
              <ProjectFields part="basics" values={form} set={set} errors={errors} companyPlace={companyPlace} idPrefix="post" />
            </section>
            <section aria-label="Skills" className="space-y-5">
              {head(
                "Skills",
                "Candidates are matched on these.",
                <span aria-live="polite" className={`nums shrink-0 font-display text-lg font-semibold ${overSkills ? "text-danger" : "text-ink-900"}`}>
                  {form.skills.length}<span className="text-ink-600">/{MAX_SKILLS_PER_PROJECT}</span>
                </span>,
              )}
              <ProjectFields part="skills" values={form} set={set} errors={errors} companyPlace={companyPlace} idPrefix="post" />
            </section>
            <section aria-label="Location" className="space-y-5">
              {head("Location", "Where the intern works, and your timezone.")}
              <ProjectFields part="location" values={form} set={set} errors={errors} companyPlace={companyPlace} idPrefix="post" />
            </section>
          </fieldset>
        </div>

        {!lockedFields && (
          <aside aria-labelledby="ready-h" className="mt-10 lg:sticky lg:top-24 lg:mt-0">
            <div className="flex items-baseline justify-between gap-3 border-b border-ink-300 pb-2">
              <h2 id="ready-h" className="font-display text-lg font-semibold text-ink-900">Ready to publish</h2>
              <span className="nums text-sm text-ink-700"><span className="font-display text-lg font-semibold text-ink-900">{doneCount}</span> of {CHECKS.length}</span>
            </div>
            <ul className="divide-y divide-ink-200 text-sm">
              {CHECKS.map(([key, label]) => {
                const bad = missing.some((m) => m === key || m.startsWith(key));
                return (
                  <li key={key} className={`flex items-center gap-2.5 py-2.5 ${bad ? "text-ink-700" : "font-medium text-ink-900"}`}>
                    {bad ? <Circle className="size-4 text-ink-500" aria-hidden /> : <CheckCircle2 className="size-4 text-brand-700" aria-hidden />}
                    <span>{label}</span>
                    <span className="sr-only">{bad ? "missing" : "done"}</span>
                  </li>
                );
              })}
            </ul>

            <h3 className="mt-6 font-display text-base font-semibold text-ink-900">How candidates will see it</h3>
            <div className="mt-2 border-t border-ink-200 pt-3">
              <p className={`break-words font-display text-lg font-semibold ${form.projectName.trim() ? "text-ink-900" : "text-ink-600"}`}>{form.projectName.trim() || "Untitled project"}</p>
              <p className="mt-1 text-sm text-ink-700">
                {[scopeValue(form.scopeOfWork) ? scopeLabel(form.scopeOfWork) : null, mode, place || null, form.fullTimeOffer ? "Full-time offer" : null].filter(Boolean).join(" · ") || "Duration and work mode not picked yet"}
              </p>
              <p className="mt-1 break-words text-sm text-ink-600">{form.skills.length ? form.skills.join(", ") : "No skills added yet"}</p>
            </div>
            <p className="mt-6 text-sm text-ink-700">Submit publishes the project right away, so matching candidates can see it. You can pause or close it any time.</p>
          </aside>
        )}
      </div>
      </fieldset>
      {error && <FormNotice tone="error" className="mt-5">{error}</FormNotice>}

      {readOnly ? (
        <p id="takedown-readonly-note" className="mt-5 border-t border-ink-200 py-3 text-sm text-text-subtle">
          Taken down by Findtern: view only. Nothing here can be saved or published. Use Contact admin above to resolve this.
        </p>
      ) : (
      <div className="sticky bottom-16 z-20 mt-10 border-t border-ink-300 bg-paper lg:bottom-0">
        <div className="flex items-center justify-end gap-2 py-3 sm:justify-between">
          <p className="text-sm text-ink-700 max-sm:hidden">
            {lockedFields ? "Changes apply right away." : missing.length ? `${missing.length} to finish before you can publish.` : "Ready to publish."}
          </p>
          <div className="flex w-full gap-2 sm:w-auto">
            <button type="submit" disabled={busy !== null} className={buttonClass({ variant: "outline", className: "min-h-11 max-sm:flex-1" })}>
              {busy === "draft" ? "Saving…" : projectId ? "Save changes" : "Save draft"}
            </button>
            {!lockedFields && (
              <button type="button" disabled={busy !== null} aria-disabled={missing.length > 0} onClick={() => void save(true)} className={buttonClass({ className: "min-h-11 max-sm:flex-1" })}>
                {busy === "submit" ? "Publishing…" : "Submit and publish"}
              </button>
            )}
          </div>
        </div>
      </div>
      )}
    </form>
  );
}
