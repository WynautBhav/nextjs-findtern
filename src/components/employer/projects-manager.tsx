"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  FolderPlus,
  Globe2,
  MapPin,
  Pencil,
  Plus,
  Search,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Users,
  X,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CityField, StateField } from "@/components/employer/location-fields";
import { PageHeader } from "@/components/layout/page-header";
import { csrfFetch } from "@/lib/client-fetch";
import { TimezoneSelect } from "@/components/employer/meeting-slots";
import { suggestSkills } from "@/lib/data/skills";
import { scopeLabel, scopeOfWorkOptions, type Project } from "@/lib/db/schema";

/** Sheet row 59: a project lists at most 7 skills (the API enforces it too). */
const MAX_SKILLS = 7;

export function ProjectsManager({
  employerId,
  initialProjects,
  india = true,
  defaultTimezone = "Asia/Kolkata",
}: {
  employerId: string;
  initialProjects: Project[];
  /** The company is in India: state/city pickers apply. */
  india?: boolean;
  /** The company's own timezone (from its country), for a new project. */
  defaultTimezone?: string;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [filterTab, setFilterTab] = useState<"all" | "active" | "closed">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Sheet drawer state for Create / Edit
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // Form inputs
  const [projectName, setProjectName] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillDraft, setSkillDraft] = useState("");
  const [scopeOfWork, setScopeOfWork] = useState<string>(scopeOfWorkOptions[0].value);
  const [locationType, setLocationType] = useState("remote");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [fullTimeOffer, setFullTimeOffer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  // Row actions (close/reopen, delete) report here, outside the edit sheet.
  const [listError, setListError] = useState("");
  // A failed delete is reported on its own card: the list banner sits above
  // the fold once the employer has scrolled down to the row.
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Skills suggestion state
  const [skillFocused, setSkillFocused] = useState(false);
  const skillSuggestions =
    skillFocused && skillDraft.trim()
      ? suggestSkills(skillDraft, 6).filter((s) => !skills.includes(s))
      : [];

  function openCreate() {
    setEditingProject(null);
    setProjectName("");
    setSkills([]);
    setSkillDraft("");
    setScopeOfWork(scopeOfWorkOptions[0].value);
    setLocationType("remote");
    setCity("");
    setState("");
    setTimezone(defaultTimezone);
    setFullTimeOffer(false);
    setErrorMsg("");
    setSheetOpen(true);
  }

  function openEdit(p: Project) {
    setEditingProject(p);
    setProjectName(p.projectName);
    setSkills((p.skills as string[]) ?? []);
    setSkillDraft("");
    // An older value maps to the nearest current option on edit.
    setScopeOfWork(
      scopeOfWorkOptions.find((o) => o.value === p.scopeOfWork)?.value ??
        scopeOfWorkOptions.find((o) => o.label === scopeLabel(p.scopeOfWork))?.value ??
        scopeOfWorkOptions[0].value,
    );
    setLocationType(p.locationType ?? "remote");
    setCity(p.city ?? "");
    setState(p.state ?? "");
    setTimezone(p.timezone ?? defaultTimezone);
    setFullTimeOffer(Boolean(p.fullTimeOffer));
    setErrorMsg("");
    setSheetOpen(true);
  }

  function addSkill(s: string) {
    const trimmed = s.trim();
    if (!trimmed || skills.some((e) => e.toLowerCase() === trimmed.toLowerCase())) return;
    if (skills.length >= MAX_SKILLS) return;
    setSkills([...skills, trimmed]);
    setSkillDraft("");
  }

  function removeSkill(s: string) {
    setSkills(skills.filter((e) => e !== s));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (projectName.trim().length < 2) {
      setErrorMsg("Project name must be at least 2 characters.");
      return;
    }
    if (skills.length === 0) {
      setErrorMsg("Add at least one required skill.");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    const payload = {
      projectName: projectName.trim(),
      skills,
      scopeOfWork,
      locationType,
      // Remote roles have no city; null clears one left over from an edit.
      city: locationType === "remote" ? null : city.trim() || null,
      state: locationType === "remote" ? null : state.trim() || null,
      timezone,
      fullTimeOffer,
    };

    try {
      if (editingProject) {
        // Update project
        const res = await csrfFetch(`/api/employer/projects/${editingProject.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to update project");
        }
        setProjects((prev) =>
          prev.map((item) =>
            item.id === editingProject.id ? { ...item, ...payload } : item,
          ),
        );
      } else {
        // Create project
        const res = await csrfFetch(`/api/employer/${employerId}/projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to create project");
        }
        const data = await res.json();
        if (data.project) {
          setProjects((prev) => [data.project, ...prev]);
        }
      }

      setSheetOpen(false);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(project: Project) {
    const nextStatus = project.status === "active" ? "closed" : "active";
    setBusyId(project.id);
    setListError("");
    try {
      const res = await csrfFetch(`/api/employer/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setListError(data.error ?? "Couldn't update this project. Try again.");
        return;
      }
      setProjects((prev) =>
        prev.map((item) =>
          item.id === project.id ? { ...item, status: nextStatus } : item,
        ),
      );
    } catch {
      setListError("Couldn't reach the server. Check your connection and try again.");
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
    } catch {
      setRowError({ id: project.id, message: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setBusyId(null);
    }
  }

  // Filter projects
  const filtered = projects.filter((p) => {
    if (filterTab === "active" && p.status !== "active") return false;
    if (filterTab === "closed" && p.status === "active") return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const inName = p.projectName.toLowerCase().includes(q);
      const inSkills = ((p.skills as string[]) ?? []).some((s) => s.toLowerCase().includes(q));
      return inName || inSkills;
    }
    return true;
  });

  const activeCount = projects.filter((p) => p.status === "active").length;
  const closedCount = projects.filter((p) => p.status !== "active").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        subtitle="Manage your internship postings, scopes of work, and matching criteria."
        action={
          <button
            type="button"
            onClick={openCreate}
            className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] bg-brand-700 px-4 text-sm font-semibold text-white shadow-xs hover:bg-brand-600"
          >
            <FolderPlus className="size-4" />
            <span>New Project</span>
          </button>
        }
      />

      {/* Tabs and Search Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-[10px] border border-ink-200/80 bg-white p-1 shadow-2xs">
          <button
            type="button"
            onClick={() => setFilterTab("all")}
            className={`apple-spring apple-pressable inline-flex min-h-11 items-center rounded-[10px] px-3 text-xs font-medium tabular-nums ${
              filterTab === "all"
                ? "bg-brand-700 text-white shadow-2xs font-semibold"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            All Projects ({projects.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("active")}
            className={`apple-spring apple-pressable inline-flex min-h-11 items-center rounded-[10px] px-3 text-xs font-medium tabular-nums ${
              filterTab === "active"
                ? "bg-brand-700 text-white shadow-2xs font-semibold"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("closed")}
            className={`apple-spring apple-pressable inline-flex min-h-11 items-center rounded-[10px] px-3 text-xs font-medium tabular-nums ${
              filterTab === "closed"
                ? "bg-brand-700 text-white shadow-2xs font-semibold"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            Closed ({closedCount})
          </button>
        </div>

        <div className="relative min-w-0 sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects or skills..."
            className="apple-spring min-h-11 w-full rounded-[10px] border border-ink-200 bg-white pl-9 pr-3 text-[14px] text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="apple-spring apple-pressable absolute right-1.5 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-[10px] text-ink-600 hover:text-ink-600"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
      </div>

      {listError ? (
        <div role="alert" className="rounded-[10px] border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {listError}
        </div>
      ) : null}

      {/* Projects List / Table */}
      {filtered.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-ink-200/70 bg-white/60 p-12 text-center shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
          <div className="mx-auto grid size-12 place-items-center rounded-[20px] bg-brand-50 text-brand-700">
            <Briefcase className="size-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-ink-900">
            {projects.length === 0 ? "No projects created yet" : "No matching projects found"}
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-text-subtle">
            {projects.length === 0
              ? "Create your first internship project to start matching with pre-vetted interns."
              : "Try clearing your search query or switching filters to see other projects."}
          </p>
          {projects.length === 0 ? (
            <button
              type="button"
              onClick={openCreate}
              className="apple-spring apple-pressable mt-5 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-600"
            >
              <Plus className="size-3.5" />
              <span>Create Project</span>
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const projectSkills = (p.skills as string[]) ?? [];
            const isActive = p.status === "active";
            const skillsHref =
              projectSkills.length > 0
                ? `/employer/candidates?skills=${encodeURIComponent(projectSkills.join(","))}`
                : "/employer/candidates";

            return (
              <div
                key={p.id}
                className="apple-spring group relative rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)] hover:border-ink-300"
              >
                <div className="min-w-0">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-base font-semibold text-ink-900">{p.projectName}</h2>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          isActive
                            ? "bg-brand-50 text-brand-700 border border-brand-200/60"
                            : "bg-ink-100 text-ink-600 border border-ink-200"
                        }`}
                      >
                        {isActive ? "Active" : "Closed"}
                      </span>
                      {p.fullTimeOffer ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent-100/60 px-2.5 py-0.5 text-xs font-medium text-accent-700 border border-accent-300/50">
                          <Sparkles className="size-3" />
                          <span>FTE Conversion</span>
                        </span>
                      ) : null}
                    </div>

                    {/* Metadata tags */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-subtle">
                      <span className="flex items-center gap-1">
                        <Briefcase className="size-3.5 text-ink-400" />
                        <span>{scopeLabel(p.scopeOfWork)}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3.5 text-ink-400" />
                        <span className="capitalize">{p.locationType || "Remote"}</span>
                        {p.city ? <span>({p.city})</span> : null}
                      </span>
                      <span className="flex items-center gap-1">
                        <Globe2 className="size-3.5 text-ink-400" />
                        <span>{p.timezone || "Asia/Kolkata"}</span>
                      </span>
                    </div>

                    {/* Required skills chips */}
                    {projectSkills.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-2xs font-semibold uppercase tracking-wider text-ink-600">
                          Skills:
                        </span>
                        {projectSkills.map((s) => (
                          <span
                            key={s}
                            className="rounded-[10px] bg-ink-50 px-2.5 py-0.5 text-xs font-medium text-ink-700 border border-ink-200/60"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {/* Actions: a full-width footer row, so the buttons never
                      fight the title for horizontal space. */}
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
                    <Link
                      href={skillsHref}
                      className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-brand-200 bg-brand-50/60 px-3 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                      title="Find candidates matching this project's skills"
                    >
                      <Users className="size-3.5" />
                      <span>Candidates</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3 text-xs font-medium text-ink-700 hover:bg-ink-50"
                    >
                      <Pencil className="size-3.5 text-ink-500" />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleStatus(p)}
                      disabled={busyId === p.id}
                      className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50"
                      title={isActive ? "Close this project" : "Reopen project"}
                    >
                      {isActive ? (
                        <>
                          <ToggleRight className="size-3.5 text-brand-700" />
                          <span>Close</span>
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="size-3.5 text-ink-400" />
                          <span>Reopen</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteProject(p)}
                      disabled={busyId === p.id}
                      className="inline-flex min-h-11 items-center justify-center rounded-[10px] px-3 text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                  {rowError?.id === p.id ? (
                    <p role="alert" className="mt-2 text-xs text-danger">
                      {rowError.message}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Slide-out Create / Edit Drawer */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-6">
          <SheetHeader className="pb-4 border-b border-ink-100">
            <SheetTitle className="text-lg font-semibold text-ink-900">
              {editingProject ? "Edit Project" : "Create New Project"}
            </SheetTitle>
            <SheetDescription className="text-xs text-text-subtle">
              Define the requirements and preferred skill profile for this role.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSave} className="mt-6 space-y-5">
            {errorMsg ? (
              <div className="rounded-[10px] border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
                {errorMsg}
              </div>
            ) : null}

            <div>
              <label htmlFor="projectName" className="block text-xs font-semibold text-ink-800">
                Project Name *
              </label>
              <input
                id="projectName"
                type="text"
                required
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. Frontend Engineering, Product Growth"
                className="apple-spring mt-1.5 min-h-11 w-full rounded-[10px] border border-ink-200 bg-white px-3.5 text-[14px] text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            {/* Skills selection with 2,482 shared vocabulary */}
            <div>
              <label htmlFor="projectSkills" className="block text-xs font-semibold text-ink-800">
                Required Skills * ({skills.length}/{MAX_SKILLS})
              </label>
              <p className="mt-0.5 text-xs text-text-subtle">
                Search the 2,482 shared skills vocabulary. Press Enter to add.
              </p>

              <div className="relative mt-2">
                <div className="flex gap-2">
                  <input
                    id="projectSkills"
                    type="text"
                    value={skillDraft}
                    onChange={(e) => setSkillDraft(e.target.value)}
                    onFocus={() => setSkillFocused(true)}
                    onBlur={() => window.setTimeout(() => setSkillFocused(false), 150)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSkill(skillDraft);
                      }
                    }}
                    placeholder="e.g. React, TypeScript, Python"
                    disabled={skills.length >= MAX_SKILLS}
                    className="apple-spring min-h-11 flex-1 rounded-[10px] border border-ink-200 bg-white px-3.5 text-[14px] text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-ink-50"
                  />
                  <button
                    type="button"
                    onClick={() => addSkill(skillDraft)}
                    disabled={skills.length >= MAX_SKILLS || !skillDraft.trim()}
                    className="apple-spring apple-pressable min-h-11 rounded-[10px] border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>

                {skillSuggestions.length > 0 ? (
                  <ul className="absolute left-0 right-0 z-30 mt-1 max-h-44 overflow-y-auto rounded-[10px] border border-ink-200 bg-white shadow-md">
                    {skillSuggestions.map((s) => (
                      <li key={s}>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            addSkill(s);
                          }}
                          className="apple-spring flex min-h-11 w-full items-center px-3.5 py-2 text-left text-xs text-ink-800 hover:bg-ink-50"
                        >
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              {skills.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {skills.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1 rounded-[10px] bg-brand-50 border border-brand-200 px-2.5 py-1 text-xs font-medium text-brand-700"
                    >
                      <span>{s}</span>
                      <button
                        type="button"
                        onClick={() => removeSkill(s)}
                        className="text-brand-500 hover:text-brand-800"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Scope & Location mode */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="scope" className="block text-xs font-semibold text-ink-800">
                  Scope of Work
                </label>
                <select
                  id="scope"
                  value={scopeOfWork}
                  onChange={(e) => setScopeOfWork(e.target.value)}
                  className="apple-spring mt-1.5 min-h-11 w-full rounded-[10px] border border-ink-200 bg-white px-3 text-[14px] text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                >
                  {scopeOfWorkOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="locType" className="block text-xs font-semibold text-ink-800">
                  Location Type
                </label>
                <select
                  id="locType"
                  value={locationType}
                  onChange={(e) => setLocationType(e.target.value)}
                  className="apple-spring mt-1.5 min-h-11 w-full rounded-[10px] border border-ink-200 bg-white px-3 text-[14px] text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">On-site</option>
                </select>
              </div>
            </div>

            {/* City & State (if not remote) */}
            {locationType !== "remote" ? (
              <div className="grid grid-cols-2 gap-4">
                <StateField compact id="state" label="State" india={india} value={state} onChange={setState} />
                <CityField
                  compact
                  id="city"
                  label="City"
                  india={india}
                  state={state}
                  onStateChange={setState}
                  value={city}
                  onChange={setCity}
                  placeholder="e.g. Bengaluru, Gurugram"
                />
              </div>
            ) : null}

            {/* Timezone & Full-time offer */}
            <div className="space-y-4 pt-2">
              <div>
                <label htmlFor="tz" className="block text-xs font-semibold text-ink-800">
                  Timezone
                </label>
                <div className="mt-1.5">
                  <TimezoneSelect id="tz" value={timezone} onChange={setTimezone} />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-[10px] border border-ink-200/80 bg-ink-50/50 p-3.5">
                <div>
                  <p className="text-xs font-semibold text-ink-900">
                    Full-time conversion opportunity?
                  </p>
                  <p className="text-xs text-text-subtle">
                    Attract high-performing candidates looking for post-internship roles.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={fullTimeOffer}
                  onChange={(e) => setFullTimeOffer(e.target.checked)}
                  className="size-4.5 rounded border-ink-300 text-brand-700 focus:border-brand-500 focus:ring-brand-500/20"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-6 border-t border-ink-100">
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="apple-spring apple-pressable min-h-11 rounded-[10px] border border-ink-200 bg-white px-4 text-xs font-semibold text-ink-700 hover:bg-ink-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-brand-700 px-5 text-xs font-semibold text-white shadow-xs hover:bg-brand-600 disabled:opacity-50"
              >
                {saving ? (
                  <span>Saving...</span>
                ) : (
                  <span>{editingProject ? "Update Project" : "Create Project"}</span>
                )}
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
