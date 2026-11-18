/**
 * A proposal's life as a four-stage trail for the employer's ledger: Sent, Accepted, Paid, Starts.
 * Pure and import-free (the node tests run it). Only dates the rows really hold are printed: an
 * acceptance has no stored date, so that stage shows none.
 */
export type TrailKey = "sent" | "accepted" | "paid" | "starts";
export type TrailStage = { key: TrailKey; label: string; state: "done" | "current" | "todo" | "closed"; date: string | null };

type DateLike = Date | string | null | undefined;

const asDate = (v: DateLike): Date | null => {
  if (!v) return null;
  const d = typeof v === "string" ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Whole calendar days from today (India time) to a `YYYY-MM-DD` start date; negative once it has begun. Null when there is no date. */
export function daysUntil(startDate: string | null | undefined, now: Date = new Date()): number | null {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}/.test(startDate)) return null;
  const [y, m, d] = startDate.slice(0, 10).split("-").map(Number);
  const ist = new Date(now.getTime() + 330 * 60_000);
  const today = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  return Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000);
}

export function stageTrail(
  p: { status: string; createdAt: DateLike; hiredAt: DateLike },
  offer: { startDate: string | null },
  /** `closed`: declined, withdrawn, expired or lapsed. `acceptedBeforeClose`: it was accepted, then closed unpaid. */
  flags: { closed: boolean; acceptedBeforeClose?: boolean },
  fmt: (v: Date | string) => string,
  now: Date = new Date(),
): TrailStage[] {
  const status = p.status.trim().toLowerCase();
  const sent = asDate(p.createdAt);
  const start = offer.startDate ? new Date(`${offer.startDate.slice(0, 10)}T00:00:00+05:30`) : null;
  const sentStage = { key: "sent" as const, label: "Sent", date: sent ? fmt(sent) : null };
  const startsDate = offer.startDate ? fmt(offer.startDate) : null;

  if (flags.closed) {
    const accepted = Boolean(flags.acceptedBeforeClose);
    return [
      { ...sentStage, state: "done" },
      { key: "accepted", label: "Accepted", date: null, state: accepted ? "done" : "closed" },
      { key: "paid", label: "Paid", date: null, state: "closed" },
      { key: "starts", label: "Starts", date: startsDate, state: "closed" },
    ];
  }

  const accepted = ["accepted", "processing", "hired"].includes(status);
  const paid = status === "hired";
  const paidAt = asDate(p.hiredAt);
  const started = paid && start !== null && !Number.isNaN(start.getTime()) && start <= now;
  const done = [true, accepted, paid, started];
  const current = done.indexOf(false);
  const state = (i: number): TrailStage["state"] => (done[i] ? "done" : i === current ? "current" : "todo");
  return [
    { ...sentStage, state: state(0) },
    { key: "accepted", label: "Accepted", date: null, state: state(1) },
    { key: "paid", label: status === "processing" ? "Paying" : "Paid", date: paidAt ? fmt(paidAt) : null, state: state(2) },
    { key: "starts", label: started ? "Started" : "Starts", date: startsDate, state: state(3) },
  ];
}
