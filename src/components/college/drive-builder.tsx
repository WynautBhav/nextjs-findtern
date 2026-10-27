"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { isStudentEligible } from "@/lib/college/eligibility";
import { fromLocalInput } from "@/lib/college/ist";
import { COHORTS, yearLabel } from "@/lib/college/labels";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import { ShareLink } from "./share-link";
import type { StudentRow } from "./types";

export type DriveDraft = {
  id?: string;
  title: string;
  kind: "internship" | "full_time";
  description: string;
  startsAt: string;
  endsAt: string;
  minCgpa: string;
  minScore: string;
  years: number[];
  branches: string[];
  includeUserIds: string[];
  excludeUserIds: string[];
};

const field =
  "h-11 w-full rounded-[10px] border border-ink-200 bg-white px-3 text-[14px] text-ink-900 placeholder:text-ink-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export function DriveBuilder({
  initial,
  students,
  branches,
  collegeId,
  collegeName,
  live = false,
}: {
  initial: DriveDraft;
  students: StudentRow[];
  branches: string[];
  collegeId: string;
  collegeName: string;
  /** The drive is open right now; edits reach employers immediately. */
  live?: boolean;
}) {
  const router = useRouter();
  const [d, setD] = useState<DriveDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"in" | "out">("in");

  const set = <K extends keyof DriveDraft>(k: K, v: DriveDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  const rules = useMemo(() => {
    const eligibility: Record<string, unknown> = {};
    if (d.minCgpa.trim() !== "" && Number.isFinite(Number(d.minCgpa))) eligibility.minCgpa = Number(d.minCgpa);
    if (d.minScore.trim() !== "" && Number.isFinite(Number(d.minScore))) eligibility.minScore = Number(d.minScore);
    if (d.years.length) eligibility.years = d.years;
    if (d.branches.length) eligibility.branches = d.branches;
    return { collegeId, eligibility, includeUserIds: d.includeUserIds, excludeUserIds: d.excludeUserIds };
  }, [d, collegeId]);

  const split = useMemo(() => {
    const inside: StudentRow[] = [];
    const outside: StudentRow[] = [];
    for (const s of students) (isStudentEligible(s, rules) ? inside : outside).push(s);
    return { inside, outside };
  }, [students, rules]);

  const noDriveConsent = students.filter((s) => !s.purposes.includes("drive_visibility")).length;
  const list = (view === "in" ? split.inside : split.outside).filter((s) =>
    `${s.name} ${s.rollNo ?? ""} ${s.branch ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()),
  );

  function toggle(userId: string, to: "include" | "exclude" | "rules") {
    setD((x) => ({
      ...x,
      includeUserIds: to === "include" ? [...new Set([...x.includeUserIds, userId])] : x.includeUserIds.filter((i) => i !== userId),
      excludeUserIds: to === "exclude" ? [...new Set([...x.excludeUserIds, userId])] : x.excludeUserIds.filter((i) => i !== userId),
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(null);
    const payload = {
      title: d.title,
      kind: d.kind,
      description: d.description,
      startsAt: fromLocalInput(d.startsAt),
      endsAt: fromLocalInput(d.endsAt),
      eligibility: rules.eligibility,
      includeUserIds: d.includeUserIds,
      excludeUserIds: d.excludeUserIds,
    };
    const res = await csrfFetch(d.id ? `/api/college/drives/${d.id}` : "/api/college/drives", {
      method: d.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { id?: string; url?: string; error?: string } | null;
    setSaving(false);
    if (!res?.ok) {
      setError(body?.error ?? "Couldn't save. Check your connection and try again.");
      return;
    }
    if (!d.id && body?.id) {
      setD((x) => ({ ...x, id: body.id }));
      setLink(body.url ?? null);
      // Update the address without remounting, so the one-time link stays on screen.
      window.history.replaceState(null, "", `/college/drives/${body.id}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSaved("Saved. Employers see the change on their next refresh.");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-6" noValidate>
      {link ? (
        <ShareLink url={link} collegeName={collegeName} driveTitle={d.title} startsAt={fromLocalInput(d.startsAt)} endsAt={fromLocalInput(d.endsAt)} kind={d.kind} />
      ) : null}

      <section className="apple-panel bg-white">
        <header className="border-b border-ink-100 px-5 py-4">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink-900">The drive</h2>
        </header>
        <div className="grid gap-5 px-5 py-5 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="text-[14px] font-medium text-ink-800">Name</span>
            <input className={cn(field, "mt-1.5")} value={d.title} onChange={(e) => set("title", e.target.value)} required maxLength={120} placeholder="e.g. Summer internship drive 2027" />
          </label>

          <fieldset className="md:col-span-2">
            <legend className="text-[14px] font-medium text-ink-800">Hiring for</legend>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["internship", "Internships", "Findtern's fixed stipend bands apply; score is shown first."],
                  ["full_time", "Full-time jobs", "Employers also see CGPA up front."],
                ] as const
              ).map(([value, label, hint]) => (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-[10px] border p-3.5",
                    d.kind === value ? "border-brand-600 bg-brand-50/60" : "border-ink-200 hover:border-ink-300",
                  )}
                >
                  <input type="radio" name="kind" value={value} checked={d.kind === value} onChange={() => set("kind", value)} className="mt-1 accent-brand-700" />
                  <span>
                    <span className="block text-[14px] font-semibold text-ink-900">{label}</span>
                    <span className="block text-[13px] text-text-subtle">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-[14px] font-medium text-ink-800">Opens (IST)</span>
            <input type="datetime-local" className={cn(field, "mt-1.5")} value={d.startsAt} onChange={(e) => set("startsAt", e.target.value)} required />
          </label>
          <label className="block">
            <span className="text-[14px] font-medium text-ink-800">Closes (IST)</span>
            <input type="datetime-local" className={cn(field, "mt-1.5")} value={d.endsAt} onChange={(e) => set("endsAt", e.target.value)} required />
            <span className="mt-1 block text-[12px] text-text-subtle">The link stops working at this time.</span>
          </label>

          <label className="block md:col-span-2">
            <span className="text-[14px] font-medium text-ink-800">Note for employers <span className="font-normal text-text-subtle">(optional)</span></span>
            <textarea
              className="mt-1.5 min-h-24 w-full rounded-[10px] border border-ink-200 bg-white px-3 py-2.5 text-[14px] text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={d.description}
              onChange={(e) => set("description", e.target.value)}
              maxLength={2000}
              placeholder="Batch, timings, who to contact at the placement cell"
            />
          </label>
        </div>
      </section>

      <section className="apple-panel bg-white">
        {live ? (
          <p role="note" className="border-b border-amber-500/25 bg-amber-500/5 px-5 py-3 text-[13px] text-amber-900">
            This drive is live. Tightening the rules removes students from employers&apos; lists, including anyone they shortlisted or are about to call.
          </p>
        ) : null}
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div>
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink-900">Who employers can see</h2>
            <p className="mt-0.5 text-[13px] text-text-subtle">Leave a box empty to not filter on it. You can hand-pick students either way below.</p>
          </div>
          <p className="text-right" aria-live="polite">
            <span className="nums text-[28px] font-bold leading-none text-ink-900">{split.inside.length}</span>
            <span className="text-[14px] text-text-subtle"> of {students.length} students</span>
          </p>
        </header>
        <div className="grid gap-5 px-5 py-5 md:grid-cols-2">
          <label className="block">
            <span className="text-[14px] font-medium text-ink-800">Minimum CGPA</span>
            <input inputMode="decimal" className={cn(field, "mt-1.5")} value={d.minCgpa} onChange={(e) => set("minCgpa", e.target.value)} placeholder="Any" />
            <span className="mt-1 block text-[12px] text-text-subtle">Students who reported a percentage, not a CGPA, are left out unless you add them by hand.</span>
          </label>
          <label className="block">
            <span className="text-[14px] font-medium text-ink-800">Minimum Findtern score</span>
            <input inputMode="decimal" className={cn(field, "mt-1.5")} value={d.minScore} onChange={(e) => set("minScore", e.target.value)} placeholder="Any" />
            <span className="mt-1 block text-[12px] text-text-subtle">Out of 10, from the AI interview. No interview means no score.</span>
          </label>

          <fieldset>
            <legend className="text-[14px] font-medium text-ink-800">Year of study</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[1, ...COHORTS.map((c) => c.year), 5].map((y) => {
                const on = d.years.includes(y);
                return (
                  <button
                    key={y}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("years", on ? d.years.filter((v) => v !== y) : [...d.years, y].sort())}
                    className={cn("min-h-11 rounded-[10px] border px-3.5 text-[14px] font-medium", on ? "border-brand-700 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-700 hover:bg-ink-50")}
                  >
                    {yearLabel(y)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-[14px] font-medium text-ink-800">Branch</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {branches.length === 0 ? <span className="text-[13px] text-text-subtle">No branches recorded yet.</span> : null}
              {branches.map((b) => {
                const on = d.branches.some((x) => x.toLowerCase() === b.toLowerCase());
                return (
                  <button
                    key={b}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("branches", on ? d.branches.filter((x) => x.toLowerCase() !== b.toLowerCase()) : [...d.branches, b])}
                    className={cn("min-h-11 rounded-[10px] border px-3.5 text-[14px] font-medium", on ? "border-brand-700 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-700 hover:bg-ink-50")}
                  >
                    {b}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="border-t border-ink-100 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" aria-label="Students" className="flex gap-1">
              {(
                [
                  ["in", `In the drive (${split.inside.length})`],
                  ["out", `Left out (${split.outside.length})`],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={cn("min-h-11 rounded-[10px] px-3.5 text-[14px] font-medium", view === v ? "bg-brand-950 text-white" : "text-ink-700 hover:bg-ink-100")}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="relative w-full sm:w-64">
              <span className="sr-only">Search students</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className={cn(field, "pl-9")} />
            </label>
          </div>
          {noDriveConsent > 0 ? (
            <p className="mt-3 text-[13px] text-text-subtle">
              {noDriveConsent} student{noDriveConsent === 1 ? " hasn't" : "s haven't"} agreed to be shown in drives and can&apos;t be added.
            </p>
          ) : null}
          <ul className="mt-3 max-h-[28rem] divide-y divide-ink-100 overflow-y-auto rounded-[10px] border border-ink-100">
            {list.length === 0 ? <li className="px-4 py-8 text-center text-[14px] text-text-subtle">Nobody here.</li> : null}
            {list.map((s) => {
              const included = d.includeUserIds.includes(s.userId);
              const excluded = d.excludeUserIds.includes(s.userId);
              const canShow = s.purposes.includes("drive_visibility");
              return (
                <li key={s.userId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-ink-900">{s.name}</p>
                    <p className="nums text-[12px] text-text-subtle">
                      {[s.rollNo, yearLabel(s.year), s.branch, s.cgpa !== null ? `CGPA ${s.cgpa.toFixed(1)}` : "CGPA —", s.score !== null ? `Score ${s.score.toFixed(1)}` : "No score"].filter(Boolean).join(" · ")}
                      {included ? <span className="ml-1.5 font-medium text-brand-800">· added by you</span> : null}
                      {excluded ? <span className="ml-1.5 font-medium text-amber-800">· removed by you</span> : null}
                    </p>
                  </div>
                  {view === "in" ? (
                    <button type="button" onClick={() => toggle(s.userId, included ? "rules" : "exclude")} className="min-h-11 rounded-[10px] px-3 text-[13px] font-medium text-ink-700 hover:bg-ink-100">
                      {included ? "Undo add" : "Remove"}
                    </button>
                  ) : canShow ? (
                    <button type="button" onClick={() => toggle(s.userId, excluded ? "rules" : "include")} className="min-h-11 rounded-[10px] px-3 text-[13px] font-medium text-brand-700 hover:bg-brand-50">
                      {excluded ? "Undo remove" : "Add anyway"}
                    </button>
                  ) : (
                    <span className="text-[12px] text-text-subtle">No drive consent</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="apple-spring apple-pressable inline-flex min-h-11 items-center rounded-[10px] bg-brand-700 px-5 text-[14px] font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {saving ? "Saving…" : d.id ? "Save changes" : "Create drive and get link"}
        </button>
        <p role="status" aria-live="polite" className={cn("text-[14px]", error ? "text-danger" : "text-brand-800")}>
          {error ?? saved}
        </p>
      </div>
    </form>
  );
}
