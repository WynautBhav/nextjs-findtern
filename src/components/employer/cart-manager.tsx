"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, CreditCard, Loader2, MapPin, Send, Trash2, UserRound, Video } from "lucide-react";

import { EmptyScene, Pill } from "@/components/app/primitives";
import { RowAvatar, ScoreBadge, SkillChips, headlineOf } from "@/components/employer/candidate-row-parts";
import { groupByCandidate, projectsLabel } from "@/components/employer/shortlist-group";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { formatRate } from "@/lib/format";
import { displayNameOf, type CandidateProfile } from "@/lib/employer-candidates";
import { isQuarterHourWall, meetingEndsAt, meetingTime, suggestedSlots } from "@/lib/employer-interview-rules";
import { MeetingSlots, TimezoneSelect, type Slots } from "@/components/employer/meeting-slots";
import { SendProposalHold } from "@/components/employer/send-proposal-hold";
import { JoinMeetingButton } from "@/components/employer/meeting-join";
import { fieldClass, labelClass } from "@/components/employer/ui-tokens";
import type { Currency } from "@/lib/employer-pricing";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RowMenu } from "@/components/app/row-menu";

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
  /** When that meeting is (ISO), for "Meeting on <date>" on the held Send proposal. */
  meetingAt?: string | null;
  /** The booked meeting's link while it is live, for "Join meeting". */
  meetingLink?: string | null;
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

  // The picked project stays an option after its last person is removed, so the select and the empty state still name it.
  const projectOptions = Array.from(
    new Map([
      ...cartLines.map((l) => [l.projectId, l.projectName] as const),
      ...initialCartLines.filter((l) => l.projectId === selectedProject).map((l) => [l.projectId, l.projectName] as const),
    ]).entries(),
  );
  const inProject = selectedProject === "all" ? cartLines : cartLines.filter((l) => l.projectId === selectedProject);
  // One meaning of "shortlisted": saved, no live proposal yet; anyone already
  // proposed to is listed apart, below (QA-124). The heading counts distinct
  // people (a person saved to two projects has two lines but is one candidate).
  const shown = inProject.filter((l) => !l.openProposalId && !l.acceptedProposalId);
  // Counted in people, like the strip and the nav badge: one candidate saved to two projects is one.
  const shownPeople = new Set(shown.map((l) => l.candidate.id)).size;
  // Everyone saved and not yet proposed to, across projects: what "of N" means when one project is picked.
  const filtered = selectedProject !== "all";
  const allPeople = new Set(cartLines.filter((l) => !l.openProposalId && !l.acceptedProposalId).map((l) => l.candidate.id)).size;
  const proposed = inProject.filter((l) => l.openProposalId || l.acceptedProposalId);
  const shownProjects = new Set(shown.map((l) => l.projectId)).size;
  // One row per person, whichever projects they are saved to.
  const shownGroups = groupByCandidate(shown);
  const proposedGroups = groupByCandidate(proposed);

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
        const at = meetingTime(data.interview);
        setCartLines((prev) =>
          prev.map((l) =>
            l.candidate.id === internId ? { ...l, meetingUntil: new Date(end).toISOString(), meetingAt: at === null ? null : new Date(at).toISOString() } : l,
          ),
        );
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
        title="No one on your shortlist yet"
        body="Tap the heart on a candidate to keep them here for a project."
        next={{ label: "Find candidates", href: "/employer/candidates" }}
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

      {/* One results bar, as on Candidates: the count (of everyone saved, when a project is picked), then the project picker. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="min-w-0 text-sm text-ink-700">
          <span className="nums text-base font-semibold text-ink-900">{shownPeople}</span>
          {filtered ? (
            <>
              {" "}of <span className="nums font-semibold text-ink-900">{allPeople}</span>
            </>
          ) : null}{" "}
          {allPeople === 1 ? "candidate" : "candidates"}
          {filtered ? <> shown for <span className="font-medium text-ink-900">{projectOptions.find(([id]) => id === selectedProject)?.[1] ?? "this project"}</span></> : null}
          {!filtered && shownProjects > 1 ? <span className="max-sm:hidden"> · across {shownProjects} projects</span> : null}
          {filtered ? (
            <>
              {" · "}
              <button type="button" onClick={() => setSelectedProject("all")} className="inline-flex min-h-11 items-center rounded-sm font-medium text-brand-700 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-600 sm:min-h-9 sm:touch:min-h-11">
                Show all projects
              </button>
            </>
          ) : null}
        </p>
        {projectOptions.length > 1 ? (
          <label className="flex min-w-0 items-center">
            <span className="sr-only">Project</span>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className={cn(fieldClass, "h-11 w-auto min-w-0 max-w-52 rounded-xl pl-3.5 [field-sizing:content] sm:h-9 sm:max-w-72 sm:touch:h-11")}
            >
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

      <ul className="space-y-4">
        {shownGroups.map((group) => (
          <CartLine
            key={group.primary.id}
            group={group}
            name={nameOf(group.primary)}
            currency={currency}
            busy={group.lines.some((l) => l.id === busyId)}
            onMeeting={() => openMeeting(group.primary)}
            onRemove={setRemoving}
          />
        ))}
      </ul>
      {inProject.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-lg font-semibold text-ink-900">No one saved for {projectOptions.find(([id]) => id === selectedProject)?.[1] ?? "this project"}</p>
          <button type="button" onClick={() => setSelectedProject("all")} className={buttonClass({ variant: "outline", size: "sm", className: "mt-4 min-h-11" })}>
            Show all projects
          </button>
        </div>
      ) : shown.length === 0 ? <p className="rounded-2xl border border-ink-200 bg-white p-5 text-sm text-ink-700 shadow-xs">Everyone saved here already has a proposal. They are listed under Already proposed.</p> : null}

      {proposed.length > 0 ? (
        <section aria-labelledby="proposed-heading" className="mt-8">
          <h2 id="proposed-heading" className="mb-3 text-base font-semibold text-ink-900">
            Already proposed <span className="nums font-normal text-text-subtle">{proposedGroups.length}</span>
          </h2>
          <ul className="space-y-4">
            {proposedGroups.map((group) => (
              <CartLine
                key={group.primary.id}
                group={group}
                name={nameOf(group.primary)}
                currency={currency}
                busy={group.lines.some((l) => l.id === busyId)}
                onMeeting={() => openMeeting(group.primary)}
                onRemove={setRemoving}
              />
            ))}
          </ul>
        </section>
      ) : null}

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
              {busyId ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
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
            <div className="rounded-apple-md border border-brand-200 bg-brand-50 p-6 text-center transition-[opacity,scale] duration-[var(--dur-standard)] ease-[var(--ease-out-quart)] starting:scale-[0.97] starting:opacity-0">
              <CheckCircle2 className="mx-auto size-8 text-brand-700" aria-hidden />
              <p id="meeting-sent-title" className="mt-2 text-base font-semibold text-ink-900">Meeting request sent</p>
              <p id="meeting-sent-body" className="mt-1 text-sm text-ink-600">It is on your Schedule as &ldquo;Waiting on candidate&rdquo; until they pick one of your times.</p>
              {/* The form that held focus is gone: focus lands here and reads the result with it. */}
              <button
                type="button"
                autoFocus
                aria-describedby="meeting-sent-title meeting-sent-body"
                onClick={() => setMeetingCandidate(null)}
                className={buttonClass({ variant: "outline", size: "sm", className: "mt-4 min-h-11" })}
              >
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
                <p className="mt-1.5 text-xs text-text-subtle">Set from your company&apos;s location. The candidate sees the times in IST.</p>
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
                  disabled={busyId === "booking-meeting"}
                  className={buttonClass({ variant: "primary", size: "sm", className: "min-h-11" })}
                >
                  {busyId === "booking-meeting" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
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
  group,
  name,
  currency,
  busy,
  onMeeting,
  onRemove,
}: {
  group: { primary: CartLineItem; lines: CartLineItem[] };
  name: string;
  currency: Currency;
  busy: boolean;
  onMeeting: () => void;
  onRemove: (line: CartLineItem) => void;
}) {
  const line = group.primary;
  const c = line.candidate;
  const forProjects = projectsLabel(group.lines);
  const headline = headlineOf(c);
  const locked = meetingLocked(line);
  const closed = Boolean(line.projectClosed);
  const profileHref = `/employer/intern/${encodeURIComponent(c.id)}?project=${encodeURIComponent(line.projectId)}`;
  const cellLabel = "text-[11px] font-semibold uppercase tracking-wider text-text-subtle";
  const pill = "h-11 rounded-xl px-4 sm:h-10 sm:touch:h-11 xl:w-full max-[400px]:[&>svg]:hidden";

  // One card per person. xl: avatar | who | score and terms | actions, the same columns on every card.
  // Below xl the metrics sit under the identity and the actions close the card.
  return (
    <li className="group/row relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-4 rounded-2xl border border-ink-200 bg-white p-4 shadow-xs transition-colors hover:border-ink-300 sm:p-5 xl:grid-cols-[auto_minmax(0,1fr)_20rem_14.5rem] xl:gap-x-6">
      <RowAvatar photoUrl={c.photoUrl} initials={c.initials} seed={c.id} square className="sm:size-14" />
      <div className="min-w-0 self-center xl:self-start">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* The whole card opens the profile: this link is stretched over it; the controls sit above. */}
          <Link
            href={profileHref}
            className="text-[15px] font-semibold text-ink-900 outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-500"
          >
            {name}
          </Link>
          {line.acceptedProposalId ? (
            <Pill tone="waiting">Offer accepted</Pill>
          ) : line.openProposalId ? (
            <Pill tone="new">Proposal sent</Pill>
          ) : null}
          {closed ? <Pill tone="closed">Project closed</Pill> : null}
        </p>
        {headline ? <p className="mt-0.5 line-clamp-2 text-pretty text-base font-medium leading-snug text-ink-900 group-hover/row:text-brand-800 sm:text-lg">{headline}</p> : null}
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-ink-700">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5 shrink-0 text-ink-500" aria-hidden />
            {c.city || c.location || "City not stated"}
          </span>
          <span className="min-w-0 max-w-full">For {forProjects}</span>
        </p>
      </div>

      {/* Score once, with its tier; rate and mode beside it. */}
      <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_7.5rem] items-start gap-x-4 rounded-xl border border-ink-200 bg-ink-50 p-3 xl:col-span-1 xl:col-start-3 xl:row-start-1 xl:self-start">
        <div className="flex min-w-0 flex-col gap-1">
          <span className={cellLabel}>Findtern Score</span>
          <ScoreBadge size="cell" score={c.score} scored={c.scored} />
        </div>
        <div className="flex flex-col gap-1">
          <span className={cellLabel}>Rate</span>
          <span className="nums whitespace-nowrap text-[15px] font-semibold text-ink-900">{formatRate(line.hourlyRateMinor, currency)}</span>
          <span className="text-[13px] text-ink-700">{c.workModes.length ? c.workModes.join(" / ") : "Mode not stated"}</span>
        </div>
      </div>

      <div className="col-span-2 min-w-0 xl:col-span-2 xl:col-start-2 xl:row-start-2">
        <SkillChips skills={c.skills} wanted={[]} />
      </div>

      {/* Phone: the card's last line. xl: one tight column on the right, the main action on top. */}
      <div className="relative z-10 col-span-2 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4 xl:col-span-1 xl:col-start-4 xl:row-span-2 xl:row-start-1 xl:grid xl:grid-cols-[minmax(0,1fr)_auto] xl:content-start xl:gap-2 xl:border-0 xl:pt-0">
        <div className="min-w-0 max-xl:order-2 xl:col-start-1 xl:row-start-1 xl:flex xl:flex-col">
          {line.acceptedProposalId ? (
            <ButtonLink href={`/employer/checkout?proposal=${encodeURIComponent(line.acceptedProposalId)}`} size="sm" className={pill}>
              <CreditCard className="size-4" aria-hidden />
              Pay to complete the hire
            </ButtonLink>
          ) : line.openProposalId ? (
            <ButtonLink href={`/employer/proposal/${encodeURIComponent(line.openProposalId)}`} variant="outline" size="sm" className={pill}>
              <Send className="size-4" aria-hidden />
              View proposal
            </ButtonLink>
          ) : closed ? (
            <span className="inline-flex min-h-11 items-center text-sm text-ink-700 sm:min-h-9">Reopen the project to send a proposal.</span>
          ) : locked ? (
            // EMB-07: legacy kept Send Proposal off until the meeting was over; the date and reason are visible text.
            <SendProposalHold pendingMeetingAt={line.meetingAt ?? line.meetingUntil} className="items-stretch max-xl:items-end" controlClassName="justify-center rounded-xl sm:h-10 sm:touch:h-11" />
          ) : (
            <ButtonLink href={`/employer/send-proposal?intern=${encodeURIComponent(c.id)}&project=${encodeURIComponent(line.projectId)}`} size="sm" className={pill}>
              <Send className="size-4" aria-hidden />
              Send proposal
            </ButtonLink>
          )}
        </div>

        {/* Its own button, not in the menu (bug sheet 8). Secondary, so it follows the main action. */}
        <div className="flex items-center gap-2 max-xl:order-1 xl:col-span-2 xl:row-start-2 xl:[&>*]:flex-1">
          {!line.acceptedProposalId && !closed && !locked ? (
            <button type="button" onClick={onMeeting} className={buttonClass({ variant: "outline", size: "sm", className: pill })}>
              <Video className="size-4" aria-hidden />
              Book meeting
            </button>
          ) : null}
          {line.meetingLink ? <JoinMeetingButton link={line.meetingLink} variant="outline" /> : null}
        </div>

        {/* Profile and remove stay in the menu (QA-124). */}
        <div className="ml-auto flex items-center gap-2 max-xl:order-3 xl:col-start-2 xl:row-start-1 xl:ml-0">
          {busy ? <Loader2 className="size-4 animate-spin text-text-subtle motion-reduce:animate-none" aria-label="Removing" /> : null}
          <RowMenu
            label={`More actions for ${name}`}
            items={[
              { label: "Open profile", href: profileHref, icon: <UserRound /> },
              ...group.lines.map((l) => ({
                label: `Remove from ${l.projectName}`,
                onSelect: () => onRemove(l),
                icon: <Trash2 />,
                destructive: true,
                disabled: busy,
              })),
            ]}
          />
        </div>
      </div>
    </li>
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
