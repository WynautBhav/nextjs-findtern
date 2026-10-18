import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BellOff } from "lucide-react";

import { EmptyScene, PageHead, SectionHead, Surface } from "@/components/app/primitives";
import { NotificationList } from "@/components/app/notification-list";
import { requireRole } from "@/lib/auth";
import { notificationsFor } from "@/lib/intern-data";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

/**
 * Notifications.
 *
 * ── Grouped by what they ask of you, not by date ────────────────────────
 *
 * The old list was one reverse chronological column where an update about a
 * stipend sat at the same weight as "your offer expires", so nothing stood out
 * and the reader had to read every line to find the one that mattered.
 *
 * Two groups. "Needs you" holds anything with a decision, a deadline or a
 * document attached. "Updates" holds everything else. Someone opening this
 * screen can stop reading after the first group and know they have caught up.
 *
 * ── Nothing here is urgent, loud, or repeats ────────────────────────────
 *
 * There is no red badge count anywhere in this product. A notification is a
 * fact that arrived once; it does not re announce itself, it does not expire,
 * and it does not pile up a number to create pressure. An unread marker on a
 * row is a fact about a row, not a score about a person.
 */
export default async function InternNotifications() {
  const session = await requireRole("intern");

  const rows = await notificationsFor(session.uid);
  const needsYou = rows.filter((n) => NEEDS_ACTION.has(n.type));
  const updates = rows.filter((n) => !NEEDS_ACTION.has(n.type));

  return (
    <div>
      <PageHead
        title="Notifications"
        lede="Everything that has happened since you were last here. Read once, kept here, never repeated at you."
        action={<NotificationList mode="mark-all" disabled={rows.every((n) => n.isRead)} />}
      />

      {rows.length === 0 ? (
        <EmptyScene
          art
          title="Nothing has happened yet"
          body="When a company sends you an offer, books an interview, or approves your hours, it appears here. You will not be pinged about anything you have already read."
          who="You control what reaches you"
        />
      ) : (
        <div className="space-y-10">
          {needsYou.length > 0 ? (
            <section>
              <SectionHead
                title="Needs you"
                hint="A decision, a document, or something waiting on your side."
              />
              <NotificationList rows={needsYou} />
            </section>
          ) : (
            <Surface className="flex items-start gap-3 p-5">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
                <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3.5 8.5l3 3 6-7" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-ink-900">
                  Nothing is waiting on you right now
                </p>
                <p className="mt-0.5 text-pretty text-sm leading-relaxed text-ink-600">
                  Everything a company has sent has been dealt with. If something lands that needs
                  an answer, it appears at the top of this list and on your home screen.
                </p>
              </div>
            </Surface>
          )}

          {updates.length > 0 ? (
            <section>
              <SectionHead title="Updates" hint="Nothing here needs an answer." />
              <NotificationList rows={updates} />
            </section>
          ) : null}

          {/* ── The absence, stated ────────────────────────────────
              Every product with notifications uses this space for a
              reengagement pitch. Saying what is deliberately not here is
              more useful, and it is a promise we can keep because the
              notifier only ever writes on a real event. */}
          <section>
            <Surface className="flex items-start gap-3 p-5">
              <BellOff className="mt-0.5 size-5 shrink-0 text-ink-400" aria-hidden />
              <div>
                <SectionHead title="What you will never get" />
                <ul className="space-y-1.5 text-pretty text-sm leading-relaxed text-ink-600">
                  {[
                    "No streak reminders, and nothing that tells you your streak is at risk.",
                    "No nudges to open the app. Nothing is sent because you were quiet.",
                    "No re engagement after you have been away, however long that is.",
                    "No message that dresses up a routine update as urgent.",
                  ].map((line) => (
                    <li key={line}>· {line}</li>
                  ))}
                </ul>
                <Link
                  href="/intern/settings"
                  className="apple-spring apple-pressable mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Notification settings
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </div>
            </Surface>
          </section>
        </div>
      )}
    </div>
  );
}

/**
 * Notification types that put work on the candidate's side.
 *
 * Everything else is genuinely just an update and belongs below the fold.
 */
const NEEDS_ACTION = new Set([
  "proposal_received",
  "proposal_updated",
  "full_time_offer_received",
  "interview_pending",
  "interview_reschedule_requested_by_employer",
  "interview_rescheduled_by_employer",
  "timesheet_rejected",
  "timesheet_updated_by_employer",
  "document_required",
]);