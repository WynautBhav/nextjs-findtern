import Link from "next/link";

import { SURFACE_CLASS } from "@/components/app/primitives";
import { employerHref, employersLine, type DriveEmployers, type EmployerRow } from "@/lib/college/drive-employers";
import { shortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { duration } from "./drive-summary";

const when = (d: Date) => shortDateTime(d, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const n = (v: number) => v.toLocaleString("en-IN");

function Status({ s }: { s: EmployerRow["status"] }) {
  switch (s.kind) {
    case "online":
      return (
        <span className="inline-flex items-center gap-1.5 font-medium text-success">
          <span aria-hidden className="size-1.5 rounded-full bg-success" />
          Online
        </span>
      );
    case "seen":
      return <span className="text-ink-700">{s.label}</span>;
    case "never":
      return <span className="text-text-subtle">Not seen</span>;
    case "completed":
      return <span className="text-ink-700">Completed</span>;
    case "withdrawn":
      return <span className="font-medium text-accent-700">Withdrawn</span>;
    case "absent":
      return <span className="font-medium text-accent-700">Didn&apos;t show up</span>;
  }
}

/** A row's company name: a link that covers the whole row (the parent is `relative`), or plain text when nobody came. */
function Company({ r, driveId }: { r: EmployerRow; driveId: string }) {
  const name = <span className="font-medium text-ink-900">{r.company}</span>;
  return r.employerId ? (
    <Link href={employerHref(driveId, r.employerId)} className="outline-none after:absolute after:inset-0 hover:underline focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-500" aria-label={`${r.company}: show this company's candidates`}>
      {name}
    </Link>
  ) : (
    name
  );
}

/** Contact, phone and email under the company. Above the row's stretched link (z-10), so each stays its own target. */
function Reach({ r }: { r: EmployerRow }) {
  const bits = [
    r.contact ? <span key="c">{r.contact}</span> : null,
    r.phone ? (
      <a key="p" href={`tel:${r.phone.replace(/\s+/g, "")}`} className="nums relative z-10 hover:text-brand-700 hover:underline">
        {r.phone}
      </a>
    ) : null,
    r.email ? (
      <a key="e" href={`mailto:${r.email}`} className="relative z-10 break-all hover:text-brand-700 hover:underline">
        {r.email}
      </a>
    ) : null,
  ].filter(Boolean);
  if (!bits.length) return null;
  return (
    <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-text-subtle">
      {bits.map((b, i) => (
        <span key={i} className="inline-flex gap-x-2">
          {i > 0 ? <span aria-hidden>·</span> : null}
          {b}
        </span>
      ))}
    </span>
  );
}

const figure = (r: EmployerRow, v: number) => (r.employerId ? <span className={v ? "text-ink-900" : "text-ink-700"}>{n(v)}</span> : <span className="text-text-subtle">—</span>);

/**
 * Employers in this drive, live or past: who came, who was invited and did not, and what each did. Look only: the
 * officer opens a company to see its candidates and cannot nudge it.
 */
export function DriveEmployersPanel({ driveId, data, over }: { driveId: string; data: DriveEmployers; over: boolean }) {
  const { rows } = data;
  const came = rows.filter((r) => r.employerId);
  const missingRows = rows.filter((r) => !r.employerId);
  // The phone list and the desktop table for one group of companies; the second group's header row is for screen readers only.
  const table = (list: EmployerRow[], headless: boolean) => (
    <>
          {/* Phone: one block per company. */}
          <ul className="divide-y divide-ink-100 sm:hidden">
            {list.map((r) => (
              <li key={r.key} className={cn("relative px-5 py-3 text-sm", r.employerId && "hover:bg-ink-50")}>
                <div className="flex items-baseline justify-between gap-3">
                  <Company r={r} driveId={driveId} />
                  <span className="shrink-0 text-xs"><Status s={r.status} /></span>
                </div>
                <Reach r={r} />
                <p className="nums mt-1 text-xs text-text-subtle">
                  {r.employerId ? `${r.minutes === null ? "" : `${duration(r.minutes)} online · `}${n(r.shortlisted)} shortlisted · ${n(r.meetings)} ${r.meetings === 1 ? "meeting" : "meetings"} · ${n(r.offers)} ${r.offers === 1 ? "offer" : "offers"} · ${n(r.hires)} ${r.hires === 1 ? "hire" : "hires"}` : "Invited"}
                </p>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[54rem] text-sm">
              <thead className={headless ? "sr-only" : undefined}>
                <tr className="text-left text-xs text-text-subtle">
                  <th scope="col" className="px-5 py-2.5 font-medium">Company</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Invited</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Joined</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Online</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Shortlisted</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Meetings</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Offers</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium">Hires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 border-t border-ink-100">
                {list.map((r) => (
                  <tr key={r.key} className={cn("relative", r.employerId && "hover:bg-ink-50")}>
                    <td className="px-5 py-3">
                      <Company r={r} driveId={driveId} />
                      <Reach r={r} />
                    </td>
                    <td className="px-3 py-3"><Status s={r.status} /></td>
                    <td className={cn("px-3 py-3", r.invited ? "text-ink-700" : "text-text-subtle")}>{r.invited ? "Yes" : "No"}</td>
                    <td className="nums px-3 py-3 text-ink-700">{r.joinedAt ? when(r.joinedAt) : "—"}</td>
                    <td className="nums px-3 py-3 text-right text-ink-700">{r.employerId && r.minutes !== null ? duration(r.minutes) : "—"}</td>
                    <td className="nums px-3 py-3 text-right">{figure(r, r.shortlisted)}</td>
                    <td className="nums px-3 py-3 text-right">{figure(r, r.meetings)}</td>
                    <td className="nums px-3 py-3 text-right">{figure(r, r.offers)}</td>
                    <td className={cn("nums px-5 py-3 text-right", r.hires && "font-semibold")}>{figure(r, r.hires)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
    </>
  );
  return (
    <section id="employers" aria-labelledby="drive-employers" className={cn("scroll-mt-6 overflow-hidden", SURFACE_CLASS)}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-ink-100 px-5 py-4">
        <h2 id="drive-employers" className="text-base font-semibold text-ink-900">Employers</h2>
        {rows.length ? <p className="nums text-sm text-ink-700">{employersLine(data, over)}</p> : null}
      </header>

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-text-subtle">{over ? "No company came in through this drive." : "No company has come in yet."}</p>
      ) : (
        <>
          {came.length ? table(came, false) : null}
          {/* 26 Nov PDF: "N invited not yet" on the drive's header jumps here. */}
          {missingRows.length ? (
            <>
              <h3 id="employers-missing" className="scroll-mt-6 border-t border-ink-100 px-5 pb-1 pt-4 text-sm font-semibold text-ink-900">
                {over ? <>Invited, didn&apos;t come</> : "Invited, not here yet"} <span className="nums font-normal text-text-subtle">· {n(missingRows.length)}</span>
              </h3>
              {table(missingRows, came.length > 0)}
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
