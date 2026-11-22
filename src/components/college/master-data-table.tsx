"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Columns3, Download, Search, Trash2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { csrfFetch } from "@/lib/client-fetch";
import { ago } from "@/lib/college/labels";
import { HIGH_CGPA, STRONG_SCORE, quadrantOf, type Quadrant } from "@/lib/college/insights";
import { COFFEE, MARKS, coffeeOf, marksOf, type CoffeeKey, type MarksKey } from "@/lib/college/overview-modes";
import { MASTER_COLUMNS, OUTCOMES, cellText, matchesOutcome, matchesWorkMode, type ColumnGroup, type Outcome, type MasterColumn, type MasterRow } from "@/lib/college/master-row";
import { ONLINE_WINDOW_MS } from "@/lib/college/constants";
import { cn } from "@/lib/utils";

/**
 * Master data: every field on the placement office's list, as a table the officer shapes into views (columns,
 * filters, sort) and downloads. Ready-made views answer the questions Insights asks; the officer's own views are
 * kept in this browser. The download is built on the server from the same rows (api/college/students/export).
 */

type Key = MasterColumn["key"];
type Placement = "any" | "offer" | "none" | "hired" | "ppo";
type Filters = {
  course: string;
  year: string;
  mode: string;
  laptop: "any" | "yes" | "no";
  placement: Placement;
  status: "any" | "verified" | "unverified";
  minScore: string;
  minCgpa: string;
  quadrant: Quadrant | "";
  /** Findtern band: "done" is any band (AI interview done), "none" is not interviewed yet. */
  band: CoffeeKey | "done" | "none" | "";
  /** CGPA / % band (marks out of 10). */
  marks: MarksKey | "";
  /** Offers and meetings: the students behind a Placement analysis block. Missing in views saved before it existed. */
  outcome?: Outcome;
};
type SortState = { key: Key; dir: "asc" | "desc" };
type View = { id: string; name: string; columns: Key[]; filters: Filters; sort: SortState; own?: boolean };

const NO_FILTERS: Filters = { course: "", year: "", mode: "", laptop: "any", placement: "any", status: "any", minScore: "", minCgpa: "", quadrant: "", band: "", marks: "", outcome: "" };
const BASE: Key[] = ["name", "degree", "branch", "year", "cgpa", "score", "offers", "hired", "ppo", "lastSeenAt"];
const SCORES: Key[] = ["name", "degree", "branch", "cgpa", "english", "coding", "aptitude", "aiInterview", "score", "offers"];

const PRESETS: View[] = [
  { id: "all", name: "All students", columns: BASE, filters: NO_FILTERS, sort: { key: "name", dir: "asc" } },
  { id: "overlooked", name: "Strong score, no offer", columns: [...SCORES, "workMode", "preferredLocations", "phone"], filters: { ...NO_FILTERS, minScore: String(STRONG_SCORE), placement: "none" }, sort: { key: "score", dir: "desc" } },
  { id: "most-offers", name: "Most offers", columns: ["name", "degree", "branch", "score", "offers", "hired", "ppo", "earningsMinor"], filters: { ...NO_FILTERS, placement: "offer" }, sort: { key: "offers", dir: "desc" } },
  { id: "score-beats-cg", name: "Score beats CGPA", columns: SCORES, filters: { ...NO_FILTERS, quadrant: "scoreBeatsCg" }, sort: { key: "score", dir: "desc" } },
  { id: "cg-beats-score", name: "CGPA beats score", columns: SCORES, filters: { ...NO_FILTERS, quadrant: "cgBeatsScore" }, sort: { key: "cgpa", dir: "desc" } },
  { id: "stars", name: "Strong on both", columns: SCORES, filters: { ...NO_FILTERS, quadrant: "stars" }, sort: { key: "score", dir: "desc" } },
  { id: "support", name: "Needs support", columns: SCORES, filters: { ...NO_FILTERS, quadrant: "support" }, sort: { key: "score", dir: "asc" } },
  { id: "placed", name: "Placed and PPO", columns: ["name", "degree", "branch", "year", "offers", "hired", "ppo", "earningsMinor"], filters: { ...NO_FILTERS, placement: "hired" }, sort: { key: "earningsMinor", dir: "desc" } },
  { id: "contact", name: "Contact sheet", columns: ["name", "phone", "email", "emergencyContact", "linkedin", "city"], filters: NO_FILTERS, sort: { key: "name", dir: "asc" } },
  { id: "work-prefs", name: "Work preferences", columns: ["name", "degree", "workMode", "preferredLocations", "laptop", "skills"], filters: NO_FILTERS, sort: { key: "name", dir: "asc" } },
  { id: "no-laptop", name: "No laptop", columns: ["name", "degree", "branch", "phone", "workMode", "laptop"], filters: { ...NO_FILTERS, laptop: "no" }, sort: { key: "name", dir: "asc" } },
];

const GROUPS: ColumnGroup[] = ["Student", "Course", "Preferences", "Scores", "Placement"];
/** The filter's options, worded as the rule: each takes in the modes before it. */
const MODES = [["remote", "Remote only"], ["hybrid", "Remote + Hybrid"], ["onsite", "Remote + Hybrid + Onsite"]] as const;
const col = (k: Key) => MASTER_COLUMNS.find((c) => c.key === k)!;
const numeric = (k: Key) => ["number", "score", "money"].includes(col(k).kind);

function sortValue(r: MasterRow, k: Key): string | number | null {
  if (k === "report") return r.hasReport ? 1 : 0;
  if (k === "recording") return r.hasRecording ? 1 : 0;
  if (k === "lastSeenAt") return r.lastSeenAt ? Date.parse(r.lastSeenAt) : null;
  if (k === "meetingsDone") return r.verified ? r.meetings.done : null;
  if (k === "meetingsNotAccepted") return r.verified ? r.meetings.notAccepted : null;
  const v = r[k as keyof MasterRow];
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (Array.isArray(v)) return v.length ? v.join(", ").toLowerCase() : null;
  return typeof v === "string" ? v.toLowerCase() : typeof v === "number" ? v : null;
}

function matches(r: MasterRow, f: Filters, q: string): boolean {
  if (f.course && (r.degree ?? "Course not set") !== f.course) return false;
  if (f.year && String(r.year ?? "") !== f.year) return false;
  if (!matchesWorkMode(r.workMode, f.mode)) return false;
  if (f.laptop !== "any" && r.laptop !== (f.laptop === "yes")) return false;
  if (f.status === "verified" && !r.verified) return false;
  if (f.status === "unverified" && r.verified) return false;
  if (f.placement === "offer" && r.offers === 0) return false;
  if (f.placement === "none" && (!r.verified || r.offers > 0)) return false;
  if (f.placement === "hired" && !r.hired) return false;
  if (f.placement === "ppo" && !r.ppo) return false;
  if (f.minScore && (r.score === null || r.score < Number(f.minScore))) return false;
  if (f.minCgpa && (r.cgpa === null || r.cgpa < Number(f.minCgpa))) return false;
  if (f.quadrant && quadrantOf(r) !== f.quadrant) return false;
  if (f.band === "done" && r.score === null) return false;
  if (f.band === "none" && r.score !== null) return false;
  if (f.band && f.band !== "done" && f.band !== "none" && (r.score === null || coffeeOf(r.score) !== f.band)) return false;
  if (f.marks && (r.marks10 === null || marksOf(r.marks10) !== f.marks)) return false;
  if (f.outcome && !matchesOutcome(r, f.outcome)) return false;
  if (q) {
    const hay = [r.name, r.email, r.branch, r.degree, r.city, ...r.skills, ...r.preferredLocations].join(" ").toLowerCase();
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

const storeKey = (collegeId: string) => `findtern:college-views:${collegeId}`;
const VIEWS_EVENT = "findtern:college-views";
/** Saved views change in this tab (VIEWS_EVENT) or another one (storage). */
function subscribeViews(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(VIEWS_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(VIEWS_EVENT, cb);
  };
}
function readViews(collegeId: string): string {
  try { return localStorage.getItem(storeKey(collegeId)) ?? "[]"; } catch { return "[]"; }
}
const PAGE = 100;

function Cell({ r, k, now }: { r: MasterRow; k: Key; now: number }) {
  const c = col(k);
  if (k === "name") {
    return (
      <Link href={`/college/students/${r.userId}`} className="font-medium text-brand-700 hover:underline">
        {r.name}
        {!r.verified ? <span className="ml-1.5 rounded bg-accent-100 px-1.5 py-0.5 text-[11px] font-medium text-accent-700">Waiting for approval</span> : null}
      </Link>
    );
  }
  if (k === "report" || k === "recording") {
    const has = k === "report" ? r.hasReport : r.hasRecording;
    return has ? <a href={`/api/college/students/${r.userId}/${k}`} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">Open</a> : <span className="text-ink-400">-</span>;
  }
  if (k === "linkedin") return r.linkedin ? <a href={r.linkedin} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">Profile</a> : <span className="text-ink-400">-</span>;
  if (k === "lastSeenAt") {
    if (!r.lastSeenAt) return <span className="text-ink-400">-</span>;
    const online = now - Date.parse(r.lastSeenAt) < ONLINE_WINDOW_MS;
    return online ? <span className="font-medium text-[var(--color-positive,#247b50)]">Online</span> : <span className="text-ink-700">{ago(r.lastSeenAt, now)}</span>;
  }
  if (k === "earningsMinor") return r.verified ? <span className="text-ink-900">₹{Math.round(r.earningsMinor / 100).toLocaleString("en-IN")}</span> : <span className="text-ink-400">-</span>;
  const text = cellText(r, k);
  if (!text) return <span className="text-ink-400">-</span>;
  if (c.kind === "bool") return <span className={text === "Yes" ? "font-medium text-ink-900" : "text-ink-500"}>{text}</span>;
  if (c.kind === "list") return <span className="block max-w-[16rem] truncate text-ink-700" title={text}>{text}</span>;
  return <span className={numeric(k) ? "text-ink-900" : "text-ink-700"}>{text}</span>;
}

/**
 * A minimum out of 10: the usual cut-offs, or "Custom…" for any value the officer types (one decimal, 0 to 10).
 * The typed value filters as soon as it is a valid number; a blank or invalid entry filters nothing.
 */
function MinimumPicker({ label, any, presets, value, onChange, className }: { label: string; any: string; presets: number[]; value: string; onChange: (v: string) => void; className: string }) {
  const isPreset = value === "" || presets.some((p) => String(p) === value);
  const [custom, setCustom] = useState(!isPreset);
  const [draft, setDraft] = useState(isPreset ? "" : value);
  const commit = (raw: string) => {
    setDraft(raw);
    const n = Number(raw);
    onChange(raw.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 10 ? String(Math.round(n * 10) / 10) : "");
  };
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <select
        aria-label={`Minimum ${label}`}
        value={custom ? "custom" : value}
        onChange={(e) => {
          if (e.target.value === "custom") {
            setCustom(true);
            commit(draft);
          } else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
        className={className}
      >
        <option value="">{any}</option>
        {presets.map((p) => <option key={p} value={String(p)}>{label} {p}+</option>)}
        <option value="custom">Custom…</option>
      </select>
      {custom ? (
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={10}
          step={0.1}
          value={draft}
          onChange={(e) => commit(e.target.value)}
          aria-label={`Minimum ${label}, 0 to 10`}
          placeholder="0-10"
          autoFocus
          className={cn(className, "w-20")}
        />
      ) : null}
    </span>
  );
}

export function MasterDataTable({ rows, collegeId, now, initial, downloadName, embedded = false }: { rows: MasterRow[]; collegeId: string; now: number; initial: { view?: string; course?: string; mode?: string; year?: string; band?: string; marks?: string; status?: string; placement?: string; outcome?: string }; /** File name for downloads before a view is picked (the Overview pop-up passes what was clicked). */ downloadName?: string; /** Inside the Overview pop-up: no views row, and the table fills the height and scrolls on its own. */ embedded?: boolean }) {
  const start = PRESETS.find((p) => p.id === initial.view) ?? PRESETS[0];
  const [viewId, setViewId] = useState(start.id);
  // A meetings drill-down from the Overview shows the meeting counts, so each row says why it is in the list.
  const [columns, setColumns] = useState<Key[]>(() =>
    /^(met|meet-|not-accepted)/.test(initial.outcome ?? "") ? ["name", "degree", "branch", "year", "meetingsDone", "meetingsNotAccepted", "score", "offers", "hired", "lastSeenAt"] : start.columns,
  );
  // Filters can arrive in the link (from the Overview and Insights): only known values are taken.
  const [filters, setFilters] = useState<Filters>(() => {
    const f: Filters = { ...start.filters };
    if (initial.course) f.course = initial.course;
    if (initial.mode && MODES.some(([v]) => v === initial.mode)) f.mode = initial.mode;
    if (initial.year && /^\d{1,2}$/.test(initial.year)) f.year = initial.year;
    if (initial.band === "done" || initial.band === "none" || COFFEE.some((c) => c.key === initial.band)) f.band = initial.band as Filters["band"];
    if (MARKS.some((m) => m.key === initial.marks)) f.marks = initial.marks as MarksKey;
    if (initial.status === "verified" || initial.status === "unverified") f.status = initial.status;
    if (initial.placement === "offer" || initial.placement === "none" || initial.placement === "hired" || initial.placement === "ppo") f.placement = initial.placement;
    if (OUTCOMES.some((o) => o.key === initial.outcome)) f.outcome = initial.outcome as Outcome;
    return f;
  });
  const [sort, setSort] = useState<SortState>(start.sort);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [saving, setSaving] = useState(false);
  const [viewName, setViewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Bumped when a view is applied or filters are cleared, so the custom score and CGPA boxes start over.
  const [resetKey, setResetKey] = useState(0);

  // Own views live in this browser only (no student data in them: just columns, filters and sort).
  const raw = useSyncExternalStore(subscribeViews, () => readViews(collegeId), () => "[]");
  const own = useMemo<View[]>(() => {
    try {
      const saved = JSON.parse(raw) as View[];
      return Array.isArray(saved) ? saved.filter((v) => v && typeof v.name === "string" && Array.isArray(v.columns)).map((v) => ({ ...v, own: true })) : [];
    } catch {
      return [];
    }
  }, [raw]);
  const persist = (next: View[]) => {
    try { localStorage.setItem(storeKey(collegeId), JSON.stringify(next)); } catch { /* private mode */ }
    window.dispatchEvent(new Event(VIEWS_EVENT));
  };

  const courses = useMemo(() => [...new Set(rows.map((r) => r.degree ?? "Course not set"))].sort(), [rows]);
  const years = useMemo(() => [...new Set(rows.map((r) => r.year).filter((y): y is number => y !== null))].sort(), [rows]);

  const visible = useMemo(() => {
    const words = q.trim().toLowerCase();
    const out = rows.filter((r) => matches(r, filters, words));
    const dir = sort.dir === "asc" ? 1 : -1;
    return out.sort((a, b) => {
      const x = sortValue(a, sort.key), y = sortValue(b, sort.key);
      // Missing values always sink to the bottom, whichever way the column is sorted.
      if (x === null && y === null) return a.name.localeCompare(b.name);
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * dir || a.name.localeCompare(b.name);
    });
  }, [rows, filters, q, sort]);

  const allViews = [...PRESETS, ...own];
  const apply = (v: View) => {
    setViewId(v.id);
    setColumns(v.columns.filter((k) => MASTER_COLUMNS.some((c) => c.key === k)));
    setFilters({ ...NO_FILTERS, ...v.filters });
    setSort(v.sort);
    setLimit(PAGE);
    setMsg(null);
    setResetKey((k) => k + 1);
  };
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => { setFilters((f) => ({ ...f, [k]: v })); setLimit(PAGE); };
  const activeFilters = (Object.keys(NO_FILTERS) as (keyof Filters)[]).filter((k) => filters[k] !== NO_FILTERS[k]).length;
  const toggleSort = (k: Key) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: numeric(k) ? "desc" : "asc" }));
  const toggleCol = (k: Key) => setColumns((cs) => (cs.includes(k) ? (cs.length > 1 ? cs.filter((c) => c !== k) : cs) : MASTER_COLUMNS.map((c) => c.key).filter((c) => cs.includes(c) || c === k)));

  async function download() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await csrfFetch("/api/college/students/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columns, userIds: visible.map((r) => r.userId) }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg(j?.error ?? "Download failed. Try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const name = ((viewId === "all" && downloadName) || allViews.find((v) => v.id === viewId)?.name || "master data").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      a.href = url;
      a.download = `${name}-${new Date().toLocaleDateString("en-CA")}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg(`Downloaded ${visible.length} ${visible.length === 1 ? "student" : "students"}.`);
    } catch {
      setMsg("Download failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function saveView() {
    const name = viewName.trim().slice(0, 40);
    if (!name) return;
    const v: View = { id: `own-${Date.now()}`, name, columns, filters, sort, own: true };
    persist([...own.filter((o) => o.name.toLowerCase() !== name.toLowerCase()), v]);
    setViewId(v.id);
    setSaving(false);
    setViewName("");
    setMsg(`Saved "${name}" in this browser.`);
  }

  const select = "h-9 rounded-lg border border-ink-300 bg-card px-2.5 text-sm text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-500";
  /** A set filter is tinted, so the officer sees at a glance which of the twelve are narrowing the list. */
  const on = (active: boolean) => (active ? cn(select, "border-brand-600 bg-brand-50 font-medium text-brand-900") : select);
  const shown = visible.slice(0, limit);

  return (
    <div className={embedded ? "flex h-full min-h-0 flex-col gap-3" : "space-y-4"}>
      {/* Views: ready-made first, then the officer's own. Not in the Overview pop-up, which is already one view. */}
      <div hidden={embedded} className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Views">
        {allViews.map((v) => (
          <span key={v.id} className="flex shrink-0 items-center">
            <button
              type="button"
              role="tab"
              aria-selected={viewId === v.id}
              onClick={() => apply(v)}
              className={cn(
                "inline-flex min-h-9 items-center whitespace-nowrap rounded-full px-3.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                viewId === v.id ? "bg-brand-700 text-white" : "bg-brand-50 text-brand-800 hover:bg-brand-100",
              )}
            >
              {v.name}
            </button>
            {v.own ? (
              <button type="button" onClick={() => { persist(own.filter((o) => o.id !== v.id)); if (viewId === v.id) apply(PRESETS[0]); }} className="ml-0.5 grid size-8 place-items-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={`Delete view ${v.name}`}>
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </span>
        ))}
      </div>

      <section className={cn("apple-admin rounded-apple-xl border border-ink-200/80 bg-card", embedded && "flex min-h-0 flex-1 flex-col overflow-hidden")} aria-label="Master data table">
        {/* Toolbar: search and filters on the left, columns, save and download on the right. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 p-4">
          <label className="relative min-w-[14rem] flex-1 sm:max-w-xs">
            <span className="sr-only">Search students</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" aria-hidden />
            <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Name, skill or city" className={cn(select, "w-full pl-9")} />
          </label>
          <p className="nums shrink-0 whitespace-nowrap px-1 text-sm text-ink-600" aria-live="polite">
            <span className="font-medium text-ink-900">{visible.length.toLocaleString("en-IN")}</span> of {rows.length.toLocaleString("en-IN")} students
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <button type="button" className={buttonClass({ variant: "outline", size: "sm" }) + " disabled:opacity-50"}><Columns3 className="size-4" aria-hidden />Columns <span className="nums text-ink-500">{columns.length}</span></button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[22rem] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Columns</SheetTitle>
                  <SheetDescription>Pick what this view shows and downloads.</SheetDescription>
                </SheetHeader>
                <div className="space-y-5 px-4 pb-6">
                  {GROUPS.map((g) => (
                    <fieldset key={g}>
                      <legend className="text-sm font-medium text-ink-900">{g}</legend>
                      <div className="mt-2 grid grid-cols-1 gap-0.5">
                        {MASTER_COLUMNS.filter((c) => c.group === g).map((c) => (
                          <label key={c.key} className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm text-ink-700 hover:bg-ink-50">
                            <input type="checkbox" checked={columns.includes(c.key)} onChange={() => toggleCol(c.key)} className="size-4 accent-[var(--color-brand-700)]" />
                            {c.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
            {saving ? (
              <form onSubmit={(e) => { e.preventDefault(); saveView(); }} className="flex items-center gap-1.5">
                <label className="sr-only" htmlFor="view-name">View name</label>
                <input id="view-name" autoFocus value={viewName} maxLength={40} onChange={(e) => setViewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setSaving(false); }} placeholder="Name this view" className={cn(select, "w-40")} />
                <button className={buttonClass({ variant: "outline", size: "sm" }) + " disabled:opacity-50"} type="submit" disabled={!viewName.trim()}>Save</button>
              </form>
            ) : (
              <button type="button" className={buttonClass({ variant: "outline", size: "sm" }) + " disabled:opacity-50"} onClick={() => setSaving(true)}>Save view</button>
            )}
            <button type="button" className={buttonClass({ size: "sm" }) + " disabled:opacity-50"} onClick={download} disabled={busy || !visible.length}>
              <Download className="size-4" aria-hidden />
              {busy ? "Preparing…" : "Download CSV"}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto border-b border-ink-100 px-4 py-3 text-sm sm:flex-wrap [&>select]:shrink-0">
          <select aria-label="Course" value={filters.course} onChange={(e) => set("course", e.target.value)} className={on(!!(filters.course))}>
            <option value="">All courses</option>
            {courses.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select aria-label="Current year" value={filters.year} onChange={(e) => set("year", e.target.value)} className={on(!!(filters.year))}>
            <option value="">All years</option>
            {years.map((y) => <option key={y} value={String(y)}>Year {y}</option>)}
          </select>
          <select aria-label="Placement" value={filters.placement} onChange={(e) => set("placement", e.target.value as Placement)} className={on(!!(filters.placement !== "any"))}>
            <option value="any">Any placement</option>
            <option value="offer">Has an offer</option>
            <option value="none">No offer yet</option>
            <option value="hired">Hired</option>
            <option value="ppo">PPO offer</option>
          </select>
          <select aria-label="Offers and meetings" value={filters.outcome ?? ""} onChange={(e) => set("outcome", e.target.value as Outcome)} className={on(!!(filters.outcome))}>
            <option value="">Offers and meetings</option>
            {OUTCOMES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <select aria-label="Findtern band" value={filters.band} onChange={(e) => set("band", e.target.value as Filters["band"])} className={on(!!(filters.band))}>
            <option value="">Findtern band</option>
            <option value="done">AI interview done</option>
            <option value="none">Not interviewed yet</option>
            {COFFEE.map((c) => <option key={c.key} value={c.key}>{c.name} ({c.range})</option>)}
          </select>
          <select aria-label="CGPA / % band" value={filters.marks} onChange={(e) => set("marks", e.target.value as Filters["marks"])} className={on(!!(filters.marks))}>
            <option value="">CGPA / % band</option>
            {MARKS.map((m) => <option key={m.key} value={m.key}>{m.name} ({m.range})</option>)}
          </select>
          <select aria-label="Work mode preference" value={filters.mode} onChange={(e) => set("mode", e.target.value)} className={on(!!(filters.mode))}>
            <option value="">Work mode preference</option>
            {MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select aria-label="Laptop" value={filters.laptop} onChange={(e) => set("laptop", e.target.value as Filters["laptop"])} className={on(!!(filters.laptop !== "any"))}>
            <option value="any">Laptop: any</option>
            <option value="yes">Has a laptop</option>
            <option value="no">No laptop</option>
          </select>
          <MinimumPicker key={`score-${resetKey}`} label="Findtern score" any="Findtern score" presets={[5, 6, STRONG_SCORE, 8, 9]} value={filters.minScore} onChange={(v) => set("minScore", v)} className={on(!!filters.minScore)} />
          <MinimumPicker key={`cgpa-${resetKey}`} label="CGPA" any="Any CGPA" presets={[6, 7, HIGH_CGPA, 8, 9]} value={filters.minCgpa} onChange={(v) => set("minCgpa", v)} className={on(!!filters.minCgpa)} />
          <select aria-label="Approval" value={filters.status} onChange={(e) => set("status", e.target.value as Filters["status"])} className={on(!!(filters.status !== "any"))}>
            <option value="any">Accepted and waiting</option>
            <option value="verified">Accepted by you</option>
            <option value="unverified">Waiting for your approval</option>
          </select>
          {activeFilters ? (
            <button type="button" onClick={() => { setFilters(NO_FILTERS); setLimit(PAGE); setResetKey((k) => k + 1); }} className="min-h-9 shrink-0 whitespace-nowrap rounded-md px-2 font-medium text-brand-700 hover:underline focus-visible:ring-2 focus-visible:ring-brand-500">
              Clear {activeFilters === 1 ? "filter" : `${activeFilters} filters`}
            </button>
          ) : null}
        </div>
        {msg ? <p className="border-b border-ink-100 px-4 py-2 text-sm text-ink-700" role="status">{msg}</p> : null}

        <div className={embedded ? "min-h-0 flex-1 overflow-auto" : "max-h-[70vh] overflow-auto"}>
          <table className="nums w-full min-w-max border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {columns.map((k, i) => {
                  const on = sort.key === k;
                  return (
                    <th
                      key={k}
                      scope="col"
                      aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                      className={cn("sticky top-0 z-10 border-b border-ink-200 bg-card px-4 py-2.5 text-xs font-normal text-ink-500", numeric(k) ? "text-right" : "text-left", i === 0 && "left-0 z-20")}
                    >
                      <button type="button" onClick={() => toggleSort(k)} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded outline-none hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500", on && "font-medium text-ink-900")}>
                        {col(k).label}
                        {on ? (sort.dir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />) : null}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.userId} className="group">
                  {columns.map((k, i) => (
                    <td key={k} className={cn("whitespace-nowrap border-b border-ink-100 px-4 py-2.5 group-hover:bg-ink-50", numeric(k) ? "text-right" : "text-left", i === 0 && "sticky left-0 z-[1] bg-card")}>
                      <Cell r={r} k={k} now={now} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length ? (
            <div className="px-4 py-10 text-center text-sm text-ink-600">
              No students match.{" "}
              <button type="button" onClick={() => { setFilters(NO_FILTERS); setQ(""); setResetKey((k) => k + 1); }} className="font-medium text-brand-700 hover:underline">Clear filters and search</button>
            </div>
          ) : null}
        </div>
        {visible.length > limit ? (
          <div className="flex items-center justify-between border-t border-ink-100 px-4 py-3 text-sm text-ink-600">
            <span className="nums">Showing 1-{limit} of {visible.length.toLocaleString("en-IN")}. The download has all {visible.length.toLocaleString("en-IN")}.</span>
            <button type="button" className={buttonClass({ variant: "outline", size: "sm" }) + " disabled:opacity-50"} onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, visible.length - limit)} more</button>
          </div>
        ) : null}
      </section>
      <p className="text-xs text-ink-500">
        Students waiting for your approval show only their name, email, year and course. Saved views stay in this browser. Every download is recorded.
      </p>
    </div>
  );
}
