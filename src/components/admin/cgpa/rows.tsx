import Link from "next/link";
import { ExternalLink, Phone } from "lucide-react";

import { StatusBadge } from "@/components/admin/status-badge";
import { CgpaDecision } from "@/components/admin/cgpa/decision";
import { CopyValue } from "@/components/admin/cgpa/copy-button";
import { rowSla, startWarning, type CgpaQueueRow } from "@/lib/admin/cgpa-queue";
import { proofSlots, semesterLabel } from "@/lib/cgpa-verification";
import { formatDate, shortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const unit = (t: string) => (t === "percentage" ? "%" : " / 10");
const when = (iso: string | null) => (iso ? `${shortDateTime(new Date(iso), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} IST` : "n/a");

function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-medium uppercase tracking-wide text-text-subtle">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{children}</dd>
    </div>
  );
}

function SlaBadge({ row, now }: { row: CgpaQueueRow; now: Date }) {
  if (row.status !== "pending") return null;
  const sla = rowSla(row, now);
  if (sla.tone === "none") return <StatusBadge tone="neutral" label="No offer accepted yet" />;
  return <StatusBadge tone={sla.tone === "overdue" ? "danger" : sla.tone === "soon" ? "warning" : "success"} label={sla.tone === "overdue" ? `Overdue · ${sla.label}` : sla.label} />;
}

/** One check per card: who, what they claim, the proofs to look at, the offers waiting, and the two decisions. */
export function CgpaRows({ rows, now, canWrite }: { rows: CgpaQueueRow[]; now: Date; canWrite: boolean }) {
  return (
    <ul className="divide-y divide-[color:var(--admin-rule)]">
      {rows.map((r) => {
        const decided = r.status !== "pending";
        return (
          <li key={r.internId} className="space-y-4 px-4 py-5 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <h2 className="break-words text-base font-semibold text-foreground">
                  <Link href={`/admin/interns/${r.internId}`} className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:inline-flex touch:min-h-11 touch:items-center">
                    {r.name}
                  </Link>
                </h2>
                <p className="break-words text-sm text-text-subtle">
                  {r.college} · {r.course}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {r.status === "verified" ? <StatusBadge tone="success" label="Verified" /> : null}
                {r.status === "incorrect" ? <StatusBadge tone="danger" label="Marked incorrect" /> : null}
                <SlaBadge row={r} now={now} />
              </div>
            </div>

            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
              <Fact label="Semester">{r.semester != null ? semesterLabel(r.semester) : "Not chosen"}</Fact>
              <Fact label={r.scoreType === "percentage" ? "Claimed percentage" : "Claimed CGPA"}>
                <span className="nums font-semibold">
                  {r.claimedScore}
                  {unit(r.scoreType)}
                </span>
                {r.status === "incorrect" && r.correctedScore ? (
                  <span className="nums mt-0.5 block text-danger">
                    Corrected to {r.correctedScore}
                    {unit(r.scoreType)}
                  </span>
                ) : null}
              </Fact>
              <Fact label="Phone">
                <span className="inline-flex items-center gap-1">
                  <Phone className="size-3.5 shrink-0 text-text-subtle" aria-hidden />
                  <CopyValue value={r.phone} label="phone number" />
                </span>
              </Fact>
              <Fact label="Email">
                <CopyValue value={r.email} label="email" />
              </Fact>
            </dl>

            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-text-subtle">Proofs ({r.proofs.length}{r.semester != null ? ` of ${proofSlots(r.semester).length}` : ""})</h3>
              {r.proofs.length === 0 ? (
                <p className="mt-1.5 text-sm text-text-subtle">No proof photos on file. Check the candidate&apos;s documents.</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-3">
                  {r.proofs.map((p) => {
                    const src = `/admin/interns/${r.internId}/documents/open?key=${encodeURIComponent(p.docKey)}`;
                    return (
                      <li key={p.key} className="w-28 sm:w-32">
                        <a
                          href={src}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group block rounded-apple-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          <span className="relative block aspect-[4/3] overflow-hidden rounded-apple-sm border border-ink-200 bg-ink-100">
                            {/* The admin documents route streams the image after checking the session and that the key is on this candidate's record. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt={`${p.label} for ${r.name}`} loading="lazy" className="size-full object-cover transition-transform duration-150 group-hover:scale-105" />
                          </span>
                          <span className="mt-1 flex items-start gap-1 text-xs leading-snug text-ink-800">
                            <span className="min-w-0 break-words">{p.label}</span>
                            <ExternalLink className="mt-0.5 size-3 shrink-0 text-text-subtle" aria-hidden />
                            <span className="sr-only"> (opens in a new tab)</span>
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-text-subtle">Accepted offers</h3>
              {r.proposals.length === 0 ? (
                <p className="mt-1.5 text-sm text-text-subtle">No offer accepted yet. The 24 to 48 hour clock starts when they accept one.</p>
              ) : (
                <ul className="mt-1.5 space-y-1.5">
                  {r.proposals.map((p) => {
                    const warn = decided ? null : startWarning(p.startDate, now);
                    return (
                      <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="min-w-0 break-words font-medium text-foreground">
                          {p.company} · {p.project}
                        </span>
                        <span className="nums text-text-subtle">starts {p.startDate ? formatDate(p.startDate) : "n/a"}</span>
                        {warn ? <StatusBadge tone={warn.tone === "past" ? "danger" : "warning"} label={warn.label} /> : null}
                        <span className="text-xs text-text-subtle">accepted {when(p.acceptedAt)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {decided ? (
              <p className="text-sm text-text-subtle">
                {r.status === "verified" ? "Verified" : "Marked incorrect"} {when(r.decidedAt)}
                {r.note ? <span className="block whitespace-pre-line break-words text-foreground">Note: {r.note}</span> : null}
              </p>
            ) : canWrite ? (
              <CgpaDecision target={{ internId: r.internId, name: r.name, semester: r.semester, claimedScore: r.claimedScore, scoreType: r.scoreType }} />
            ) : (
              <p className="text-sm text-text-subtle">You can view this check but your role can&apos;t decide it.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
