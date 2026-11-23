import type { PlacementData } from "@/lib/college/overview-modes";
import { cn } from "@/lib/utils";
import { COFFEE_FILL, GOLD, Legend, MARKS_FILL, n, white } from "../kit";

/** Dark ink for text that sits on a light or gold fill (the hero field colour). */
export const INK = "var(--color-brand-950)";
/** Text colour that reads on a given outcome / band fill. */
export const onFill = (fill: string) => (fill === GOLD || fill === white(0.72) ? INK : "white");
/** Gold at a set strength, for the quieter win (hired, not yet PPO). Same hue as GOLD, never a new colour. */
export const goldA = (a: number) => `color-mix(in srgb, var(--color-accent-400) ${Math.round(a * 100)}%, transparent)`;

/** CGPA / % bands of the interviewed students as one stacked bar; each legend item opens those students. */
export function MarksBar({ data, className }: { data: PlacementData; className?: string }) {
  return (
    <div className={className}>
      <div className="flex h-2.5 gap-0.5 overflow-hidden" role="img" aria-label={`Students by CGPA or percentage band: ${data.marks.map((m) => `${m.name} ${m.students}`).join(", ")}`}>
        {data.marks.map((m) => (m.students ? <span key={m.key} style={{ flexGrow: m.students, flexBasis: 0, background: MARKS_FILL[m.key] }} /> : null))}
      </div>
      <Legend
        className="mt-2.5"
        items={data.marks.map((m) => ({ label: `${m.name} ${m.range}`, fill: MARKS_FILL[m.key], value: m.students, drill: { title: `Interviewed, CGPA / % ${m.name} (${m.range})`, filters: { band: "done", marks: m.key } } }))}
      />
    </div>
  );
}

/** Findtern bands of the interviewed students as one stacked bar; each legend item opens those students. */
export function BandBar({ data, className }: { data: PlacementData; className?: string }) {
  return (
    <div className={className}>
      <div className="flex h-2.5 gap-0.5 overflow-hidden" role="img" aria-label={`Students by Findtern band: ${data.coffee.map((b) => `${b.name} ${b.students}`).join(", ")}`}>
        {data.coffee.map((b) => (b.students ? <span key={b.key} style={{ flexGrow: b.students, flexBasis: 0, background: COFFEE_FILL[b.key] }} /> : null))}
      </div>
      <Legend
        className="mt-2.5"
        items={data.coffee.map((b) => ({ label: `${b.name} ${b.range}`, fill: COFFEE_FILL[b.key], value: b.students, drill: { title: `${b.name} (${b.range})`, filters: { band: b.key } } }))}
      />
    </div>
  );
}

const dash = (v: number | null) => (v === null ? "-" : v.toFixed(1));

/** The two averages, side by side. */
export function Averages({ data, className }: { data: PlacementData; className?: string }) {
  const figs = [["Avg CGPA / % out of 10", dash(data.avgMarks)], ["Avg Findtern score", dash(data.avgScore)]] as const;
  return (
    <div className={cn("flex gap-8", className)}>
      {figs.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <p className="text-[13px] text-on-dark">{label}</p>
          <p className="nums mt-1 text-[1.75rem] font-light leading-none tracking-[-0.03em] text-white">{value}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Meetings with employers: the two figures asked for (conducted, not accepted by the student) and every meeting in
 * one bar, its parts adding up to the total. Legend items open the students behind each part.
 */
export function Meetings({ data, className }: { data: PlacementData; className?: string }) {
  const m = data.meetings;
  const parts = [
    { key: "met", label: "Conducted", v: m.done, fill: GOLD },
    { key: "meet-upcoming", label: "Booked", v: m.upcoming, fill: white(0.72) },
    { key: "meet-waiting", label: "Waiting for the student", v: m.waiting, fill: white(0.38) },
    { key: "not-accepted", label: "Not accepted", v: m.notAccepted, fill: white(0.2) },
    { key: "meet-other", label: "Missed or called off", v: m.other, fill: white(0.08) },
  ] as const;
  const title: Record<(typeof parts)[number]["key"], string> = {
    met: "Students who had a meeting",
    "meet-upcoming": "Students with a meeting booked",
    "meet-waiting": "Students yet to answer a meeting",
    "not-accepted": "Students who didn't accept a meeting",
    "meet-other": "Students with a missed or called-off meeting",
  };
  return (
    <section className={cn("grid gap-x-10 gap-y-4 sm:grid-cols-[auto_1fr] sm:items-end", className)} aria-label="Meetings with employers">
      <div className="flex gap-8">
        <div>
          <p className="text-[13px] text-on-dark">Meetings conducted</p>
          <p className="nums mt-1 text-[1.75rem] font-light leading-none tracking-[-0.03em] text-accent-300">{n(m.done)}</p>
        </div>
        <div>
          <p className="text-[13px] text-on-dark">Not accepted</p>
          <p className="nums mt-1 text-[1.75rem] font-light leading-none tracking-[-0.03em] text-white">{n(m.notAccepted)}</p>
        </div>
      </div>
      <div className="min-w-0">
        <p className="mb-2 text-[13px] text-on-dark">
          <span className="nums text-white">{n(m.total)}</span> {m.total === 1 ? "meeting" : "meetings"} asked for by employers, with <span className="nums text-white">{n(m.students)}</span> {m.students === 1 ? "student" : "students"}
        </p>
        <div className="flex h-2.5 gap-0.5 overflow-hidden" role="img" aria-label={`${m.total} meetings: ${parts.map((p) => `${p.label} ${p.v}`).join(", ")}`}>
          {m.total ? parts.map((p) => (p.v ? <span key={p.key} style={{ flexGrow: p.v, flexBasis: 0, background: p.fill }} /> : null)) : <span className="flex-1" style={{ background: white(0.08) }} />}
        </div>
        <Legend className="mt-2.5" items={parts.map((p) => ({ label: p.label, fill: p.fill, value: p.v, drill: p.v ? { title: title[p.key], filters: { outcome: p.key } } : undefined }))} />
      </div>
    </section>
  );
}
