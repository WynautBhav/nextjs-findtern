import type { CategoriesData } from "@/lib/college/overview-modes";
import { COFFEE_FILL, DesignFrame, Legend, n } from "../kit";
import { BAND_KEYS, finding, Lead, MarksBars, NOT_YET, notInterviewed, segments, YearBars } from "./parts";

/**
 * Categories 3, "Mosaic": a Marimekko. Each degree is a column as wide as its students; the column is cut by band,
 * Latte on the base line so the gold compares across degrees. Area is students, so the whole drawing sums to the roll.
 */
const H = "h-60";

export function Mosaic({ data }: { data: CategoriesData }) {
  return (
    <DesignFrame label="Degrees by width, split by Findtern band" finding={finding(data, "degree")}>
      <div className="grid gap-8 lg:grid-cols-[1fr_19rem]">
        <div className="min-w-0">
          <div className="flex gap-1.5">
            {data.degrees.map((d) => {
              const segs = segments(d).filter((s) => s.count > 0);
              return (
                <div key={d.name} className="min-w-0" style={{ flex: `${Math.max(d.students, 1)} 1 0%` }}>
                  <div className={`relative ${H}`}>
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
                      {segs.reduce<{ y: number; els: React.ReactNode[] }>(
                        (acc, s, i) => {
                          const h = (s.count / d.students) * 100;
                          acc.els.push(<rect key={i} x="0" width="100" y={acc.y - h + 0.5} height={Math.max(0, h - 1)} fill={s.fill} />);
                          acc.y -= h;
                          return acc;
                        },
                        { y: 100, els: [] },
                      ).els}
                    </svg>
                    <div className="absolute inset-0 flex flex-col-reverse">
                      {segs.map((s, i) => (
                        <div key={i} className="flex items-center justify-center" style={{ height: `${(s.count / d.students) * 100}%` }}>
                          {s.count / d.students >= 0.1 ? <span className={`nums text-xs ${s.key === "none" ? "text-white" : "font-medium text-brand-950"}`}>{n(s.count)}</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="mt-2 truncate text-sm text-white">{d.name}</p>
                  <p className="nums truncate text-xs text-on-dark-subtle">
                    {n(d.students)} <span className="hidden sm:inline">students</span>
                  </p>
                </div>
              );
            })}
          </div>
          <Legend
            className="mt-4"
            items={[
              ...BAND_KEYS.slice()
                .reverse()
                .map((k) => {
                  const b = data.coffee.find((x) => x.key === k)!;
                  return { label: b.name, fill: COFFEE_FILL[k], value: b.students };
                }),
              { label: "Not interviewed", fill: NOT_YET, value: notInterviewed(data) },
            ]}
          />
          <p className="mt-2 text-xs text-on-dark-subtle">Column width is the degree&apos;s students; height is each band&apos;s share of them.</p>
        </div>
        <div className="min-w-0 space-y-5 max-lg:contents">
          <Lead data={data} className="max-lg:order-first" />
          <MarksBars data={data} />
          <YearBars data={data} />
        </div>
      </div>
    </DesignFrame>
  );
}
