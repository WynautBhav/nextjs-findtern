"use client";

import { useState } from "react";
import { useProgressRouter } from "@/components/layout/navigation-progress";
import { CheckCircle2, Circle } from "lucide-react";

import { Surface } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { FormNotice } from "@/components/employer/company-fields";
import { ProjectFields, projectFormErrors, type ProjectBaseline } from "@/components/employer/project-fields";
import { csrfFetch } from "@/lib/client-fetch";
import { emptyProject, type ProjectDraft } from "@/lib/employer-onboarding";
import { MAX_SKILLS_PER_PROJECT, submitReadiness } from "@/lib/projects/lifecycle";

const CHECKS: [key: string, label: string][] = [
  ["title", "Title"],
  ["description", "How long it runs"],
  ["skills", "Skills"],
  ["locationType", "Work mode"],
];

export function ProjectForm({
  employerId,
  projectId,
  initial,
  companyName,
  companyPlace,
  defaultTimezone,
  lockedFields = false,
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
    if (thenSubmit && missing.length) return setError(`Complete these first: ${missing.join(", ")}.`);
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

  const sectionCls = "space-y-5 p-4 sm:p-6";
  const head = (n: number, title: string, hint?: string, aside?: React.ReactNode) => (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-900">{n}. {title}</h2>
        {hint ? <p className="mt-0.5 text-sm text-text-subtle">{hint}</p> : null}
      </div>
      {aside}
    </div>
  );
  const errorList = Object.values(errors);
  const overSkills = form.skills.length > MAX_SKILLS_PER_PROJECT;

  return (
    <form
      className="max-w-2xl"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
    >
      <div className="space-y-5">
        {lockedFields && (
          <FormNotice tone="info">This project is live. You can change how long it runs, preferred locations and the full-time offer.</FormNotice>
        )}
        {errorList.length > 0 && (
          <div role="alert" className="rounded-apple-md bg-danger-soft p-3 text-sm text-ink-900">
            <p className="font-semibold">Fix {errorList.length === 1 ? "this" : `these ${errorList.length} things`} to continue</p>
            <ul className="mt-1 list-disc pl-5">
              {errorList.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        <fieldset disabled={busy !== null} className="min-w-0 space-y-5">
          <Surface className={sectionCls}>
            {head(1, "Basics", "Name the work and how long it runs.")}
            <ProjectFields part="basics" values={form} set={set} errors={errors} companyPlace={companyPlace} idPrefix="post" />
          </Surface>
          <Surface className={sectionCls}>
            {head(
              2,
              "Skills",
              "Candidates are matched on these.",
              <span aria-live="polite" className={`nums shrink-0 rounded-full px-2.5 py-1 text-sm font-medium ring-1 ring-inset ${overSkills ? "bg-danger-soft text-danger ring-danger/25" : "bg-ink-100 text-ink-700 ring-ink-200"}`}>
                {form.skills.length}/{MAX_SKILLS_PER_PROJECT}
              </span>,
            )}
            <ProjectFields part="skills" values={form} set={set} errors={errors} companyPlace={companyPlace} idPrefix="post" />
          </Surface>
          <Surface className={sectionCls}>
            {head(3, "Location", "Where the intern works, and your timezone.")}
            <ProjectFields part="location" values={form} set={set} errors={errors} companyPlace={companyPlace} idPrefix="post" />
          </Surface>
        </fieldset>

        {!lockedFields && (
          <Surface className={sectionCls} aria-labelledby="ready-h">
            <h2 id="ready-h" className="text-lg font-semibold tracking-[-0.01em] text-ink-900">4. Review</h2>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {CHECKS.map(([key, label]) => {
                const bad = missing.some((m) => m === key || m.startsWith(key));
                return (
                  <li key={key} className="flex items-center gap-2 text-ink-700">
                    {bad ? <Circle className="size-4 text-ink-400" aria-hidden /> : <CheckCircle2 className="size-4 text-brand-700" aria-hidden />}
                    <span>{label}</span>
                    <span className="sr-only">{bad ? "missing" : "done"}</span>
                  </li>
                );
              })}
            </ul>
            <p className="text-sm text-text-subtle">Submit publishes the project right away, so matching candidates can see it. You can pause or close it any time.</p>
          </Surface>
        )}
        {error && <FormNotice tone="error">{error}</FormNotice>}
      </div>

      <div className="sticky bottom-0 z-20 mt-5 border-t border-ink-200 bg-white/85 backdrop-blur-md">
        <div className="flex items-center justify-end gap-2 py-3 sm:justify-between">
          <p className="text-sm text-text-subtle max-sm:hidden">
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
    </form>
  );
}
