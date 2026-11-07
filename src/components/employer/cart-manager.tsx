"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";

import { EmptyScene } from "@/components/app/primitives";
import { useConfirm } from "@/components/app/use-confirm";
import { csrfFetch } from "@/lib/client-fetch";
import { displayNameOf } from "@/lib/employer-candidates";
import { isQuarterHourWall, meetingEndsAt, suggestedSlots } from "@/lib/employer-interview-rules";
import type { Slots } from "@/components/employer/meeting-slots";
import { fieldClass, labelClass } from "@/components/employer/ui-tokens";
import type { Currency } from "@/lib/employer-pricing";
import { cn } from "@/lib/utils";
import { meetingLocked, nowMs, type CartLineItem } from "./cart/cart-helpers";
import { CartSummary } from "./cart/cart-summary";
import { MeetingDialog } from "./cart/meeting-dialog";
import { ProjectGroup, groupByProject } from "./cart/project-group";

export type { CartLineItem } from "./cart/cart-helpers";

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

  const { ask, dialog: confirmDialog } = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const projectOptions = Array.from(new Map(cartLines.map((l) => [l.projectId, l.projectName])).entries());
  const inProject = selectedProject === "all" ? cartLines : cartLines.filter((l) => l.projectId === selectedProject);
  // One meaning of "shortlisted": saved, no live proposal yet. The header
  // badge, the hiring-steps strip and this heading all count that; anyone
  // already proposed to is listed apart, below (QA-124).
  const shown = inProject.filter((l) => !l.openProposalId && !l.acceptedProposalId);
  const proposed = inProject.filter((l) => l.openProposalId || l.acceptedProposalId);

  async function requestRemove(item: CartLineItem) {
    const ok = await ask({
      title: `Remove ${nameOf(item)} from your shortlist?`,
      body: `They come off the shortlist for ${item.projectName}. Proposals and meetings already sent are not affected, and you can shortlist them again from Candidates.`,
      confirmLabel: "Remove",
      cancelLabel: "Keep",
    });
    if (ok) await confirmRemove(item);
  }

  async function confirmRemove(item: CartLineItem) {
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
        router.refresh();
      } else {
        const data = await results[0].json().catch(() => ({}));
        setErrorMsg(data.error ?? "Couldn't remove this candidate. Try again.");
      }
    } catch {
      setErrorMsg("Couldn't reach the server. Check your connection and try again.");
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

  const continueTarget = (() => {
    const pay = proposed.find((l) => l.acceptedProposalId);
    if (pay) return { href: "/employer/checkout", label: "Continue to checkout", next: "An offer was accepted. Pay to complete the hire." };
    const first = shown.find((l) => !l.projectClosed && !meetingLocked(l));
    if (first)
      return {
        href: `/employer/send-proposal?intern=${encodeURIComponent(first.candidate.id)}&project=${encodeURIComponent(first.projectId)}`,
        label: "Continue",
        next: `Start with ${nameOf(first)}: send a proposal. You pay only once a candidate accepts.`,
      };
    return null;
  })();

  const renderGroups = (lines: CartLineItem[], start = 0) =>
    groupByProject(lines).map((g, gi, all) => (
      <ProjectGroup
        key={g.id}
        name={g.name}
        lines={g.lines}
        closed={g.closed}
        nameOf={nameOf}
        currency={currency}
        timezone={companyTimezone}
        busyId={busyId}
        onMeeting={openMeeting}
        onRemove={requestRemove}
        startIndex={start + all.slice(0, gi).reduce((n, x) => n + x.lines.length, 0)}
      />
    ));

  return (
    <div>
      {errorMsg ? (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-apple-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {errorMsg}
        </p>
      ) : null}

      <div className="grid gap-6 pb-[calc(9rem+env(safe-area-inset-bottom))] lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:pb-0">
        <div className="min-w-0">
          {projectOptions.length > 1 ? (
            <label className={cn(labelClass, "mb-4 flex items-center gap-2")}>
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
          {shown.length > 0 ? renderGroups(shown) : null}
          {shown.length === 0 ? <p className="rounded-[24px] bg-white p-5 text-sm text-ink-600 shadow-tile ring-1 ring-ink-100">Everyone saved here already has a proposal.</p> : null}

          {proposed.length > 0 ? (
            <section aria-labelledby="proposed-heading" className="mt-10">
              <h2 id="proposed-heading" className="mb-3 text-sm font-semibold text-ink-900">
                Already proposed <span className="nums font-normal text-text-subtle">{proposed.length}</span>
              </h2>
              {renderGroups(proposed, shown.length)}
            </section>
          ) : null}
        </div>

        <CartSummary ready={shown.length} inProgress={proposed.length} target={continueTarget} />
      </div>

      {confirmDialog}

      <MeetingDialog
        name={meetingCandidate ? nameOf(meetingCandidate) : null}
        open={Boolean(meetingCandidate)}
        onClose={() => setMeetingCandidate(null)}
        success={meetingSuccess}
        error={meetingError}
        booking={busyId === "booking-meeting"}
        slots={slots}
        setSlots={setSlots}
        slotsTouched={slotsTouched}
        setSlotsTouched={setSlotsTouched}
        timezone={timezone}
        setTimezone={setTimezone}
        onSubmit={handleBookMeeting}
      />
    </div>
  );
}
