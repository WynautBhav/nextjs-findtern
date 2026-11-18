"use client";

import { useState } from "react";
import { useProgressRouter } from "@/components/layout/navigation-progress";
import { Pencil, Pause, Play, Plus, Users, XCircle, Wrench, Undo2 } from "lucide-react";

import { EmptyScene, FilterTabs } from "@/components/app/primitives";
import { useConfirm } from "@/components/app/use-confirm";
import { FormNotice } from "@/components/employer/company-fields";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import { MAX_SKILLS_PER_PROJECT } from "@/lib/projects/lifecycle";
import { RowMenu, type RowMenuItem } from "@/components/app/row-menu";
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

  const counts = new Map<string, number>();
  for (const p of projects) {
    const k = statusMeta(p.status).key ?? "unknown";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const tabs = [
    { key: "all", label: "All", count: projects.length },
    ...STATUS_ORDER.filter((s) => counts.get(s)).map((s) => ({ key: s, label: STATUS_META[s].label, count: counts.get(s) })),
  ];
  // One status only: a tab strip that repeats "All" would be noise.
  const showTabs = tabs.length > 2;
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
    <div>
      {dialog}
      {showTabs && <FilterTabs tabs={tabs} value={filter} onChange={setFilter} label="Filter projects by status" className="mb-4" />}
      {error && <FormNotice tone="error" className="mb-3">{error}</FormNotice>}
      <ul className="border-t border-ink-300">
        {shown.map((p) => {
          const meta = statusMeta(p.status);
          // Taken down by Findtern: view only. No lifecycle action, no edit, no candidates: View and Contact admin.
          const actions = p.takenDown ? [] : (meta.key && ACTIONS[meta.key]) || [];
          const busy = busyId === p.id;
          const edit = `/employer/projects/${p.id}/edit`;
          const candidatesHref = `/employer/candidates?project=${encodeURIComponent(p.id)}`;
          const menu: RowMenuItem[] = [];
          if (!p.takenDown && (meta.key === "published" || meta.key === "paused")) menu.push({ label: "Edit", href: edit, icon: <Pencil /> });
          if (!p.takenDown && meta.key === "published") menu.push({ label: "View candidates", href: candidatesHref, icon: <Users /> });
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
          const mode = p.locationType ? p.locationType.charAt(0).toUpperCase() + p.locationType.slice(1) : "Work mode not set";
          const facts = [mode, locations, `${p.skills.length}/${MAX_SKILLS_PER_PROJECT} skills`, p.fullTimeOffer ? "Full-time offer" : null].filter(Boolean).join(" · ");
          const action = "min-h-11";
          return (
            <li key={p.id} className="border-b border-ink-200 py-5 lg:grid lg:grid-cols-[minmax(0,1fr)_13rem_12rem] lg:items-center lg:gap-x-8">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <h2 className="break-words font-display text-lg font-semibold text-ink-900">{p.projectName}</h2>
                  {p.takenDown ? <TakedownBadge /> : <StatusPill status={p.status} />}
                </div>
                <p className="mt-1 text-sm text-ink-700">{facts}</p>
                {p.skills.length > 0 && (
                  <p className="mt-1 text-sm text-ink-600">
                    <span className="sr-only">Skills: </span>
                    {p.skills.slice(0, 5).join(", ")}
                    {p.skills.length > 5 ? ` +${p.skills.length - 5} more` : ""}
                  </p>
                )}
              </div>

              <div className="mt-4 lg:mt-0">
                {live && p.sent > 0 ? (
                  <Tally sent={p.sent} accepted={p.accepted} />
                ) : live ? (
                  <p className="text-sm text-ink-600">No proposals sent yet.</p>
                ) : null}
              </div>

              <div className="mt-4 flex items-center gap-2 lg:mt-0 lg:justify-end">
                {p.takenDown && (
                  <>
                    <ButtonLink href={edit} variant="outline" size="sm" className={action}>View</ButtonLink>
                    <ContactAdminButton projectId={p.id} projectName={p.projectName} />
                  </>
                )}
                {!p.takenDown && meta.key === "published" && (
                  <ButtonLink href={candidatesHref} variant="outline" size="sm" className={`${action} max-lg:flex-1`}>
                    <Users className="size-4" aria-hidden /> View candidates
                  </ButtonLink>
                )}
                {!p.takenDown && meta.key === "draft" && (
                  <ButtonLink href={edit} variant="outline" size="sm" className={`${action} max-lg:flex-1`}>
                    <Pencil className="size-4" aria-hidden /> <span className="lg:hidden">Edit and publish</span><span className="max-lg:hidden">Edit</span>
                  </ButtonLink>
                )}
                {resume && !p.takenDown && (
                  <button type="button" disabled={busy} onClick={() => void move(p, resume)} className={buttonClass({ variant: "outline", size: "sm", className: `${action} max-lg:flex-1` })}>
                    <Play className="size-4" aria-hidden /> {resume.label}
                  </button>
                )}
                {!p.takenDown && meta.key === "closed" && (
                  <ButtonLink href={candidatesHref} variant="outline" size="sm" className={`${action} max-lg:flex-1`}>View</ButtonLink>
                )}
                {meta.key === "rejected" && !p.takenDown && (
                  <button type="button" disabled={busy} onClick={() => void resubmit(p)} className={buttonClass({ variant: "outline", size: "sm", className: `${action} max-lg:flex-1` })}>
                    <Wrench className="size-4" aria-hidden /> Edit and publish
                  </button>
                )}
                {!p.takenDown && <RowMenu label={`More actions for ${p.projectName}`} items={menu} />}
              </div>

              {(p.takenDown || meta.key === "pending_review" || meta.key === "rejected") && (
                <div className="mt-4 text-sm lg:col-span-3">
                  {p.takenDown && (
                    <div role="note" className="rounded-md bg-danger-soft p-3 text-ink-900">
                      <p className="font-semibold">Taken down by Findtern</p>
                      <p className="mt-0.5 break-words">{p.takenDownReason || "No reason was recorded."} It is view only until admin restores it. Use Contact admin to resolve this.</p>
                    </div>
                  )}
                  {meta.key === "pending_review" && <p className="text-ink-700">Not shown to candidates yet. Publish it now, or move it back to a draft to edit it.</p>}
                  {meta.key === "rejected" && (
                    <div role="note" className="rounded-md bg-danger-soft p-3 text-ink-900">
                      <p className="font-semibold">Not approved{p.rejectionReason ? "" : ": no reason was recorded"}</p>
                      {p.rejectionReason && <p className="mt-0.5 break-words">{p.rejectionReason}</p>}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && <p className="py-6 text-sm text-ink-700">Nothing under this status. Pick another one above.</p>}
      <ButtonLink href="/employer/projects/new" className="mt-6 sm:hidden" block>
        <Plus className="size-4" aria-hidden /> Post a project
      </ButtonLink>
    </div>
  );
}

const MARKS = 20;

/** Sent and accepted for one project: two big figures, and one mark per proposal sent (filled once accepted). */
function Tally({ sent, accepted }: { sent: number; accepted: number }) {
  const marks = Math.min(sent, MARKS);
  const filled = sent <= MARKS ? accepted : Math.round((accepted / sent) * MARKS);
  return (
    <div>
      <dl className="flex gap-8">
        <div>
          <dt className="text-xs text-ink-600">Sent</dt>
          <dd className="nums font-display text-4xl font-semibold leading-none tracking-[-0.03em] text-ink-900">{sent}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-600">Accepted</dt>
          <dd className={cn("nums font-display text-4xl font-semibold leading-none tracking-[-0.03em]", accepted > 0 ? "text-brand-700" : "text-ink-500")}>{accepted}</dd>
        </div>
      </dl>
      <div aria-hidden className="mt-3 flex max-w-52 flex-wrap gap-1">
        {Array.from({ length: marks }, (_, i) => (
          <span key={i} className={cn("size-2.5 rounded-sm", i < filled ? "bg-brand-700" : "bg-ink-300")} />
        ))}
      </div>
    </div>
  );
}
