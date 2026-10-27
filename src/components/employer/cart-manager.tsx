"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarCheck, CheckCircle2, CreditCard, Laptop, Loader2, MapPin, Send, Trash2, UserRound, Video } from "lucide-react";

import { EmptyScene, Pill, Surface } from "@/components/app/primitives";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { formatPerHire, formatRate } from "@/lib/format";
import { displayNameOf, type CandidateProfile } from "@/lib/employer-candidates";
import { isQuarterHourWall, meetingEndsAt, suggestedSlots } from "@/lib/employer-interview-rules";
import { MeetingSlots, TimezoneSelect, type Slots } from "@/components/employer/meeting-slots";
import { fieldClass, labelClass } from "@/components/employer/ui-tokens";
import type { Currency } from "@/lib/employer-pricing";
import { PLAN_NAME, bandFor } from "@/lib/score";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type CartLineItem = {
  id: string;
  projectId: string;
  projectName: string;
  /** The project is closed (inactive): no new meetings or proposals on it. */
  projectClosed?: boolean;
  createdAt: string | null;
  candidate: CandidateProfile;
  hourlyRateMinor: number;
  perHireMinor: number;
  /** A proposal already out to this candidate (any project), if any. */
  openProposalId?: string | null;
  /** An accepted offer to this candidate (any project): it is paid, not re-proposed. */
  acceptedProposalId?: string | null;
  /** An open meeting holds the candidate until this time (ISO); no new booking or proposal before. */
  meetingUntil?: string | null;
};

export function CartManager({
  employerId,
  initialCartLines,
  currency = "INR",
  unlockAll = false,
  timezone: companyTimezone = "Asia/Kolkata",
}: {
  employerId: string;
  initialCartLines: CartLineItem[];
  currency?: Currency;
  /** Admin "View as": every name shows. */
  unlockAll?: boolean;
  /** The company's timezone, from its location; meetings default to it. */
  timezone?: string;
}) {
  const router = useRouter();
  const nameOf = (line: CartLineItem) => displayNameOf(line.candidate, unlockAll);
  const [cartLines, setCartLines] = useState<CartLineItem[]>(initialCartLines);
  const [selectedProject, setSelectedProject] = useState<string>("all");

  const [meetingCandidate, setMeetingCandidate] = useState<CartLineItem | null>(null);
  const [slots, setSlots] = useState<Slots>(["", "", ""]);
  const [slotsTouched, setSlotsTouched] = useState(false);
  const [timezone, setTimezone] = useState(companyTimezone);
  const [meetingSuccess, setMeetingSuccess] = useState(false);
  const [meetingError, setMeetingError] = useState("");

  const [removing, setRemoving] = useState<CartLineItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const projectOptions = Array.from(new Map(cartLines.map((l) => [l.projectId, l.projectName])).entries());
  const shown = selectedProject === "all" ? cartLines : cartLines.filter((l) => l.projectId === selectedProject);

  async function confirmRemove() {
    const item = removing;
    if (!item) return;
    setBusyId(item.id);
    setErrorMsg("");
    try {
      // A legacy "checkout"-staged twin goes too, or the line would come back.
      const results = await Promise.all(
        (["cart", "checkout"] as const).map((listType) =>
          csrfFetch("/api/employer/cart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "remove", internId: item.candidate.id, projectId: item.projectId, listType }),
          }),
        ),
      );
      if (results.some((r) => r.ok)) {
        setCartLines((prev) => prev.filter((l) => l.id !== item.id));
        setRemoving(null);
        router.refresh();
      } else {
        const data = await results[0].json().catch(() => ({}));
        setErrorMsg(data.error ?? "Couldn't remove this candidate. Try again.");
        setRemoving(null);
      }
    } catch {
      setErrorMsg("Couldn't reach the server. Check your connection and try again.");
      setRemoving(null);
    } finally {
      setBusyId(null);
    }
  }

  function openMeeting(line: CartLineItem) {
    // Three suggested slots: the next quarter hour, then +1 h and +2 h
    // (bug sheet 7 S2 r2). Editable.
    setTimezone(companyTimezone);
    setSlots(suggestedSlots(nowMs(), companyTimezone));
    setSlotsTouched(false);
    setMeetingCandidate(line);
    setMeetingError("");
    setMeetingSuccess(false);
  }

  async function handleBookMeeting(e: React.FormEvent) {
    e.preventDefault();
    if (!meetingCandidate) return;
    const [slot1, slot2, slot3] = slots;
    if (!slot1 || !slot2 || !slot3) return setMeetingError("Offer three time slots so the candidate can choose.");
    if (!slots.every(isQuarterHourWall)) return setMeetingError("Slots start on the hour or at :15, :30 or :45.");
    if (new Set(slots).size !== 3) return setMeetingError("Offer three different times.");

    setBusyId("booking-meeting");
    setMeetingError("");
    try {
      const res = await csrfFetch(`/api/employer/${employerId}/interviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Wall-clock times in the chosen zone; the server converts them.
        body: JSON.stringify({ internId: meetingCandidate.candidate.id, projectId: meetingCandidate.projectId, slot1, slot2, slot3, timezone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setMeetingError(data.error ?? "Couldn't send the meeting request. Try again.");
      // Hold "Book meeting" and "Send proposal" for this candidate until the meeting is over.
      const end = data.interview ? meetingEndsAt(data.interview) : null;
      const internId = meetingCandidate.candidate.id;
      if (end !== null) {
        setCartLines((prev) => prev.map((l) => (l.candidate.id === internId ? { ...l, meetingUntil: new Date(end).toISOString() } : l)));
      }
      setMeetingSuccess(true);
      router.refresh();
    } catch {
      setMeetingError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (cartLines.length === 0) {
    return (
      <EmptyScene
        art
        title="Your shortlist is empty"
        body="Shortlist candidates while you browse. From here you book a meeting with them or send a proposal."
        next={{ label: "Browse candidates", href: "/employer/candidates" }}
        who="You - shortlist a candidate"
      />
    );
  }

  return (
    <div>
      {errorMsg ? (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-apple-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {errorMsg}
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-ink-600">
          <span className="nums font-semibold text-ink-900">{shown.length}</span> shortlisted
          {selectedProject !== "all" ? " for this project" : ""}
        </p>
        {projectOptions.length > 1 ? (
          <label className={cn(labelClass, "flex items-center gap-2")}>
            <span className="shrink-0">Project</span>
            <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)} className={cn(fieldClass, "w-auto min-w-48")}>
              <option value="all">All projects</option>
              {projectOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <ul className="space-y-3">
        {shown.map((line) => (
          <CartLine
            key={line.id}
            line={line}
            name={nameOf(line)}
            currency={currency}
            timezone={companyTimezone}
            busy={busyId === line.id}
            onMeeting={() => openMeeting(line)}
            onRemove={() => setRemoving(line)}
          />
        ))}
      </ul>

      {/* Remove: confirmed, as legacy did (EMB-16). */}
      <Dialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove {removing ? nameOf(removing) : "candidate"} from your shortlist?</DialogTitle>
            <DialogDescription>
              {removing ? `They come off the shortlist for ${removing.projectName}. ` : ""}
              Proposals and meetings already sent are not affected, and you can shortlist them again from Candidates.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" onClick={() => setRemoving(null)} className={buttonClass({ variant: "light", size: "sm", className: "min-h-11" })}>
              Keep
            </button>
            <button
              type="button"
              onClick={confirmRemove}
              disabled={busyId !== null}
              className={buttonClass({ variant: "primary", size: "sm", className: "min-h-11 bg-danger hover:bg-danger/90" })}
            >
              {busyId ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
              Remove
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Book a meeting */}
      <Dialog open={Boolean(meetingCandidate)} onOpenChange={(open) => !open && setMeetingCandidate(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{meetingCandidate ? `Book a meeting with ${nameOf(meetingCandidate)}` : "Book a meeting"}</DialogTitle>
            <DialogDescription>
              Offer three times on the quarter hour. We suggest the next quarter hour and the two hours after it; change any of
              them. The candidate picks one.
            </DialogDescription>
          </DialogHeader>

          {meetingSuccess ? (
            <div role="status" className="rounded-apple-md border border-brand-200 bg-brand-50 p-6 text-center">
              <CheckCircle2 className="mx-auto size-8 text-brand-700" aria-hidden />
              <p className="mt-2 text-base font-semibold text-ink-900">Meeting request sent</p>
              <p className="mt-1 text-sm text-ink-600">The candidate picks one of your times. It shows on your Schedule once they do.</p>
              <button type="button" onClick={() => setMeetingCandidate(null)} className={buttonClass({ variant: "outline", size: "sm", className: "mt-4 min-h-11" })}>
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleBookMeeting} className="space-y-4 pt-1">
              <MeetingSlots
                slots={slots}
                timezone={timezone}
                onChange={(next) => {
                  setSlots(next);
                  setSlotsTouched(true);
                }}
              />
              <div>
                <label htmlFor="cart-timezone" className={labelClass}>
                  Timezone
                </label>
                <div className="mt-1.5">
                  <TimezoneSelect
                    id="cart-timezone"
                    value={timezone}
                    onChange={(tz) => {
                      setTimezone(tz);
                      // Untouched suggestions move to the new zone's next quarter hour.
                      if (!slotsTouched) setSlots(suggestedSlots(nowMs(), tz));
                    }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-ink-500">Set from your company&apos;s location. The candidate sees the times in IST.</p>
              </div>
              {meetingError ? (
                <p role="alert" className="text-sm text-danger">
                  {meetingError}
                </p>
              ) : null}
              <DialogFooter>
                <button type="button" onClick={() => setMeetingCandidate(null)} className={buttonClass({ variant: "light", size: "sm", className: "min-h-11" })}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyId === "booking-meeting" || slots.some((s) => !s)}
                  className={buttonClass({ variant: "primary", size: "sm", className: "min-h-11" })}
                >
                  {busyId === "booking-meeting" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Send meeting request
                </button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CartLine({
  line,
  name,
  currency,
  timezone,
  busy,
  onMeeting,
  onRemove,
}: {
  line: CartLineItem;
  name: string;
  currency: Currency;
  timezone: string;
  busy: boolean;
  onMeeting: () => void;
  onRemove: () => void;
}) {
  const c = line.candidate;
  const band = bandFor(c.score);
  const locked = meetingLocked(line);
  const closed = Boolean(line.projectClosed);
  const profileHref = `/employer/intern/${encodeURIComponent(c.id)}?project=${encodeURIComponent(line.projectId)}`;

  return (
    <Surface as="li" className="p-5">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <span aria-hidden className="grid size-12 place-items-center rounded-apple-md bg-brand-50 text-base font-semibold text-brand-800">
          {c.initials}
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <Link href={profileHref} className="text-[0.9375rem] font-semibold text-ink-900 underline-offset-4 hover:text-brand-700 hover:underline">
              {name}
            </Link>
            {line.acceptedProposalId ? (
              <Pill tone="waiting">Offer accepted</Pill>
            ) : line.openProposalId ? (
              <Pill tone="new">Proposal sent</Pill>
            ) : locked ? (
              <Pill tone="live">Meeting booked</Pill>
            ) : null}
            {closed ? <Pill tone="closed">Project closed</Pill> : null}
          </p>
          <p className="mt-0.5 text-sm text-ink-600">For {line.projectName}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-600">
            {c.location ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4 text-ink-400" aria-hidden />
                {c.location}
              </span>
            ) : null}
            {c.hasLaptop != null ? (
              <span className="inline-flex items-center gap-1.5">
                <Laptop className="size-4 text-ink-400" aria-hidden />
                {c.hasLaptop ? "Has a laptop" : "No laptop"}
              </span>
            ) : null}
          </p>
          {c.skills.length ? (
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Skills">
              {c.skills.map((s) => (
                <li key={s} className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700">
                  {s}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="col-span-2 flex flex-wrap items-baseline gap-x-3 sm:col-span-1 sm:block sm:text-right">
          <p className="nums text-3xl font-semibold leading-none tracking-[-0.02em] text-brand-700">
            {c.scored ? c.score.toFixed(1) : "-"}
            <span className="ml-0.5 text-sm font-normal text-ink-500">/10</span>
          </p>
          <p className="mt-1 text-xs font-medium text-ink-600">{PLAN_NAME[band.id]}</p>
          <p className="nums mt-2 text-sm font-semibold text-ink-900">{formatRate(line.hourlyRateMinor, currency)}</p>
          {line.perHireMinor > 0 ? <p className="nums text-xs text-ink-500">{formatPerHire(line.perHireMinor, currency)}</p> : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
        {line.acceptedProposalId ? (
          <ButtonLink href={`/employer/checkout?proposal=${encodeURIComponent(line.acceptedProposalId)}`} size="sm" className="min-h-11">
            <CreditCard className="size-4" aria-hidden />
            Pay to complete the hire
          </ButtonLink>
        ) : line.openProposalId ? (
          <ButtonLink href={`/employer/proposal/${encodeURIComponent(line.openProposalId)}`} variant="outline" size="sm" className="min-h-11">
            <Send className="size-4" aria-hidden />
            View proposal
          </ButtonLink>
        ) : closed ? (
          <span className="text-sm text-ink-600">Reopen the project to send a proposal.</span>
        ) : locked ? (
          // EMB-07: legacy kept Send Proposal off until the meeting was over.
          <span
            className={buttonClass({ size: "sm", className: "min-h-11 cursor-not-allowed opacity-55" })}
            aria-disabled="true"
            title="A proposal can be sent once the meeting is completed."
          >
            <Send className="size-4" aria-hidden />
            Send proposal
            <span className="sr-only"> (available once the meeting is completed)</span>
          </span>
        ) : (
          <ButtonLink
            href={`/employer/send-proposal?intern=${encodeURIComponent(c.id)}&project=${encodeURIComponent(line.projectId)}`}
            size="sm"
            className="min-h-11"
          >
            <Send className="size-4" aria-hidden />
            Send proposal
          </ButtonLink>
        )}

        {!line.acceptedProposalId && !closed ? (
          locked ? (
            <span className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm text-ink-600" title="You can book another meeting once this one's time is over.">
              <CalendarCheck className="size-4 text-brand-700" aria-hidden />
              Meeting until {untilLabel(line.meetingUntil!, timezone)}
            </span>
          ) : (
            <button type="button" onClick={onMeeting} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}>
              <Video className="size-4" aria-hidden />
              Book meeting
            </button>
          )
        ) : null}

        <ButtonLink href={profileHref} variant="ghost" size="sm" className="min-h-11">
          <UserRound className="size-4" aria-hidden />
          Profile
        </ButtonLink>

        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className={buttonClass({ variant: "ghost", size: "sm", className: "ml-auto min-h-11 text-ink-600 hover:bg-danger-soft hover:text-danger" })}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
          Remove
        </button>
      </div>
      {locked && !line.openProposalId && !line.acceptedProposalId ? (
        <p className="mt-2 text-xs text-ink-500">Send a proposal once the meeting is completed.</p>
      ) : null}
    </Surface>
  );
}

/** The clock, read in event handlers only. */
function nowMs(): number {
  return Date.now();
}

/** An open meeting still holds this candidate. */
function meetingLocked(line: CartLineItem): boolean {
  return Boolean(line.meetingUntil && Date.parse(line.meetingUntil) > nowMs());
}

/** "3 Nov, 4:30 pm" in the company's timezone. */
function untilLabel(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone });
}
