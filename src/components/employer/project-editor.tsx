"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHead } from "@/components/app/primitives";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { FormNotice } from "@/components/employer/company-fields";
import { ProjectFields, projectFormErrors, type ProjectBaseline } from "@/components/employer/project-fields";
import { InternRoleCard } from "@/components/intern/role-card";
import { csrfFetch } from "@/lib/client-fetch";
import { scopeValue, type Project } from "@/lib/db/schema";
import { emptyProject, projectFromRecord, type ProjectDraft } from "@/lib/employer-onboarding";
import { projectContactError } from "@/lib/project-contact";

/**
 * Post or edit one project, as a page: the fields in one calm column under
 * section headings, and beside them (under them on a phone) the row exactly
 * as candidates see it in Open roles, built from the same component.
 * Errors show inline: contact details in the name as soon as they are typed,
 * everything else once a save was tried, then live as fields are fixed.
 */
export function ProjectEditor({
  employerId,
  project,
  defaultTimezone = "Asia/Kolkata",
  companyName,
  companyPlace,
}: {
  employerId: string;
  /** The stored project when editing; absent when posting a new one. */
  project?: Project;
  defaultTimezone?: string;
  /** The company name, which a project name must not contain. */
  companyName?: string | null;
  /** The company's city and state, offered when a role is on-site. */
  companyPlace?: { city?: string | null; state?: string | null };
}) {
  const router = useRouter();
  const [form, setForm] = useState<ProjectDraft>(() => {
    if (!project) return { ...emptyProject(), timezone: defaultTimezone };
    const draft = projectFromRecord(project);
    return { ...draft, scopeOfWork: scopeValue(draft.scopeOfWork) || draft.scopeOfWork, timezone: draft.timezone || defaultTimezone };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const baseline: ProjectBaseline | null = project
    ? {
        projectName: project.projectName ?? "",
        skills: (project.skills as string[] | null) ?? [],
        preferredLocations: (project.preferredLocations as string[] | null) ?? [],
        scopeOfWork: project.scopeOfWork ?? "",
        city: project.city ?? "",
        state: project.state ?? "",
        locationType: project.locationType ?? "",
      }
    : null;

  function setField(patch: Partial<ProjectDraft>) {
    const next = { ...form, ...patch };
    setForm(next);
    if (tried) {
      setErrors(projectFormErrors(next, baseline, companyName));
      return;
    }
    setErrors((prev) => {
      const out = { ...prev };
      for (const key of Object.keys(patch)) delete out[key];
      // Contact details are refused the moment they are typed, not on save.
      if ("projectName" in patch && next.projectName.trim() !== (baseline?.projectName ?? "").trim()) {
        const contact = projectContactError(next.projectName);
        if (contact) out.projectName = contact;
      }
      return out;
    });
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTried(true);
    const problems = projectFormErrors(form, baseline, companyName);
    setErrors(problems);
    if (Object.keys(problems).length > 0) {
      setSaveError("");
      const formEl = e.currentTarget;
      window.requestAnimationFrame(() => formEl.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setSaving(true);
    setSaveError("");
    const remote = form.locationType === "remote";
    const payload = {
      projectName: form.projectName.trim(),
      skills: form.skills,
      scopeOfWork: form.scopeOfWork,
      locationType: form.locationType,
      // A remote role has no place; null clears one left over from an edit.
      city: remote ? null : form.city.trim() || null,
      state: remote ? null : form.state.trim() || null,
      preferredLocations: remote ? [] : form.preferredLocations,
      timezone: form.timezone,
      fullTimeOffer: form.fullTimeOffer,
    };
    try {
      const res = await csrfFetch(project ? `/api/employer/projects/${project.id}` : `/api/employer/${employerId}/projects`, {
        method: project ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSaveError(data.error ?? "Couldn't save this project. Try again.");
        return;
      }
      router.push("/employer/projects");
      router.refresh();
    } catch {
      setSaveError("Couldn't reach the server. Your answers are still here; try again.");
    } finally {
      setSaving(false);
    }
  }

  const remote = form.locationType === "remote";
  const errorCount = Object.keys(errors).length;

  return (
    <div className="max-w-5xl">
      <Link
        href="/employer/projects"
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-apple-sm text-sm font-medium text-ink-600 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All projects
      </Link>
      <PageHead
        title={project ? "Edit project" : "Post a project"}
        lede="Candidates are matched on the skills, work mode and place you set here."
      />

      <form onSubmit={handleSave} noValidate className="[&_[aria-invalid=true]]:scroll-mt-28 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          {project?.takenDownAt ? (
            <FormNotice tone="error" className="mb-6">
              Findtern took this listing down{project.takenDownReason ? `: ${project.takenDownReason.trim().replace(/[.!?]*$/, ".")}` : "."} Candidates
              can&apos;t see it, and saving changes won&apos;t put it back up. Write to us if you think that was a mistake.
            </FormNotice>
          ) : null}
          {saveError ? <FormNotice tone="error" className="mb-6">{saveError}</FormNotice> : null}
          {tried && errorCount > 0 ? (
            <FormNotice tone="error" className="mb-6">
              {errorCount === 1 ? "One field needs a look." : `${errorCount} fields need a look.`} They are marked below.
            </FormNotice>
          ) : null}
          <ProjectFields values={form} set={setField} errors={errors} companyPlace={companyPlace} idPrefix="project" headings />
        </div>

        <aside aria-labelledby="preview-title" className="min-w-0 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <h2 id="preview-title" className="text-lg font-semibold tracking-[-0.01em] text-ink-900">
            Preview
          </h2>
          <p className="mt-1 text-sm text-ink-600">How candidates see this in Open roles. Your company stays unnamed until you hire.</p>
          {/* The real candidate row, inert: it reads the same, but links nowhere from here. */}
          <div inert className="mt-4 overflow-hidden rounded-apple-lg border border-ink-200/80 bg-white">
            <InternRoleCard
              role={{
                id: project?.id ?? "preview",
                projectName: form.projectName.trim() || "Your project name",
                companyName: "",
                scopeOfWork: form.scopeOfWork,
                skills: form.skills,
                locationType: form.locationType || null,
                fullTimeOffer: form.fullTimeOffer,
                city: remote ? null : form.city,
                state: remote ? null : form.state,
                createdAt: project?.createdAt ?? new Date(),
              }}
            />
          </div>
        </aside>

        <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 pt-6 lg:col-start-1 lg:row-start-2">
          {/* A taken-down listing can still be corrected, but saving isn't the way back up, so it isn't the main action. */}
          <button type="submit" disabled={saving} className={buttonClass({ variant: project?.takenDownAt ? "outline" : "primary", size: "md" })}>
            {saving ? "Saving…" : project ? "Save changes" : "Post project"}
          </button>
          <ButtonLink href="/employer/projects" variant="outline" size="md">
            Cancel
          </ButtonLink>
        </div>
      </form>
    </div>
  );
}
