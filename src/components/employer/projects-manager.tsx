"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, Pause, Pencil, Play, Plus, Search, Trash2, Users, X } from "lucide-react";

import { EmptyScene, PageHead } from "@/components/app/primitives";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { FormNotice } from "@/components/employer/company-fields";
import { fieldClass } from "@/components/employer/ui-tokens";
import { csrfFetch } from "@/lib/client-fetch";
import { scopeLabel, type Project } from "@/lib/db/schema";
import { formatDayLabel } from "@/lib/format";
import { FINAL_PROJECT_STATUS, PAUSED_PROJECT_STATUS, isProjectClosedForGood, isProjectOpen } from "@/lib/project-locations";
import { cn } from "@/lib/utils";
import { RowMenu } from "@/components/app/row-menu";
import { useConfirm } from "@/components/app/use-confirm";

export type ProjectCounts = { shortlisted: number; proposals: number; hired: number };
/** A project row as the employer's browser gets it: never the admin who took it down. */
export type EmployerProject = Omit<Project, "takenDownBy">;

type State = "live" | "paused" | "closed" | "down";
type Filter = "all" | State;

const MODE_LABEL: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };
const STATE_LABEL: Record<State, string> = { live: "Live", paused: "Paused", closed: "Closed", down: "Taken down" };
const STATE_DOT: Record<State, string> = { live: "bg-brand-600", paused: "bg-accent-500", closed: "bg-ink-400", down: "bg-danger" };
const PAGE = 20;
const NO_COUNTS: ProjectCounts = { shortlisted: 0, proposals: 0, hired: 0 };

/** Taken down by Findtern beats the employer's own status. Paused ("inactive") can resume; closed is final. */
const stateOf = (p: EmployerProject): State =>
  p.takenDownAt ? "down" : isProjectOpen(p.status) ? "live" : isProjectClosedForGood(p.status) ? "closed" : "paused";

/**
 * Projects: the listings you're hiring for, one row each, the way a jobs list
 * reads: name and status, where and how long, the skills candidates are
 * matched on, what has happened so far (shortlisted, proposals, hired), and
 * one action. Posting and editing are their own page (`ProjectEditor`).
 * Pause writes "inactive" and can be undone; Close writes "closed" and is
 * final (it asks first). At least one project stays open (the API enforces
 * it). A listing Findtern took down shows why and can't be reopened.
 */
export function ProjectsManager({
  initialProjects,
  counts,
}: {
  initialProjects: EmployerProject[];
  counts: Record<string, ProjectCounts>;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState<EmployerProject[]>(initialProjects);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  // A long list (one account has 55) shows a page at a time; a new filter or search starts over.
  const [shown, setShown] = useState(PAGE);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { ask: askConfirm, dialog } = useConfirm();

  async function changeStatus(project: EmployerProject, nextStatus: "active" | typeof PAUSED_PROJECT_STATUS | typeof FINAL_PROJECT_STATUS) {
    if (nextStatus === FINAL_PROJECT_STATUS) {
      const ok = await askConfirm({
        title: `Close "${project.projectName}" for good?`,
        body: "It leaves candidate search and its public page, and it can't be reopened. Offers already sent are not affected. To stop it for a while instead, choose Pause.",
        confirmLabel: "Yes, close it",
      });
      if (!ok) return;
    }
    setBusyId(project.id);
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

  async function deleteProject(project: EmployerProject) {
    const ok = await askConfirm({ title: `Delete "${project.projectName}"?`, body: "The project and its listing are removed. This can't be undone.", confirmLabel: "Yes, delete it" });
    if (!ok) return;
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

  const tally: Record<State, number> = { live: 0, paused: 0, closed: 0, down: 0 };
  for (const p of projects) tally[stateOf(p)] += 1;
  const q = query.trim().toLowerCase();
  const order: Record<State, number> = { live: 0, down: 1, paused: 2, closed: 3 };
  const filtered = projects
    .filter((p) => filter === "all" || stateOf(p) === filter)
    .filter((p) => !q || p.projectName.toLowerCase().includes(q) || ((p.skills as string[] | null) ?? []).some((s) => s.toLowerCase().includes(q)))
    // Live first, then taken down (it needs a look), paused, closed; newest first within each.
    .sort((a, b) => order[stateOf(a)] - order[stateOf(b)]);

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: projects.length },
    { key: "live", label: "Live", count: tally.live },
    ...(tally.paused > 0 ? [{ key: "paused" as const, label: "Paused", count: tally.paused }] : []),
    { key: "closed", label: "Closed", count: tally.closed },
    ...(tally.down > 0 ? [{ key: "down" as const, label: "Taken down", count: tally.down }] : []),
  ];

  return (
    <div>
      {dialog}
      <PageHead
        title="Projects"
        action={
          projects.length > 0 ? (
            <ButtonLink href="/employer/projects/new" variant="primary" size="md" className="rounded-full max-sm:w-full">
              <Plus className="size-4" aria-hidden />
              Post a project
            </ButtonLink>
          ) : null
        }
      />

      {projects.length === 0 ? (
        <EmptyScene
          art
          title="No projects yet"
          body="A project tells us the skills and work mode you need, so candidates are matched to it. It takes about two minutes."
          who="You - about two minutes"
          next={{ label: "Post your first project", href: "/employer/projects/new" }}
        />
      ) : (
        <>
          <div className="relative max-w-xl">
            <label htmlFor="project-search" className="sr-only">
              Search projects or skills
            </label>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
            <input
              id="project-search"
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShown(PAGE);
              }}
              placeholder="Search projects or skills"
              className={cn(fieldClass, "rounded-full pl-10 pr-11 [&::-webkit-search-cancel-button]:hidden")}
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setShown(PAGE);
                }}
                aria-label="Clear search"
                className="absolute right-0.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-text-subtle hover:bg-ink-100 hover:text-ink-800 focus-visible:outline-2 focus-visible:outline-brand-600 touch:size-11"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>

          <div role="group" aria-label="Show projects" className="mt-6 flex gap-6 overflow-x-auto border-b border-ink-100">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={filter === t.key}
                onClick={() => {
                  setFilter(t.key);
                  setShown(PAGE);
                }}
                className={cn(
                  "-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                  filter === t.key ? "border-ink-900 text-ink-900" : "border-transparent text-ink-600 hover:text-ink-900",
                )}
              >
                {t.label}
                <span className="nums text-text-subtle">{t.count}</span>
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-base font-semibold text-ink-900">No projects match</p>
              <p className="mt-1 text-sm text-ink-600">
                {q ? `Nothing matches "${query.trim()}"` : `No ${STATE_LABEL[filter as State].toLowerCase()} projects`}. Clear the search or show all projects.
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
            </div>
          ) : (
            <>
            <ul className="divide-y divide-ink-100" aria-label="Projects">
              {filtered.slice(0, shown).map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  counts={counts[p.id] ?? NO_COUNTS}
                  busy={busyId === p.id}
                  error={rowError?.id === p.id ? rowError.message : null}
                  onStatus={(next) => changeStatus(p, next)}
                  onDelete={() => deleteProject(p)}
                />
              ))}
            </ul>
            {filtered.length > shown ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-100 pt-6">
                <button type="button" onClick={() => setShown((n) => n + PAGE)} className={buttonClass({ variant: "outline", size: "md" })}>
                  Show {Math.min(PAGE, filtered.length - shown)} more
                </button>
                <p className="nums text-sm text-ink-600">
                  Showing {shown} of {filtered.length}
                </p>
              </div>
            ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}

function ProjectRow({
  project: p,
  counts,
  busy,
  error,
  onStatus,
  onDelete,
}: {
  project: EmployerProject;
  counts: ProjectCounts;
  busy: boolean;
  error: string | null;
  onStatus: (next: "active" | typeof PAUSED_PROJECT_STATUS | typeof FINAL_PROJECT_STATUS) => void;
  onDelete: () => void;
}) {
  const state = stateOf(p);
  const skills = (p.skills as string[] | null) ?? [];
  const place = p.locationType !== "remote" ? [p.city, p.state].filter(Boolean).join(", ") : "";
  const day = p.createdAt ? formatDayLabel(p.createdAt) : null;
  const meta = [
    [MODE_LABEL[p.locationType ?? ""] ?? "Work mode not set", place].filter(Boolean).join(" · "),
    scopeLabel(p.scopeOfWork),
    p.fullTimeOffer ? "Can lead to full time" : "",
  ].filter(Boolean);
  const posted = day && day !== "Unknown" ? `Posted ${/^\d/.test(day) ? day : day.toLowerCase()}` : null;
  const editHref = `/employer/projects/${encodeURIComponent(p.id)}/edit`;
  const figures: [string, number][] = [
    ["Shortlisted", counts.shortlisted],
    ["Proposals", counts.proposals],
    ["Hired", counts.hired],
  ];

  return (
    <li className="grid gap-x-10 gap-y-3 py-6 lg:grid-cols-[minmax(0,1fr)_15rem_auto] lg:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className={cn("min-w-0 break-words text-lg font-semibold tracking-[-0.01em]", state === "live" ? "text-ink-900" : "text-ink-600")}>
            <Link
              href={editHref}
              className="rounded-apple-sm underline-offset-4 hover:text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 touch:inline-flex touch:min-h-11 touch:items-center"
            >
              {p.projectName}
            </Link>
          </h2>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-700">
            <span className={cn("size-2 rounded-full", STATE_DOT[state])} aria-hidden />
            {STATE_LABEL[state]}
          </span>
          {posted ? <span className="nums text-sm text-text-subtle">{posted}</span> : null}
        </div>
        <p className="nums mt-1 text-sm text-ink-600">{meta.join(" · ")}</p>

        {state === "down" ? (
          <p className="mt-3 text-sm text-danger">
            <span className="font-medium">Findtern took this listing down</span>
            {p.takenDownReason ? `: ${p.takenDownReason.trim().replace(/[.!?]*$/, ".")}` : "."} Candidates can&apos;t see it. Write to us if you think that was a mistake.
          </p>
        ) : null}

        {skills.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Skills">
            {skills.slice(0, 7).map((skill) => (
              <li key={skill} className="inline-flex h-7 items-center rounded-full px-2.5 text-[13px] font-medium text-ink-700 ring-1 ring-inset ring-ink-200">
                {skill}
              </li>
            ))}
            {skills.length > 7 ? (
              <li className="inline-flex h-7 items-center px-1 text-[13px] font-medium text-ink-600">
                +{skills.length - 7}
                <span className="sr-only"> more skills</span>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-accent-700">No skills yet, so no matches. Edit the project to add them.</p>
        )}
      </div>

      {/* Phones read it as one line ("5 Shortlisted  1 Proposals  0 Hired"); wide screens as three columns. */}
      <dl className="flex flex-wrap gap-x-5 gap-y-1 lg:grid lg:grid-cols-3 lg:gap-4">
        {figures.map(([label, n]) => (
          <div key={label} className="flex min-w-0 flex-row-reverse items-baseline justify-end gap-1.5 lg:flex-col lg:items-start lg:justify-start lg:gap-0.5">
            <dt className="text-sm text-ink-600 lg:text-xs">{label}</dt>
            <dd className={cn("nums text-base font-semibold lg:text-lg", n > 0 ? "text-ink-900" : "text-text-subtle")}>{n}</dd>
          </div>
        ))}
      </dl>

      <div className="flex items-center gap-2 lg:justify-end">
        {state === "live" ? (
          <ButtonLink href={`/employer/candidates?project=${encodeURIComponent(p.id)}`} variant="outline" size="sm" className="rounded-full px-4">
            <Users className="size-4" aria-hidden />
            Find candidates
          </ButtonLink>
        ) : state === "paused" ? (
          <button type="button" onClick={() => onStatus("active")} disabled={busy} className={buttonClass({ variant: "outline", size: "sm", className: "rounded-full px-4" })}>
            <Play className="size-4" aria-hidden />
            {busy ? "Resuming…" : "Resume"}
          </button>
        ) : null}
        <RowMenu
          label={`More actions for ${p.projectName}`}
          items={[
            { label: "Edit project", href: editHref, icon: <Pencil /> },
            ...(state === "live" ? [{ label: "Pause project", onSelect: () => onStatus(PAUSED_PROJECT_STATUS), icon: <Pause />, disabled: busy }] : []),
            ...(state === "live" || state === "paused"
              ? [{ label: "Close project for good", onSelect: () => onStatus(FINAL_PROJECT_STATUS), icon: <Briefcase />, disabled: busy }]
              : []),
            // A taken-down listing can't be deleted and re-posted (the API refuses it), so the menu doesn't offer it.
            ...(state === "down" ? [] : [{ label: "Delete project", onSelect: onDelete, icon: <Trash2 />, destructive: true, disabled: busy }]),
          ]}
        />
      </div>

      {error ? (
        <FormNotice tone="error" className="lg:col-span-3">
          {error}
        </FormNotice>
      ) : null}
    </li>
  );
}
