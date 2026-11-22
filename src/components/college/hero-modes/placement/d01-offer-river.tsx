import type { PlacementData } from "@/lib/college/overview-modes";
import { COFFEE_FILL, DesignFrame, Figure, GOLD, Legend, n, OUTCOME_FILL, pct, white } from "../kit";

/**
 * Placement 1, "Offer river": every offer received as one long bar split by what the student did with it
 * (accepted, not answered, rejected, withdrawn), then the three Findtern bands as lanes showing how many in each got
 * an offer and how many were hired, and the end figures: internships and PPOs.
 */
export function OfferRiver({ data }: { data: PlacementData }) {
  const o = data.offers;
  const parts = [
    { key: "accepted", label: "Accepted", v: o.accepted },
    { key: "notAnswered", label: "Not answered", v: o.notAnswered },
    { key: "rejected", label: "Rejected", v: o.rejected },
    { key: "withdrawn", label: "Withdrawn by employer", v: o.withdrawn },
  ] as const;
  return (
    <DesignFrame
      label="Offers and placement by Findtern band"
      finding={
        <>
          {n(o.received)} offers to {n(data.withOffer)} students: {n(o.accepted)} accepted, {n(o.notAnswered)} still waiting for an answer.
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-6">
          <div>
            <div className="flex h-10 overflow-hidden rounded-xl" role="img" aria-label={parts.map((p) => `${p.label} ${p.v}`).join(", ")}>
              {parts.map((p) =>
                p.v ? (
                  <span key={p.key} className="nums grid place-items-center text-xs font-medium" style={{ width: `${pct(p.v, o.received)}%`, background: OUTCOME_FILL[p.key], color: p.key === "withdrawn" || p.key === "rejected" ? "white" : "var(--color-brand-950)" }}>
                    {pct(p.v, o.received) >= 8 ? n(p.v) : ""}
                  </span>
                ) : null,
              )}
            </div>
            <Legend className="mt-3" items={parts.map((p) => ({ label: p.label, fill: OUTCOME_FILL[p.key], value: p.v }))} />
          </div>
          <ul className="space-y-3" aria-label="By Findtern band">
            {data.coffee.map((b) => (
              <li key={b.key} className="grid grid-cols-[6.5rem_1fr_6rem] items-center gap-3 text-sm">
                <span className="flex items-center gap-2 text-white">
                  <span className="size-2.5 rounded-full" style={{ background: COFFEE_FILL[b.key] }} aria-hidden />
                  {b.name}
                </span>
                {/* Track = the band's students; light fill = got an offer; gold = hired. */}
                <span className="relative h-3 rounded-full" style={{ background: white(0.1) }} aria-hidden>
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct(b.withOffer, b.students)}%`, background: white(0.55) }} />
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct(b.hired, b.students)}%`, background: GOLD }} />
                </span>
                <span className="nums text-right text-xs text-on-dark-subtle">
                  <span className="text-white">{n(b.hired)}</span> hired of {n(b.students)}
                </span>
              </li>
            ))}
          </ul>
          <Legend items={[{ label: "Students in band", fill: white(0.1) }, { label: "Got an offer", fill: white(0.55) }, { label: "Hired", fill: GOLD }]} />
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 self-start">
          <Figure label="AI interview done" value={n(data.interviewed)} note={data.avgScore !== null ? `Avg Findtern score ${data.avgScore.toFixed(1)}` : undefined} />
          <Figure label="Avg CGPA / % out of 10" value={data.avgMarks !== null ? data.avgMarks.toFixed(1) : "-"} />
          <Figure label="Got internships" value={n(data.internships)} gold />
          <Figure label="PPO, full-time offers" value={n(data.ppo)} />
        </div>
      </div>
    </DesignFrame>
  );
}
