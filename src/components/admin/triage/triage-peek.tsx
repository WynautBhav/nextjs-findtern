"use client";

/**
 * The record peek: what the selected row is, and the one thing to do about it.
 * Payouts embed the existing PayoutEditor (mark paid, bank reference, its own
 * confirm), so a payout is cleared without leaving the desk. Every other queue
 * gets one primary button that names its object and goes to the record's page,
 * and a quiet "Next" to keep working the queue.
 */

import { PayoutEditor } from "@/components/admin/payout-editor";
import { AdminAvatar } from "@/components/admin/avatar";
import { ADMIN_PILL_PRIMARY, ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import type { QueueGroup, QueueRecord } from "@/lib/admin/dashboard-queues.types";
import { cn } from "@/lib/utils";

/** The primary button's wording per queue: it names the person or company it acts on. */
export function primaryLabel(r: QueueRecord): string {
  switch (r.queue) {
    case "nolink":
      return `Add the link for ${r.title}`;
    case "unscored":
      return `Score ${r.title}`;
    case "accepted":
      return `Chase ${r.title} about this offer`;
    case "messages":
      return "Open the inbox";
    case "sheets":
      return `Review the timesheet for ${r.title}`;
    case "calendar":
      return "Connect the Google calendar";
    case "payouts":
    default:
      return `Open the payout for ${r.title}`;
  }
}

export function TriagePeek({
  record,
  group,
  hasNext,
  onNext,
  onSaved,
}: {
  record: QueueRecord;
  group: QueueGroup;
  hasNext: boolean;
  onNext: () => void;
  /** The payout was marked paid or failed: the desk clears the row. */
  onSaved: (id: string) => void;
}) {
  return (
    <div data-testid="triage-peek" data-record={record.id}>
      <div className="flex items-center gap-3">
        <AdminAvatar name={record.title} id={record.id} size="lg" />
        <div className="min-w-0">
          <h2 className="text-xl font-semibold leading-7 text-foreground [overflow-wrap:anywhere]">{record.title}</h2>
          <p className="mt-0.5 text-[13px] text-text-subtle">{group.label}</p>
        </div>
      </div>

      {record.props.length ? (
        <dl className="mt-5 divide-y divide-[color:var(--admin-rule)] border-y border-[color:var(--admin-rule)]">
          {record.props.map((p) => (
            <div key={p.label} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-4 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
              <dt className="text-[13px] leading-5 text-text-subtle">{p.label}</dt>
              <dd className="nums text-sm leading-5 text-foreground [overflow-wrap:anywhere]">{p.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {group.detail ? <p className="mt-5 text-pretty text-sm text-foreground">{group.detail}</p> : null}

      <div data-peek-actions="" className="mt-5 flex flex-col items-start gap-4">
        {record.queue === "payouts" && record.payout ? (
          <>
            <PayoutEditor
              payoutId={record.payout.id}
              initialReference={record.payout.reference}
              initialNote={record.payout.note}
              status={record.payout.status}
              onSaved={() => onSaved(record.id)}
            />
            <ButtonLink
              href={record.href}
              variant="link"
              size="sm"
              className="px-0 text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {`Open the payout page for ${record.title}`}
            </ButtonLink>
          </>
        ) : (
          <ButtonLink href={record.href} variant="primary" size="md" className={cn(ADMIN_PILL_PRIMARY, "h-auto min-h-11 max-w-full whitespace-normal py-2.5 text-left leading-snug")}>
            {primaryLabel(record)}
          </ButtonLink>
        )}
        {hasNext ? (
          <button
            type="button"
            onClick={onNext}
            className={cn(
              buttonClass({ variant: "outline", size: "sm" }),
              ADMIN_PILL_SECONDARY,
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            Next (J)
          </button>
        ) : null}
      </div>
    </div>
  );
}
