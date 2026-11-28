"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

import { AdminAvatar } from "@/components/admin/avatar";
import { FILTER_BUTTON, FILTER_SELECT, FilterField } from "@/components/admin/filter-controls";
import { StatusBadge } from "@/components/admin/status-badge";
import { useUrlTableState } from "@/components/admin/use-url-table-state";
import { useConfirm } from "@/components/app/use-confirm";
import { useToast } from "@/components/app/toast";
import { buttonClass } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { activeToggle, MODE_LABEL, payLines, projectStatus, restoresToActive } from "@/lib/admin/projects-board-pure";
import type { BoardCompany, BoardProject } from "@/lib/admin/projects-board";
import { csrfFetch } from "@/lib/client-fetch";
import { formatDate, formatNumber } from "@/lib/format";
import { TAKEDOWN_REASON_MAX } from "@/lib/projects/takedown";
import { cn } from "@/lib/utils";

const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;

/** Company order, in the URL (`sort`), so a shared link keeps it. */
function CompanySortSelect() {
  const id = useId();
  const { searchParams, set } = useUrlTableState({});
  return (
    <FilterField label="Sort companies" htmlFor={id} className="max-sm:w-full">
      <select id={id} value={searchParams.get("sort") ?? "projects"} onChange={(e) => set("sort", e.target.value === "projects" ? null : e.target.value)} className={FILTER_SELECT}>
        <option value="projects">Most projects</option>
        <option value="name">Name, A to Z</option>
        <option value="latest">Latest project</option>
      </select>
    </FilterField>
  );
}

export function ProjectsBoard({ companies, canWrite, summary }: { companies: BoardCompany[]; canWrite: boolean; summary: string }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const allCollapsed = companies.length > 0 && companies.every((c) => collapsed.has(c.employerId));
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="nums pb-2.5 text-sm text-text-subtle" aria-live="polite">{summary}</p>
        <div className="flex flex-wrap items-end gap-2.5 max-sm:w-full">
        <CompanySortSelect />
        <button
          type="button"
          className={FILTER_BUTTON}
          onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(companies.map((c) => c.employerId)))}
        >
          {allCollapsed ? "Expand all" : "Collapse all"}
        </button>
        </div>
      </div>
      {companies.map((c) => (
        <CompanyGroup key={c.employerId} company={c} open={!collapsed.has(c.employerId)} onToggle={() => toggle(c.employerId)} canWrite={canWrite} />
      ))}
    </div>
  );
}

function CompanyGroup({ company, open, onToggle, canWrite }: { company: BoardCompany; open: boolean; onToggle: () => void; canWrite: boolean }) {
  const bodyId = useId();
  const ps = company.projects;
  const active = ps.filter((p) => projectStatus(p).key === "active").length;
  const offers = ps.reduce((n, p) => n + p.offersSent, 0);
  const hires = ps.reduce((n, p) => n + p.hires, 0);
  const name = company.companyName.trim() || "Unnamed company";

  return (
    <section aria-label={name} className="overflow-hidden rounded-[var(--radius-admin-card)] border border-[color:var(--admin-panel-edge)] bg-[color:var(--admin-panel)] shadow-[var(--admin-shadow)]">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="apple-spring group flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-text-subtle transition-transform motion-reduce:transition-none", !open && "-rotate-90")} />
          <AdminAvatar name={name} id={company.employerId} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-[0.9375rem] font-semibold text-foreground group-hover:underline">{name}</span>
            <span className="nums block text-[0.8125rem] text-text-subtle">
              {plural(ps.length, "project")} · {formatNumber(active)} active · {plural(offers, "offer")} sent · {plural(hires, "hire")}
            </span>
          </span>
        </button>
        <Link
          href={`/admin/companies/${company.employerId}?tab=projects`}
          className="rounded-sm text-[0.8125rem] font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Open company
        </Link>
      </header>
      {open ? (
        <ul id={bodyId} className="border-t border-[color:var(--admin-rule)]">
          {ps.map((p) => (
            <ProjectRow key={`${p.id}:${p.takenDownAt ?? ""}`} project={p} canWrite={canWrite} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ProjectRow({ project: p0, canWrite }: { project: BoardProject; canWrite: boolean }) {
  const detailsId = useId();
  // Optimistic: the switch flips takenDownAt locally while the request runs, and rolls back on failure.
  const [takenDownAt, setTakenDownAt] = useState<string | null>(p0.takenDownAt);
  const [reasonShown, setReasonShown] = useState<string | null>(p0.takenDownReason);
  const [details, setDetails] = useState(false);
  const [asking, setAsking] = useState(false);
  const p = { ...p0, takenDownAt, takenDownReason: reasonShown };
  const status = projectStatus(p);
  const pay = payLines(p.pay);
  const where = [p.city, p.state].filter(Boolean).join(", ");
  const extraSkills = Math.max(0, p.skills.length - 5);

  return (
    <li className="border-b border-[color:var(--admin-rule)] px-4 py-4 last:border-b-0 sm:px-5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(7rem,auto)_minmax(9rem,auto)]">
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <p className="break-words text-[0.9375rem] font-medium text-foreground">{p.name}</p>
          {p.skills.length ? (
            <ul aria-label="Required skills" className="mt-1.5 flex flex-wrap gap-1">
              {p.skills.slice(0, 5).map((s) => (
                <li key={s} className="rounded-full bg-[color:var(--admin-panel-2)] px-2 py-0.5 text-xs text-ink-700">
                  {s}
                </li>
              ))}
              {extraSkills ? <li className="px-1 py-0.5 text-xs text-text-subtle" title={p.skills.slice(5).join(", ")}>+{extraSkills} more</li> : null}
            </ul>
          ) : (
            <p className="mt-1 text-[0.8125rem] text-text-subtle">No skills listed</p>
          )}
          {p.scope ? <p className="mt-1.5 line-clamp-1 text-[0.8125rem] text-text-subtle">Scope: {p.scope}</p> : null}
        </div>

        <div className="min-w-0 text-sm">
          <p className="text-foreground">{MODE_LABEL[p.locationType] ?? "Mode not set"}</p>
          <p className="truncate text-[0.8125rem] text-text-subtle">{where || "No city"}</p>
          {p.preferredLocations.length ? (
            <p className="truncate text-[0.8125rem] text-text-subtle" title={p.preferredLocations.join(", ")}>
              Prefers {p.preferredLocations.join(", ")}
            </p>
          ) : null}
        </div>

        <div className="min-w-0 text-sm">
          <p className="text-foreground">{p.fullTimeOffer ? "Full-time" : "Internship"}</p>
          {pay.length ? (
            pay.map((line) => (
              <p key={line} className="nums text-[0.8125rem] text-text-subtle">
                {line}
              </p>
            ))
          ) : (
            <p className="text-[0.8125rem] text-text-subtle">No offers yet</p>
          )}
        </div>

        <div className="nums text-sm">
          <p className="text-foreground">{plural(p.offersSent, "offer")}</p>
          <p className="text-[0.8125rem] text-text-subtle">{plural(p.hires, "hire")}</p>
        </div>

        <div className={cn("flex flex-col items-start gap-3 lg:items-end", asking && "col-span-2 lg:col-span-1")}>
          <div className="lg:text-right">
            <StatusBadge tone={status.tone} label={status.label} className={status.key === "deactivated" ? "cursor-help" : undefined} />
            <p className="nums mt-1 text-[0.8125rem] text-text-subtle">Posted {formatDate(p.createdAt)}</p>
          </div>
          <ActiveSwitch project={p} canWrite={canWrite} asking={asking} setAsking={setAsking} onOptimistic={(down, reason) => { setTakenDownAt(down); setReasonShown(reason); }} />
        </div>
      </div>

      <button
        type="button"
        aria-expanded={details}
        aria-controls={detailsId}
        onClick={() => setDetails((d) => !d)}
        className="mt-2 inline-flex min-h-8 items-center gap-1 rounded-sm text-[0.8125rem] font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11"
      >
        {details ? "Hide details" : status.key === "deactivated" ? "Why it was deactivated" : "Details"}
        <ChevronDown aria-hidden className={cn("size-3.5 transition-transform motion-reduce:transition-none", details && "rotate-180")} />
      </button>
      {details ? (
        <div id={detailsId} className="mt-2 grid gap-3 rounded-[var(--radius-admin-card)] bg-[color:var(--admin-panel-2)] p-4 text-sm sm:grid-cols-2">
          {p.takenDownAt ? (
            <div className="sm:col-span-2">
              <p className="font-medium text-foreground">Deactivated on {formatDate(p.takenDownAt)}</p>
              <p className="mt-0.5 whitespace-pre-line break-words text-ink-700">{p.takenDownReason || "No reason saved"}</p>
              <Link href={`/admin/messages?q=${encodeURIComponent(p.id)}`} className="mt-1 inline-block text-[0.8125rem] font-medium text-primary underline-offset-4 hover:underline">
                Messages about this project
              </Link>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <p className="font-medium text-foreground">Scope of work</p>
            <p className="mt-0.5 whitespace-pre-line break-words text-ink-700">{p.scope || "Not set"}</p>
          </div>
          <div>
            <p className="font-medium text-foreground">All skills</p>
            <p className="mt-0.5 text-ink-700">{p.skills.join(", ") || "None"}</p>
          </div>
          <div>
            <p className="font-medium text-foreground">Preferred locations</p>
            <p className="mt-0.5 text-ink-700">{p.preferredLocations.join(", ") || "None"}</p>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** Activate = restore, Deactivate = takedown (reason required, withdraws open offers). Locked when only the employer can reopen. */
function ActiveSwitch({
  project: p,
  canWrite,
  asking,
  setAsking,
  onOptimistic,
}: {
  project: BoardProject;
  canWrite: boolean;
  asking: boolean;
  setAsking: (on: boolean) => void;
  onOptimistic: (takenDownAt: string | null, reason: string | null) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { ask, dialog } = useConfirm();
  const reasonId = useId();
  const noteId = useId();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const t = activeToggle(p, canWrite);
  if (!t.show) return null;

  async function send(path: "takedown" | "restore", body: Record<string, string>, prev: { at: string | null; reason: string | null }) {
    setBusy(true);
    try {
      const res = await csrfFetch(`/api/admin/projects/${p.id}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onOptimistic(prev.at, prev.reason);
        toast.show({ tone: "error", title: path === "takedown" ? "Could not deactivate" : "Could not activate", body: data.error ?? "Nothing was changed. Try again." });
        return;
      }
      const n = Number(data.withdrawnOffers ?? 0);
      const left = Number(data.skippedOffers ?? 0);
      toast.show({
        tone: "success",
        title: path === "takedown" ? `Deactivated "${p.name}"` : `Activated "${p.name}"`,
        body:
          path === "takedown"
            ? `${n === 0 ? "No open offers to withdraw." : `${plural(n, "open offer")} withdrawn.`}${left ? ` ${plural(left, "offer")} with a payment in progress left as is.` : ""}`
            : restoresToActive(p.status) ? "Candidates can see it again." : "The employer's own status still keeps it closed.",
      });
      router.refresh();
    } catch {
      onOptimistic(prev.at, prev.reason);
      toast.show({ tone: "error", title: "Network problem", body: "Nothing was changed. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    const why = reason.trim();
    if (!why) return;
    const offers = p.openOffers;
    const ok = await ask({
      title: "Deactivate this project?",
      body: `"${p.name}" leaves candidate discovery now and the employer is told why. ${
        offers === 0 ? "It has no open offers." : `Its ${plural(offers, "open offer")} (unanswered, or accepted but unpaid) will be withdrawn and the candidates told.`
      } Hires are not touched, and withdrawn offers stay withdrawn if you activate it again.`,
      confirmLabel: offers ? `Deactivate and withdraw ${formatNumber(offers)}` : "Deactivate",
    });
    if (!ok) return;
    const prev = { at: p.takenDownAt, reason: p.takenDownReason };
    onOptimistic(new Date().toISOString(), why);
    setAsking(false);
    setReason("");
    await send("takedown", { reason: why }, prev);
  }

  async function activate() {
    const ok = await ask({
      title: "Activate this project?",
      body: `"${p.name}" ${restoresToActive(p.status) ? "becomes visible to candidates again" : "is no longer held by Findtern, but the employer closed it, so it stays closed"}. Offers withdrawn when it was deactivated stay withdrawn.`,
      confirmLabel: "Activate",
      destructive: false,
    });
    if (!ok) return;
    const prev = { at: p.takenDownAt, reason: p.takenDownReason };
    onOptimistic(null, null);
    await send("restore", {}, prev);
  }

  if (t.action === null) {
    return (
      <div className="flex items-center gap-2 lg:justify-end">
        <Switch checked={false} disabled aria-label={`Activate ${p.name}`} aria-describedby={noteId} />
        <span id={noteId} className="text-[0.8125rem] text-text-subtle">{t.reason}</span>
      </div>
    );
  }

  return (
    <div className={cn("min-w-0 lg:text-right", asking && "w-full lg:w-auto")}>
      {dialog}
      <label className="inline-flex items-center gap-2 text-sm text-foreground">
        <Switch
          checked={t.on && !asking}
          disabled={busy}
          aria-label={`${t.action === "deactivate" ? "Deactivate" : "Activate"} ${p.name}`}
          onCheckedChange={(on) => {
            if (t.action === "activate" && on) void activate();
            else if (t.action === "deactivate" && !on) setAsking(true);
            else if (t.action === "deactivate" && on) setAsking(false);
          }}
        />
        <span className="sr-only">{t.on && !asking ? "Active" : "Inactive"}</span>
      </label>
      {asking ? (
        <div className="mt-2 w-full space-y-2 text-left sm:max-w-sm lg:w-72">
          <label htmlFor={reasonId} className="block text-[0.8125rem] font-medium text-foreground">
            Reason for the employer
          </label>
          <Textarea id={reasonId} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={TAKEDOWN_REASON_MAX} autoFocus />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || !reason.trim()} onClick={() => void deactivate()} className={buttonClass({ size: "sm" })}>
              Deactivate…
            </button>
            <button type="button" onClick={() => { setAsking(false); setReason(""); }} className={buttonClass({ variant: "outline", size: "sm" })}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
