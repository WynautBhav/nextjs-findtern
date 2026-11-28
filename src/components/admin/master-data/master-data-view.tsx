"use client";

import { ArrowDown, ArrowUp, Columns3, Download, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AdminAvatar } from "@/components/admin/avatar";
import { buttonClass } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { csrfFetch } from "@/lib/client-fetch";
import { useConfirm } from "@/components/app/use-confirm";
import type { CallNo } from "@/lib/admin/follow-ups";
import {
  COLLEGE_COLUMNS,
  COLLEGE_FILTERS,
  EMPLOYER_COLUMNS,
  EMPLOYER_FILTERS,
  KPIS,
  STUDENT_COLUMNS,
  STUDENT_FILTERS,
  TAB_TARGET,
  VIEWS,
  applyFilters,
  rowsCsv,
  searchText,
  sortRows,
  type AnyRow,
  type CollegeRow,
  type ColumnDef,
  type EmployerRow,
  type FilterDef,
  type Filters,
  type StudentRow,
  type TabKey,
} from "@/lib/admin/master-data-pure";
import { ago } from "@/lib/college/labels";
import { istStamp } from "@/lib/college/master-row";
import { cn } from "@/lib/utils";

import { FollowUpMarks } from "./follow-up-marks";
import { HeatMark } from "./heat-mark";
import { RecordDrawer, type DrawerRecord } from "./record-drawer";

/**
 * Master data: one tab of records as a table the admin shapes (preset views, column picker, filters, sort, search) and
 * downloads exactly as shown. The KPI cards are filter sets counted by the same applyFilters the table uses. Follow-up
 * status changes inline; the drawer holds the note, nudges and history.
 */

type Def = { cols: ColumnDef<AnyRow>[]; filters: FilterDef<AnyRow>[]; hay: (r: AnyRow) => (string | null)[]; one: string; many: string };
const DEFS = {
  students: { cols: STUDENT_COLUMNS, filters: STUDENT_FILTERS, hay: searchText.students, one: "student", many: "students" },
  employers: { cols: EMPLOYER_COLUMNS, filters: EMPLOYER_FILTERS, hay: searchText.employers, one: "employer", many: "employers" },
  colleges: { cols: COLLEGE_COLUMNS, filters: COLLEGE_FILTERS, hay: searchText.colleges, one: "college", many: "colleges" },
} as unknown as Record<TabKey, Def>;

const PAGE = 50;
const fmt = (n: number) => n.toLocaleString("en-IN");
const SELECT = "h-9 shrink-0 rounded-full border border-ink-200 bg-[color:var(--admin-panel)] px-3 text-sm text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";
const SELECT_ON = "border-brand-600 bg-brand-50 font-medium text-brand-900";
const RULE = "border-[color:var(--admin-rule)]";

function titleOf(tab: TabKey, r: AnyRow): { title: string; sub: string } {
  if (tab === "students") { const s = r as StudentRow; return { title: s.name, sub: s.email ?? s.phone ?? "" }; }
  if (tab === "employers") { const e = r as EmployerRow; return { title: e.company || "Unnamed company", sub: [e.contact, e.email].filter(Boolean).join(" · ") }; }
  const c = r as CollegeRow;
  return { title: c.name, sub: [c.city, c.partner ? "Partner" : "Not a partner"].filter(Boolean).join(" · ") };
}

export function MasterDataView({
  tab,
  rows,
  now,
  canWrite,
  canNudge,
  hrefBase,
}: {
  tab: TabKey;
  rows: AnyRow[];
  now: number;
  canWrite: boolean;
  canNudge: boolean;
  /** The record page for a row ("/admin/interns"), or null when this admin may not open it. */
  hrefBase: string | null;
}) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const def = DEFS[tab];
  const views = VIEWS[tab];
  const colOf = (k: string) => def.cols.find((c) => c.key === k);
  const [viewId, setViewId] = useState(views[0].id);
  const [columns, setColumns] = useState<string[]>(views[0].columns);
  const [filters, setFilters] = useState<Filters>(views[0].filters);
  const [sort, setSort] = useState(views[0].sort);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<DrawerRecord | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const shownCols = useMemo(() => columns.map((k) => def.cols.find((c) => c.key === k)).filter((c): c is ColumnDef<AnyRow> => !!c), [columns, def]);
  const visible = useMemo(() => {
    const list = applyFilters(rows, def.filters, filters, q, def.hay);
    const col = def.cols.find((c) => c.key === sort.key) ?? def.cols[0];
    return sortRows(list, col, sort.dir, def.cols[0]);
  }, [rows, def, filters, q, sort]);
  const kpis = useMemo(() => KPIS.map((k) => ({ ...k, n: applyFilters(rows, def.filters, k.filters).length })), [rows, def]);

  const applyView = (id: string) => {
    const v = views.find((x) => x.id === id) ?? views[0];
    setViewId(v.id);
    setColumns(v.columns);
    setFilters(v.filters);
    setSort(v.sort);
    setLimit(PAGE);
  };
  const setFilter = (key: string, value: string) => { setFilters((f) => ({ ...f, [key]: value })); setLimit(PAGE); };
  const activeFilters = def.filters.filter((d) => filters[d.key]).length;
  const kpiOn = (f: Filters) => {
    const keys = def.filters.map((d) => d.key);
    return keys.every((k) => (f[k] ?? "") === (filters[k] ?? ""));
  };
  const toggleSort = (k: string) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: colOf(k)?.kind === "number" || k === "heat" ? "desc" : "asc" }));
  const toggleCol = (k: string) => setColumns((cs) => (cs.includes(k) ? (cs.length > 1 ? cs.filter((c) => c !== k) : cs) : def.cols.map((c) => c.key).filter((c) => cs.includes(c) || c === k)));
  const groups = [...new Set(def.cols.map((c) => c.group))];

  function download() {
    const blob = new Blob([rowsCsv(visible, shownCols)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const view = views.find((v) => v.id === viewId)?.name ?? "master data";
    a.download = `${tab}-${view}`.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + `-${new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMsg({ text: `Downloaded ${fmt(visible.length)} ${visible.length === 1 ? def.one : def.many}, ${shownCols.length} columns.`, bad: false });
  }

  async function setCall(r: AnyRow, call: CallNo, done: boolean) {
    const who = titleOf(tab, r).title;
    if (!done && !(await ask({ title: `Undo Call ${call} for ${who}?`, body: "The tick is removed. The history keeps both steps.", confirmLabel: `Undo Call ${call}`, destructive: false }))) return;
    setSaving(r.id);
    setMsg(null);
    try {
      const res = await csrfFetch("/api/admin/follow-ups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType: TAB_TARGET[tab], targetId: r.id, call, done }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg({ text: j.error ?? "Not saved. Try again.", bad: true });
      setMsg({ text: `${who}: Call ${call} ${done ? "marked done" : "undone"}.`, bad: false });
      router.refresh();
    } catch {
      setMsg({ text: "Network problem. Nothing was saved.", bad: true });
    } finally {
      setSaving(null);
    }
  }

  function cell(r: AnyRow, c: ColumnDef<AnyRow>) {
    if (c.key === "name" || c.key === "company") {
      const t = titleOf(tab, r);
      return (
        <div className="flex min-w-0 items-center gap-3">
          <AdminAvatar name={t.title} id={r.id} size="sm" className="max-sm:hidden" />
          <button type="button" onClick={() => setOpen({ row: r, ...t, href: hrefBase ? `${hrefBase}/${r.id}` : null })} className="min-w-0 max-w-[9.5rem] rounded-sm text-left sm:max-w-[13rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <span className="block truncate font-medium text-foreground hover:underline">{t.title}</span>
            <span className="block truncate text-[0.8125rem] text-text-subtle">{t.sub}</span>
          </button>
        </div>
      );
    }
    if (c.key === "heat") return <HeatMark heat={r.heat} id={r.id} />;
    if (c.key === "followUp") return <FollowUpMarks f={r.followUp} canWrite={canWrite} busy={saving === r.id} onToggle={(n, d) => void setCall(r, n, d)} name={titleOf(tab, r).title} />;
    if (c.key === "lastSeenAt" && tab === "students") {
      const s = r as StudentRow;
      if (s.activityHidden) return <span className="text-text-subtle">Hidden</span>;
      if (s.online) return <span className="font-medium text-success">Online</span>;
      return s.lastSeenAt ? <span title={istStamp(s.lastSeenAt)}>{ago(s.lastSeenAt, now)}</span> : <span className="text-text-subtle">Never</span>;
    }
    const text = c.text(r);
    if (!text) return <span className="text-text-subtle">-</span>;
    if (c.kind === "date") {
      const at = c.sort(r);
      return <span title={text}>{typeof at === "number" ? ago(new Date(at).toISOString(), now) : text}</span>;
    }
    if (c.key === "followUpNote") return <span className="block max-w-[18rem] truncate" title={text}>{text}</span>;
    return <span className={cn(c.kind === "number" ? "text-foreground" : "text-foreground/90")}>{text}</span>;
  }

  const shown = visible.slice(0, limit);
  return (
    <div className="space-y-5">
      {dialog}
      {/* KPI cards: each is a filter; its number is that filter's row count. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpis.map((k) => {
          const on = kpiOn(k.filters) && !q;
          return (
            <button
              key={k.key}
              type="button"
              aria-pressed={on}
              onClick={() => { setFilters(k.filters); setLimit(PAGE); }}
              className={cn(
                "group min-w-0 rounded-[var(--radius-admin-card)] border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-[var(--admin-pad-panel)]",
                on ? "border-transparent bg-[color:var(--admin-tile)] text-[color:var(--admin-tile-ink)]" : "border-[color:var(--admin-panel-edge)] bg-[color:var(--admin-panel)] shadow-[var(--admin-shadow)] hover:bg-[color:var(--admin-panel-2)]",
              )}
            >
              <span className={cn("flex items-center gap-2 text-sm font-medium", on ? "" : "text-text-subtle")}>
                {k.tone && !on ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent-500" /> : null}
                {k.label}
              </span>
              <span className="nums mt-2 block text-[1.75rem] font-semibold leading-none tracking-[-0.03em] sm:text-[2.25rem]">{fmt(k.n)}</span>
              <span className={cn("mt-2 truncate text-sm max-sm:hidden sm:block", on ? "" : "text-text-subtle")}>{k.hint}</span>
            </button>
          );
        })}
      </div>

      {/* Preset views. */}
      <div role="group" aria-label="Views" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={viewId === v.id}
            onClick={() => applyView(v.id)}
            className={cn(
              "inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11",
              viewId === v.id ? "bg-[color:var(--admin-tile)] text-[color:var(--admin-tile-ink)]" : "bg-[color:var(--admin-panel)] text-foreground hover:bg-[color:var(--admin-panel-2)]",
            )}
          >
            {v.name}
          </button>
        ))}
      </div>

      <section aria-label={`${def.many} table`} className="apple-admin overflow-hidden rounded-[var(--radius-admin-card)] border border-[color:var(--admin-panel-edge)] bg-[color:var(--admin-panel)] shadow-[var(--admin-shadow)]">
        <div className={cn("flex flex-wrap items-center gap-2 border-b p-4", RULE)}>
          <label className="relative min-w-0 flex-1 basis-56 sm:max-w-sm">
            <span className="sr-only">Search {def.many}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle" aria-hidden />
            <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder={tab === "colleges" ? "Name, city or TPO" : "Name, email, phone or city"} className={cn(SELECT, "w-full rounded-full bg-[color:var(--admin-panel-2)] pl-9")} />
          </label>
          <p className="nums shrink-0 whitespace-nowrap px-1 text-sm text-text-subtle" aria-live="polite">
            <span className="font-semibold text-foreground">{fmt(visible.length)}</span> of {fmt(rows.length)} {rows.length === 1 ? def.one : def.many}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <button type="button" className={buttonClass({ variant: "outline", size: "sm" }) + " rounded-full"}>
                  <Columns3 className="size-4" aria-hidden />Columns <span className="nums text-text-subtle">{columns.length}</span>
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[22rem] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Columns</SheetTitle>
                  <SheetDescription>Pick what the table shows and the CSV holds.</SheetDescription>
                </SheetHeader>
                <div className="space-y-5 px-4 pb-6">
                  {groups.map((g) => (
                    <fieldset key={g}>
                      <legend className="text-sm font-medium text-foreground">{g}</legend>
                      <div className="mt-2 grid gap-0.5">
                        {def.cols.filter((c) => c.group === g).map((c) => (
                          <label key={c.key} className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm text-foreground hover:bg-[color:var(--admin-panel-2)]">
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
            <button type="button" onClick={download} disabled={!visible.length} className={buttonClass({ size: "sm" }) + " rounded-full disabled:opacity-50"}>
              <Download className="size-4" aria-hidden />CSV
            </button>
          </div>
        </div>

        <div className={cn("flex items-center gap-2 overflow-x-auto border-b px-4 py-3 sm:flex-wrap", RULE)} role="group" aria-label="Filters">
          {def.filters.map((d) => {
            const v = filters[d.key] ?? "";
            return (
              <select key={d.key} aria-label={d.label} value={v} onChange={(e) => setFilter(d.key, e.target.value)} className={cn(SELECT, "max-w-[16rem] pr-8 [field-sizing:content]", v && SELECT_ON)}>
                <option value="">{d.label}: any</option>
                {d.options(rows).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            );
          })}
          {activeFilters || q ? (
            <button type="button" onClick={() => { setFilters({}); setQ(""); setLimit(PAGE); }} className="min-h-9 shrink-0 whitespace-nowrap rounded-md px-2 text-sm font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
              Clear {activeFilters === 1 && !q ? "filter" : "all"}
            </button>
          ) : null}
        </div>
        {msg ? <p role={msg.bad ? "alert" : "status"} className={cn("border-b px-4 py-2 text-sm", RULE, msg.bad ? "text-[color:var(--color-danger)]" : "text-foreground")}>{msg.text}</p> : null}

        <div className="max-h-[70vh] overflow-auto overscroll-x-contain" tabIndex={0} role="region" aria-label={`${def.many}, scrolls sideways`}>
          <table className="nums w-full min-w-max border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {shownCols.map((c, i) => {
                  const on = sort.key === c.key;
                  return (
                    <th key={c.key} scope="col" aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("sticky top-0 z-10 border-b bg-[color:var(--admin-panel)] px-3 py-2.5 first:pl-4 text-[0.8125rem] font-medium text-text-subtle", RULE, c.kind === "number" ? "text-right" : "text-left", i === 0 && "left-0 z-20")}>
                      <button type="button" onClick={() => toggleSort(c.key)} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring", on && "text-foreground")}>
                        {c.label}
                        {on ? (sort.dir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />) : null}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="group">
                  {shownCols.map((c, i) => (
                    <td key={c.key} className={cn("whitespace-nowrap border-b px-3 py-2.5 first:pl-4 group-hover:bg-[color:var(--admin-panel-2)]", RULE, c.kind === "number" ? "text-right" : "text-left", i === 0 && "sticky left-0 z-[1] bg-[color:var(--admin-panel)]")}>
                      {cell(r, c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length ? (
            <div className="px-4 py-12 text-center text-sm text-text-subtle">
              {rows.length ? <>No {def.many} match. <button type="button" onClick={() => { setFilters({}); setQ(""); }} className="font-medium text-brand-700 hover:underline">Clear filters and search</button></> : `No ${def.many} yet.`}
            </div>
          ) : null}
        </div>
        {visible.length > limit ? (
          <div className={cn("flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-text-subtle", RULE)}>
            <span className="nums">Showing 1-{fmt(limit)} of {fmt(visible.length)}. The CSV has all {fmt(visible.length)}.</span>
            <button type="button" className={buttonClass({ variant: "outline", size: "sm" }) + " rounded-full"} onClick={() => setLimit((l) => l + PAGE)}>Show {fmt(Math.min(PAGE, visible.length - limit))} more</button>
          </div>
        ) : null}
      </section>

      <RecordDrawer tab={tab} record={open ? { ...open, row: rows.find((r) => r.id === open.row.id) ?? open.row } : null} columns={def.cols} canWrite={canWrite} canNudge={canNudge && tab !== "colleges"} onClose={() => setOpen(null)} />
    </div>
  );
}
