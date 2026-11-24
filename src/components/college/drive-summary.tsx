import Link from "next/link";
import { AlertTriangle, Check } from "lucide-react";

import type { DriveSummary as Summary, NudgeKind } from "@/lib/college/drive-summary";
import { shortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NudgeButton } from "./nudge-button";

const SURFACE = "overflow-hidden rounded-apple-xl border border-ink-200/80 bg-card shadow-xs";
const n = (v: number) => v.toLocaleString("en-IN");
const when = (d: Date) => shortDateTime(d, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** 0 min, 45 min, 3 h, 3 h 20 min. */
export function duration(min: number | null): string {
  if (min === null) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const VERDICT = {
  good: { word: "Going well", tone: "text-success" },
  watch: { word: "Mostly on track", tone: "text-warning" },
  poor: { word: "Needs attention", tone: "text-danger" },
} as const;

function Block({ id, title, note, action, children, className }: { id: string; title: string; note?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn("min-w-0 px-5 py-5 sm:px-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 id={id} className="text-sm font-semibold text-ink-900">{title}</h3>
          {note ? <p className="mt-0.5 text-pretty text-xs leading-relaxed text-text-subtle">{note}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StudentLink({ id, name, open }: { id: string; name: string; open: boolean }) {
  return open ? (
    <Link href={`/college/students/${id}`} className="truncate font-medium text-ink-900 hover:text-brand-700 hover:underline">
      {name}
    </Link>
  ) : (
    <span className="truncate font-medium text-ink-900">{name}</span>
  );
}

/** A share of a whole, on one shared 0-100 scale. */
function Bar({ value, of, tone = "bg-brand-600" }: { value: number; of: number; tone?: string }) {
  const w = of > 0 ? Math.round((value / of) * 100) : 0;
  return (
    <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-ink-100">
      <span className={cn("block h-full rounded-full", tone)} style={{ width: `${value > 0 ? Math.max(2, w) : 0}%` }} />
    </span>
  );
}

const CLOSED = "The drive is over, so names are closed. The figures stay.";

/**
 * The drive summary. Live: opened from the hero's "Drive summary" button; every list links to the student or
 * carries the one action that fixes it. Over: shown under the hero as a read-only report (names, no actions).
 */
export function DriveSummary({ s, open, canAct = open, startedLabel }: { s: Summary; open: boolean; /** The drive is still running: nudge buttons show. A finished drive shows names but no actions. */ canAct?: boolean; startedLabel: string }) {
  const since = s.trackingSince ? shortDateTime(s.trackingSince, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }) : null;
  const verdict = VERDICT[s.health.verdict];
  const sinceDay = s.trackingSince ? shortDateTime(s.trackingSince, { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }) : null;
  // On a part-recorded drive "never online" is not known; only "not seen since tracking began" is.
  const notSeen = s.tracked === "partial" && sinceDay ? `not seen since ${sinceDay}` : "never online";
  const funnelBase = s.funnel[0]?.value ?? 0;
  const empMax = Math.max(1, ...s.online.employers.map((e) => e.minutes));
  const trackedNote =
    s.tracked === "none"
      ? since
        ? `Online time is recorded from ${since}, after this drive.`
        : "Online time has not been recorded yet."
      : s.tracked === "partial"
        ? `Recorded from ${since}; this drive began on ${startedLabel}, so earlier hours are not counted.`
        : null;

  return (
    <section id="summary" aria-labelledby="summary-title" className={cn("scroll-mt-6", SURFACE)}>
      {/* Verdict and the signals behind it: each one a link to where it is fixed. */}
      <div className="grid gap-6 border-b border-ink-100 px-5 py-6 sm:px-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-10">
        <div className="min-w-0">
          <h2 id="summary-title" className="text-base font-semibold text-ink-900">Drive summary</h2>
          <p className={cn("mt-3 text-[clamp(1.5rem,2.6vw,2rem)] font-light leading-tight tracking-[-0.03em]", verdict.tone)}>{verdict.word}</p>
          <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-700">{s.health.line}</p>
        </div>
        <ul className="grid content-start gap-1 sm:grid-cols-2" aria-label="How the drive is doing">
          {s.health.signals.map((g) => {
            const body = (
              <>
                {g.ok ? <Check className="size-4 shrink-0 text-success" aria-hidden /> : <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />}
                <span className="min-w-0 flex-1 truncate text-sm text-ink-700">{g.label}</span>
                <span className={cn("nums text-sm font-semibold", g.ok ? "text-ink-900" : "text-warning")}>{g.value}</span>
                <span className="sr-only">{g.ok ? "(fine)" : "(needs attention)"}</span>
              </>
            );
            return (
              <li key={g.key}>
                {open ? (
                  <Link href={g.href} className="flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-brand-600">
                    {body}
                  </Link>
                ) : (
                  <div className="flex min-h-11 items-center gap-2.5 px-2.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid divide-y divide-ink-100 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        {/* Where students drop out. */}
        <Block id="sum-funnel" title="Where students drop out" note="Offers can come without a meet, so each step names what it is a share of.">
          <ol className="space-y-2.5">
            {s.funnel.map((f) => {
              const row = (
                <>
                  <span className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate text-ink-700">{f.label}</span>
                    <span className="nums shrink-0 text-ink-900">
                      <span className="font-semibold">{n(f.value)}</span>
                      {f.share !== null ? <span className="text-text-subtle"> · {f.share}% {f.of}</span> : null}
                    </span>
                  </span>
                  <span className="mt-1.5 block">
                    <Bar value={f.value} of={funnelBase} tone={f.key === "hired" ? "bg-accent-500" : "bg-brand-600"} />
                  </span>
                </>
              );
              return (
                <li key={f.key}>
                  {f.href ? (
                    <Link href={f.href} className="-mx-2 block rounded-lg px-2 py-1 hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-brand-600">
                      {row}
                    </Link>
                  ) : (
                    <div className="py-1">{row}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </Block>

        {/* Nudges sent in the drive, and whether each one worked. */}
        <Block id="sum-nudges" title="Nudges" note={s.nudges.total ? `${n(s.nudges.total)} sent in this drive. "Worked" means the student did it within a day.` : "No nudges sent in this drive yet."}>
          {s.nudges.byKind.length ? (
            <ul className="space-y-3">
              {s.nudges.byKind.map((k) => {
                const again = s.nudges.again[k.kind as NudgeKind] ?? [];
                return (
                  <li key={k.kind} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5">
                    <span className="truncate text-sm text-ink-700">{k.label}</span>
                    <span className="nums text-sm text-ink-900">
                      {k.checkable ? (
                        <>
                          <span className="font-semibold">{n(k.worked)}</span> of {n(k.sent)} worked
                        </>
                      ) : (
                        <>{n(k.sent)} sent</>
                      )}
                    </span>
                    <span className="col-span-2 flex items-center gap-3">
                      <span className="flex-1">{k.checkable ? <Bar value={k.worked} of={k.sent} /> : null}</span>
                      {canAct && again.length && k.kind !== "interview" ? (
                        <NudgeButton kind={k.kind} userIds={again} label={`Nudge ${n(again.length)} again`} size="xs" />
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : canAct ? (
            <p className="text-sm text-ink-700">Use Nudge on any list in the drive board below; each one shows up here with what came of it.</p>
          ) : null}
          {open && s.nudges.rows.length ? (
            <details className="group mt-4">
              <summary className="min-h-9 cursor-pointer list-none text-sm font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600">
                <span className="group-open:hidden">Show each nudge</span>
                <span className="hidden group-open:inline">Hide each nudge</span>
              </summary>
              <ul className="mt-2 divide-y divide-ink-100">
                {s.nudges.rows.map((r, i) => (
                  <li key={`${r.userId}-${r.kind}-${i}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-2 text-sm">
                    <StudentLink id={r.userId} name={r.name} open={open} />
                    <span className={cn("text-right", r.worked === false ? "text-warning" : r.worked ? "text-success" : "text-text-subtle")}>{r.outcome}</span>
                    <span className="text-xs text-text-subtle">
                      {r.kind === "meeting" ? "Answer a meet" : r.kind === "offer" ? "Reply to an offer" : r.kind === "online" ? "Come online" : "Interview"} · {when(r.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {!open && s.nudges.total ? <p className="mt-3 text-xs text-text-subtle">{CLOSED}</p> : null}
        </Block>
      </div>

      {/* Time online: students and the companies. */}
      <div className="grid divide-y divide-ink-100 border-t border-ink-100 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <Block
          id="sum-online-students"
          title="Students online"
          note={trackedNote ?? "Time with Findtern open during the drive."}
          action={
            canAct && s.tracked !== "none" && s.online.neverOnline.length ? (
              <NudgeButton kind="online" userIds={s.online.neverOnline.map((x) => x.userId)} label={`Nudge ${n(s.online.neverOnline.length)} ${notSeen}`} size="xs" emphasis />
            ) : null
          }
        >
          {s.tracked === "none" ? (
            <p className="text-sm text-ink-700">Nothing to show yet.</p>
          ) : (
            <>
              <dl className="grid grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <dt className="text-xs text-text-subtle">Average per student</dt>
                  <dd className="nums mt-1 text-lg font-light tracking-[-0.02em] sm:text-xl text-ink-900">{duration(s.online.studentsAvg)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-subtle">Came online</dt>
                  <dd className="nums mt-1 text-lg font-light tracking-[-0.02em] sm:text-xl text-ink-900">{n(s.online.studentsEver)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-subtle first-letter:uppercase">{notSeen}</dt>
                  <dd className={cn("nums mt-1 text-lg font-light tracking-[-0.02em] sm:text-xl", s.online.neverOnlineCount ? "text-warning" : "text-ink-900")}>{n(s.online.neverOnlineCount)}</dd>
                </div>
              </dl>
              {open && s.online.most.length ? (
                <>
                  <p className="mt-5 text-xs font-medium text-ink-700">Most time online</p>
                  <ul className="mt-1.5 divide-y divide-ink-100">
                    {s.online.most.map((x) => (
                      <li key={x.userId} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <StudentLink id={x.userId} name={x.name} open={open} />
                        <span className="nums shrink-0 text-ink-700">{duration(x.minutes)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}
        </Block>

        <Block id="sum-online-employers" title="Companies online" note={trackedNote ?? "Time each company had Findtern open during the drive."}>
          {s.online.employers.length === 0 ? (
            <p className="text-sm text-ink-700">No company has come in yet.</p>
          ) : (
            <ul className="space-y-3">
              {s.online.employers.map((e) => (
                <li key={e.employerId}>
                  <span className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate text-ink-900">{e.company}</span>
                    <span className="nums shrink-0 text-ink-700">{s.tracked === "none" ? "—" : duration(e.minutes)}</span>
                  </span>
                  {s.tracked === "none" ? null : (
                    <span className="mt-1.5 block">
                      <Bar value={e.minutes} of={empMax} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Block>
      </div>

      {/* How fast students answer, and the strong students nobody has reached. */}
      <div className="grid divide-y divide-ink-100 border-t border-ink-100 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <Block id="sum-speed" title="How fast students reply" note="Middle value: half reply faster, half slower.">
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-text-subtle">To a meet request</dt>
              <dd className="nums mt-1 text-lg font-light tracking-[-0.02em] sm:text-xl text-ink-900">{s.speed.meetMedianMin === null ? "—" : duration(s.speed.meetMedianMin)}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-subtle">To an offer</dt>
              <dd className="nums mt-1 text-lg font-light tracking-[-0.02em] sm:text-xl text-ink-900">
                {s.speed.offerMedianHours === null ? "—" : s.speed.offerMedianHours < 1 ? duration(Math.round(s.speed.offerMedianHours * 60)) : `${s.speed.offerMedianHours} h`}
              </dd>
            </div>
          </dl>
          {open && s.speed.slowMeet.length ? (
            <>
              <p className="mt-5 text-xs font-medium text-ink-700">Slowest to answer a meet</p>
              <ul className="mt-1.5 divide-y divide-ink-100">
                {s.speed.slowMeet.map((x, i) => (
                  <li key={`${x.userId}-${i}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <StudentLink id={x.userId} name={x.name} open={open} />
                    <span className="nums shrink-0 text-ink-700">{duration(x.minutes)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Block>

        <Block id="sum-missed" title="Strong students not reached" note="Findtern score 8 or more, with no meet request and no offer.">
          <p className="nums text-lg font-light tracking-[-0.02em] sm:text-xl text-ink-900">{n(s.missed.count)}</p>
          {open && s.missed.rows.length ? (
            <ul className="mt-3 divide-y divide-ink-100">
              {s.missed.rows.slice(0, 6).map((x) => (
                <li key={x.userId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-2 text-sm">
                  <span className="min-w-0">
                    <StudentLink id={x.userId} name={x.name} open={open} />
                    <span className="block truncate text-xs text-text-subtle">{[x.branch, x.year ? `Year ${x.year}` : null].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="nums text-ink-700">{x.score?.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {open && s.missed.count > 6 ? <p className="mt-2 text-xs text-text-subtle">And {n(s.missed.count - 6)} more.</p> : null}
          {!open && s.missed.count ? <p className="mt-3 text-xs text-text-subtle">{CLOSED}</p> : null}
        </Block>
      </div>
    </section>
  );
}
