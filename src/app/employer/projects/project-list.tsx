"use client";

import { useState } from "react";
import { useProgressRouter } from "@/components/layout/navigation-progress";
import { Briefcase, MapPin, Pencil, Pause, Play, Users, XCircle, Wrench, Undo2 } from "lucide-react";

import { EmptyScene, Surface, SURFACE_CLASS } from "@/components/app/primitives";
import { useConfirm } from "@/components/app/use-confirm";
import { FormNotice } from "@/components/employer/company-fields";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { MAX_SKILLS_PER_PROJECT } from "@/lib/projects/lifecycle";
import { MetaList } from "@/components/app/meta-list";
import { RowMenu, type RowMenuItem } from "@/components/app/row-menu";
import { ProjectPipeline } from "./project-pipeline";
import { skillChips, stripTiles, tallyStatuses } from "@/lib/projects/list-summary";
import { cn } from "@/lib/utils";
import { StatusPill } from "./status-icon";
import { ContactAdminButton } from "@/components/employer/contact-admin-button";
import { TakedownBadge } from "@/components/employer/takedown-badge";
import { STATUS_META, STATUS_ORDER, statusMeta } from "./status";

export type ListProject = {
  id: string;
  projectName: string;
  status: string | null;
  scopeOfWork: string | null;
  skills: string[];
  locationType: string | null;
  rejectionReason: string | null;
  takenDown: boolean;
  takenDownReason: string | null;
  sent: number;
  accepted: number;
  fullTimeOffer: boolean;
  preferredLocations: string[];
};

type Action = { to: string; label: string; confirm?: { title: string; body: string; destructive?: boolean } };

const ACTIONS: Record<string, Action[]> = {
  pending_review: [
    { to: "published", label: "Publish now" },
    { to: "draft", label: "Back to draft", confirm: { title: "Move back to draft?", body: "It goes back to a draft. You can publish it from the edit page." } },
  ],
  published: [
    { to: "paused", label: "Pause", confirm: { title: "Pause this project?", body: "Candidates stop seeing it until you resume." } },
    { to: "closed", label: "Close", confirm: { title: "Close this project?", body: "This can't be undone. Candidates will no longer see it.", destructive: true } },
  ],
  paused: [
    { to: "published", label: "Resume" },
    { to: "closed", label: "Close", confirm: { title: "Close this project?", body: "This can't be undone.", destructive: true } },
  ],
};

export function ProjectList({ projects }: { projects: ListProject[] }) {
  const router = useProgressRouter();
  const { ask, dialog } = useConfirm();
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = tallyStatuses(projects.map((p) => statusMeta(p.status).key));
  const tiles = stripTiles(counts, projects.length, Object.fromEntries(STATUS_ORDER.map((s) => [s, STATUS_META[s].label])));
  const activeHint = filter === "all" ? "" : (tiles.find((t) => t.key === filter)?.hint ?? "");
  const shown = projects.filter((p) => filter === "all" || statusMeta(p.status).key === filter);

  async function move(p: ListProject, a: Action) {
    if (a.confirm && !(await ask({ ...a.confirm, confirmLabel: a.label }))) return;
    setBusyId(p.id);
    setError(null);
    try {
      const res = await csrfFetch(`/api/employer/projects/${p.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: a.to }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.error ?? "Could not update the project.");
      else router.refresh();
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  /** A rejected project goes to draft, then into the edit form to resubmit. */
  async function resubmit(p: ListProject) {
    setBusyId(p.id);
    setError(null);
    try {
      const res = await csrfFetch(`/api/employer/projects/${p.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: "draft" }),
      });
      if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Could not reopen the project.");
      router.refresh(); // the edit page and the list must not show the pre-change status
      router.push(`/employer/projects/${p.id}/edit`);
    } finally {
      setBusyId(null);
    }
  }

  if (projects.length === 0) {
    return (
      <EmptyScene
        as="h2"
        title="Post your first project"
        body="Describe the work and the skills you need. It goes live when you submit, and matching candidates can see it right away."
        next={{ label: "Post a project", href: "/employer/projects/new" }}
        who="You post it; it goes live straight away."
      />
    );
  }

  return (
    <div className="space-y-4">
      {dialog}
      <div role="group" aria-label="Filter projects by status" className="@container">
        <div className="flex flex-wrap gap-2 @xl:grid @xl:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] @xl:gap-3">
          {tiles.map((t) => {
            const on = t.key === filter;
            const none = t.count === 0 && !on && t.key !== "all";
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={on}
                disabled={none}
                onClick={() => setFilter(t.key)}
                className={cn(
                  SURFACE_CLASS,
                  "apple-spring flex min-h-[4.75rem] min-w-0 flex-1 basis-[6.5rem] flex-col items-start gap-1 p-3 text-left @xl:basis-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-default @xl:p-5",
                  on ? "border-transparent bg-brand-700 text-white" : none ? "" : "hover:bg-ink-50",
                )}
              >
                <span className={cn("text-sm font-medium", on ? "text-white" : "text-ink-700")}>{t.label}</span>
                <span className={cn("nums order-first text-2xl font-semibold leading-none tracking-tight", on ? "text-white" : none ? "text-ink-500" : "text-ink-900")}>{t.count}</span>
              </button>
            );
          })}
        </div>
        <p role="status" className="mt-3 text-sm text-text-subtle">
          Showing {shown.length} of {projects.length} {projects.length === 1 ? "project" : "projects"}
          {activeHint ? `. ${activeHint}.` : ""}
        </p>
      </div>
      {error && <FormNotice tone="error">{error}</FormNotice>}
      <ul className="grid gap-4">
        {shown.map((p, idx) => {
          const meta = statusMeta(p.status);
          // Taken down by Findtern: view only. No lifecycle action, no edit, no candidates: View and Contact admin.
          const actions = p.takenDown ? [] : (meta.key && ACTIONS[meta.key]) || [];
          const busy = busyId === p.id;
          const edit = `/employer/projects/${p.id}/edit`;
          const candidates = `/employer/candidates?project=${encodeURIComponent(p.id)}`;
          const menu: RowMenuItem[] = [];
          if (!p.takenDown && (meta.key === "published" || meta.key === "paused")) menu.push({ label: "Edit", href: edit, icon: <Pencil /> });
          if (!p.takenDown && meta.key === "published") menu.push({ label: "View candidates", href: candidates, icon: <Users /> });
          for (const a of actions) {
            if (a.to === "published") continue; // Resume is the primary action
            menu.push({
              label: a.label,
              icon: a.to === "paused" ? <Pause /> : a.to === "closed" ? <XCircle /> : <Undo2 />,
              destructive: a.to === "closed",
              disabled: busy,
              onSelect: () => void move(p, a),
            });
          }
          const resume = actions.find((a) => a.to === "published");
          const locations = p.preferredLocations.length ? p.preferredLocations.slice(0, 2).join(", ") + (p.preferredLocations.length > 2 ? ` +${p.preferredLocations.length - 2}` : "") : null;
          const live = meta.key === "published" || meta.key === "paused" || meta.key === "closed";
          const chips = skillChips(p.skills, 5);
          const closed = meta.key === "closed" || meta.key === "paused";
          const hasActions = p.takenDown || meta.key !== null;
          return (
            <Surface as="li" key={p.id} style={{ "--i": idx } as React.CSSProperties} className="rise @container p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h2 className={cn("min-w-0 break-words text-lg font-semibold leading-snug tracking-[-0.01em]", closed ? "text-ink-700" : "text-ink-900")}>{p.projectName}</h2>
                {p.takenDown ? <TakedownBadge /> : <StatusPill status={p.status} />}
              </div>
              <MetaList
                className="mt-1.5"
                items={[
                  { icon: <Briefcase />, text: p.locationType ? p.locationType.charAt(0).toUpperCase() + p.locationType.slice(1) : "Work mode not set" },
                  { icon: <MapPin />, text: locations },
                  { text: `${p.skills.length}/${MAX_SKILLS_PER_PROJECT} skills` },
                  { text: p.fullTimeOffer ? "Full-time offer" : null },
                ]}
              />
              {chips.shown.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Skills">
                  {chips.shown.map((sk) => (
                    <li key={sk} className="max-w-full truncate rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700">{sk}</li>
                  ))}
                  {chips.more > 0 && (
                    <li className="rounded-full px-2 py-1 text-xs font-medium text-text-subtle ring-1 ring-inset ring-ink-200">
                      +{chips.more}
                      <span className="sr-only"> more skills</span>
                    </li>
                  )}
                </ul>
              )}
              {p.takenDown && (
                <div role="note" className="mt-4 rounded-apple-md bg-danger-soft p-3 text-sm text-ink-900">
                  <p className="font-semibold">Taken down by Findtern</p>
                  <p className="mt-0.5 break-words">{p.takenDownReason || "No reason was recorded."} It is view only until admin restores it. Use Contact admin to resolve this.</p>
                </div>
              )}
              {meta.key === "pending_review" && <p className="mt-3 text-sm text-text-subtle">Not shown to candidates yet. Publish it now, or move it back to a draft to edit it.</p>}
              {meta.key === "rejected" && (
                <div role="note" className="mt-4 rounded-apple-md bg-danger-soft p-3 text-sm text-ink-900">
                  <p className="font-semibold">Not approved{p.rejectionReason ? "" : ": no reason was recorded"}</p>
                  {p.rejectionReason && <p className="mt-0.5 break-words">{p.rejectionReason}</p>}
                </div>
              )}
              {(live || hasActions) && (
                <div className="mt-4 flex flex-col gap-3 border-t border-ink-100 pt-4 @xl:flex-row @xl:items-center @xl:justify-between @xl:gap-6">
                  {live && <ProjectPipeline sent={p.sent} accepted={p.accepted} className="w-full @xl:max-w-xs" />}
                  <div className="flex items-center gap-2 @xl:ml-auto">
                    {p.takenDown && (
                      <>
                        <ButtonLink href={edit} variant="outline" size="sm" className="min-h-11 flex-1 @xl:flex-none">View</ButtonLink>
                        <ContactAdminButton projectId={p.id} projectName={p.projectName} className="flex-1 @xl:flex-none" />
                      </>
                    )}
                    {!p.takenDown && meta.key === "published" && (
                      <ButtonLink href={candidates} size="sm" className="min-h-11 flex-1 @xl:flex-none">
                        <Users className="size-4" aria-hidden /> View candidates
                      </ButtonLink>
                    )}
                    {!p.takenDown && meta.key === "draft" && (
                      <ButtonLink href={edit} size="sm" className="min-h-11 flex-1 @xl:flex-none">
                        <Pencil className="size-4" aria-hidden />
                        <span className="@xl:hidden">Edit and publish</span>
                        <span className="hidden @xl:inline">Edit</span>
                      </ButtonLink>
                    )}
                    {resume && !p.takenDown && (
                      <button type="button" disabled={busy} onClick={() => void move(p, resume)} className={buttonClass({ size: "sm", className: "min-h-11 flex-1 @xl:flex-none" })}>
                        <Play className="size-4" aria-hidden /> {resume.label}
                      </button>
                    )}
                    {!p.takenDown && meta.key === "closed" && (
                      <ButtonLink href={candidates} variant="outline" size="sm" className="min-h-11 flex-1 @xl:flex-none">View</ButtonLink>
                    )}
                    {meta.key === "rejected" && !p.takenDown && (
                      <button type="button" disabled={busy} onClick={() => void resubmit(p)} className={buttonClass({ size: "sm", className: "min-h-11 flex-1 @xl:flex-none" })}>
                        <Wrench className="size-4" aria-hidden /> Edit and publish
                      </button>
                    )}
                    {!p.takenDown && <RowMenu label={`More actions for ${p.projectName}`} items={menu} className="ring-1 ring-inset ring-ink-200" />}
                  </div>
                </div>
              )}
            </Surface>
          );
        })}
      </ul>
      {shown.length === 0 && <Surface className="px-4 py-10 text-center text-sm text-ink-600">Nothing here under this status. Pick another status above.</Surface>}
    </div>
  );
}
