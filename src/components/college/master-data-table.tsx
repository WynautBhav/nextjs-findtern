"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Columns3, Download, Search, Trash2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { csrfFetch } from "@/lib/client-fetch";
import { ago } from "@/lib/college/labels";
import { HIGH_CGPA, STRONG_SCORE, quadrantOf, type Quadrant } from "@/lib/college/insights";
import { MASTER_COLUMNS, cellText, type ColumnGroup, type MasterColumn, type MasterRow } from "@/lib/college/master-row";
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
};
type SortState = { key: Key; dir: "asc" | "desc" };
type View = { id: string; name: string; columns: Key[]; filters: Filters; sort: SortState; own?: boolean };

const NO_FILTERS: Filters = { course: "", year: "", mode: "", laptop: "any", placement: "any", status: "any", minScore: "", minCgpa: "", quadrant: "" };
const BASE: Key[] = ["name", "degree", "branch", "year", "cgpa", "score", "offers", "hired", "ppo", "lastSeenAt"];
const SCORES: Key[] = ["name", "degree", "branch", "cgpa", "english", "coding", "aptitude", "aiInterview", "score", "offers"];

const PRESETS: View[] = [
  { id: "all", name: "All students", columns: BASE, filters: NO_FILTERS, sort: { key: "name", dir: "asc" } },
  { id: "overlooked", name: "Strong score, no offer", columns: [...SCORES, "workModes", "preferredLocations", "phone"], filters: { ...NO_FILTERS, minScore: String(STRONG_SCORE), placement: "none" }, sort: { key: "score", dir: "desc" } },
  { id: "most-offers", name: "Most offers", columns: ["name", "degree", "branch", "score", "offers", "hired", "ppo", "earningsMinor"], filters: { ...NO_FILTERS, placement: "offer" }, sort: { key: "offers", dir: "desc" } },
  { id: "score-beats-cg", name: "Score beats CGPA", columns: SCORES, filters: { ...NO_FILTERS, quadrant: "scoreBeatsCg" }, sort: { key: "score", dir: "desc" } },
  { id: "cg-beats-score", name: "CGPA beats score", columns: SCORES, filters: { ...NO_FILTERS, quadrant: "cgBeatsScore" }, sort: { key: "cgpa", dir: "desc" } },
  { id: "stars", name: "Strong on both", columns: SCORES, filters: { ...NO_FILTERS, quadrant: "stars" }, sort: { key: "score", dir: "desc" } },
  { id: "support", name: "Needs support", columns: SCORES, filters: { ...NO_FILTERS, quadrant: "support" }, sort: { key: "score", dir: "asc" } },
  { id: "placed", name: "Placed and PPO", columns: ["name", "degree", "branch", "year", "offers", "hired", "ppo", "earningsMinor"], filters: { ...NO_FILTERS, placement: "hired" }, sort: { key: "earningsMinor", dir: "desc" } },
  { id: "contact", name: "Contact sheet", columns: ["name", "rollNo", "phone", "email", "emergencyContact", "linkedin", "city"], filters: NO_FILTERS, sort: { key: "name", dir: "asc" } },
  { id: "work-prefs", name: "Work preferences", columns: ["name", "degree", "workModes", "preferredLocations", "laptop", "skills"], filters: NO_FILTERS, sort: { key: "name", dir: "asc" } },
  { id: "no-laptop", name: "No laptop", columns: ["name", "degree", "branch", "phone", "workModes", "laptop"], filters: { ...NO_FILTERS, laptop: "no" }, sort: { key: "name", dir: "asc" } },
];

const GROUPS: ColumnGroup[] = ["Student", "Course", "Preferences", "Scores", "Placement"];
const MODES = [["remote", "Remote"], ["hybrid", "Hybrid"], ["onsite", "Onsite"]] as const;
const col = (k: Key) => MASTER_COLUMNS.find((c) => c.key === k)!;
const numeric = (k: Key) => ["number", "score", "money"].includes(col(k).kind);

function sortValue(r: MasterRow, k: Key): string | number | null {
  if (k === "report") return r.hasReport ? 1 : 0;
  if (k === "recording") return r.hasRecording ? 1 : 0;
  if (k === "lastSeenAt") return r.lastSeenAt ? Date.parse(r.lastSeenAt) : null;
  const v = r[k as keyof MasterRow];
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (Array.isArray(v)) return v.length ? v.join(", ").toLowerCase() : null;
  return typeof v === "string" ? v.toLowerCase() : v;
}

function matches(r: MasterRow, f: Filters, q: string): boolean {
  if (f.course && (r.degree ?? "Course not set") !== f.course) return false;
  if (f.year && String(r.year ?? "") !== f.year) return false;
  if (f.mode && !r.workModes.includes(f.mode)) return false;
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
  if (q) {
    const hay = [r.name, r.email, r.rollNo, r.branch, r.degree, r.city, ...r.skills, ...r.preferredLocations].join(" ").toLowerCase();
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
        {!r.verified ? <span className="ml-1.5 rounded bg-accent-100 px-1.5 py-0.5 text-[11px] font-medium text-accent-700">Not verified</span> : null}
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

export function MasterDataTable({ rows, collegeId, now, initial }: { rows: MasterRow[]; collegeId: string; now: number; initial: { view?: string; course?: string; mode?: string } }) {
  const start = PRESETS.find((p) => p.id === initial.view) ?? PRESETS[0];
  const [viewId, setViewId] = useState(start.id);
  const [columns, setColumns] = useState<Key[]>(start.columns);
  const [filters, setFilters] = useState<Filters>({ ...start.filters, ...(initial.course ? { course: initial.course } : {}), ...(initial.mode ? { mode: initial.mode } : {}) });
  const [sort, setSort] = useState<SortState>(start.sort);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [saving, setSaving] = useState(false);
  const [viewName, setViewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
      const name = (allViews.find((v) => v.id === viewId)?.name ?? "master data").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      a.href = url;
      a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
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
  const shown = visible.slice(0, limit);

  return (
    <div className="space-y-4">
      {/* Views: ready-made first, then the officer's own. */}
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Views">
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

      <section className="apple-admin rounded-apple-xl border border-ink-200/80 bg-card" aria-label="Master data table">
        {/* Toolbar: search and filters on the left, columns, save and download on the right. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 p-4">
          <label className="relative min-w-[14rem] flex-1 sm:max-w-xs">
            <span className="sr-only">Search students</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" aria-hidden />
            <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Name, roll no., skill or city" className={cn(select, "w-full pl-9")} />
          </label>
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
          <select aria-label="Course" value={filters.course} onChange={(e) => set("course", e.target.value)} className={select}>
            <option value="">All courses</option>
            {courses.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select aria-label="Current year" value={filters.year} onChange={(e) => set("year", e.target.value)} className={select}>
            <option value="">All years</option>
            {years.map((y) => <option key={y} value={String(y)}>Year {y}</option>)}
          </select>
          <select aria-label="Placement" value={filters.placement} onChange={(e) => set("placement", e.target.value as Placement)} className={select}>
            <option value="any">Any placement</option>
            <option value="offer">Has an offer</option>
            <option value="none">No offer yet</option>
            <option value="hired">Hired</option>
            <option value="ppo">PPO offer</option>
          </select>
          <select aria-label="Work preference" value={filters.mode} onChange={(e) => set("mode", e.target.value)} className={select}>
            <option value="">Any work mode</option>
            {MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select aria-label="Laptop" value={filters.laptop} onChange={(e) => set("laptop", e.target.value as Filters["laptop"])} className={select}>
            <option value="any">Laptop: any</option>
            <option value="yes">Has a laptop</option>
            <option value="no">No laptop</option>
          </select>
          <select aria-label="Minimum Findtern score" value={filters.minScore} onChange={(e) => set("minScore", e.target.value)} className={select}>
            <option value="">Any score</option>
            {[5, 6, 7, 8, 9].map((v) => <option key={v} value={String(v)}>Score {v}+</option>)}
          </select>
          <select aria-label="Minimum CGPA" value={filters.minCgpa} onChange={(e) => set("minCgpa", e.target.value)} className={select}>
            <option value="">Any CGPA</option>
            {[6, 7, HIGH_CGPA, 8, 9].map((v) => <option key={v} value={String(v)}>CGPA {v}+</option>)}
          </select>
          <select aria-label="Verification" value={filters.status} onChange={(e) => set("status", e.target.value as Filters["status"])} className={select}>
            <option value="any">Verified and not</option>
            <option value="verified">Verified only</option>
            <option value="unverified">Not verified</option>
          </select>
          {activeFilters ? (
            <button type="button" onClick={() => { setFilters(NO_FILTERS); setLimit(PAGE); }} className="min-h-9 rounded-md px-2 font-medium text-brand-700 hover:underline focus-visible:ring-2 focus-visible:ring-brand-500">
              Clear {activeFilters === 1 ? "filter" : `${activeFilters} filters`}
            </button>
          ) : null}
          <p className="nums ml-auto shrink-0 whitespace-nowrap text-ink-600" aria-live="polite">
            <span className="font-medium text-ink-900">{visible.length.toLocaleString("en-IN")}</span> of {rows.length.toLocaleString("en-IN")} students
          </p>
        </div>
        {msg ? <p className="border-b border-ink-100 px-4 py-2 text-sm text-ink-700" role="status">{msg}</p> : null}

        <div className="max-h-[70vh] overflow-auto">
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
              <button type="button" onClick={() => { setFilters(NO_FILTERS); setQ(""); }} className="font-medium text-brand-700 hover:underline">Clear filters and search</button>
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
        Students you have not verified show only their name, email, year and course. Saved views stay in this browser. Every download is recorded.
      </p>
    </div>
  );
}
