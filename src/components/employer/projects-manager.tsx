"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Clock3, FolderPlus, Globe2, MapPin, Pencil, Search, Sparkles, Trash2, Users, X } from "lucide-react";

import { EmptyScene, Pill, Surface } from "@/components/app/primitives";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FormNotice, controlClass } from "@/components/employer/company-fields";
import { ProjectFields, projectFormErrors, type ProjectBaseline } from "@/components/employer/project-fields";
import { csrfFetch } from "@/lib/client-fetch";
import { scopeLabel, scopeValue, type Project } from "@/lib/db/schema";
import { emptyProject, projectFromRecord, type ProjectDraft } from "@/lib/employer-onboarding";
import { CLOSED_PROJECT_STATUS, isProjectOpen } from "@/lib/project-locations";
import { cn } from "@/lib/utils";

type Filter = "all" | "open" | "closed";

const MODE_LABEL: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

/**
 * Projects: what you're hiring for.
 *
 * A project is the unit candidates are matched against, so the list leads
 * with what decides the match (skills, mode, place) and one action that uses
 * it, "Find candidates". Editing opens a drawer with the same fields as
 * onboarding (`ProjectFields`). Closing writes the legacy "inactive"
 * (EMH-03), and at least one project stays open (the API enforces it).
 */
export function ProjectsManager({
  employerId,
  initialProjects,
  defaultTimezone = "Asia/Kolkata",
  companyPlace,
  openNew = false,
}: {
  employerId: string;
  initialProjects: Project[];
  /** The company's own timezone (from its location), for a new project. */
  defaultTimezone?: string;
  /** The company's city and state, offered when a role is on-site. */
  companyPlace?: { city?: string | null; state?: string | null };
  /** Open the "New project" drawer on arrival (`?new=1`). */
  openNew?: boolean;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState<ProjectDraft>(() => ({ ...emptyProject(), timezone: defaultTimezone }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [listError, setListError] = useState("");
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // `?new=1` (the dashboard's "New project") opens the drawer straight away.
  useEffect(() => {
    if (!openNew) return;
    openCreate();
    router.replace("/employer/projects", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNew]);

  const baseline: ProjectBaseline | null = editing
    ? {
        skills: (editing.skills as string[] | null) ?? [],
        preferredLocations: (editing.preferredLocations as string[] | null) ?? [],
        scopeOfWork: editing.scopeOfWork ?? "",
        city: editing.city ?? "",
        state: editing.state ?? "",
        locationType: editing.locationType ?? "",
      }
    : null;

  function setField(patch: Partial<ProjectDraft>) {
    setForm((prev) => ({ ...prev, ...patch }));
    setErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patch)) delete next[key];
      return next;
    });
  }

  function openCreate() {
    setEditing(null);
    // Scope and work mode start unchosen (EMH-47).
    setForm({ ...emptyProject(), timezone: defaultTimezone });
    setErrors({});
    setSaveError("");
    setSheetOpen(true);
  }

  function openEdit(p: Project) {
    setEditing(p);
    const draft = projectFromRecord(p);
    setForm({ ...draft, scopeOfWork: scopeValue(draft.scopeOfWork) || draft.scopeOfWork, timezone: draft.timezone || defaultTimezone });
    setErrors({});
    setSaveError("");
    setSheetOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const problems = projectFormErrors(form, baseline);
    setErrors(problems);
    if (Object.keys(problems).length > 0) {
      setSaveError("Some details need a look - see the highlighted fields.");
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
      const res = editing
        ? await csrfFetch(`/api/employer/projects/${editing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await csrfFetch(`/api/employer/${employerId}/projects`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = (await res.json().catch(() => ({}))) as { error?: string; project?: Project };
      if (!res.ok) {
        setSaveError(data.error ?? "Couldn't save this project. Try again.");
        return;
      }
      if (editing) {
        setProjects((prev) => prev.map((item) => (item.id === editing.id ? { ...item, ...payload } : item)));
      } else if (data.project) {
        setProjects((prev) => [data.project!, ...prev]);
      }
      setSheetOpen(false);
      router.refresh();
    } catch {
      setSaveError("Couldn't reach the server. Your answers are still here; try again.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(project: Project) {
    const open = isProjectOpen(project.status);
    const nextStatus = open ? CLOSED_PROJECT_STATUS : "active";
    setBusyId(project.id);
    setListError("");
    setRowError(null);
    try {
      const res = await csrfFetch(`/api/employer/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setRowError({ id: project.id, message: data.error ?? "Couldn't update this project. Try again." });
        return;
      }
      setProjects((prev) => prev.map((item) => (item.id === project.id ? { ...item, status: nextStatus } : item)));
      router.refresh();
    } catch {
      setRowError({ id: project.id, message: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setBusyId(null);
    }
  }

  async function deleteProject(project: Project) {
    if (!window.confirm(`Delete "${project.projectName}"? This can't be undone.`)) return;
    setBusyId(project.id);
    setRowError(null);
    try {
      const res = await csrfFetch(`/api/employer/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setRowError({ id: project.id, message: data.error ?? "Couldn't delete this project." });
        return;
      }
      setProjects((prev) => prev.filter((item) => item.id !== project.id));
      router.refresh();
    } catch {
      setRowError({ id: project.id, message: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setBusyId(null);
    }
  }

  const openCount = projects.filter((p) => isProjectOpen(p.status)).length;
  const closedCount = projects.length - openCount;
  const q = query.trim().toLowerCase();
  const filtered = projects
    .filter((p) => (filter === "open" ? isProjectOpen(p.status) : filter === "closed" ? !isProjectOpen(p.status) : true))
    .filter(
      (p) =>
        !q ||
        p.projectName.toLowerCase().includes(q) ||
        ((p.skills as string[] | null) ?? []).some((s) => s.toLowerCase().includes(q)),
    )
    // Open projects first, newest first within each group.
    .sort((a, b) => Number(isProjectOpen(b.status)) - Number(isProjectOpen(a.status)));

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="What you're hiring for. Candidates are matched on each project's skills, work mode and place."
        action={
          <button type="button" onClick={openCreate} className={buttonClass({ variant: "primary", size: "md" })}>
            <FolderPlus className="size-4" aria-hidden />
            New project
          </button>
        }
      />

      {projects.length === 0 ? (
        <div className="space-y-4">
          <EmptyScene
            art
            title="No projects yet"
            body="A project tells us the skills and work mode you need, so candidates are matched to it. It takes about two minutes."
            who="You - about two minutes"
          />
          <div className="flex justify-center">
            <button type="button" onClick={openCreate} className={buttonClass({ variant: "primary", size: "md" })}>
              <FolderPlus className="size-4" aria-hidden />
              Create your first project
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div role="tablist" aria-label="Show projects" className="inline-flex self-start rounded-apple-md border border-ink-200/80 bg-white p-1 shadow-xs">
              {(
                [
                  ["all", "All", projects.length],
                  ["open", "Open", openCount],
                  ["closed", "Closed", closedCount],
                ] as const
              ).map(([key, label, n]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={filter === key}
                  onClick={() => setFilter(key)}
                  className={cn(
                    "apple-spring inline-flex min-h-10 items-center gap-1.5 rounded-apple-sm px-3.5 text-sm font-medium",
                    filter === key ? "bg-brand-700 text-white shadow-xs" : "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
                  )}
                >
                  {label}
                  <span className={cn("nums text-xs", filter === key ? "text-white/80" : "text-ink-500")}>{n}</span>
                </button>
              ))}
            </div>

            <div className="relative min-w-0 sm:w-72">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects or skills"
                aria-label="Search projects or skills"
                className={controlClass(false, "pl-10 pr-10")}
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-apple-sm text-ink-500 hover:bg-ink-100 hover:text-ink-800"
                >
                  <X className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
          </div>

          {listError ? <FormNotice tone="error" className="mb-4">{listError}</FormNotice> : null}

          {filtered.length === 0 ? (
            <Surface className="px-6 py-10 text-center">
              <p className="text-base font-semibold text-ink-900">No projects match</p>
              <p className="mt-1 text-sm text-ink-600">
                {q ? `Nothing matches "${query.trim()}"` : `No ${filter} projects`}. Clear the search or show all projects.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
                className={buttonClass({ variant: "outline", size: "sm", className: "mt-4" })}
              >
                Show all projects
              </button>
            </Surface>
          ) : (
            <ul className="grid gap-4 xl:grid-cols-2">
              {filtered.map((p) => {
                const skills = (p.skills as string[] | null) ?? [];
                const open = isProjectOpen(p.status);
                const mode = MODE_LABEL[p.locationType ?? ""] ?? "Work mode not set";
                const place = [p.city, p.state].filter(Boolean).join(", ");
                return (
                  <Surface as="li" key={p.id} className={cn("flex flex-col p-5 sm:p-6", !open && "bg-ink-50/40")}>
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <h2 className="min-w-0 text-lg font-semibold tracking-[-0.01em] text-ink-900">{p.projectName}</h2>
                      <div className="flex flex-wrap gap-1.5">
                        {p.fullTimeOffer ? (
                          <Pill tone="new">
                            <Sparkles className="size-3" aria-hidden />
                            Full-time path
                          </Pill>
                        ) : null}
                        <Pill tone={open ? "live" : "closed"}>{open ? "Open" : "Closed"}</Pill>
                      </div>
                    </div>

                    <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-600">
                      <div className="flex items-center gap-1.5">
                        <dt className="sr-only">Scope</dt>
                        <Clock3 className="size-4 text-ink-400" aria-hidden />
                        <dd>{scopeLabel(p.scopeOfWork)}</dd>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <dt className="sr-only">Work mode</dt>
                        <MapPin className="size-4 text-ink-400" aria-hidden />
                        <dd>
                          {mode}
                          {place && p.locationType !== "remote" ? ` · ${place}` : ""}
                        </dd>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <dt className="sr-only">Timezone</dt>
                        <Globe2 className="size-4 text-ink-400" aria-hidden />
                        <dd>{p.timezone || "Asia/Kolkata"}</dd>
                      </div>
                    </dl>

                    {skills.length > 0 ? (
                      <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Skills">
                        {skills.map((s) => (
                          <li key={s} className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700">
                            {s}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-4 text-sm text-ink-600">No skills listed yet. Add some so candidates can be matched.</p>
                    )}

                    <div aria-hidden className="flex-1" />
                    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
                      {open ? (
                        <ButtonLink
                          href={`/employer/candidates?project=${encodeURIComponent(p.id)}`}
                          variant="outline"
                          size="sm"
                        >
                          <Users className="size-4" aria-hidden />
                          Find candidates
                        </ButtonLink>
                      ) : null}
                      <button type="button" onClick={() => openEdit(p)} className={buttonClass({ variant: "ghost", size: "sm" })}>
                        <Pencil className="size-4" aria-hidden />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStatus(p)}
                        disabled={busyId === p.id}
                        className={buttonClass({ variant: "ghost", size: "sm", className: "text-ink-700 hover:bg-ink-100" })}
                      >
                        <Briefcase className="size-4" aria-hidden />
                        {open ? "Close" : "Reopen"}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteProject(p)}
                        disabled={busyId === p.id}
                        className={buttonClass({
                          variant: "ghost",
                          size: "sm",
                          className: "ml-auto text-danger hover:bg-danger-soft",
                        })}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Delete
                      </button>
                    </div>
                    {rowError?.id === p.id ? (
                      <FormNotice tone="error" className="mt-3">
                        {rowError.message}
                      </FormNotice>
                    ) : null}
                  </Surface>
                );
              })}
            </ul>
          )}
        </>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-xl">
          <SheetHeader className="border-b border-ink-100 px-6 py-5">
            <SheetTitle className="text-xl font-semibold tracking-[-0.015em] text-ink-900">
              {editing ? "Edit project" : "New project"}
            </SheetTitle>
            <SheetDescription className="text-sm text-ink-600">
              Candidates are matched on the skills, work mode and place you set here.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSave} noValidate className="px-6 pb-6 pt-5">
            {saveError ? <FormNotice tone="error" className="mb-5">{saveError}</FormNotice> : null}
            <ProjectFields values={form} set={setField} errors={errors} companyPlace={companyPlace} idPrefix="sheet" />
            {/* Left-aligned, primary first: the "Ask me" launcher floats
                over the bottom-right corner of every screen. */}
            <div className="sticky bottom-0 -mx-6 mt-8 flex items-center gap-2 border-t border-ink-100 bg-white py-4 pl-6 pr-36">
              <button type="submit" disabled={saving} className={buttonClass({ variant: "primary", size: "md" })}>
                {saving ? "Saving…" : editing ? "Save changes" : "Create project"}
              </button>
              {/* On a phone the drawer's own close button does this. */}
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className={buttonClass({ variant: "light", size: "md", className: "hidden sm:inline-flex" })}
              >
                Cancel
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
