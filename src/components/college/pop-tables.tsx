"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Columns3, Download, ListFilter, Search } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { downloadCsv } from "@/lib/admin/csv";
import type { BoardItem } from "@/lib/college/drive-board";
import { yearLabel } from "@/lib/college/labels";
import { COFFEE, coffeeOf } from "@/lib/college/overview-modes";
import {
  EMPLOYER_COLUMNS,
  NO_EMPLOYER_FILTERS,
  NO_STUDENT_FILTERS,
  STUDENT_COLUMNS,
  csvColumnsFor,
  employerFiltersActive,
  employerStatusText,
  filterEmployers,
  filterStudents,
  nextSort,
  slugify,
  sortRows,
  studentFiltersActive,
  toStudentTableRow,
  type ColumnDef,
  type EmployerColKey,
  type EmployerFilters,
  type EmployerTableRow,
  type PersonInfo,
  type SortState,
  type StudentColKey,
  type StudentFilters,
  type StudentTableRow,
} from "@/lib/college/pop-table";
import type { EmployerRow } from "@/lib/college/drive-employers";
import { shortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { duration } from "./drive-summary";

/**
 * The one table every figure's pop-up on a finished drive opens: students (all lists, the company pop-up's tabs) or
 * companies. Columns can be shown and hidden, rows filtered and sorted, and what is on screen downloads as CSV.
 * College-facing only; nothing here is used on an employer page.
 */

const n = (v: number) => v.toLocaleString("en-IN");
const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`;
const when = (d: Date) => shortDateTime(d, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const field = "h-9 min-w-0 rounded-md border border-ink-200 bg-white px-2.5 text-sm text-ink-900 outline-none focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40 touch:h-11";
const Dash = () => <span className="text-ink-400">—</span>;
const orDash = (v: string | null | undefined) => (v && v.trim() ? v : <Dash />);

/* ---------- the shared frame: toolbar, header, scrolling body ---------- */

function PopTable<R, K extends string>({
  cols,
  all,
  shown,
  noun,
  nouns,
  download,
  defaults,
  search,
  filters,
  active,
  onClear,
  rowKey,
  cell,
}: {
  cols: ColumnDef<R, K>[];
  all: R[];
  /** The rows after the filters, before the sort. */
  shown: R[];
  noun: string;
  nouns: string;
  /** The download's name, without the date or extension. */
  download: string;
  /** Columns on when the pop-up opens. */
  defaults: K[];
  search: React.ReactNode;
  filters: React.ReactNode;
  active: boolean;
  onClear: () => void;
  rowKey: (r: R) => string;
  cell: (key: K, r: R) => React.ReactNode;
}) {
  const [visible, setVisible] = useState<Set<K>>(() => new Set(defaults));
  const [sort, setSort] = useState<SortState<K>>(null);
  // Phones: the filters fold behind one button so the list starts on the first screen.
  const [showFilters, setShowFilters] = useState(false);
  const shownCols = cols.filter((c) => visible.has(c.key));
  const rows = useMemo(() => sortRows(shown, cols, sort), [shown, cols, sort]);
  const first = cols[0].key;

  return (
    <>
      <div className="shrink-0 space-y-3 border-b border-ink-200/70 bg-white px-5 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {search}
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(buttonClass({ variant: "outline", size: "sm" }), "outline-none focus-visible:ring-2 focus-visible:ring-brand-500")}>
              <Columns3 className="size-4" aria-hidden />
              Columns <span className="nums text-ink-500">{shownCols.length}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[min(26rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              {cols.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={visible.has(c.key)}
                  disabled={c.key === first || c.locked}
                  // Keep the menu open so several columns can be switched in one go.
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(on) => {
                    // A hidden column no longer sorts the rows (or the CSV) without showing it.
                    if (!on) setSort((s) => (s?.key === c.key ? null : s));
                    setVisible((v) => {
                      const next = new Set(v);
                      if (on) next.add(c.key);
                      else next.delete(c.key);
                      return next;
                    });
                  }}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            aria-expanded={showFilters}
            onClick={() => setShowFilters((v) => !v)}
            className={cn(buttonClass({ variant: "outline", size: "sm" }), "outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:hidden", active && "border-brand-300 text-brand-800")}
          >
            <ListFilter className="size-4" aria-hidden />
            Filters{active ? " on" : ""}
          </button>
          <button
            type="button"
            disabled={!rows.length}
            onClick={() => downloadCsv(download, rows, csvColumnsFor(cols, visible))}
            className={cn(buttonClass({ variant: "outline", size: "sm" }), "outline-none focus-visible:ring-2 focus-visible:ring-brand-500")}
          >
            <Download className="size-4" aria-hidden />
            Download CSV
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className={cn("contents", !showFilters && "max-sm:hidden")}>{filters}</div>
          <p aria-live="polite" className="nums ml-auto text-sm text-text-subtle">
            {n(rows.length)} of {plural(all.length, noun, nouns)}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-white">
        {!all.length ? (
          <p className="px-5 py-8 text-sm text-text-subtle">Nobody here.</p>
        ) : !rows.length ? (
          <div className="flex flex-col items-start gap-3 px-5 py-8 sm:px-6">
            <p className="text-sm text-ink-700">No {nouns} match these filters</p>
            {active ? (
              <button type="button" onClick={onClear} className={cn(buttonClass({ variant: "outline", size: "sm" }), "outline-none focus-visible:ring-2 focus-visible:ring-brand-500")}>
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {shownCols.map((c) => {
                  const on = sort?.key === c.key;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={on ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                      className={cn(
                        "sticky top-0 z-10 whitespace-nowrap border-b border-ink-200 bg-white p-0 text-xs font-normal text-ink-500",
                        c.key === first && "left-0 z-20",
                        c.highlight && "bg-brand-50 font-medium text-brand-800",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSort((s) => nextSort(s, c.key))}
                        className={cn(
                          "flex min-h-10 w-full items-center gap-1 px-3 py-2 outline-none hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500",
                          c.numeric ? "justify-end text-right" : "text-left",
                          c.key === first && "pl-5 sm:pl-6",
                          on && "text-ink-900",
                        )}
                      >
                        {c.label}
                        {on ? sort!.dir === "asc" ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden /> : null}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${rowKey(r)}-${i}`} className="group">
                  {shownCols.map((c, ci) => (
                    <td
                      key={c.key}
                      className={cn(
                        "max-w-[22rem] truncate whitespace-nowrap border-b border-ink-100 px-3 py-2.5 text-ink-700 group-hover:bg-ink-50",
                        c.numeric && "nums text-right",
                        c.key === first && "sticky left-0 z-[1] bg-white pl-5 sm:pl-6",
                        c.highlight && "bg-brand-50/70 font-medium text-ink-900 group-hover:bg-brand-50",
                        ci === shownCols.length - 1 && "pr-5 sm:pr-6",
                      )}
                    >
                      {cell(c.key, r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function SearchBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="relative min-w-[12rem] flex-1">
      <span className="sr-only">{label}</span>
      <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} className={cn(field, "w-full pl-8")} />
    </label>
  );
}

function Pick({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(field, "max-w-[14rem]", value && "border-brand-300 bg-brand-50")}>
        {children}
      </select>
    </label>
  );
}

const sortedUnique = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

/* ---------- students ---------- */

const STUDENT_DEFAULTS = STUDENT_COLUMNS.filter((c) => c.main).map((c) => c.key);
const bandOf = (score: number) => {
  const key = coffeeOf(score);
  return { key, name: COFFEE.find((c) => c.key === key)!.name };
};

/** Every student pop-up: the rows of one list, joined to what is known about each student. */
export function StudentTable({ rows, people, title, driveTitle }: { rows: BoardItem[]; people: Record<string, PersonInfo>; title: string; driveTitle: string }) {
  const all = useMemo(() => rows.map((r) => toStudentTableRow(r, people[r.userId], bandOf)), [rows, people]);
  const [f, setF] = useState<StudentFilters>(NO_STUDENT_FILTERS);
  const set = <K extends keyof StudentFilters>(k: K, v: StudentFilters[K]) => setF((x) => ({ ...x, [k]: v }));
  const shown = useMemo(() => filterStudents(all, f), [all, f]);
  const branches = useMemo(() => sortedUnique(all.map((r) => r.branch).filter((b): b is string => Boolean(b))), [all]);
  const years = useMemo(() => [...new Set(all.map((r) => r.year).filter((y): y is number => y !== null))].sort((a, b) => a - b), [all]);
  const companies = useMemo(() => sortedUnique(all.flatMap((r) => r.companies)), [all]);
  // A list with no detail text at all (the whole drive) does not open with an empty column.
  const defaults = STUDENT_DEFAULTS;

  return (
    <PopTable<StudentTableRow, StudentColKey>
      cols={STUDENT_COLUMNS}
      all={all}
      shown={shown}
      noun="student"
      nouns="students"
      download={slugify(title, driveTitle)}
      defaults={defaults}
      search={<SearchBox value={f.q} onChange={(v) => set("q", v)} label="Search name, phone or email" />}
      filters={
        <>
          <Pick label="Open to work" value={f.open} onChange={(v) => set("open", v as StudentFilters["open"])}>
            <option value="">Open to work: any</option>
            <option value="yes">Open to work</option>
            <option value="no">Not open to work</option>
          </Pick>
          <Pick label="Branch" value={f.branch} onChange={(v) => set("branch", v)}>
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Pick>
          <Pick label="Year" value={f.year} onChange={(v) => set("year", v)}>
            <option value="">All years</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {yearLabel(y)}
              </option>
            ))}
          </Pick>
          <Pick label="Score band" value={f.band} onChange={(v) => set("band", v)}>
            <option value="">All score bands</option>
            {COFFEE.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name} · {c.range}
              </option>
            ))}
            <option value="none">Not interviewed</option>
          </Pick>
          <Pick label="Company" value={f.company} onChange={(v) => set("company", v)}>
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Pick>
          <Pick label="Offer type" value={f.type} onChange={(v) => set("type", v as StudentFilters["type"])}>
            <option value="">Offer type: any</option>
            <option value="full">Full-time / PPO</option>
            <option value="intern">Internship</option>
          </Pick>
          <Pick label="Hired" value={f.hired} onChange={(v) => set("hired", v as StudentFilters["hired"])}>
            <option value="">Hired: any</option>
            <option value="yes">Hired</option>
            <option value="no">Not hired</option>
          </Pick>
        </>
      }
      active={studentFiltersActive(f)}
      onClear={() => setF(NO_STUDENT_FILTERS)}
      rowKey={(r) => r.userId}
      cell={(key, r) => studentCell(key, r)}
    />
  );
}

function studentCell(key: StudentColKey, r: StudentTableRow): React.ReactNode {
  switch (key) {
    case "name":
      return (
        <Link href={`/college/students/${r.userId}`} className="rounded-sm font-medium text-ink-900 outline-none hover:text-brand-700 hover:underline focus-visible:ring-2 focus-visible:ring-brand-500">
          {r.name || "Student"}
        </Link>
      );
    case "year":
      return r.year ? yearLabel(r.year) : <Dash />;
    case "branch":
      return orDash(r.branch);
    case "phone":
      return r.phone ? (
        <a href={`tel:${r.phone.replace(/\s+/g, "")}`} className="nums rounded-sm outline-none hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500">
          {r.phone}
        </a>
      ) : (
        <Dash />
      );
    case "email":
      return r.email ? (
        <a href={`mailto:${r.email}`} className="rounded-sm outline-none hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500">
          {r.email}
        </a>
      ) : (
        <Dash />
      );
    case "cgpa":
      return r.cgpa === null ? <Dash /> : r.cgpa.toFixed(2);
    case "score":
      return r.score === null ? <Dash /> : r.score.toFixed(1);
    case "band":
      return orDash(r.bandName);
    case "offerType":
      return orDash(r.offerType);
    case "openToWork":
      return r.openToWork !== false ? "Yes" : <span className="text-text-subtle">No</span>;
    case "minutes":
      return r.minutes === null ? <Dash /> : duration(r.minutes);
    case "detail":
      return r.detail ? <span title={r.detail}>{r.detail}</span> : <Dash />;
    case "companies":
      return r.companies.length ? <span title={r.companies.join(", ")}>{r.companies.join(", ")}</span> : <Dash />;
    case "offers":
      return r.offers === 0 ? <span className="text-text-subtle">0</span> : n(r.offers);
    case "hired":
      return r.hired ? <span className="font-medium text-ink-900">Yes</span> : <span className="text-text-subtle">No</span>;
  }
}

/* ---------- companies ---------- */

const EMPLOYER_DEFAULTS = EMPLOYER_COLUMNS.filter((c) => c.main).map((c) => c.key);

/** "Companies in the drive": who came, who was invited and did not, and what each did. A name opens that company. */
export function EmployerTable({
  rows,
  minutes,
  tracked,
  title,
  driveTitle,
  onOpen,
}: {
  rows: EmployerRow[];
  minutes: Map<string, number>;
  tracked: boolean;
  title: string;
  driveTitle: string;
  onOpen: (employerId: string) => void;
}) {
  const all = useMemo<EmployerTableRow[]>(() => rows.map((r) => ({ ...r, minutes: tracked && r.employerId ? (minutes.get(r.employerId) ?? null) : null })), [rows, minutes, tracked]);
  const [f, setF] = useState<EmployerFilters>(NO_EMPLOYER_FILTERS);
  const set = <K extends keyof EmployerFilters>(k: K, v: EmployerFilters[K]) => setF((x) => ({ ...x, [k]: v }));
  const shown = useMemo(() => filterEmployers(all, f), [all, f]);

  return (
    <PopTable<EmployerTableRow, EmployerColKey>
      cols={EMPLOYER_COLUMNS}
      all={all}
      shown={shown}
      noun="company"
      nouns="companies"
      download={slugify(title, driveTitle)}
      defaults={EMPLOYER_DEFAULTS}
      search={<SearchBox value={f.q} onChange={(v) => set("q", v)} label="Search company, contact, phone or email" />}
      filters={
        <>
          <Pick label="Came or didn't come" value={f.came} onChange={(v) => set("came", v as EmployerFilters["came"])}>
            <option value="">Came or didn&apos;t come</option>
            <option value="came">Came</option>
            <option value="didnt">Didn&apos;t come</option>
          </Pick>
          <Pick label="Invited" value={f.invited} onChange={(v) => set("invited", v as EmployerFilters["invited"])}>
            <option value="">Invited: any</option>
            <option value="yes">Invited</option>
            <option value="no">Not invited</option>
          </Pick>
        </>
      }
      active={employerFiltersActive(f)}
      onClear={() => setF(NO_EMPLOYER_FILTERS)}
      rowKey={(r) => r.key}
      cell={(key, r) => employerCell(key, r, onOpen)}
    />
  );
}

function employerCell(key: EmployerColKey, r: EmployerTableRow, onOpen: (id: string) => void): React.ReactNode {
  const came = r.employerId !== null;
  switch (key) {
    case "company":
      return came ? (
        <button type="button" onClick={() => onOpen(r.employerId!)} className="rounded-sm text-left font-medium text-ink-900 outline-none hover:text-brand-700 hover:underline focus-visible:ring-2 focus-visible:ring-brand-500">
          {r.company}
        </button>
      ) : (
        <span className="font-medium text-ink-900">{r.company}</span>
      );
    case "contact":
      return orDash(r.contact);
    case "phone":
      return r.phone ? (
        <a href={`tel:${r.phone.replace(/\s+/g, "")}`} className="nums rounded-sm outline-none hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500">
          {r.phone}
        </a>
      ) : (
        <Dash />
      );
    case "email":
      return r.email ? (
        <a href={`mailto:${r.email}`} className="rounded-sm outline-none hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500">
          {r.email}
        </a>
      ) : (
        <Dash />
      );
    case "invited":
      return r.invited ? "Yes" : <span className="text-text-subtle">No</span>;
    case "came":
      return came ? (r.status.kind === "withdrawn" ? <span className="text-accent-700">Withdrawn</span> : employerStatusText(r)) : <span className="text-warning">Didn&apos;t come</span>;
    case "joinedAt":
      return r.joinedAt ? <span className="nums">{when(r.joinedAt)}</span> : <Dash />;
    case "minutes":
      return r.minutes === null ? <Dash /> : duration(r.minutes);
    case "meetings":
      return came ? count(r.meetings) : <Dash />;
    case "offers":
      return came ? count(r.offers) : <Dash />;
    case "hires":
      return came ? count(r.hires) : <Dash />;
  }
}

const count = (v: number) => (v === 0 ? <span className="text-text-subtle">0</span> : n(v));
