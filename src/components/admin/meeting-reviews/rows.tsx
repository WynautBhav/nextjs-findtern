import Link from "next/link";
import { ArrowLeft, ExternalLink, FileText, MicOff, RefreshCw, ShieldAlert, TriangleAlert, Unlink } from "lucide-react";

import { MeetingReviewActions, ClampedSummary } from "@/components/admin/meeting-reviews/actions";
import { AdminPageHeader, Panel } from "@/components/admin/panel";
import { StatusBadge } from "@/components/admin/status-badge";
import type { StatusTone } from "@/lib/admin/status-tone";
import { shortDateTime } from "@/lib/format";
import {
  FLAG_RULES,
  type Flag,
  type FlagSeverity,
  type ReviewParty,
  type ReviewRowView,
  type ReviewState,
  type TranscriptLine,
} from "@/lib/meetings/review-types";
import { cn } from "@/lib/utils";

/** `m:ss`, or `h:mm:ss` past an hour. `null` when the source gave no offset. */
export function mmss(sec: number | null): string | null {
  if (sec === null || !Number.isFinite(sec) || sec < 0) return null;
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function istDateTime(iso: string | null): string {
  if (!iso) return "Time unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Time unknown";
  return `${shortDateTime(d, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })} IST`;
}

const SEVERITY_TONE: Record<FlagSeverity, StatusTone> = { high: "danger", medium: "warning", low: "info" };
export const SEVERITY_LABEL: Record<FlagSeverity, string> = { high: "High", medium: "Medium", low: "Low" };

export function SeverityChip({ severity, label }: { severity: FlagSeverity; label?: string }) {
  return <StatusBadge tone={SEVERITY_TONE[severity]} label={label ?? SEVERITY_LABEL[severity]} />;
}

export function stateLabel(row: Pick<ReviewRowView, "state" | "reviewParty" | "employer" | "intern">): string {
  const who = row.reviewParty === "employer" ? row.employer : row.reviewParty === "intern" ? row.intern : null;
  const base: Record<ReviewState, string> = { open: "Open", clean: "Clean", dismissed: "Dismissed", warned: "Warned", frozen: "Frozen" };
  return (row.state === "warned" || row.state === "frozen") && who ? `${base[row.state]} (${who.name})` : base[row.state];
}

const STATE_TONE: Record<ReviewState, StatusTone> = { open: "warning", clean: "success", dismissed: "neutral", warned: "warning", frozen: "danger" };
export function StateChip({ row }: { row: Pick<ReviewRowView, "state" | "reviewParty" | "employer" | "intern"> }) {
  return <StatusBadge tone={STATE_TONE[row.state]} label={stateLabel(row)} className="max-w-full whitespace-normal py-0.5" />;
}

function PartyLine({ role, party }: { role: string; party: ReviewParty | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-text-subtle">{role}</dt>
      <dd className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground">
        <span className="break-words font-medium">{party ? party.name : "Not known"}</span>
        {party?.frozen ? <StatusBadge tone="danger" label="Frozen" dot={false} /> : null}
        {party && party.violations > 0 ? (
          <StatusBadge tone="warning" label={`${party.violations} violation${party.violations === 1 ? "" : "s"}`} dot={false} />
        ) : null}
      </dd>
    </div>
  );
}

export function Parties({ employer, intern }: { employer: ReviewParty | null; intern: ReviewParty | null }) {
  return (
    <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
      <PartyLine role="Employer" party={employer} />
      <PartyLine role="Intern" party={intern} />
    </dl>
  );
}

/** One flag: the rule, how serious, the words, and where in the call (for the admin to jump to). */
export function FlagItem({ flag, href }: { flag: Flag; href?: string }) {
  const rule = FLAG_RULES[flag.rule];
  const at = mmss(flag.offsetSec);
  const meta = (
    <>
      {at ? <span className="nums">{at}</span> : <span>Time unknown</span>}
      <span aria-hidden> · </span>
      <span>{flag.speaker ?? "Speaker unknown"}</span>
    </>
  );
  return (
    <li className="rounded-xl bg-[color:var(--admin-panel-2)] px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-sm font-semibold text-foreground">{rule?.label ?? flag.rule}</span>
        <SeverityChip severity={flag.severity} />
        <span className="ml-auto text-xs text-text-subtle">
          {href ? (
            <Link href={href} prefetch={false} className="rounded-sm underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {meta}
            </Link>
          ) : (
            meta
          )}
        </span>
      </div>
      <p className="mt-1.5 break-words text-sm leading-relaxed text-foreground">&ldquo;{flag.snippet}&rdquo;</p>
    </li>
  );
}

export function EvidenceList({ flags, evidencePurged, transcriptId }: { flags: Flag[]; evidencePurged: boolean; transcriptId?: string | null }) {
  if (evidencePurged) return <p className="text-sm text-text-subtle">Evidence deleted after 1 year.</p>;
  if (flags.length === 0) return <p className="text-sm text-text-subtle">No flags. Nothing in this meeting matched a rule.</p>;
  return (
    <ul className="space-y-2">
      {flags.map((f, i) => (
        <FlagItem key={`${f.line}-${f.rule}-${i}`} flag={f} href={transcriptId ? `/admin/meeting-reviews/${encodeURIComponent(transcriptId)}#line-${f.line}` : undefined} />
      ))}
    </ul>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-subtle">{children}</h3>;
}

export function ReviewNote({ row }: { row: ReviewRowView }) {
  if (!row.reviewedAt && !row.reviewNote) return null;
  const when = row.reviewedAt ? istDateTime(row.reviewedAt) : null;
  return (
    <div className="rounded-xl border border-[color:var(--admin-rule)] px-3.5 py-3 text-sm">
      <p className="text-foreground">
        <span className="font-semibold">Reviewed</span>
        {row.reviewedByName ? <> by {row.reviewedByName}</> : null}
        {when ? <span className="text-text-subtle"> · {when}</span> : null}
      </p>
      {row.reviewNote ? (
        <p className="mt-1.5 whitespace-pre-wrap break-words text-foreground">
          <span className="mr-1.5 text-xs font-semibold uppercase tracking-wide text-text-subtle">Admin only</span>
          {row.reviewNote}
        </p>
      ) : null}
    </div>
  );
}

function Notice({ icon: Icon, title, children, tone = "neutral" }: { icon: typeof MicOff; title: string; children?: React.ReactNode; tone?: "neutral" | "danger" }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl px-3.5 py-3", tone === "danger" ? "bg-danger-soft" : "bg-[color:var(--admin-panel-2)]")}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "danger" ? "text-danger" : "text-text-subtle")} aria-hidden />
      <div className="min-w-0 text-sm leading-relaxed">
        <p className="font-semibold text-foreground">{title}</p>
        {children ? <div className="mt-0.5 break-words text-text-subtle">{children}</div> : null}
      </div>
    </div>
  );
}

function attemptsText(n: number) {
  return `${n} attempt${n === 1 ? "" : "s"} so far`;
}

function Body({ row, canWrite }: { row: ReviewRowView; canWrite: boolean }) {
  if (row.kind === "no_recording") {
    return (
      <>
        <Parties employer={row.employer} intern={row.intern} />
        <Notice icon={MicOff} title="No recording">
          The bot did not join or no transcript arrived within 3 hours of the meeting end.
        </Notice>
      </>
    );
  }
  if (row.kind === "pending_fetch") {
    return (
      <>
        <Parties employer={row.employer} intern={row.intern} />
        <Notice icon={RefreshCw} title="Transcript on its way">
          Fireflies has told us the recording is ready. We are fetching it; {attemptsText(row.attempts)}.
        </Notice>
      </>
    );
  }
  if (row.kind === "fetch_failed") {
    return (
      <>
        <Parties employer={row.employer} intern={row.intern} />
        <Notice icon={TriangleAlert} title="Could not fetch the transcript" tone="danger">
          <p>{attemptsText(row.attempts)}.</p>
          {row.lastError ? <p className="mt-1 font-mono text-xs">{row.lastError}</p> : null}
        </Notice>
      </>
    );
  }
  if (row.kind === "unmatched") {
    return (
      <>
        <Notice icon={Unlink} title="Not matched to a meeting">
          {row.matchNote ?? "We could not tie this recording to a Findtern meeting."}
        </Notice>
        {row.sourceUrl ? (
          <p className="text-sm">
            <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-sm underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0">
              Open the recording in Fireflies
              <ExternalLink className="size-3.5" aria-hidden />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        ) : null}
        {row.transcriptId ? <TranscriptLink id={row.transcriptId} /> : null}
      </>
    );
  }

  const canAct = canWrite && row.transcriptId;
  return (
    <>
      <Parties employer={row.employer} intern={row.intern} />
      <div>
        <Heading>Summary</Heading>
        {row.summary ? (
          <ClampedSummary text={row.summary} />
        ) : (
          <p className="text-sm text-text-subtle">{row.textPurged ? "Summary deleted after 90 days." : "No summary for this meeting."}</p>
        )}
      </div>
      <div>
        <Heading>Evidence{!row.evidencePurged && row.flags.length > 0 ? ` (${row.flags.length})` : ""}</Heading>
        <EvidenceList flags={row.flags} evidencePurged={row.evidencePurged} transcriptId={row.transcriptId} />
      </div>
      <ReviewNote row={row} />
      {row.transcriptId ? <TranscriptLink id={row.transcriptId} /> : null}
      {canAct && row.transcriptId ? (
        <MeetingReviewActions transcriptId={row.transcriptId} state={row.state} employer={row.employer} intern={row.intern} />
      ) : null}
    </>
  );
}

function TranscriptLink({ id }: { id: string }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <Link
        href={`/admin/meeting-reviews/${encodeURIComponent(id)}`}
        prefetch={false}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-sm font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
      >
        <FileText className="size-4" aria-hidden />
        Open full transcript
      </Link>
      <span className="text-text-subtle">Viewing is audit-logged</span>
    </p>
  );
}

/** One meeting per card: when and who, what the recording says, the evidence, and the three decisions. */
export function MeetingReviewRows({ rows, canWrite }: { rows: ReviewRowView[]; canWrite: boolean }) {
  return (
    <ul className="divide-y divide-[color:var(--admin-rule)]">
      {rows.map((r) => {
        const meta = [istDateTime(r.meetingAt), r.durationMin !== null ? `${r.durationMin} min` : null, r.project].filter(Boolean) as string[];
        return (
          <li key={r.key} className="space-y-4 px-4 py-5 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <h2 className="break-words text-base font-semibold text-foreground">{r.title}</h2>
                <p className="mt-0.5 break-words text-sm text-text-subtle">{meta.join(" · ")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {r.kind === "reviewed" ? (
                  <>
                    {r.flagsCount > 0 && r.maxSeverity ? (
                      <SeverityChip severity={r.maxSeverity} label={`${r.flagsCount} flag${r.flagsCount === 1 ? "" : "s"} · ${SEVERITY_LABEL[r.maxSeverity]}`} />
                    ) : (
                      <StatusBadge tone="neutral" label="No flags" />
                    )}
                    <StateChip row={r} />
                  </>
                ) : null}
              </div>
            </div>
            <Body row={r} canWrite={canWrite} />
          </li>
        );
      })}
    </ul>
  );
}

/** The detail page body: header, summary, evidence and the full transcript with flagged lines highlighted. Pure, so a fixture can render it. */
export function MeetingReviewDetail({ row, lines }: { row: ReviewRowView; lines: TranscriptLine[] | null }) {
  const flagsByLine = new Map<number, Flag[]>();
  for (const f of row.flags) flagsByLine.set(f.line, [...(flagsByLine.get(f.line) ?? []), f]);
  const meta = [istDateTime(row.meetingAt), row.durationMin !== null ? `${row.durationMin} min` : null, row.project].filter(Boolean) as string[];

  return (
    <div>
      <BackLink />
      <AdminPageHeader title={row.title} subtitle={meta.join(" · ")} />
      <p role="note" className="mb-4 flex items-start gap-2 rounded-xl bg-[color:var(--admin-bar-tint)] px-3.5 py-3 text-sm text-foreground">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <strong className="font-semibold">Admin only.</strong> This view is audit-logged.
        </span>
      </p>

      <div className="space-y-4">
        <Panel className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <StateChip row={row} />
            {row.flagsCount > 0 && row.maxSeverity ? <SeverityChip severity={row.maxSeverity} label={`${row.flagsCount} flag${row.flagsCount === 1 ? "" : "s"}`} /> : null}
          </div>
          <Parties employer={row.employer} intern={row.intern} />
          <ReviewNote row={row} />
        </Panel>

        <Panel className="p-4 sm:p-5">
          <h2 className="text-base font-semibold text-foreground">Summary</h2>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {row.summary ?? (row.textPurged ? "Summary deleted after 90 days." : "No summary for this meeting.")}
          </p>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <h2 className="mb-3 text-base font-semibold text-foreground">Evidence{!row.evidencePurged && row.flags.length > 0 ? ` (${row.flags.length})` : ""}</h2>
          <EvidenceList flags={row.flags} evidencePurged={row.evidencePurged} transcriptId={row.transcriptId} />
        </Panel>

        <Panel className="p-4 sm:p-5">
          <h2 className="mb-3 text-base font-semibold text-foreground">Full transcript</h2>
          {lines === null ? (
            <p className="text-sm text-text-subtle">The full text was deleted after 90 days; only the flags and metadata are kept.</p>
          ) : lines.length === 0 ? (
            <p className="text-sm text-text-subtle">This transcript has no spoken lines.</p>
          ) : (
            <ol className="divide-y divide-[color:var(--admin-rule)]">
              {lines.map((l) => {
                const hits = flagsByLine.get(l.i);
                const at = mmss(l.s);
                return (
                  <li
                    key={l.i}
                    id={`line-${l.i}`}
                    className={
                      hits
                        ? "scroll-mt-24 -mx-2 rounded-lg bg-warning-soft px-2 py-2.5 target:ring-2 target:ring-[color:var(--color-ring,currentColor)]"
                        : "scroll-mt-24 py-2.5"
                    }
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-xs text-text-subtle">
                      <span className="nums w-12 shrink-0 font-medium">{at ?? "--:--"}</span>
                      <span className="font-medium text-foreground">{l.sp ?? "Speaker unknown"}</span>
                    </div>
                    <p className="mt-0.5 break-words text-sm leading-relaxed text-foreground sm:pl-[3.625rem]">{l.t}</p>
                    {hits ? (
                      <p className="mt-1.5 flex flex-wrap gap-1.5 sm:pl-[3.625rem]">
                        {hits.map((f, k) => (
                          <span key={`${f.rule}-${k}`} className="inline-flex items-center gap-1.5">
                            <SeverityChip severity={f.severity} label={FLAG_RULES[f.rule]?.label ?? f.rule} />
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}

export function BackLink() {
  return (
    <Link
      href="/admin/meeting-reviews"
      className="mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Back to meeting reviews
    </Link>
  );
}
