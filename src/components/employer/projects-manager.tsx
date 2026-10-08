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
import { csrfFetch } from "@/lib/client-fetch";
import { suggestSkills } from "@/lib/data/skills";
import type { Project } from "@/lib/db/schema";

export function ProjectsManager({
  employerId,
  initialProjects,
}: {
  employerId: string;
  initialProjects: Project[];
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
  const [scopeOfWork, setScopeOfWork] = useState("Short-term");
  const [locationType, setLocationType] = useState("remote");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [fullTimeOffer, setFullTimeOffer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

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
    setScopeOfWork("Short-term");
    setLocationType("remote");
    setCity("");
    setState("");
    setTimezone("Asia/Kolkata");
    setFullTimeOffer(false);
    setErrorMsg("");
    setSheetOpen(true);
  }

  function openEdit(p: Project) {
    setEditingProject(p);
    setProjectName(p.projectName);
    setSkills((p.skills as string[]) ?? []);
    setSkillDraft("");
    setScopeOfWork(p.scopeOfWork ?? "Short-term");
    setLocationType(p.locationType ?? "remote");
    setCity(p.city ?? "");
    setState(p.state ?? "");
    setTimezone(p.timezone ?? "Asia/Kolkata");
    setFullTimeOffer(Boolean(p.fullTimeOffer));
    setErrorMsg("");
    setSheetOpen(true);
  }

  function addSkill(s: string) {
    const trimmed = s.trim();
    if (!trimmed || skills.some((e) => e.toLowerCase() === trimmed.toLowerCase())) return;
    if (skills.length >= 8) return;
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
      city: city.trim() || null,
      state: state.trim() || null,
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
    try {
      const res = await csrfFetch(`/api/employer/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setProjects((prev) =>
          prev.map((item) =>
            item.id === project.id ? { ...item, status: nextStatus } : item,
          ),
        );
      }
    } catch {
      // Revert on fail
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
      {/* Top action bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-ink-100 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Projects</h1>
          <p className="mt-1 text-sm text-text-subtle">
            Manage your internship postings, scopes of work, and matching criteria.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-all hover:bg-brand-600 active:scale-[0.98]"
        >
          <FolderPlus className="size-4" />
          <span>New Project</span>
        </button>
      </div>

      {/* Tabs and Search Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-xl border border-ink-200/80 bg-white p-1 shadow-2xs">
          <button
            type="button"
            onClick={() => setFilterTab("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
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
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
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
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
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
            className="h-9 w-full rounded-xl border border-ink-200 bg-white pl-9 pr-3 text-xs text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-brand-600"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Projects List / Table */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white/60 p-12 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
            <Briefcase className="size-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-ink-900">
            {projects.length === 0 ? "No projects created yet" : "No matching projects found"}
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-xs text-text-subtle">
            {projects.length === 0
              ? "Create your first internship project to start matching with pre-vetted interns."
              : "Try clearing your search query or switching filters to see other projects."}
          </p>
          {projects.length === 0 ? (
            <button
              type="button"
              onClick={openCreate}
              className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600"
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
                className="group relative rounded-2xl border border-ink-200/80 bg-white p-5 shadow-2xs transition-all hover:border-ink-300 hover:shadow-xs"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-base font-semibold text-ink-900">{p.projectName}</h2>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-2xs font-semibold ${
                          isActive
                            ? "bg-brand-50 text-brand-700 border border-brand-200/60"
                            : "bg-ink-100 text-ink-600 border border-ink-200"
                        }`}
                      >
                        {isActive ? "Active" : "Closed"}
                      </span>
                      {p.fullTimeOffer ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent-100/60 px-2.5 py-0.5 text-2xs font-medium text-accent-700 border border-accent-300/50">
                          <Sparkles className="size-3" />
                          <span>FTE Conversion</span>
                        </span>
                      ) : null}
                    </div>

                    {/* Metadata tags */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-subtle">
                      <span className="flex items-center gap-1">
                        <Briefcase className="size-3.5 text-ink-400" />
                        <span>{p.scopeOfWork || "Standard"}</span>
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
                        <span className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                          Skills:
                        </span>
                        {projectSkills.map((s) => (
                          <span
                            key={s}
                            className="rounded-lg bg-ink-50 px-2.5 py-0.5 text-2xs font-medium text-ink-700 border border-ink-200/60"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
                    <Link
                      href={skillsHref}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 transition-colors"
                      title="Find candidates matching this project's skills"
                    >
                      <Users className="size-3.5" />
                      <span>Candidates</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50 transition-colors"
                    >
                      <Pencil className="size-3.5 text-ink-500" />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleStatus(p)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50 transition-colors"
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
                  </div>
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
              <div className="rounded-xl border border-danger/30 bg-danger-soft p-3 text-xs text-danger">
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
                className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-sm text-ink-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
              />
            </div>

            {/* Skills selection with 2,482 shared vocabulary */}
            <div>
              <label htmlFor="projectSkills" className="block text-xs font-semibold text-ink-800">
                Required Skills * ({skills.length}/8)
              </label>
              <p className="mt-0.5 text-2xs text-text-subtle">
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
                    disabled={skills.length >= 8}
                    className="h-10 flex-1 rounded-xl border border-ink-200 bg-white px-3.5 text-sm text-ink-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 disabled:bg-ink-50"
                  />
                  <button
                    type="button"
                    onClick={() => addSkill(skillDraft)}
                    disabled={skills.length >= 8 || !skillDraft.trim()}
                    className="rounded-xl border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>

                {skillSuggestions.length > 0 ? (
                  <ul className="absolute left-0 right-0 z-30 mt-1 max-h-44 overflow-y-auto rounded-xl border border-ink-200 bg-white shadow-md">
                    {skillSuggestions.map((s) => (
                      <li key={s}>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            addSkill(s);
                          }}
                          className="w-full px-3.5 py-2 text-left text-xs text-ink-800 hover:bg-ink-50 transition-colors"
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
                      className="inline-flex items-center gap-1 rounded-lg bg-brand-50 border border-brand-200 px-2.5 py-1 text-xs font-medium text-brand-700"
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
                  className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs text-ink-900 outline-none focus:border-brand-600"
                >
                  <option value="Short-term">Short-term (1–3 mos)</option>
                  <option value="Long-term">Long-term (4–6 mos)</option>
                  <option value="Trial-to-hire">Trial to Hire</option>
                  <option value="Custom">Custom Scope</option>
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
                  className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs text-ink-900 outline-none focus:border-brand-600"
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
                <div>
                  <label htmlFor="city" className="block text-xs font-semibold text-ink-800">
                    City
                  </label>
                  <input
                    id="city"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Bengaluru, Gurugram"
                    className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs text-ink-900 outline-none focus:border-brand-600"
                  />
                </div>
                <div>
                  <label htmlFor="state" className="block text-xs font-semibold text-ink-800">
                    State
                  </label>
                  <input
                    id="state"
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="e.g. Karnataka"
                    className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs text-ink-900 outline-none focus:border-brand-600"
                  />
                </div>
              </div>
            ) : null}

            {/* Timezone & Full-time offer */}
            <div className="space-y-4 pt-2">
              <div>
                <label htmlFor="tz" className="block text-xs font-semibold text-ink-800">
                  Timezone
                </label>
                <select
                  id="tz"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs text-ink-900 outline-none focus:border-brand-600"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="America/New_York">America/New_York (EST)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                  <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                </select>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-ink-200/80 bg-ink-50/50 p-3.5">
                <div>
                  <p className="text-xs font-semibold text-ink-900">
                    Full-time conversion opportunity?
                  </p>
                  <p className="text-2xs text-text-subtle">
                    Attract high-performing candidates looking for post-internship roles.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={fullTimeOffer}
                  onChange={(e) => setFullTimeOffer(e.target.checked)}
                  className="size-4.5 rounded border-ink-300 text-brand-700 focus:ring-brand-600"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-6 border-t border-ink-100">
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="rounded-xl border border-ink-200 bg-white px-4 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-700 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-600 disabled:opacity-50"
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
