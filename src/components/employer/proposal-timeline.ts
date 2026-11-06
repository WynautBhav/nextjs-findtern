/**
 * An offer's life as steps for the employer proposal page: sent, (interview),
 * accepted, paid, starts - or cut short by a decline, a withdraw or a lapse.
 * Only dates the rows really hold are printed; an acceptance has no stored
 * date, so it shows none. Server-safe and import-free so it runs under node:test.
 */
export type TimelineStep = { label: string; date: string | null; state: "done" | "current" | "todo" | "closed" };

type DateLike = Date | string | null;

export function offerTimeline(
  p: { status: string | null; createdAt: DateLike; updatedAt: DateLike; hiredAt: DateLike },
  offer: { startDate: string | null; fullTime: boolean },
  /** From `offerState`: the closed step reuses its label so the pill and the timeline agree. */
  state: { label: string; lapsed: boolean },
  fmt: (value: Date | string) => string,
  now: Date = new Date(),
): TimelineStep[] {
  const status = (p.status ?? "").toLowerCase();
  const ft = offer.fullTime;
  const accepted = ["accepted", "processing", "hired"].includes(status);
  const hired = status === "hired";
  const startDay = offer.startDate ? new Date(`${offer.startDate.slice(0, 10)}T00:00:00+05:30`) : null;
  const started = hired && startDay !== null && !Number.isNaN(startDay.getTime()) && startDay <= now;

  const steps: Omit<TimelineStep, "state">[] = [{ label: "Offer sent", date: p.createdAt ? fmt(p.createdAt) : null }];
  const done: boolean[] = [true];
  if (status === "interview_scheduled") {
    steps.push({ label: "Interview booked", date: null });
    done.push(true);
  }

  if (state.lapsed || ["rejected", "withdrawn", "expired"].includes(status)) {
    return [
      ...steps.map((s) => ({ ...s, state: "done" as const })),
      { label: state.label, date: !state.lapsed && p.updatedAt ? fmt(p.updatedAt) : null, state: "closed" },
    ];
  }

  steps.push({ label: accepted ? "Accepted by the candidate" : "Candidate decides", date: null });
  done.push(accepted);
  steps.push({
    label: hired ? "Paid, hire confirmed" : status === "processing" ? "Payment in progress" : ft ? "You pay the hiring fee" : "You pay to confirm the hire",
    date: p.hiredAt ? fmt(p.hiredAt) : null,
  });
  done.push(hired);
  steps.push({ label: started ? (ft ? "Joined" : "Started") : ft ? "Joins" : "Starts", date: offer.startDate ? fmt(offer.startDate) : null });
  done.push(started);

  const current = done.indexOf(false);
  return steps.map((s, i) => ({ ...s, state: done[i] ? "done" : i === current ? "current" : "todo" }));
}
