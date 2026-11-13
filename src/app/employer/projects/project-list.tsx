"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, MapPin, Pencil, Pause, Play, Plus, Users, XCircle, Wrench, Undo2 } from "lucide-react";

import { EmptyScene, Figure, FilterTabs } from "@/components/app/primitives";
import { useConfirm } from "@/components/app/use-confirm";
import { FormNotice } from "@/components/employer/company-fields";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { MAX_SKILLS_PER_PROJECT } from "@/lib/projects/lifecycle";
import { MetaList } from "@/components/app/meta-list";
import { RowMenu, type RowMenuItem } from "@/components/app/row-menu";
import { RatioBar } from "@/components/employer/kit/ratio-bar";
import { StatusPill } from "./status-icon";
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
  const router = useRouter();
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
    <div className="space-y-4">
      {dialog}
      <dl className="grid grid-cols-3 gap-4 rounded-apple-xl border border-ink-200/80 bg-white p-4 sm:p-5">
        <Figure label="Live" value={counts.get("published") ?? 0} empty="None" hint="Candidates can see these" />
        <Figure label="Drafts" value={counts.get("draft") ?? 0} empty="None" hint="Not yet published" />
        <Figure label="Paused" value={counts.get("paused") ?? 0} empty="None" hint="Hidden until you resume" />
      </dl>
      <FilterTabs tabs={tabs} value={filter} onChange={setFilter} label="Filter projects by status" />
      {error && <FormNotice tone="error">{error}</FormNotice>}
      <ul className="grid gap-3">
        {shown.map((p, idx) => {
          const meta = statusMeta(p.status);
          const actions = (meta.key && ACTIONS[meta.key]) || [];
          const busy = busyId === p.id;
          const edit = `/employer/projects/${p.id}/edit`;
          const menu: RowMenuItem[] = [];
          if (meta.key === "published" || meta.key === "paused") menu.push({ label: "Edit", href: edit, icon: <Pencil /> });
          if (meta.key === "published") menu.push({ label: "View candidates", href: `/employer/candidates?project=${encodeURIComponent(p.id)}`, icon: <Users /> });
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
          return (
            <li key={p.id} style={{ "--i": idx } as React.CSSProperties} className="rise tile-lift space-y-3 rounded-apple-xl border border-ink-200/70 bg-white p-4 sm:p-5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_14rem_11.5rem_2.75rem]">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <h2 className="break-words text-base font-semibold text-ink-900">{p.projectName}</h2>
                    <StatusPill status={p.status} />
                  </div>
                  <MetaList
                    items={[
                      { icon: <Briefcase />, text: p.locationType ? p.locationType.charAt(0).toUpperCase() + p.locationType.slice(1) : "Work mode not set" },
                      { icon: <MapPin />, text: locations },
                      { text: `${p.skills.length}/${MAX_SKILLS_PER_PROJECT} skills` },
                      { text: p.fullTimeOffer ? "Full-time offer" : null },
                    ]}
                  />
                  {p.skills.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Skills">
                      {p.skills.slice(0, 6).map((sk) => (
                        <li key={sk} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-100">{sk}</li>
                      ))}
                      {p.skills.length > 6 && <li className="px-1 py-0.5 text-xs text-text-subtle">+{p.skills.length - 6}</li>}
                    </ul>
                  )}
                </div>
                <div className="order-last col-span-2 sm:order-none sm:col-span-1">
                  {live && <RatioBar sent={p.sent} accepted={p.accepted} className="w-full" />}
                </div>
                <div className="flex items-center justify-end gap-1 sm:contents">
                  <div className="flex items-center justify-end max-sm:hidden">
                    {meta.key === "published" && (
                      <ButtonLink href={`/employer/candidates?project=${encodeURIComponent(p.id)}`} size="sm" className="min-h-11">
                        <Users className="size-4" aria-hidden /> View candidates
                      </ButtonLink>
                    )}
                    {meta.key === "draft" && (
                      <ButtonLink href={edit} size="sm" className="min-h-11">
                        <Pencil className="size-4" aria-hidden /> Edit
                      </ButtonLink>
                    )}
                    {resume && (
                      <button type="button" disabled={busy} onClick={() => void move(p, resume)} className={buttonClass({ size: "sm", className: "min-h-11" })}>
                        <Play className="size-4" aria-hidden /> {resume.label}
                      </button>
                    )}
                    {meta.key === "closed" && (
                      <ButtonLink href={`/employer/candidates?project=${encodeURIComponent(p.id)}`} variant="outline" size="sm" className="min-h-11">View</ButtonLink>
                    )}
                  </div>
                  <RowMenu label={`More actions for ${p.projectName}`} items={menu} />
                </div>
              </div>
              {p.takenDown && (
                <div role="note" className="rounded-apple-md bg-danger-soft p-3 text-sm text-ink-900">
                  <p className="font-semibold">Taken down by Findtern</p>
                  <p className="mt-0.5 break-words">{p.takenDownReason || "No reason was recorded."} Contact support if you think this is a mistake.</p>
                </div>
              )}
              {meta.key === "pending_review" && <p className="text-sm text-text-subtle">Not shown to candidates yet. Publish it now, or move it back to a draft to edit it.</p>}
              {meta.key === "rejected" && (
                <div role="note" className="rounded-apple-md bg-danger-soft p-3 text-sm text-ink-900">
                  <p className="font-semibold">Not approved{p.rejectionReason ? "" : ": no reason was recorded"}</p>
                  {p.rejectionReason && <p className="mt-0.5 break-words">{p.rejectionReason}</p>}
                </div>
              )}
              {/* Phone: the primary action sits under the facts, full width. */}
              <div className="sm:hidden">
                {meta.key === "published" && (
                  <ButtonLink href={`/employer/candidates?project=${encodeURIComponent(p.id)}`} size="sm" block className="min-h-11">View candidates</ButtonLink>
                )}
                {meta.key === "draft" && (
                  <ButtonLink href={edit} size="sm" block className="min-h-11">Edit and publish</ButtonLink>
                )}
                {resume && (
                  <button type="button" disabled={busy} onClick={() => void move(p, resume)} className={buttonClass({ size: "sm", block: true, className: "min-h-11" })}>{resume.label}</button>
                )}
              </div>
              {meta.key === "rejected" && (
                <button type="button" disabled={busy} onClick={() => void resubmit(p)} className={buttonClass({ size: "sm", className: "min-h-11 max-sm:w-full" })}>
                  <Wrench className="size-4" aria-hidden /> Edit and publish
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && <p className="text-sm text-ink-600">Nothing here under this status. Pick another tab above.</p>}
      <ButtonLink href="/employer/projects/new" className="sm:hidden" block>
        <Plus className="size-4" aria-hidden /> Post a project
      </ButtonLink>
    </div>
  );
}
