import type { CategoriesData } from "@/lib/college/overview-modes";
import { COFFEE_FILL, DesignFrame, n, Swatch } from "../kit";
import { BAND_KEYS, DONE, finding, Lead, MarksInline, NOT_YET, step } from "./parts";

/**
 * Categories 8, "Flow": ribbons from degree, through "interview done or not", into the Findtern bands. Every ribbon
 * is as thick as the students it carries, on one scale, so the columns add up. The data has no degree-by-year
 * table, so the year of study is its own stacked column beside the flow rather than a made-up middle step.
 */
const G = 2.5;
const XL = 2.5;
const XM0 = 41;
const XM1 = 59;
const XR = 98;

type Node = { y: number; h: number };

function layout(values: number[], scale: number): Node[] {
  const total = values.reduce((s, v) => s + v * scale, 0) + Math.max(0, values.length - 1) * G;
  let y = (100 - total) / 2;
  return values.map((v) => {
    const node = { y, h: v * scale };
    y += v * scale + G;
    return node;
  });
}

const ribbon = (x0: number, a: number, h0: number, x1: number, b: number, h1: number) => {
  const m = (x0 + x1) / 2;
  return `M${x0} ${a}C${m} ${a} ${m} ${b} ${x1} ${b}L${x1} ${b + h1}C${m} ${b + h1} ${m} ${a + h0} ${x0} ${a + h0}Z`;
};

export function Flow({ data }: { data: CategoriesData }) {
  const S = Math.max(0, data.degrees.reduce((s, d) => s + d.students, 0));
  const done = data.degrees.reduce((s, d) => s + d.interviewed, 0);
  const notDone = Math.max(0, S - done);
  const bands = BAND_KEYS.map((k) => ({ k, b: data.coffee.find((x) => x.key === k)! }));
  const kmax = Math.max(data.degrees.length, 2, bands.length);
  const scale = S ? (100 - (kmax - 1) * G) / S : 0;
  const left = layout(data.degrees.map((d) => d.students), scale);
  const mid = layout([done, notDone], scale);
  const right = layout(bands.map(({ b }) => b.students), scale);

  let doneIn = mid[0].y;
  let notIn = mid[1].y;
  const ribbons: React.ReactNode[] = [];
  data.degrees.forEach((d, i) => {
    const yes = d.interviewed * scale;
    const no = Math.max(0, d.students - d.interviewed) * scale;
    ribbons.push(<path key={`d${i}a`} d={ribbon(XL, left[i].y, yes, XM0, doneIn, yes)} fill={DONE} opacity="0.5" />);
    ribbons.push(<path key={`d${i}b`} d={ribbon(XL, left[i].y + yes, no, XM0, notIn, no)} fill={NOT_YET} />);
    doneIn += yes;
    notIn += no;
  });
  let doneOut = mid[0].y;
  bands.forEach(({ k, b }, i) => {
    const h = b.students * scale;
    ribbons.push(<path key={`b${k}`} d={ribbon(XM1, doneOut, h, XR, right[i].y, h)} fill={COFFEE_FILL[k]} opacity="0.62" />);
    doneOut += h;
  });

  const maxYear = Math.max(1, ...data.years.map((y) => y.students));
  const pos = (v: number) => `${v}%`;
  return (
    <DesignFrame label="Students flowing from degree through interview to Findtern band" finding={finding(data, "band")}>
      <div className="grid gap-8 lg:grid-cols-[1fr_19rem]">
        <div className="min-w-0">
          <div className="grid grid-cols-[4.25rem_1fr_6.5rem] gap-x-0 pb-1.5 text-[13px] text-on-dark-subtle sm:grid-cols-[5rem_1fr_8.5rem]">
            <span>Degree</span>
            <span className="text-center">AI interview</span>
            <span className="pl-2">Findtern band</span>
          </div>
          <div className="grid h-64 grid-cols-[4.25rem_1fr_6.5rem] sm:grid-cols-[5rem_1fr_8.5rem]">
            <div className="relative">
              {data.degrees.map((d, i) => (
                <div key={d.name} className="absolute right-2 left-0 -translate-y-1/2" style={{ top: pos(left[i].y + left[i].h / 2) }}>
                  <p className="truncate text-sm text-white">{d.name}</p>
                  <p className="nums text-xs text-on-dark-subtle">{n(d.students)}</p>
                </div>
              ))}
            </div>
            <div className="relative">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
                {ribbons}
                {data.degrees.map((d, i) => (
                  <rect key={d.name} x="0" width={XL} y={left[i].y} height={left[i].h} fill={step(i)} />
                ))}
                <rect x={XM0} width={XM1 - XM0} y={mid[0].y} height={mid[0].h} fill={DONE} />
                <rect x={XM0} width={XM1 - XM0} y={mid[1].y} height={mid[1].h} fill={NOT_YET} />
                {bands.map(({ k }, i) => (
                  <rect key={k} x={XR} width={100 - XR} y={right[i].y} height={right[i].h} fill={COFFEE_FILL[k]} />
                ))}
              </svg>
              {[
                { name: "Done", v: done, node: mid[0] },
                { name: "Not yet", v: notDone, node: mid[1] },
              ].map((m) => (
                <div key={m.name} className="absolute flex flex-col items-center justify-center text-center" style={{ left: pos(XM0), width: pos(XM1 - XM0), top: pos(m.node.y), height: pos(m.node.h) }}>
                  <span className="whitespace-nowrap text-xs text-white">{m.name}</span>
                  <span className="nums text-base font-light leading-none text-white">{n(m.v)}</span>
                </div>
              ))}
            </div>
            <div className="relative">
              {bands.map(({ k, b }, i) => (
                <div key={k} className="absolute right-0 left-2 -translate-y-1/2" style={{ top: pos(right[i].y + right[i].h / 2) }}>
                  <p className="flex items-center gap-1.5 text-sm text-white">
                    <Swatch fill={COFFEE_FILL[k]} />
                    {b.name}
                  </p>
                  <p className="nums flex items-baseline gap-1.5 pl-4 text-xs text-on-dark-subtle">
                    <span className={`text-base ${k === "latte" ? "text-accent-300" : "text-white"}`}>{n(b.students)}</span>
                    {b.range}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="min-w-0 space-y-5 max-lg:contents">
          <Lead data={data} className="max-lg:order-first" />
          <div>
            <p className="text-[13px] text-on-dark-subtle">Year of study</p>
            <ul className="mt-2 flex gap-3" aria-label="Students by year">
              {data.years.map((y) => (
                <li key={y.year} className="min-w-0 flex-1">
                  <div className="relative h-24">
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
                      <rect x="0" width="100" y={100 - (y.students / maxYear) * 100} height={(y.students / maxYear) * 100} fill={NOT_YET} />
                      <rect x="0" width="100" y={100 - (y.interviewed / maxYear) * 100} height={(y.interviewed / maxYear) * 100} fill={DONE} />
                    </svg>
                  </div>
                  <p className="mt-1.5 text-[13px] text-white">Year {y.year}</p>
                  <p className="nums text-xs text-on-dark-subtle">
                    <span className="text-white">{n(y.interviewed)}</span>/{n(y.students)}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex items-center gap-4 text-xs text-on-dark-subtle">
              <span className="flex items-center gap-1.5">
                <Swatch fill={DONE} />
                Done
              </span>
              <span className="flex items-center gap-1.5">
                <Swatch fill={NOT_YET} />
                Not yet
              </span>
            </p>
          </div>
          <MarksInline data={data} />
        </div>
      </div>
    </DesignFrame>
  );
}
