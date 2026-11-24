"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Search } from "lucide-react";

import { isStudentEligible } from "@/lib/college/eligibility";
import { fromLocalInput } from "@/lib/college/ist";
import { cgpaText } from "@/lib/college/master-row";
import { COHORTS, yearLabel } from "@/lib/college/labels";
import { csrfFetch } from "@/lib/client-fetch";
import { inviteSentLine } from "@/lib/college/drive-invite-line";
import type { Audience } from "@/lib/college/drive-input";
import { MAX_IMPORT_BYTES, MAX_INVITES, inviteRowProblem, mergeInvites, parseInviteSheet, toApiRow, type InviteRow } from "@/lib/college/invite-import";
import { decodeRosterBytes } from "@/lib/college/roster";
import { cn } from "@/lib/utils";
import { PageHead, SURFACE_CLASS } from "@/components/app/primitives";
import { FileUpload } from "@/components/app/file-upload";
import { CollegeMark } from "@/components/employer/drive-parts";

import { ShareLink } from "./share-link";
import type { StudentRow } from "./types";
import { buttonClass } from "@/components/ui/button";
import { DmyDateInput } from "@/components/app/dmy-date-input";
import { todayIst } from "@/lib/offer";

export type DriveDraft = {
  id?: string;
  title: string;
  kind: "internship" | "full_time";
  /** Tech / Non-tech label. Left out, a saved drive keeps its own; a new drive must pick one. "any" reads "Not set". */
  audience?: Audience;
  description: string;
  startsAt: string;
  endsAt: string;
  minCgpa: string;
  minScore: string;
  years: number[];
  branches: string[];
  includeUserIds: string[];
  excludeUserIds: string[];
  /** Companies the officer invited: the drive page shows who came and who to chase. */
  invitedEmployers?: InvitedRow[];
};

/** name and phone are absent on rows saved before those fields existed; the server then keeps what it has. */
type InvitedRow = { company: string; email: string; name?: string; phone?: string };

const AUDIENCE_OPTIONS: { value: Exclude<Audience, "any">; label: string }[] = [
  { value: "tech", label: "Tech" },
  { value: "non_tech", label: "Non-tech" },
];

const field =
  "h-11 w-full rounded-apple-sm border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export function DriveBuilder({
  initial,
  students,
  branches,
  collegeId,
  collegeName,
  collegeLogoUrl,
  live = false,
  heading,
}: {
  initial: DriveDraft;
  students: StudentRow[];
  branches: string[];
  collegeId: string;
  collegeName: string;
  /** The college's logo (null: none yet). Leave it out to hide the logo block. */
  collegeLogoUrl?: string | null;
  /** The drive is open right now; edits reach employers immediately. */
  live?: boolean;
  /** The new-drive heading. Once the drive is created it becomes the drive's
      own, so "New drive" never sits over its edit form (QA-158). */
  heading?: { title: string; lede: string };
}) {
  const router = useRouter();
  const [d, setD] = useState<DriveDraft>(initial);
  const today = todayIst();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"in" | "out">("in");
  const [logoUrl, setLogoUrl] = useState<string | null>(collegeLogoUrl ?? null);
  const [audienceError, setAudienceError] = useState(false);
  const [rowErrors, setRowErrors] = useState(false);
  // A new drive shows every student unless the officer asks to narrow it; an existing drive opens with its rules visible.
  const [limit, setLimit] = useState(Boolean(initial.id) || Boolean(initial.minCgpa || initial.minScore || initial.years.length || initial.branches.length || initial.includeUserIds.length || initial.excludeUserIds.length));

  const set = <K extends keyof DriveDraft>(k: K, v: DriveDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  const rules = useMemo(() => {
    const eligibility: Record<string, unknown> = {};
    if (d.minCgpa.trim() !== "" && Number.isFinite(Number(d.minCgpa))) eligibility.minCgpa = Number(d.minCgpa);
    if (d.minScore.trim() !== "" && Number.isFinite(Number(d.minScore))) eligibility.minScore = Number(d.minScore);
    if (d.years.length) eligibility.years = d.years;
    if (d.branches.length) eligibility.branches = d.branches;
    return { collegeId, kind: d.kind, eligibility, includeUserIds: d.includeUserIds, excludeUserIds: d.excludeUserIds };
  }, [d, collegeId]);

  const split = useMemo(() => {
    const inside: StudentRow[] = [];
    const outside: StudentRow[] = [];
    for (const s of students) (isStudentEligible(s, rules) ? inside : outside).push(s);
    return { inside, outside };
  }, [students, rules]);

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
    setError(null);
    setSaved(null);
    // The server checks all of this again; these only say what is wrong before anything is sent.
    if (!d.id && (!d.audience || d.audience === "any")) {
      setAudienceError(true);
      setError("Pick Tech or Non-tech.");
      document.getElementById("audience-tech")?.focus();
      return;
    }
    const invited = (d.invitedEmployers ?? []).filter((r) => r.company.trim() || r.email.trim() || (r.name ?? "").trim() || (r.phone ?? "").trim());
    if (invited.some((r) => inviteRowProblem(asInviteRow(r)))) {
      setRowErrors(true);
      setError("Fix the employers marked below.");
      return;
    }
    setSaving(true);
    const payload = {
      title: d.title,
      kind: d.kind,
      ...(d.audience ? { audience: d.audience } : {}),
      description: d.description,
      startsAt: fromLocalInput(d.startsAt),
      endsAt: fromLocalInput(d.endsAt),
      eligibility: rules.eligibility,
      includeUserIds: d.includeUserIds,
      excludeUserIds: d.excludeUserIds,
      // Blank rows are dropped. A row saved before name and phone existed is sent as it is, so the server keeps its details.
      invitedEmployers: invited.map((r) => (r.name === undefined && r.phone === undefined ? { company: r.company.trim(), email: r.email.trim() } : toApiRow(asInviteRow(r)))),
    };
    const res = await csrfFetch(d.id ? `/api/college/drives/${d.id}` : "/api/college/drives", {
      method: d.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { id?: string; url?: string; error?: string; invites?: { sent: string[]; failed: string[]; limited: string[] } } | null;
    setSaving(false);
    if (!res?.ok) {
      setError(body?.error ?? "Couldn't save. Check your connection and try again.");
      return;
    }
    // "Invite sent to hr@acme.com": each newly invited company was emailed (and alerted in its app if it has an account).
    const inviteLine = body?.invites ? inviteSentLine(body.invites.sent, body.invites.failed, body.invites.limited) : null;
    if (!d.id && body?.id) {
      if (inviteLine) setSaved(inviteLine);
      setD((x) => ({ ...x, id: body.id }));
      setLink(body.url ? new URL(body.url, window.location.origin).href : null);
      // Update the address without remounting, so the one-time link stays on screen.
      window.history.replaceState(null, "", `/college/drives/${body.id}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSaved(inviteLine ? `Saved. ${inviteLine}` : "Saved. Employers see the change on their next refresh.");
    router.refresh();
  }

  return (
    <>
    {heading ? (
      link ? (
        <PageHead title={d.title || "Your drive"} lede="Drive created. Send employers the link; you can still change the details below." />
      ) : (
        <PageHead title={heading.title} lede={heading.lede} />
      )
    ) : null}
    <form onSubmit={save} className="space-y-6" noValidate>
      {link ? (
        <ShareLink url={link} collegeName={collegeName} driveTitle={d.title} startsAt={fromLocalInput(d.startsAt)} endsAt={fromLocalInput(d.endsAt)} kind={d.kind} />
      ) : null}

      <section className={SURFACE_CLASS}>
        <header className="border-b border-ink-100 px-5 py-4">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink-900">The drive</h2>
        </header>
        <div className="grid gap-5 px-5 py-5 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="text-sm font-medium text-ink-800">Name</span>
            <input className={cn(field, "mt-1.5")} value={d.title} onChange={(e) => set("title", e.target.value)} required maxLength={120} placeholder="e.g. Summer internship drive 2027" />
          </label>

          {/* Tech / Non-tech is a label for employers; it never changes which students they see (owner, 24 Nov). */}
          <fieldset className="md:col-span-2" aria-describedby="audience-hint">
            <legend className="text-sm font-medium text-ink-800">Who is it for</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[...AUDIENCE_OPTIONS, ...(initial.audience === "any" ? [{ value: "any" as const, label: "Not set" }] : [])].map((o) => {
                const on = (d.audience ?? "") === o.value;
                return (
                  <label
                    key={o.value}
                    className={cn(
                      "inline-flex min-h-11 cursor-pointer items-center rounded-apple-sm border px-3.5 text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/40",
                      on ? "border-brand-700 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-700 hover:bg-ink-50",
                    )}
                  >
                    <input
                      id={`audience-${o.value === "non_tech" ? "non-tech" : o.value}`}
                      type="radio"
                      name="audience"
                      value={o.value}
                      checked={on}
                      onChange={() => {
                        set("audience", o.value);
                        setAudienceError(false);
                      }}
                      className="sr-only"
                    />
                    {o.label}
                  </label>
                );
              })}
            </div>
            <span id="audience-hint" className={cn("mt-1 block text-xs", audienceError ? "font-medium text-danger" : "text-text-subtle")}>
              {audienceError ? "Pick Tech or Non-tech." : "Shown to employers. It doesn't change which students they see."}
            </span>
          </fieldset>

          {/* One kind of drive: inside it the employer picks Interns or Full-time (final year only). Owner, 23 Nov. */}
          <p className="text-sm text-text-subtle md:col-span-2">
            Employers hire interns and full-time from the same drive. Full-time offers go to final-year students only.
          </p>

          {/* No backdated drives (owner, 23 Nov): past days are greyed; a live drive being edited keeps its own start day. */}
          <IstDateTime label="Opens (IST)" value={d.startsAt} min={initial.startsAt && initial.startsAt.slice(0, 10) < today ? initial.startsAt.slice(0, 10) : today} onChange={(v) => set("startsAt", v)} field={field} />
          <IstDateTime label="Closes (IST)" value={d.endsAt} min={d.startsAt.slice(0, 10) > today ? d.startsAt.slice(0, 10) : today} onChange={(v) => set("endsAt", v)} field={field} />

          <label className="block md:col-span-2">
            <span className="text-sm font-medium text-ink-800">Note for employers <span className="font-normal text-text-subtle">(optional)</span></span>
            <textarea
              className="mt-1.5 min-h-24 w-full rounded-apple-sm border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={d.description}
              onChange={(e) => set("description", e.target.value)}
              maxLength={2000}
              placeholder="Batch, timings, who to contact at the placement cell"
            />
          </label>
        </div>
      </section>

      <InvitedEmployers value={d.invitedEmployers ?? []} onChange={(v) => set("invitedEmployers", v)} showErrors={rowErrors} />

      {limit ? (
      <section className={SURFACE_CLASS}>
        {live ? (
          <p role="note" className="border-b border-accent-300/60 bg-accent-100/60 px-5 py-3 text-sm text-accent-700">
            This drive is live. Tightening the rules removes students from employers&apos; lists, including anyone they shortlisted or are about to call.
          </p>
        ) : null}
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink-900">Who employers can see</h2>
            <p className="mt-0.5 text-sm text-text-subtle">Leave a box empty to not filter on it. You can hand-pick students either way below.</p>
          </div>
          <p className="text-right" aria-live="polite">
            <span className="nums text-3xl font-bold leading-none text-ink-900">{split.inside.length}</span>
            <span className="text-sm text-text-subtle"> of {students.length} students</span>
          </p>
        </header>
        <div className="grid gap-5 px-5 py-5 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-ink-800">Minimum CGPA</span>
            <input inputMode="decimal" className={cn(field, "mt-1.5")} value={d.minCgpa} onChange={(e) => set("minCgpa", e.target.value)} placeholder="Any" />
            <span className="mt-1 block text-xs text-text-subtle">Students who reported a percentage, not a CGPA, are left out unless you add them by hand.</span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink-800">Minimum Findtern score</span>
            <input inputMode="decimal" className={cn(field, "mt-1.5")} value={d.minScore} onChange={(e) => set("minScore", e.target.value)} placeholder="Any" />
            <span className="mt-1 block text-xs text-text-subtle">Out of 10, from the AI interview. No interview means no score.</span>
          </label>

          <fieldset>
            <legend className="text-sm font-medium text-ink-800">Year of study</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[1, ...COHORTS.map((c) => c.year), 5].map((y) => {
                const on = d.years.includes(y);
                return (
                  <button
                    key={y}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("years", on ? d.years.filter((v) => v !== y) : [...d.years, y].sort())}
                    className={cn("min-h-11 rounded-apple-sm border px-3.5 text-sm font-medium", on ? "border-brand-700 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-700 hover:bg-ink-50")}
                  >
                    {yearLabel(y)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-ink-800">Branch</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {branches.length === 0 ? <span className="text-sm text-text-subtle">No branches recorded yet.</span> : null}
              {branches.map((b) => {
                const on = d.branches.some((x) => x.toLowerCase() === b.toLowerCase());
                return (
                  <button
                    key={b}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("branches", on ? d.branches.filter((x) => x.toLowerCase() !== b.toLowerCase()) : [...d.branches, b])}
                    className={cn("min-h-11 rounded-apple-sm border px-3.5 text-sm font-medium", on ? "border-brand-700 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-700 hover:bg-ink-50")}
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
                  className={cn("min-h-11 rounded-apple-sm px-3.5 text-sm font-medium", view === v ? "bg-brand-950 text-white" : "text-ink-700 hover:bg-ink-100")}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="relative w-full sm:w-64">
              <span className="sr-only">Search students</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle" aria-hidden />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className={cn(field, "pl-9")} />
            </label>
          </div>
          <ul className="mt-3 max-h-[28rem] divide-y divide-ink-100 overflow-y-auto rounded-apple-sm border border-ink-100">
            {list.length === 0 ? <li className="px-4 py-8 text-center text-sm text-text-subtle">Nobody here.</li> : null}
            {list.map((s) => {
              const included = d.includeUserIds.includes(s.userId);
              const excluded = d.excludeUserIds.includes(s.userId);
              return (
                <li key={s.userId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">{s.name}</p>
                    <p className="nums text-xs text-text-subtle">
                      {[s.rollNo, yearLabel(s.year), s.branch, s.cgpa !== null ? `CGPA ${cgpaText(s.cgpa)}` : "CGPA —", s.score !== null ? `Score ${s.score.toFixed(1)}` : "No score"].filter(Boolean).join(" · ")}
                      {included ? <span className="ml-1.5 font-medium text-brand-800">· added by you</span> : null}
                      {excluded ? <span className="ml-1.5 font-medium text-accent-700">· removed by you</span> : null}
                    </p>
                  </div>
                  {view === "in" ? (
                    <button type="button" onClick={() => toggle(s.userId, included ? "rules" : "exclude")} className="min-h-11 rounded-apple-sm px-3 text-sm font-medium text-ink-700 hover:bg-ink-100">
                      {included ? "Undo add" : "Remove"}
                    </button>
                  ) : (
                    <button type="button" onClick={() => toggle(s.userId, excluded ? "rules" : "include")} className="min-h-11 rounded-apple-sm px-3 text-sm font-medium text-brand-700 hover:bg-brand-50">
                      {excluded ? "Undo remove" : "Add anyway"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </section>
      ) : (
        <section className={cn(SURFACE_CLASS, "flex flex-wrap items-center justify-between gap-4 px-5 py-4")}>
          <p className="min-w-0 text-sm text-ink-700">
            <span className="block text-[0.9375rem] font-semibold text-ink-900">
              Employers will see <span className="nums">{split.inside.length}</span> of your <span className="nums">{students.length}</span> students
            </span>
            Only your students, and only while the drive is open. You can limit it by CGPA, score, year or branch, or pick students by hand.
          </p>
          <button type="button" onClick={() => setLimit(true)} className={buttonClass({ variant: "outline", size: "sm" })}>
            Choose who is shown
          </button>
        </section>
      )}

      {collegeLogoUrl !== undefined ? (
        <section className={SURFACE_CLASS} aria-labelledby="college-logo">
          <header className="border-b border-ink-100 px-5 py-4">
            <h2 id="college-logo" className="text-lg font-semibold tracking-[-0.02em] text-ink-900">Your college logo</h2>
            <p className="mt-0.5 text-sm text-text-subtle">{logoUrl ? "Employers see this on the drive page, for all your drives." : "Not added yet. Employers will see it on the drive page, for all your drives."}</p>
          </header>
          <div className="flex flex-wrap items-center gap-4 px-5 py-4">
            <CollegeMark name={collegeName} logoUrl={logoUrl} className="size-16 rounded-xl" />
            <FileUpload kind="college_logo" accept="image/jpeg,image/png,image/webp" label="Logo" noun={logoUrl ? "new logo" : "logo"} hint="JPG, PNG or WebP, up to 5 MB." onUploaded={(r) => setLogoUrl(r.url)} />
          </div>
        </section>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="submit"
            disabled={saving}
            className={buttonClass({ className: "disabled:opacity-60" })}
          >
            {saving ? "Saving…" : d.id ? "Save changes" : "Create drive and get link"}
          </button>
          <p className="text-sm text-text-subtle">The link stops working when the drive ends.</p>
        </div>
        <p role="status" aria-live="polite" className={cn("text-sm", error ? "text-danger" : "text-brand-800")}>
          {error ?? saved}
        </p>
      </div>
    </form>
    </>
  );
}

/**
 * A date (DD/MM/YYYY, the product format) and a time, in IST. The browser's
 * datetime-local showed "10/28/2026, 09:54 AM" in an en-US browser (critique
 * P1). Reads and writes the same "YYYY-MM-DDTHH:mm" IST value as before.
 */
function IstDateTime({
  label,
  value,
  onChange,
  field,
  hint,
  min,
}: {
  label: string;
  value: string;
  /** Earliest day (YYYY-MM-DD) the picker offers. */
  min?: string;
  onChange: (value: string) => void;
  field: string;
  hint?: string;
}) {
  const date = value.slice(0, 10);
  const time = value.slice(11, 16) || "09:00";
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-medium text-ink-800">{label}</legend>
      <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
        <DmyDateInput
          aria-label={`${label}, date`}
          className={field}
          value={date}
          min={min}
          onChange={(iso) => onChange(iso ? `${iso}T${time}` : "")}
          required
        />
        <input
          type="time"
          aria-label={`${label}, time`}
          className={field}
          value={time}
          step={900}
          onChange={(e) => onChange(date ? `${date}T${e.target.value || "09:00"}` : "")}
          required
        />
      </div>
      {hint ? <span className="mt-1 block text-xs text-text-subtle">{hint}</span> : null}
    </fieldset>
  );
}

const asInviteRow = (r: InvitedRow): InviteRow => ({ company: r.company, email: r.email, name: r.name ?? "", phone: r.phone ?? "" });
const BLANK: InvitedRow = { company: "", email: "", name: "", phone: "" };
const isBlank = (r: InvitedRow) => !r.company.trim() && !r.email.trim() && !(r.name ?? "").trim() && !(r.phone ?? "").trim();

type ImportNote = { kind: "done" | "error"; text: string; skipped: string[] };

/**
 * The employers the officer is inviting, so the drive page can say who came and who to chase. Type them in, or import a
 * CSV; imported rows join the same list, where each one can be fixed or removed before saving.
 */
function InvitedEmployers({ value, onChange, showErrors }: { value: InvitedRow[]; onChange: (v: InvitedRow[]) => void; showErrors: boolean }) {
  const rows = value.length ? value : [BLANK];
  const [note, setNote] = useState<ImportNote | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const focusLast = useRef(false);
  const put = (i: number, k: "company" | "email" | "name" | "phone", v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  // "Add more" puts the cursor in the new row's first field.
  useEffect(() => {
    if (!focusLast.current) return;
    focusLast.current = false;
    list.current?.querySelector<HTMLInputElement>("li:last-child input")?.focus();
  }, [rows.length]);

  async function importFile(file: File) {
    setNote(null);
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) {
      setNote({ kind: "error", text: "Save your sheet as a CSV file and import that. Excel files (.xlsx) can't be read.", skipped: [] });
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setNote({ kind: "error", text: "That file is too big. Import a CSV with only your employers.", skipped: [] });
      return;
    }
    setBusy(true);
    try {
      const parsed = parseInviteSheet(decodeRosterBytes(new Uint8Array(await file.arrayBuffer())));
      if (parsed.rows.length === 0) {
        setNote({ kind: "error", text: parsed.errors[0] ?? "No employers found in that file.", skipped: parsed.errors.slice(1) });
        return;
      }
      const merged = mergeInvites(rows.filter((r) => !isBlank(r)).map((r) => ({ ...r, name: r.name ?? "", phone: r.phone ?? "" })), parsed.rows);
      onChange(merged.rows);
      const extra = [merged.duplicates ? `${merged.duplicates} already on your list` : null, merged.overflow ? `${merged.overflow} didn't fit (a drive takes at most ${MAX_INVITES})` : null].filter(Boolean);
      setNote({
        kind: "done",
        text: `Added ${merged.added} ${merged.added === 1 ? "employer" : "employers"} from ${file.name.slice(0, 60)}${extra.length ? `. ${extra.join("; ")}` : ""}.`,
        skipped: parsed.errors,
      });
    } catch {
      setNote({ kind: "error", text: "That file couldn't be read. Try saving it as CSV again.", skipped: [] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={SURFACE_CLASS} aria-labelledby="invited-companies">
      <header className="border-b border-ink-100 px-5 py-4">
        <h2 id="invited-companies" className="text-lg font-semibold tracking-[-0.02em] text-ink-900">
          Employers you are inviting <span className="text-sm font-normal text-text-subtle">(optional)</span>
        </h2>
        <p className="mt-0.5 text-sm text-text-subtle">Each new employer is emailed a link to join the drive, and gets an alert if it already has a Findtern account. The drive page shows who came in and who you still need to chase.</p>
      </header>
      <p role="note" className="border-b border-accent-300/60 bg-accent-100/60 px-5 py-3 text-sm text-accent-700">
        Ask each employer which email they will log in or sign up with, and add only that one. If they join with a different email, they can still come in, but you won&apos;t get insights for them.
      </p>

      <div className="space-y-3 px-5 py-4">
        <div aria-hidden className="hidden gap-2 text-xs font-medium text-text-subtle xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_5.5rem]">
          <span>Name</span>
          <span>Company name</span>
          <span>Email</span>
          <span>Phone</span>
          <span />
        </div>
        <ul ref={list} className="space-y-4 xl:space-y-2">
          {rows.map((r, i) => {
            const problem = showErrors && !isBlank(r) ? inviteRowProblem(asInviteRow(r)) : null;
            const bad = (f: string) => (problem?.field === f ? true : undefined);
            return (
              <li key={i} className="grid gap-2 rounded-apple-sm border border-ink-100 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_5.5rem] xl:border-0 xl:p-0">
                <label className="block">
                  <span className="text-sm font-medium text-ink-800 xl:sr-only">Name</span>
                  <input className={cn(field, "mt-1.5 xl:mt-0")} value={r.name ?? ""} maxLength={120} autoComplete="off" onChange={(e) => put(i, "name", e.target.value)} />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-ink-800 xl:sr-only">Company name</span>
                  <input className={cn(field, "mt-1.5 xl:mt-0")} value={r.company} maxLength={120} autoComplete="off" aria-invalid={bad("company")} aria-describedby={bad("company") ? `emp-err-${i}` : undefined} onChange={(e) => put(i, "company", e.target.value)} />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-ink-800 xl:sr-only">Email</span>
                  <input type="email" className={cn(field, "mt-1.5 xl:mt-0")} value={r.email} maxLength={200} autoComplete="off" aria-invalid={bad("email")} aria-describedby={bad("email") ? `emp-err-${i}` : undefined} onChange={(e) => put(i, "email", e.target.value)} />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-ink-800 xl:sr-only">Phone</span>
                  <input type="tel" inputMode="tel" className={cn(field, "mt-1.5 xl:mt-0")} value={r.phone ?? ""} maxLength={40} autoComplete="off" aria-invalid={bad("phone")} aria-describedby={bad("phone") ? `emp-err-${i}` : undefined} onChange={(e) => put(i, "phone", e.target.value)} />
                </label>
                <div className="flex items-end sm:col-span-2 xl:col-span-1">
                  <button
                    type="button"
                    onClick={() => onChange(rows.length > 1 ? rows.filter((_, j) => j !== i) : [])}
                    aria-label={`Remove employer ${i + 1}`}
                    className={buttonClass({ variant: "ghost", size: "sm", className: "h-11 text-ink-600" })}
                  >
                    Remove
                  </button>
                </div>
                {problem ? (
                  <p id={`emp-err-${i}`} role="alert" className="text-xs font-medium text-danger sm:col-span-2 xl:col-span-5">
                    {problem.message}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-3 border-t border-ink-100 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={rows.length >= MAX_INVITES}
            onClick={() => {
              focusLast.current = true;
              onChange([...rows, { ...BLANK }]);
            }}
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            Add more
          </button>
          <label
            className={buttonClass({
              variant: "outline",
              size: "sm",
              className: cn("cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600", busy && "pointer-events-none opacity-60"),
            })}
          >
            <FileUp className="size-4" aria-hidden />
            {busy ? "Reading…" : "Import file"}
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void importFile(f);
              }}
            />
          </label>
          <span className="text-xs text-text-subtle">CSV with the columns Name, Company name, Email, Phone.</span>
        </div>
        <div role="status" aria-live="polite">
          {note ? (
            <div className={cn("text-sm", note.kind === "error" ? "text-danger" : "text-ink-800")}>
              <p className="font-medium">{note.text}</p>
              {note.skipped.length ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-text-subtle">
                  {note.skipped.slice(0, 5).map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                  {note.skipped.length > 5 ? <li>and {note.skipped.length - 5} more</li> : null}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
