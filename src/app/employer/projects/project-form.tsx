"use client";

import { useState } from "react";
import { useProgressRouter } from "@/components/layout/navigation-progress";
import { CheckCircle2, Circle, CircleAlert, Info } from "lucide-react";

import { Surface } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { FormNotice } from "@/components/employer/company-fields";
import { ProjectFields, projectFormErrors, type ProjectBaseline } from "@/components/employer/project-fields";
import { csrfFetch } from "@/lib/client-fetch";
import { emptyProject, type ProjectDraft } from "@/lib/employer-onboarding";
import { EDITABLE_WHILE_PUBLISHED, MAX_SKILLS_PER_PROJECT, isLockedWhilePublished, submitReadiness } from "@/lib/projects/lifecycle";

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
  /** Published: only EDITABLE_WHILE_PUBLISHED may change; the rest shows read-only. */
  lockedFields?: boolean;
  /** The project is taken down by Findtern: every field is read-only and there is nothing to save. */
  readOnly?: boolean;
}) {
  const router = useProgressRouter();
  const [form, setForm] = useState<ProjectDraft>(initial ?? { ...emptyProject(), timezone: defaultTimezone ?? "Asia/Kolkata" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const baseline: ProjectBaseline | null = initial ?? null;

  const missing = submitReadiness(form);
  const set = (patch: Partial<ProjectDraft>) => setForm((f) => ({ ...f, ...patch }));

  async function save(thenSubmit: boolean) {
    setError(null);
    // A live project saves only what the server accepts, so only those fields are checked and sent.
    const all = projectFormErrors(form, baseline, companyName);
    const found = lockedFields ? Object.fromEntries(Object.entries(all).filter(([k]) => !isLockedWhilePublished(k))) : all;
    setErrors(found);
    if (Object.keys(found).length) return;
    if (thenSubmit && missing.length) return setError(`Complete these first: ${missing.map(labelOf).join(", ")}.`);
    setBusy(thenSubmit ? "submit" : "draft");
    try {
      // A remote project keeps its one preferred work location; on-site and hybrid have their city instead.
      const preferredToSave = form.locationType === "remote" ? form.preferredLocations.slice(0, 1) : [];
      const res = await csrfFetch(projectId ? `/api/employer/projects/${projectId}` : `/api/employer/${employerId}/projects`, {
        method: projectId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          lockedFields
            ? Object.fromEntries(EDITABLE_WHILE_PUBLISHED.map((k) => [k, k === "preferredLocations" ? preferredToSave : form[k]]))
            : { ...form, preferredLocations: preferredToSave },
        ),
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

  const sectionCls = "space-y-5 p-5 sm:p-6";
  const head = (n: number, title: string, hint?: string, aside?: React.ReactNode) => (
    <div className="flex items-start justify-between gap-3 border-b border-ink-100 pb-4">
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden className="nums mt-px grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-800 ring-1 ring-inset ring-brand-200/70">
          {n}
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">{title}</h2>
          {hint ? <p className="mt-0.5 text-sm text-text-subtle">{hint}</p> : null}
        </div>
      </div>
      {aside}
    </div>
  );
  const errorList = Object.values(errors);
  const overSkills = form.skills.length > MAX_SKILLS_PER_PROJECT;
  const doneCount = CHECKS.length - CHECKS.filter(([key]) => missing.some((m) => m === key || m.startsWith(key))).length;

  return (
    <form
      className="max-w-5xl"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (readOnly) return;
        void save(false);
      }}
    >
      <fieldset disabled={readOnly} aria-describedby={readOnly ? "takedown-readonly-note" : undefined} className={`m-0 min-w-0 border-0 p-0${readOnly ? " opacity-70" : ""}`}>
      <div className={lockedFields ? "max-w-2xl" : "lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-8"}>
        <div className="min-w-0 space-y-5">
          {lockedFields && !readOnly && (
            <FormNotice tone="info">This project is live. You can change its scope of work, skills, city and the full-time option. To change anything else, pause the project first.</FormNotice>
          )}
          <p className="text-sm text-text-subtle">
            Fields marked <span aria-hidden className="text-danger">*</span>
            <span className="sr-only">with an asterisk</span> are required.
          </p>
          {errorList.length > 0 && (
            <div role="alert" className="rounded-apple-md border border-danger/25 bg-danger-soft p-4 text-sm text-ink-900">
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
              <ProjectFields part="basics" values={form} set={set} errors={errors} companyPlace={companyPlace} idPrefix="post" lockedFields={lockedFields} />
            </Surface>
            <Surface className={sectionCls}>
              {head(
                2,
                "Skills",
                "Candidates are matched on these.",
                lockedFields ? undefined : <span aria-live="polite" className={`nums shrink-0 rounded-full px-2.5 py-1 text-sm font-medium ring-1 ring-inset ${overSkills ? "bg-danger-soft text-danger ring-danger/25" : "bg-ink-100 text-ink-700 ring-ink-200"}`}>
                  {form.skills.length}/{MAX_SKILLS_PER_PROJECT}
                </span>,
              )}
              <ProjectFields part="skills" values={form} set={set} errors={errors} companyPlace={companyPlace} idPrefix="post" lockedFields={lockedFields} />
            </Surface>
            <Surface className={sectionCls}>
              {head(3, "Location", "Where the intern works, and your timezone.")}
              <ProjectFields part="location" values={form} set={set} errors={errors} companyPlace={companyPlace} idPrefix="post" lockedFields={lockedFields} />
            </Surface>
          </fieldset>
        </div>

        {!lockedFields && (
          <aside aria-labelledby="ready-h" className="mt-5 lg:sticky lg:top-24 lg:mt-0">
            <Surface className="space-y-4 p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="ready-h" className="text-base font-semibold tracking-[-0.01em] text-ink-900">Ready to publish</h2>
                <span className="nums text-sm font-medium text-ink-700">{doneCount} of {CHECKS.length} done</span>
              </div>
              <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                <div className="h-full rounded-full bg-brand-700 transition-[width]" style={{ width: `${(doneCount / CHECKS.length) * 100}%` }} />
              </div>
              <ul className="grid gap-2.5 text-sm max-lg:sm:grid-cols-2">
                {CHECKS.map(([key, label]) => {
                  const bad = missing.some((m) => m === key || m.startsWith(key));
                  return (
                    <li key={key} className={`flex items-center gap-2 ${bad ? "text-ink-700" : "font-medium text-ink-900"}`}>
                      {bad ? <Circle className="size-4 text-ink-400" aria-hidden /> : <CheckCircle2 className="size-4 text-brand-700" aria-hidden />}
                      <span>{label}</span>
                      <span className="sr-only">{bad ? "missing" : "done"}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="border-t border-ink-100 pt-4 text-sm text-text-subtle">Submit publishes the project right away, so matching candidates can see it. You can pause or close it any time.</p>
            </Surface>
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
      <div data-floating-bar className="sticky bottom-[calc(9rem+env(safe-area-inset-bottom))] z-20 mt-5 rounded-apple-xl border border-ink-200/80 bg-white px-4 py-3 shadow-tile sm:px-5 lg:bottom-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p aria-live="polite" className={`flex min-w-0 items-center gap-2 text-sm ${!lockedFields && !missing.length ? "font-medium text-ink-900" : "text-ink-700"}`}>
            {lockedFields ? (
              <Info className="size-4 shrink-0 text-ink-500" aria-hidden />
            ) : missing.length ? (
              <CircleAlert className="size-4 shrink-0 text-warning" aria-hidden />
            ) : (
              <CheckCircle2 className="size-4 shrink-0 text-brand-700" aria-hidden />
            )}
            <span>{lockedFields ? "Changes apply right away." : missing.length ? `${missing.length} to finish before you can publish` : "Ready to publish"}</span>
          </p>
          <div className="flex w-full gap-3 sm:w-auto">
            <button type="submit" disabled={busy !== null} className={buttonClass({ variant: "outline", className: "min-h-11 max-sm:flex-1 max-sm:px-3" })}>
              {busy === "draft" ? "Saving…" : projectId ? "Save changes" : "Save draft"}
            </button>
            {!lockedFields && (
              <button type="button" disabled={busy !== null} aria-disabled={missing.length > 0} onClick={() => void save(true)} className={buttonClass({ className: `min-h-11 max-sm:flex-1 max-sm:px-3${missing.length > 0 ? " cursor-not-allowed opacity-55 hover:shadow-sm" : ""}` })}>
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
