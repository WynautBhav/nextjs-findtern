import type { CategoriesData } from "@/lib/college/overview-modes";
import { COFFEE_FILL, DesignFrame, Legend, MARKS_FILL, n, white } from "../kit";
import { BAND_KEYS, DONE, finding, Lead, NOT_YET, notInterviewed } from "./parts";

/**
 * Categories 9, "Staircase": the year of study as steps, each step as tall as its students and filled to the share
 * done with the interview. Beside it the whole roll as one column cut by Findtern band, and the marks as a ladder
 * (Foundation on the bottom rung, Top gold on the highest). The degrees run under it as one strip, wide by students.
 * The data has no year-by-band table, so the bands are shown for the whole roll, not per year.
 */
const PLOT = "h-36";

export function Staircase({ data }: { data: CategoriesData }) {
  const ny = Math.max(1, data.years.length);
  const maxYear = Math.max(1, ...data.years.map((y) => y.students));
  const tops = data.years.map((y) => 100 - (y.students / maxYear) * 100);
  const outline = tops.length ? `M0 ${tops[0]}` + tops.map((t, i) => `${i ? `V${t}` : ""}H${((i + 1) / ny) * 100}`).join("") : "";
  const bands = BAND_KEYS.map((k) => ({ k, b: data.coffee.find((x) => x.key === k)! }));
  const segs = [...bands.map(({ k, b }) => ({ key: k as string, name: b.name, count: b.students, fill: COFFEE_FILL[k] })), { key: "none", name: "Not interviewed", count: notInterviewed(data), fill: NOT_YET }];
  let base = 0;
  const total = Math.max(1, data.students);
  const placed = segs.map((s) => {
    const h = (s.count / total) * 100;
    const p = { ...s, h, y: 100 - base - h };
    base += h;
    return p;
  });
  const maxMarks = Math.max(1, ...data.marks.map((b) => b.students));
  return (
    <DesignFrame label="Students by year, Findtern band, CGPA and degree" finding={finding(data, "band")}>
      <Lead data={data} />
      <div className="mt-5 grid gap-x-8 gap-y-6 md:grid-cols-[1.2fr_1fr] lg:grid-cols-[1.2fr_1fr_1.1fr]">
        <div className="min-w-0">
          <p className="text-[13px] text-on-dark-subtle">Year of study</p>
          <div className={`relative mt-2 ${PLOT}`}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
              {data.years.map((y, i) => {
                const h = (y.students / maxYear) * 100;
                const hi = (y.interviewed / maxYear) * 100;
                const x = (i / ny) * 100;
                return (
                  <g key={y.year}>
                    <rect x={x} width={100 / ny} y={100 - h} height={h} fill={NOT_YET} />
                    <rect x={x} width={100 / ny} y={100 - hi} height={hi} fill={DONE} />
                  </g>
                );
              })}
              {outline ? <path d={outline} fill="none" stroke={white(0.6)} strokeWidth="2" vectorEffect="non-scaling-stroke" /> : null}
            </svg>
          </div>
          <ul className="mt-1.5 flex" aria-label="Students by year">
            {data.years.map((y) => (
              <li key={y.year} className="min-w-0 flex-1 text-[13px]">
                <span className="text-white">Year {y.year}</span>
                <span className="nums block text-xs text-on-dark-subtle">
                  <span className="text-white">{n(y.interviewed)}</span>/{n(y.students)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0">
          <p className="text-[13px] text-on-dark-subtle">Findtern band, all years</p>
          <div className={`mt-2 flex gap-3 ${PLOT}`}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-14 shrink-0" aria-hidden>
              {placed.map((s) => (s.count > 0 ? <rect key={s.key} x="0" width="100" y={s.y + 0.6} height={Math.max(0, s.h - 1.2)} fill={s.fill} /> : null))}
            </svg>
            <div className="relative min-w-0 flex-1">
              {placed.map((s) => (
                <p key={s.key} className="absolute left-0 flex -translate-y-1/2 items-baseline gap-1.5 whitespace-nowrap text-[13px] text-on-dark-subtle" style={{ top: `${s.y + s.h / 2}%` }}>
                  <span className="text-white">{s.name}</span>
                  <span className={`nums text-base ${s.key === "latte" ? "text-accent-300" : "text-white"}`}>{n(s.count)}</span>
                </p>
              ))}
            </div>
          </div>
        </div>

        <div className="min-w-0 md:col-span-2 lg:col-span-1">
          <p className="text-[13px] text-on-dark-subtle">CGPA / % ladder</p>
          <ul className={`mt-2 flex flex-col-reverse ${PLOT}`} aria-label="CGPA and percentage bands">
            {data.marks.map((b) => (
              <li key={b.key} className="grid min-h-0 flex-1 grid-cols-[2.25rem_1fr] items-center gap-2">
                <svg viewBox="0 0 36 40" preserveAspectRatio="none" className="h-full w-9" aria-hidden>
                  <path d="M8 0V40M28 0V40" stroke={white(0.3)} strokeWidth="3" fill="none" vectorEffect="non-scaling-stroke" />
                  <path d="M8 20H28" stroke={white(0.3)} strokeWidth="3" vectorEffect="non-scaling-stroke" />
                </svg>
                <div className="min-w-0">
                  <p className="flex items-baseline gap-1.5 whitespace-nowrap text-[13px] text-white">
                    {b.name} <span className="nums text-[11px] text-on-dark-subtle">{b.range}</span>
                    <span className={`nums ml-auto text-base ${b.key === "top" ? "text-accent-300" : "text-white"}`}>{n(b.students)}</span>
                  </p>
                  <span className="mt-0.5 block h-2 rounded-full" style={{ background: white(0.07) }} aria-hidden>
                    <span className="block h-full rounded-full" style={{ width: `${(b.students / maxMarks) * 100}%`, background: MARKS_FILL[b.key] }} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {data.marksMissing > 0 ? <p className="nums mt-1 text-xs text-on-dark-subtle">{n(data.marksMissing)} with no CGPA or % on file</p> : null}
        </div>
      </div>

      <div className="mt-5">
        <ul className="flex gap-1.5" aria-label="Degrees, wide by students">
          {data.degrees.map((d) => (
            <li key={d.name} className="min-w-0" style={{ flex: `${Math.max(d.students, 1)} 1 0%` }}>
              <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-3 w-full" aria-hidden>
                <rect width="100" height="10" fill={NOT_YET} />
                <rect width={d.students ? (d.interviewed / d.students) * 100 : 0} height="10" fill={DONE} />
              </svg>
              <p className="mt-1.5 truncate text-sm text-white">{d.name}</p>
              <p className="nums truncate text-xs text-on-dark-subtle">
                <span className="text-white">{n(d.interviewed)}</span>/{n(d.students)}
              </p>
            </li>
          ))}
        </ul>
        <Legend
          className="mt-2"
          items={[
            { label: "Done with the interview", fill: DONE },
            { label: "Not yet", fill: NOT_YET },
          ]}
        />
      </div>
    </DesignFrame>
  );
}
