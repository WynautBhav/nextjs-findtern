import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { StatusBadge } from "@/components/admin/status-badge";
import { CgpaDecision } from "@/components/admin/cgpa/decision";
import { CopyValue } from "@/components/admin/cgpa/copy-button";
import { firstAcceptedAt, startWarning, type CgpaQueueRow } from "@/lib/admin/cgpa-queue";
import { cgpaSla } from "@/lib/cgpa-verification-flow";
import { formatDate, shortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const unit = (t: string) => (t === "percentage" ? "%" : " / 10");
const when = (iso: string | null) => (iso ? `${shortDateTime(new Date(iso), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} IST` : "n/a");
const day = (iso: string | null) => (iso ? shortDateTime(new Date(iso), { day: "numeric", month: "short" }) : "");

/** How long a pending check has been waiting: whole hours under two days, whole days after. Null when no offer was accepted yet. */
export function waitedFor(row: Pick<CgpaQueueRow, "proposals">, now: Date): { hours: number; label: string; unit: string } | null {
  const sla = cgpaSla(firstAcceptedAt(row.proposals), now);
  if (sla.hoursElapsed === null) return null;
  const hours = Math.max(0, Math.floor(sla.hoursElapsed));
  return hours < 48 ? { hours, label: String(hours), unit: "hours" } : { hours, label: String(Math.floor(hours / 24)), unit: "days" };
}

function Label({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-medium text-ink-700">{children}</h3>;
}

/** The age cell: the one figure a triage queue is sorted by. */
function Age({ row, now }: { row: CgpaQueueRow; now: Date }) {
  if (row.status !== "pending") {
    return (
      <div>
        <p className="text-sm font-medium text-ink-900">{row.status === "verified" ? "Verified" : "Marked incorrect"}</p>
        <p className="nums text-xs text-ink-700">{day(row.decidedAt)}</p>
      </div>
    );
  }
  const waited = waitedFor(row, now);
  if (!waited) {
    return (
      <div>
        <p className="font-display text-lg font-semibold text-ink-700">No clock</p>
        <p className="text-xs text-ink-700">no offer accepted yet</p>
      </div>
    );
  }
  const sla = cgpaSla(firstAcceptedAt(row.proposals), now);
  const overdue = sla.tone === "overdue";
  return (
    <div>
      <p className={cn("nums font-display text-2xl font-semibold leading-none", overdue ? "text-signal" : "text-ink-900")}>
        {waited.label}
        <span className="ml-1 text-sm font-medium text-ink-700">{waited.unit === "days" ? (waited.label === "1" ? "day" : "days") : "h"}</span>
      </p>
      <p className={cn("mt-1.5 text-xs", overdue ? "font-medium text-signal" : "text-ink-700")}>
        {overdue ? (waited.hours >= 96 ? `${Math.floor((waited.hours - 48) / 24)} days overdue` : sla.label) : sla.label.replace(" left", " left of 48")}
      </p>
    </div>
  );
}

/**
 * The triage queue: one ruled row per check, oldest first, the age on the left. Each row holds who, the claim, the
 * offers waiting on it, the proofs to look at and the two decisions.
 */
export function CgpaRows({ rows, now, canWrite }: { rows: CgpaQueueRow[]; now: Date; canWrite: boolean }) {
  return (
    <ol className="divide-y divide-[color:var(--admin-rule)]">
      {rows.map((r) => {
        const decided = r.status !== "pending";
        return (
          <li key={r.internId} className="grid gap-x-8 gap-y-4 px-[var(--admin-pad-panel)] py-5 lg:grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1.3fr)]">
            <Age row={r} now={now} />

            <div className="min-w-0">
              <h2 className="break-words font-display text-lg font-semibold text-ink-900">
                <Link href={`/admin/interns/${r.internId}`} className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  {r.name}
                </Link>
              </h2>
              <p className="break-words text-sm text-ink-700">
                {r.college} · {r.course}
              </p>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <dt className="w-12 shrink-0 text-ink-700">Phone</dt>
                  <dd>
                    <CopyValue value={r.phone} label="phone number" />
                  </dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="w-12 shrink-0 text-ink-700">Email</dt>
                  <dd className="min-w-0">
                    <CopyValue value={r.email} label="email" />
                  </dd>
                </div>
              </dl>
            </div>

            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="nums font-display text-2xl font-semibold leading-none text-ink-900">
                  {r.claimedScore}
                  <span className="text-sm font-medium text-ink-700">{unit(r.scoreType)}</span>
                </p>
                <p className="text-sm text-ink-700">{r.scoreType === "percentage" ? "claimed percentage" : "claimed CGPA"}, {r.semester ? `semester ${r.semester}` : "semester not chosen"}</p>
                {r.status === "incorrect" && r.correctedScore ? (
                  <p className="nums text-sm font-medium text-danger">
                    Corrected to {r.correctedScore}
                    {unit(r.scoreType)}
                  </p>
                ) : null}
              </div>

              <div>
                <Label>Offers waiting on this check</Label>
                {r.proposals.length === 0 ? (
                  <p className="mt-1 text-sm text-ink-700">None yet. The 24 to 48 hour clock starts when the candidate accepts one.</p>
                ) : (
                  <ul className="mt-1 space-y-1.5">
                    {r.proposals.map((p) => {
                      const warn = decided ? null : startWarning(p.startDate, now);
                      return (
                        <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          <span className="min-w-0 break-words font-medium text-ink-900">
                            {p.company} · {p.project}
                          </span>
                          <span className="nums text-ink-700">starts {p.startDate ? formatDate(p.startDate) : "n/a"}</span>
                          {warn ? <StatusBadge tone={warn.tone === "past" ? "danger" : "warning"} label={warn.label} /> : null}
                          <span className="text-xs text-ink-700">accepted {when(p.acceptedAt)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="space-y-4 lg:col-span-2 lg:col-start-2">
              <div>
                <Label>
                  Proofs, {r.proofs.length}
                  {r.semester ? ` of ${r.semester} semesters` : ""}
                </Label>
                {r.proofs.length === 0 ? (
                  <p className="mt-1 text-sm text-ink-700">
                    No proof photos on file.{" "}
                    <Link href={`/admin/interns/${r.internId}`} className="font-medium text-brand-800 underline underline-offset-4">
                      Check the candidate&apos;s documents
                    </Link>
                    .
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-3">
                    {r.proofs.map((p) => {
                      const src = `/admin/interns/${r.internId}/documents/open?key=${encodeURIComponent(p.docKey)}`;
                      return (
                        <li key={p.key} className="w-28 sm:w-32">
                          <a href={src} target="_blank" rel="noopener noreferrer" className="group block rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                            <span className="relative block aspect-[4/3] overflow-hidden rounded-md border border-ink-200 bg-ink-100">
                              {/* The admin documents route streams the image after checking the session and that the key is on this candidate's record. */}
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={src} alt={`${p.label} for ${r.name}`} loading="lazy" className="size-full object-cover transition-transform duration-150 group-hover:scale-105" />
                            </span>
                            <span className="mt-1 flex items-start gap-1 text-xs leading-snug text-ink-800">
                              <span className="min-w-0 break-words">{p.label}</span>
                              <ExternalLink className="mt-0.5 size-3 shrink-0 text-ink-600" aria-hidden />
                              <span className="sr-only"> (opens in a new tab)</span>
                            </span>
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {decided ? (
                <p className="text-sm text-ink-700">
                  {r.status === "verified" ? "Verified" : "Marked incorrect"} {when(r.decidedAt)}
                  {r.note ? <span className="block break-words text-ink-900">Note: {r.note}</span> : null}
                </p>
              ) : canWrite ? (
                <CgpaDecision target={{ internId: r.internId, name: r.name, semester: r.semester, claimedScore: r.claimedScore, scoreType: r.scoreType }} />
              ) : (
                <p className="text-sm text-ink-700">You can view this check but your role can&apos;t decide it.</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
