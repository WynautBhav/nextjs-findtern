import Link from "next/link";

import { Panel, PanelBody, PanelHeader } from "@/components/college/panel";
import { HIGH_CGPA, STRONG_SCORE, type CourseStat, type Insights, type Quadrant } from "@/lib/college/insights";
import type { MasterRow } from "@/lib/college/master-row";
import { yearLabel } from "@/lib/college/labels";
import { cn } from "@/lib/utils";

/**
 * The blocks under the Insights hero. One hue on data (brand green), its pale tints for areas; ink for numbers.
 * Every block links to the master data view that lists exactly the students it counts.
 */

const n = (v: number) => v.toLocaleString("en-IN");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const one = (v: number | null) => (v === null ? null : v.toFixed(1));
const rupees = (minor: number) => `₹${n(Math.round(minor / 100))}`;
const Dash = () => <span className="text-ink-400" aria-label="not available">-</span>;

const viewHref = (view: string, extra = "") => `/college/master-data?view=${view}${extra}`;
const ViewAll = ({ href, label }: { href: string; label: string }) => (
  <Link href={href} className="inline-flex min-h-9 items-center text-sm font-medium text-brand-700 hover:underline">
    {label}
  </Link>
);

// ── Course board ─────────────────────────────────────────────────────────

/** Count over its share, on one right edge. */
function Stack({ value, of }: { value: number; of: number }) {
  return (
    <>
      <span className="block text-ink-900">{n(value)}</span>
      <span className="block text-xs text-ink-500">{pct(value, of)}%</span>
    </>
  );
}

const BOARD_COLS = "grid-cols-[minmax(8rem,1.6fr)_repeat(8,minmax(4.5rem,1fr))]";

function BoardRow({ c, total, maxEarn }: { c: Omit<CourseStat, "course"> & { course: string }; total?: boolean; maxEarn: number }) {
  return (
    <div role="row" className={cn("nums grid items-center gap-x-3 px-5 py-3 text-sm", BOARD_COLS, total ? "border-t border-ink-200 font-medium" : "border-t border-ink-100")}>
      <span role="rowheader" className="min-w-0">
        {total ? (
          <span className="text-ink-900">All courses</span>
        ) : (
          <Link href={`/college/master-data?course=${encodeURIComponent(c.course)}`} className="font-medium text-brand-700 hover:underline">
            {c.course}
          </Link>
        )}
      </span>
      <span role="cell" className="text-right text-ink-900">{n(c.students)}</span>
      <span role="cell" className="text-right"><Stack value={c.interviewed} of={c.students} /></span>
      <span role="cell" className="text-right text-ink-900">{one(c.avgCgpa) ?? <Dash />}</span>
      <span role="cell" className="text-right text-ink-900">{one(c.avgScore) ?? <Dash />}</span>
      <span role="cell" className="text-right"><Stack value={c.withOffer} of={c.students} /></span>
      <span role="cell" className="text-right"><Stack value={c.hired} of={c.students} /></span>
      <span role="cell" className="text-right text-ink-900">{n(c.ppo)}</span>
      <span role="cell" className="text-right">
        <span className="block text-ink-900">{rupees(c.earningsMinor)}</span>
        {!total ? (
          <span className="mt-1 ml-auto block h-1 rounded-full bg-brand-500" style={{ width: `${Math.max(c.earningsMinor ? 6 : 0, (c.earningsMinor / maxEarn) * 100)}%` }} aria-hidden />
        ) : null}
      </span>
    </div>
  );
}

export function CourseBoard({ courses, totals }: { courses: CourseStat[]; totals: Insights["totals"] }) {
  const maxEarn = Math.max(1, ...courses.map((c) => c.earningsMinor));
  return (
    <Panel bleed>
      <PanelHeader title="Course by course" description="Who is placing, and who brings in the most for the college." />
      <PanelBody>
        <div className="overflow-x-auto">
          <div role="table" aria-label="Placement by course" className="min-w-[56rem]">
            <div role="row" className={cn("grid gap-x-3 px-5 py-2.5 text-xs text-ink-500", BOARD_COLS)}>
              {["Course", "Students", "Interviewed", "Avg CGPA", "Avg score", "With an offer", "Hired", "PPO", "Earnings"].map((h, i) => (
                <span key={h} role="columnheader" className={i ? "text-right" : ""}>{h}</span>
              ))}
            </div>
            {courses.map((c) => <BoardRow key={c.course} c={c} maxEarn={maxEarn} />)}
            {courses.length > 1 ? <BoardRow c={{ course: "", ...totals }} total maxEarn={maxEarn} /> : null}
          </div>
        </div>
      </PanelBody>
    </Panel>
  );
}

// ── CGPA against Findtern score ──────────────────────────────────────────

export const QUADRANT: Record<Quadrant, { title: string; body: string; view: string }> = {
  scoreBeatsCg: { title: "Score beats CGPA", body: `CGPA under ${HIGH_CGPA}, Findtern score ${STRONG_SCORE}+`, view: "score-beats-cg" },
  stars: { title: "Strong on both", body: `CGPA ${HIGH_CGPA}+, Findtern score ${STRONG_SCORE}+`, view: "stars" },
  support: { title: "Needs support", body: `CGPA under ${HIGH_CGPA}, score under ${STRONG_SCORE}`, view: "support" },
  cgBeatsScore: { title: "CGPA beats score", body: `CGPA ${HIGH_CGPA}+, Findtern score under ${STRONG_SCORE}`, view: "cg-beats-score" },
};

export function CgVsScore({ rows, quadrants }: { rows: MasterRow[]; quadrants: Insights["quadrants"] }) {
  const pts = rows.filter((r) => r.verified && r.cgpa !== null && r.score !== null);
  // Axes: CGPA 4-10 across, score 2-10 up, both on whole-number ticks.
  const W = 560, H = 300, L = 30, B = 26, T = 8, R = 8;
  const x = (v: number) => L + ((Math.max(4, v) - 4) / 6) * (W - L - R);
  const y = (v: number) => T + (1 - (Math.max(2, v) - 2) / 8) * (H - T - B);
  const q = Object.fromEntries(quadrants.map((s) => [s.key, s]));
  const order: Quadrant[] = ["scoreBeatsCg", "stars", "support", "cgBeatsScore"];
  return (
    <Panel>
      <PanelHeader title="CGPA against Findtern score" description="Each dot is a student. Filled dots have at least one offer." />
      <PanelBody className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <figure className="min-w-0" role="img" aria-label={`${pts.length} students plotted. ${order.map((k) => `${QUADRANT[k].title}: ${q[k]?.students ?? 0}`).join("; ")}`}>
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" aria-hidden>
            {/* Quadrant tint: the corner the screen is about (score beats CGPA) in the palest brand tint. */}
            <rect x={L} y={T} width={x(HIGH_CGPA) - L} height={y(STRONG_SCORE) - T} fill="var(--color-brand-50)" />
            {[2, 4, 6, 8, 10].map((v) => (
              <g key={`y${v}`}>
                <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--color-ink-100)" />
                <text x={L - 8} y={y(v) + 4} textAnchor="end" className="fill-ink-500 text-[11px]">{v}</text>
              </g>
            ))}
            {[4, 5, 6, 7, 8, 9, 10].map((v) => (
              <text key={`x${v}`} x={x(v)} y={H - 6} textAnchor={v === 4 ? "start" : v === 10 ? "end" : "middle"} className="fill-ink-500 text-[11px]">{v}</text>
            ))}
            <line x1={x(HIGH_CGPA)} x2={x(HIGH_CGPA)} y1={T} y2={H - B} stroke="var(--color-ink-400)" strokeDasharray="3 3" />
            <line x1={L} x2={W - R} y1={y(STRONG_SCORE)} y2={y(STRONG_SCORE)} stroke="var(--color-ink-400)" strokeDasharray="3 3" />
            <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--color-ink-300)" strokeWidth="1.5" />
            {pts.map((r) => (
              <circle key={r.userId} cx={x(r.cgpa!)} cy={y(r.score!)} r="4" fill={r.offers > 0 ? "var(--color-brand-600)" : "white"} stroke="var(--color-brand-600)" strokeWidth="1.4" fillOpacity={r.offers > 0 ? 0.85 : 1}>
                <title>{`${r.name}: CGPA ${r.cgpa!.toFixed(1)}, score ${r.score!.toFixed(1)}, ${r.offers} offer${r.offers === 1 ? "" : "s"}`}</title>
              </circle>
            ))}
          </svg>
          <figcaption className="mt-1 flex justify-between text-xs text-ink-500">
            <span>Findtern score up, CGPA across</span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1"><svg viewBox="0 0 10 10" className="size-2.5" aria-hidden><circle cx="5" cy="5" r="4" fill="var(--color-brand-600)" /></svg>Has an offer</span>
              <span className="flex items-center gap-1"><svg viewBox="0 0 10 10" className="size-2.5" aria-hidden><circle cx="5" cy="5" r="3.6" fill="white" stroke="var(--color-brand-600)" strokeWidth="1.4" /></svg>No offer</span>
            </span>
          </figcaption>
        </figure>
        <ul className="divide-y divide-ink-100 self-start" aria-label="The four groups">
          {order.map((k) => {
            const s = q[k];
            return (
              <li key={k}>
                <Link href={viewHref(QUADRANT[k].view)} className="nums grid grid-cols-[1fr_auto] gap-x-3 rounded-lg px-2 py-2.5 -mx-2 outline-none hover:bg-ink-50 focus-visible:ring-2 focus-visible:ring-brand-500">
                  <span className="min-w-0">
                    <span className={cn("block text-sm font-medium", k === "scoreBeatsCg" ? "text-brand-700" : "text-ink-900")}>{QUADRANT[k].title}</span>
                    <span className="block text-xs text-ink-500">{QUADRANT[k].body}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-medium text-ink-900">{n(s?.students ?? 0)}</span>
                    <span className="block text-xs text-ink-500">{s?.avgOffers === null || s?.avgOffers === undefined ? "-" : `${s.avgOffers.toFixed(1)} offers each`}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </PanelBody>
    </Panel>
  );
}

// ── Student lists ────────────────────────────────────────────────────────

function Initials({ name }: { name: string }) {
  const parts = name.split(/\s+/).filter(Boolean);
  const ini = ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  return <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800" aria-hidden>{ini}</span>;
}

export function StudentList({
  title,
  description,
  rows,
  total,
  href,
  figure,
  figureLabel,
  empty,
}: {
  title: string;
  description: string;
  rows: MasterRow[];
  total: number;
  href: string;
  figure: (r: MasterRow) => React.ReactNode;
  figureLabel: string;
  empty: string;
}) {
  return (
    <Panel className="flex flex-col">
      <PanelHeader title={title} description={description} action={total > rows.length ? <ViewAll href={href} label={`All ${n(total)}`} /> : null} />
      {rows.length ? (
        <ul className="flex-1 divide-y divide-ink-100 px-5" aria-label={title}>
          {rows.map((r) => (
            <li key={r.userId}>
              <Link href={`/college/students/${r.userId}`} className="nums flex items-center gap-3 rounded-lg py-2.5 outline-none hover:bg-ink-50 focus-visible:ring-2 focus-visible:ring-brand-500">
                <Initials name={r.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-900">{r.name}</span>
                  <span className="block truncate text-xs text-ink-500">
                    {[r.degree, r.branch, r.year ? yearLabel(r.year) : null].filter(Boolean).join(" · ")}
                    {r.cgpa !== null ? ` · CGPA ${r.cgpa.toFixed(1)}` : ""}
                  </span>
                </span>
                <span className="text-right" aria-label={figureLabel}>{figure(r)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <PanelBody className="flex-1 text-sm text-ink-600">{empty}</PanelBody>
      )}
    </Panel>
  );
}

/** Three small scores side by side: English, Coding, Aptitude, then the Findtern score in ink. */
export function ScoreTrio({ r }: { r: MasterRow }) {
  return (
    <span className="flex items-baseline gap-3 text-xs text-ink-500">
      <span className="hidden sm:inline">Eng <span className="text-ink-900">{one(r.english) ?? "-"}</span></span>
      <span className="hidden sm:inline">Apt <span className="text-ink-900">{one(r.aptitude) ?? "-"}</span></span>
      <span className="text-base font-medium text-ink-900">{one(r.score)}<span className="text-xs font-normal text-ink-500"> /10</span></span>
    </span>
  );
}

// ── Offers per student ───────────────────────────────────────────────────

export function OfferSpread({ spread }: { spread: number[] }) {
  const max = Math.max(1, ...spread);
  const top = Math.ceil(max / 10) * 10 || 10;
  const labels = ["No offer", "1", "2", "3", "4 or more"];
  const total = spread.reduce((a, b) => a + b, 0);
  return (
    <Panel>
      <PanelHeader title="Offers per student" description={`${n(total)} interviewed students, by how many offers each has had.`} />
      <PanelBody>
        <ol className="flex h-48 items-end gap-3" aria-label="Students by number of offers">
          {spread.map((v, i) => (
            <li key={i} className="flex h-full flex-1 flex-col justify-end text-center">
              <span className="nums mb-1 text-sm font-medium text-ink-900">{n(v)}</span>
              <span className={cn("block w-full rounded-t-[4px]", i === 0 ? "bg-ink-200" : "bg-brand-500")} style={{ height: `${(v / top) * 100}%` }} aria-hidden />
              <span className="mt-2 block border-t border-ink-300 pt-1.5 text-xs text-ink-600">{labels[i]}</span>
            </li>
          ))}
        </ol>
        <p className="nums mt-3 text-sm text-ink-600">
          {pct(spread[0], total)}% have no offer yet; {n(spread[3] + spread[4])} have three or more.
        </p>
      </PanelBody>
    </Panel>
  );
}

// ── Skills by course ─────────────────────────────────────────────────────

/** Score to one of four brand tints: the darker the cell, the stronger the course. */
const tint = (v: number | null) =>
  v === null ? "bg-ink-50 text-ink-400" : v >= 8 ? "bg-brand-700 text-white" : v >= 7 ? "bg-brand-500 text-white" : v >= 6 ? "bg-brand-200 text-brand-900" : "bg-brand-50 text-brand-900";

export function SkillsByCourse({ courses }: { courses: CourseStat[] }) {
  const cols: { key: keyof CourseStat; label: string }[] = [
    { key: "avgEnglish", label: "English" },
    { key: "avgCoding", label: "Coding" },
    { key: "avgAptitude", label: "Aptitude" },
    { key: "avgInterview", label: "AI interview" },
    { key: "avgScore", label: "Findtern" },
  ];
  return (
    <Panel>
      <PanelHeader title="Skills by course" description="Average AI interview scores, out of 10." />
      <PanelBody>
        <div role="table" aria-label="Average scores by course" className="nums grid grid-cols-[minmax(5rem,1fr)_repeat(5,minmax(2.75rem,4rem))] gap-1 text-sm">
          <span role="columnheader" />
          {cols.map((c) => <span key={c.label} role="columnheader" className="pb-1 text-center text-xs text-ink-500">{c.label}</span>)}
          {courses.map((c) => (
            <div key={c.course} role="row" className="contents">
              <span role="rowheader" className="truncate py-2 pr-2 text-ink-900">{c.course}</span>
              {cols.map((k) => {
                const v = c[k.key] as number | null;
                return <span key={k.label} role="cell" className={cn("grid place-items-center rounded-md py-2 font-medium", tint(v))}>{one(v) ?? "-"}</span>;
              })}
            </div>
          ))}
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
          {[["bg-brand-50", "under 6"], ["bg-brand-200", "6 to 7"], ["bg-brand-500", "7 to 8"], ["bg-brand-700", "8 and above"]].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1.5"><span className={cn("size-3 rounded-sm", c)} aria-hidden />{l}</span>
          ))}
        </p>
      </PanelBody>
    </Panel>
  );
}

// ── Where and how they want to work ──────────────────────────────────────

export function Readiness({ ins }: { ins: Insights }) {
  const total = Math.max(1, ins.verified);
  const MODE = { remote: "Remote", hybrid: "Hybrid", onsite: "Onsite" } as const;
  const cities = ins.cities.slice(0, 6);
  const maxCity = Math.max(1, ...cities.map((c) => c.students));
  const { yes, no, unknown } = ins.laptop;
  return (
    <Panel>
      <PanelHeader title="How and where they want to work" description="From each student's profile. Onsite students are open to hybrid and remote too." />
      <PanelBody className="grid gap-8 md:grid-cols-3">
        <div>
          <h3 className="text-sm font-medium text-ink-900">Open to</h3>
          <ul className="mt-3 space-y-3">
            {ins.workModes.map((m) => (
              <li key={m.mode}>
                <Link href={viewHref("all", `&mode=${m.mode}`)} className="nums block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                  <span className="flex justify-between text-sm"><span className="text-ink-700">{MODE[m.mode]}</span><span className="text-ink-900">{n(m.students)} <span className="text-xs text-ink-500">{pct(m.students, total)}%</span></span></span>
                  <span className="mt-1 block h-2 rounded-full bg-brand-50"><span className="block h-2 rounded-full bg-brand-500" style={{ width: `${pct(m.students, total)}%` }} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-medium text-ink-900">Top preferred cities</h3>
          {cities.length ? (
            <ul className="mt-3 space-y-2">
              {cities.map((c, i) => (
                <li key={c.city} className="nums grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-2 text-sm">
                  <span className="truncate text-ink-700">{c.city}</span>
                  <span className="h-1.5 rounded-full bg-brand-50"><span className={cn("block h-1.5 rounded-full", i === 0 ? "bg-brand-700" : "bg-brand-400")} style={{ width: `${(c.students / maxCity) * 100}%` }} /></span>
                  <span className="text-right text-ink-900">{n(c.students)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-600">No cities picked yet.</p>
          )}
        </div>
        <div>
          <h3 className="text-sm font-medium text-ink-900">Has a laptop</h3>
          <p className="nums mt-3 text-[1.75rem] font-light leading-none tracking-[-0.02em] text-ink-900">{pct(yes, total)}<span className="text-base text-ink-500">%</span></p>
          <p className="nums mt-2 text-sm text-ink-600">
            {n(yes)} yes · <Link href={viewHref("no-laptop")} className="font-medium text-brand-700 hover:underline">{n(no)} no</Link>
            {unknown ? ` · ${n(unknown)} not said` : ""}
          </p>
          <p className="mt-1 text-xs text-ink-500">Remote offers need one.</p>
        </div>
      </PanelBody>
    </Panel>
  );
}

