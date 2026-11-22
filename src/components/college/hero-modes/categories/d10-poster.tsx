import type { CategoriesData } from "@/lib/college/overview-modes";
import { cn } from "@/lib/utils";
import { COFFEE_FILL, DesignFrame, GOLD, MARKS_FILL, n, pct, Swatch } from "../kit";
import { BAND_KEYS, finding, NOT_YET, step } from "./parts";

/**
 * Categories 10, "Poster": the interview share as one large ring (gold, thin on a big circle) with the count in
 * the middle, and a board of four ticker lines beside it: bands, CGPA / %, degrees, years. Each line is a tape cut
 * to scale with the figures under it, so the parts of each line visibly sum to its whole.
 */
type Item = { name: string; note?: string; value: number; fill: string; gold?: boolean };

function Ticker({ label, items, aria }: { label: string; items: Item[]; aria: string }) {
  const whole = items.reduce((s, i) => s + i.value, 0);
  return (
    <section aria-label={aria}>
      <p className="text-[13px] text-on-dark-subtle">{label}</p>
      <div className="mt-1.5 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {whole > 0 ? items.filter((i) => i.value > 0).map((i) => <span key={i.name} style={{ flex: `${i.value} 1 0%`, background: i.fill }} />) : <span className="flex-1" style={{ background: NOT_YET }} />}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
        {items.map((i) => (
          <li key={i.name} className="flex items-baseline gap-1.5">
            <Swatch fill={i.fill} className="self-center" />
            <span className="text-[13px] text-white">{i.name}</span>
            <span className={cn("nums text-[1.5rem] font-light leading-none", i.gold ? "text-accent-300" : "text-white")}>{n(i.value)}</span>
            {i.note ? <span className="nums text-[11px] text-on-dark-subtle">{i.note}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Poster({ data }: { data: CategoriesData }) {
  const share = pct(data.interviewed, data.students);
  const r = 124;
  const c = 2 * Math.PI * r;
  return (
    <DesignFrame label="Interview share, bands, marks, degrees and years" finding={finding(data, "degree")}>
      <div className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
        <div className="relative mx-auto w-[15.5rem] sm:w-[19rem]">
          <svg viewBox="0 0 280 280" className="block w-full" aria-hidden>
            <circle cx="140" cy="140" r={r} fill="none" stroke={NOT_YET} strokeWidth="12" />
            {data.interviewed > 0 ? <circle cx="140" cy="140" r={r} fill="none" stroke={GOLD} strokeWidth="12" strokeDasharray={`${(c * data.interviewed) / Math.max(1, data.students)} ${c}`} transform="rotate(-90 140 140)" /> : null}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="nums text-[2.5rem] font-light leading-none tracking-[-0.03em] text-white">{n(data.interviewed)}</span>
            <span className="mt-2 text-[13px] text-on-dark-subtle">students done with</span>
            <span className="text-[13px] text-on-dark-subtle">the AI interview</span>
            <span className="nums mt-1.5 text-sm text-white">
              {share}% of {n(data.students)}
            </span>
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          <Ticker
            aria="Findtern bands"
            label="Findtern bands, of the students interviewed"
            items={BAND_KEYS.slice()
              .reverse()
              .map((k) => {
                const b = data.coffee.find((x) => x.key === k)!;
                return { name: b.name, note: b.range, value: b.students, fill: COFFEE_FILL[k], gold: k === "latte" };
              })}
          />
          <Ticker
            aria="CGPA and percentage bands"
            label={data.marksMissing > 0 ? `CGPA / % bands (${n(data.marksMissing)} with none on file)` : "CGPA / % bands"}
            items={data.marks.map((b) => ({ name: b.name, note: b.range, value: b.students, fill: MARKS_FILL[b.key], gold: b.key === "top" }))}
          />
          <Ticker aria="Degrees" label="Degree" items={data.degrees.map((d, i) => ({ name: d.name, note: `${n(d.interviewed)} done`, value: d.students, fill: step(i) }))} />
          <Ticker aria="Years" label="Year of study" items={data.years.map((y, i) => ({ name: `Year ${y.year}`, note: `${n(y.interviewed)} done`, value: y.students, fill: step(i + 1) }))} />
        </div>
      </div>
    </DesignFrame>
  );
}
