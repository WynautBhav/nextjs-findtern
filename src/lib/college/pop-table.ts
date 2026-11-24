// The tables inside a finished drive's pop-ups: student and company columns, filters, sort and the CSV columns.
// Pure, so node:test runs it. Relative imports only.

import type { CsvColumn } from "../admin/csv.ts";
import type { BoardItem } from "./drive-board.ts";
import type { EmployerRow } from "./drive-employers.ts";
import { yearLabel } from "./labels.ts";

/** What the pop-up shows about one student beyond the board row. Built once on the server, keyed by userId. */
export type PersonInfo = {
  email: string | null;
  cgpa: number | null;
  score: number | null;
  /** Minutes on Findtern during the drive; null when online time was not recorded. */
  minutes: number | null;
  offers: number;
  hired: boolean;
  companies: string[];
};

export function buildPeople(input: {
  students: { userId: string; email: string | null; cgpa: number | null; score: number | null }[];
  /** userId -> minutes online, or null when not recorded. */
  minutes: Map<string, number> | null;
  offers: { userId: string; company: string | null }[];
  meets: { userId: string; company: string | null }[];
  hiredIds: Iterable<string>;
}): Record<string, PersonInfo> {
  const hired = new Set(input.hiredIds);
  const offers = new Map<string, number>();
  for (const o of input.offers) offers.set(o.userId, (offers.get(o.userId) ?? 0) + 1);
  const companies = new Map<string, Set<string>>();
  for (const f of [...input.offers, ...input.meets]) {
    const name = f.company?.trim();
    if (!name) continue;
    companies.set(f.userId, (companies.get(f.userId) ?? new Set()).add(name));
  }
  return Object.fromEntries(
    input.students.map((s) => [
      s.userId,
      {
        email: s.email || null,
        cgpa: s.cgpa,
        score: s.score,
        minutes: input.minutes ? (input.minutes.get(s.userId) ?? 0) : null,
        offers: offers.get(s.userId) ?? 0,
        hired: hired.has(s.userId),
        companies: [...(companies.get(s.userId) ?? [])].sort((a, b) => a.localeCompare(b)),
      } satisfies PersonInfo,
    ]),
  );
}

/**
 * A phone for the CSV: "+91 98…" would start with "+", which the CSV guard (csv.ts) neutralises with a quote that
 * Excel then shows. "(+91) 98…" starts safely and still reads as the number. Anything else goes through the guard.
 */
export function phoneCsv(phone: string | null): string | null {
  if (!phone) return null;
  const m = /^\+(\d{1,4})[\s-]*([\d\s()-]+)$/.exec(phone.trim());
  return m ? `(+${m[1]}) ${m[2].trim()}` : phone;
}

/* ---------- students ---------- */

export type StudentTableRow = BoardItem & {
  email: string | null;
  cgpa: number | null;
  score: number | null;
  /** Findtern score band key (espresso, cappuccino, latte) and its name; null when not interviewed. */
  band: string | null;
  bandName: string | null;
  minutes: number | null;
  offers: number;
  hired: boolean;
  companies: string[];
};

/** A board row joined to what the pop-up knows about the student. Missing info reads as missing, never as zero. */
export function toStudentTableRow(item: BoardItem, p: PersonInfo | undefined, band: (score: number) => { key: string; name: string }): StudentTableRow {
  const b = p?.score != null ? band(p.score) : null;
  return {
    ...item,
    email: p?.email ?? null,
    cgpa: p?.cgpa ?? null,
    score: p?.score ?? null,
    band: b?.key ?? null,
    bandName: b?.name ?? null,
    minutes: p?.minutes ?? null,
    offers: p?.offers ?? 0,
    hired: p?.hired ?? false,
    companies: p?.companies ?? [],
  };
}

export type StudentColKey = "name" | "rollNo" | "year" | "branch" | "phone" | "email" | "cgpa" | "score" | "band" | "openToWork" | "minutes" | "detail" | "companies" | "offers" | "hired";

type Sortable = string | number | null;
export type ColumnDef<R, K extends string> = {
  key: K;
  label: string;
  numeric?: boolean;
  /** On by default. */
  main?: boolean;
  /** The CSV header, when it should say more than the label (a unit). */
  csvLabel?: string;
  csv: (r: R) => unknown;
  sort: (r: R) => Sortable;
};

const yesNo = (v: boolean) => (v ? "Yes" : "No");
const text = (v: string | null | undefined) => (v && v.trim() ? v : null);

export const STUDENT_COLUMNS: ColumnDef<StudentTableRow, StudentColKey>[] = [
  { key: "name", label: "Name", main: true, csv: (r) => r.name || "Student", sort: (r) => (r.name || "Student").toLowerCase() },
  { key: "rollNo", label: "Roll no", main: true, csv: (r) => r.rollNo, sort: (r) => text(r.rollNo)?.toLowerCase() ?? null },
  { key: "year", label: "Year", main: true, csv: (r) => (r.year ? yearLabel(r.year) : null), sort: (r) => r.year },
  { key: "branch", label: "Branch", main: true, csv: (r) => r.branch, sort: (r) => text(r.branch)?.toLowerCase() ?? null },
  { key: "phone", label: "Phone", main: true, csv: (r) => phoneCsv(r.phone), sort: (r) => text(r.phone) },
  { key: "email", label: "Email", csv: (r) => r.email, sort: (r) => text(r.email)?.toLowerCase() ?? null },
  { key: "cgpa", label: "CGPA", numeric: true, main: true, csv: (r) => (r.cgpa === null ? null : r.cgpa.toFixed(2)), sort: (r) => r.cgpa },
  { key: "score", label: "Findtern score", numeric: true, main: true, csv: (r) => (r.score === null ? null : r.score.toFixed(1)), sort: (r) => r.score },
  { key: "band", label: "Score band", csv: (r) => r.bandName, sort: (r) => r.score },
  { key: "openToWork", label: "Open to work", csv: (r) => yesNo(r.openToWork !== false), sort: (r) => (r.openToWork !== false ? 1 : 0) },
  { key: "minutes", label: "Time online", csvLabel: "Time online in the drive (minutes)", numeric: true, csv: (r) => r.minutes, sort: (r) => r.minutes },
  { key: "detail", label: "What happened", main: true, csv: (r) => r.detail, sort: (r) => text(r.detail)?.toLowerCase() ?? null },
  { key: "companies", label: "Companies", csv: (r) => r.companies.join("; "), sort: (r) => (r.companies.length ? r.companies.join(", ").toLowerCase() : null) },
  { key: "offers", label: "Offers", numeric: true, csv: (r) => r.offers, sort: (r) => r.offers },
  { key: "hired", label: "Hired", main: true, csv: (r) => yesNo(r.hired), sort: (r) => (r.hired ? 1 : 0) },
];

export type StudentFilters = {
  q: string;
  branch: string;
  year: string;
  /** espresso | cappuccino | latte | none (not interviewed) */
  band: string;
  company: string;
  open: "" | "yes" | "no";
  hired: "" | "yes" | "no";
};
export const NO_STUDENT_FILTERS: StudentFilters = { q: "", branch: "", year: "", band: "", company: "", open: "", hired: "" };

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
/** Typed text matches when every word is found in the haystack; digits also match a phone written with spaces. */
function matches(hay: (string | null | undefined)[], q: string): boolean {
  const words = norm(q).split(" ").filter(Boolean);
  if (!words.length) return true;
  const joined = hay.map(norm).join(" | ");
  const num = hay.map(digits).join(" | ");
  return words.every((w) => joined.includes(w) || (/^\d+$/.test(w) && num.includes(w)));
}

export function filterStudents(rows: StudentTableRow[], f: StudentFilters): StudentTableRow[] {
  return rows.filter(
    (r) =>
      matches([r.name, r.rollNo, r.phone, r.email], f.q) &&
      (!f.branch || r.branch === f.branch) &&
      (!f.year || String(r.year ?? "") === f.year) &&
      (!f.band || (f.band === "none" ? r.band === null : r.band === f.band)) &&
      (!f.company || r.companies.includes(f.company)) &&
      (!f.open || (r.openToWork !== false) === (f.open === "yes")) &&
      (!f.hired || r.hired === (f.hired === "yes")),
  );
}

export const studentFiltersActive = (f: StudentFilters) => Object.values(f).some((v) => v !== "");

/* ---------- companies ---------- */

export type EmployerTableRow = EmployerRow & { minutes: number | null };
export type EmployerColKey = "company" | "contact" | "phone" | "email" | "invited" | "came" | "joinedAt" | "minutes" | "meetings" | "offers" | "hires";

/** "2026-11-24 15:05" in India time, whatever the browser's zone is. */
const istStamp = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 16).replace("T", " ");

export const EMPLOYER_COLUMNS: ColumnDef<EmployerTableRow, EmployerColKey>[] = [
  { key: "company", label: "Company", main: true, csv: (r) => r.company, sort: (r) => r.company.toLowerCase() },
  { key: "contact", label: "Contact", main: true, csv: (r) => r.contact, sort: (r) => text(r.contact)?.toLowerCase() ?? null },
  { key: "phone", label: "Phone", main: true, csv: (r) => phoneCsv(r.phone), sort: (r) => text(r.phone) },
  { key: "email", label: "Email", main: true, csv: (r) => r.email, sort: (r) => text(r.email)?.toLowerCase() ?? null },
  { key: "invited", label: "Invited", main: true, csv: (r) => yesNo(r.invited), sort: (r) => (r.invited ? 1 : 0) },
  { key: "came", label: "Came", main: true, csv: (r) => (r.employerId ? "Came" : "Didn't come"), sort: (r) => (r.employerId ? 1 : 0) },
  { key: "joinedAt", label: "Joined at", csvLabel: "Joined at (IST)", main: true, csv: (r) => (r.joinedAt ? istStamp(r.joinedAt) : null), sort: (r) => r.joinedAt?.getTime() ?? null },
  { key: "minutes", label: "Time online", csvLabel: "Time online in the drive (minutes)", numeric: true, main: true, csv: (r) => r.minutes, sort: (r) => r.minutes },
  { key: "meetings", label: "Meets", numeric: true, main: true, csv: (r) => (r.employerId ? r.meetings : null), sort: (r) => (r.employerId ? r.meetings : null) },
  { key: "offers", label: "Offers", numeric: true, main: true, csv: (r) => (r.employerId ? r.offers : null), sort: (r) => (r.employerId ? r.offers : null) },
  { key: "hires", label: "Hired", numeric: true, main: true, csv: (r) => (r.employerId ? r.hires : null), sort: (r) => (r.employerId ? r.hires : null) },
];

export type EmployerFilters = { q: string; came: "" | "came" | "didnt"; invited: "" | "yes" | "no" };
export const NO_EMPLOYER_FILTERS: EmployerFilters = { q: "", came: "", invited: "" };

export function filterEmployers(rows: EmployerTableRow[], f: EmployerFilters): EmployerTableRow[] {
  return rows.filter(
    (r) => matches([r.company, r.contact, r.email, r.phone], f.q) && (!f.came || (r.employerId !== null) === (f.came === "came")) && (!f.invited || r.invited === (f.invited === "yes")),
  );
}

export const employerFiltersActive = (f: EmployerFilters) => Object.values(f).some((v) => v !== "");

/* ---------- sort and CSV, shared ---------- */

export type SortState<K extends string> = { key: K; dir: "asc" | "desc" } | null;

/** A header click: first ascending, then descending, then back to the pop-up's own order. */
export function nextSort<K extends string>(cur: SortState<K>, key: K): SortState<K> {
  if (!cur || cur.key !== key) return { key, dir: "asc" };
  return cur.dir === "asc" ? { key, dir: "desc" } : null;
}

/** Stable sort on one column. Missing values always go last, whichever way it runs. */
export function sortRows<R, K extends string>(rows: R[], cols: ColumnDef<R, K>[], sort: SortState<K>): R[] {
  if (!sort) return rows;
  const col = cols.find((c) => c.key === sort.key);
  if (!col) return rows;
  const sign = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i, v: col.sort(r) }))
    .sort((a, b) => {
      if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1;
      const c = typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : String(a.v).localeCompare(String(b.v), "en", { numeric: true });
      return c ? c * sign : a.i - b.i;
    })
    .map((x) => x.r);
}

/** The CSV columns for what is on screen: the visible columns, in table order. */
export function csvColumnsFor<R, K extends string>(cols: ColumnDef<R, K>[], visible: ReadonlySet<K>): CsvColumn<R>[] {
  return cols.filter((c) => visible.has(c.key)).map((c) => ({ header: c.csvLabel ?? c.label, value: c.csv }));
}

/** "Hired, Poornima Buildathon 2026" -> "hired-poornima-buildathon-2026": the download's name, safe on any file system. */
export function slugify(...parts: string[]): string {
  const s = parts
    .join(" ")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return s || "drive";
}
