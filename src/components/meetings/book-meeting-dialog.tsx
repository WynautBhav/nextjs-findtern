"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, CheckCircle2, Loader2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { TimezoneSelect, type Slots } from "@/components/employer/meeting-slots";
import { cannotSend, offerProblem } from "@/components/employer/meeting-slots-model";
import { labelClass } from "@/components/employer/ui-tokens";
import { suggestedSlots } from "@/lib/employer-interview-rules";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { meetingContextFor, type MeetingContext } from "./meeting-context";
import { postMeeting } from "./meeting-api";
import { SlotsEditor } from "./slots-editor";

export type BookMeetingProps = {
  /** With `defaultTimezone`, nothing is looked up. Without them the dialog asks the server who is signed in and which zone applies. */
  employerId?: string;
  internId: string;
  projectId?: string | null;
  projectName?: string | null;
  /** How the candidate reads to the employer ("Candidate XY", or the full name once hired). */
  candidateLabel: string;
  /** The project's zone, else the company's. */
  defaultTimezone?: string;
  /** The project owns the zone: shown, not chosen. */
  lockTimezone?: boolean;
};

/**
 * "Book a meeting": the employer offers one to three times, the candidate picks one (or answers with times of its own).
 * The form mounts only while the dialog is open, so each opening starts from fresh suggestions.
 */
export function BookMeetingDialog({
  open,
  onOpenChange,
  onBooked,
  ...props
}: BookMeetingProps & { open: boolean; onOpenChange: (open: boolean) => void; onBooked?: (interview: unknown) => void }) {
  const { employerId, defaultTimezone, lockTimezone, projectId } = props;
  const known = Boolean(employerId && defaultTimezone);
  const key = projectId ?? "";
  const [looked, setLooked] = useState<{ key: string; ctx: MeetingContext | null } | null>(null);
  useEffect(() => {
    if (!open || known) return;
    let live = true;
    meetingContextFor(projectId ?? null)
      .then((ctx) => live && setLooked({ key, ctx }))
      .catch(() => live && setLooked({ key, ctx: null }));
    return () => {
      live = false;
    };
  }, [open, known, projectId, key]);
  const ctx = known ? { employerId: employerId!, zone: defaultTimezone!, locked: Boolean(lockTimezone) } : looked?.key === key ? looked.ctx : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {ctx ? (
          <BookMeetingForm {...props} employerId={ctx.employerId} defaultTimezone={ctx.zone} lockTimezone={ctx.locked} onClose={() => onOpenChange(false)} onBooked={onBooked} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Book a meeting with {props.candidateLabel}</DialogTitle>
              <DialogDescription>{ctx === null ? "Couldn't load your time zone. Close this and try again." : "Getting your time zone."}</DialogDescription>
            </DialogHeader>
            {ctx === undefined ? (
              <p role="status" className="flex items-center gap-2 text-sm text-ink-600">
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
                Loading
              </p>
            ) : (
              <DialogFooter>
                <button type="button" onClick={() => onOpenChange(false)} className={buttonClass({ variant: "light", size: "sm", className: "min-h-11" })}>
                  Close
                </button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const DEFAULT_ZONE = "Asia/Kolkata";

function BookMeetingForm({
  employerId,
  internId,
  projectId,
  projectName,
  candidateLabel,
  defaultTimezone = DEFAULT_ZONE,
  lockTimezone,
  onClose,
  onBooked,
}: BookMeetingProps & { employerId: string; onClose: () => void; onBooked?: (interview: unknown) => void }) {
  const router = useRouter();
  const tzId = useId();
  const errId = useId();
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [slots, setSlots] = useState<Slots>(() => suggestedSlots(Date.now(), defaultTimezone));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = offerProblem(slots);
    if (problem) return setError(problem);
    setBusy(true);
    setError("");
    // Wall-clock times in the chosen zone; the server converts them (the project's own zone wins there).
    const r = await postMeeting<{ interview?: unknown }>(`/api/employer/${encodeURIComponent(employerId)}/interviews`, {
      internId,
      ...(projectId ? { projectId } : {}),
      slot1: slots[0],
      ...(slots[1] ? { slot2: slots[1] } : {}),
      ...(slots[2] ? { slot3: slots[2] } : {}),
      timezone,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setSent(true);
    onBooked?.(r.data.interview);
    router.refresh();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Book a meeting with {candidateLabel}</DialogTitle>
        <DialogDescription>
          {projectName ? `For ${projectName}. ` : ""}Offer up to three times on the quarter hour. We suggest the next quarter hour and the two hours after it;
          change or remove any. The candidate picks one, or sends times back.
        </DialogDescription>
      </DialogHeader>

      {sent ? (
        <div className="rounded-apple-md border border-brand-200 bg-brand-50 p-6 text-center transition-[opacity,scale] duration-[var(--dur-standard)] ease-[var(--ease-out-quart)] starting:scale-[0.97] starting:opacity-0">
          <CheckCircle2 className="mx-auto size-8 text-brand-700" aria-hidden />
          <p id="meeting-sent-title" className="mt-2 text-base font-semibold text-ink-900">Meeting request sent</p>
          <p id="meeting-sent-body" className="mt-1 text-sm text-ink-600">
            It is on your Schedule as &ldquo;Waiting on candidate&rdquo; until they pick one of your times.
          </p>
          {/* The form that held focus is gone: focus lands here and reads the result with it. */}
          <button
            type="button"
            autoFocus
            aria-describedby="meeting-sent-title meeting-sent-body"
            onClick={onClose}
            className={buttonClass({ variant: "outline", size: "sm", className: "mt-4 min-h-11" })}
          >
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4 pt-1">
          <SlotsEditor
            slots={slots}
            timezone={timezone}
            invalid={Boolean(error)}
            describedBy={errId}
            onChange={(next) => {
              setSlots(next);
              setTouched(true);
              setError("");
            }}
          />
          <div>
            <label htmlFor={tzId} className={labelClass}>
              Timezone
            </label>
            <div className="mt-1.5">
              {lockTimezone ? (
                <p id={tzId} className="nums text-sm font-medium text-ink-900">
                  {timezone}
                </p>
              ) : (
                <TimezoneSelect
                  id={tzId}
                  value={timezone}
                  onChange={(tz) => {
                    setTimezone(tz);
                    // Untouched suggestions move to the new zone's next quarter hour.
                    if (!touched) setSlots(suggestedSlots(Date.now(), tz));
                  }}
                />
              )}
            </div>
            <p className="mt-1.5 text-xs text-text-subtle">
              {lockTimezone ? "Set by the project." : "Set from your company's location."} The candidate sees the times in IST.
            </p>
          </div>
          {error ? (
            <p id={errId} role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <button type="button" onClick={onClose} className={buttonClass({ variant: "light", size: "sm", className: "min-h-11" })}>
              Cancel
            </button>
            <button type="submit" disabled={busy || cannotSend(slots, timezone)} className={buttonClass({ variant: "primary", size: "sm", className: "min-h-11" })}>
              {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              Send meeting request
            </button>
          </DialogFooter>
        </form>
      )}
    </>
  );
}

/** A "Book meeting" button that owns its dialog. With `meetingOpen` the pair already has a live meeting: shown disabled. */
export function BookMeetingButton({
  size = "sm",
  variant = "outline",
  meetingOpen = false,
  className,
  ...props
}: BookMeetingProps & { size?: "sm" | "md"; variant?: "primary" | "outline"; meetingOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={meetingOpen}
        onClick={() => setOpen(true)}
        className={buttonClass({ variant, size, className: ["min-h-11", className].filter(Boolean).join(" ") })}
      >
        <CalendarPlus className="size-4" aria-hidden />
        {meetingOpen ? "Meeting open" : "Book meeting"}
      </button>
      <BookMeetingDialog {...props} open={open} onOpenChange={setOpen} />
    </>
  );
}
