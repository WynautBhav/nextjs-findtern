"use client";

import { useId, useState } from "react";
import { Loader2, ShieldAlert, Video } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MeetingRulesList } from "@/components/employer/meeting-rules";
import { csrfFetch } from "@/lib/client-fetch";
import { normalizeMeetingLink } from "@/lib/employer-interview-rules";

/**
 * "Join meeting" that first shows the mandatory conduct rules with a tick
 * box, as legacy did every time (employer-schedule.tsx:1555; EMB-10). The
 * link opens in a new tab only after "I agree"; a link typed without a
 * scheme opens as https.
 *
 * With `interviewId` the click goes through POST /api/interviews/[id]/join,
 * which records that the employer joined (an interview nobody joins within 30
 * minutes of its start expires, bug sheet 12 Nov row 13) and returns the link.
 * With `ready={false}` (the booking has no link yet, bug sheet row 12) the
 * button is shown disabled with the reason beside it.
 */
export function JoinMeetingButton({
  link = null,
  interviewId,
  ready = true,
  size = "sm",
  variant = "primary",
  block = false,
  label = "Join meeting",
}: {
  /** The link to open. With `interviewId` the server's answer wins and this only decides whether to show the button. */
  link?: string | null;
  /** The interview being joined; its join is recorded server-side. */
  interviewId?: string;
  /** False: the booking has no link yet. Shown disabled, with the reason. */
  ready?: boolean;
  size?: "sm" | "md";
  variant?: "primary" | "outline";
  block?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const href = normalizeMeetingLink(link);

  if (!ready) {
    return (
      <span className={block ? "grid gap-1" : "inline-flex flex-col items-start gap-1"}>
        <button type="button" disabled aria-describedby={`${id}-wait`} className={buttonClass({ variant: "outline", size, block })}>
          <Video className="size-4" aria-hidden />
          {label}
        </button>
        <span id={`${id}-wait`} className="text-xs text-text-subtle">
          Link not ready, we&apos;ll email it
        </span>
      </span>
    );
  }
  if (!href && !interviewId) return null;

  async function proceed() {
    if (!interviewId) {
      window.open(href!, "_blank", "noopener,noreferrer");
      setOpen(false);
      return;
    }
    setBusy(true);
    setError(null);
    // Opened first, inside the click, so the pop-up blocker lets it through; pointed at the link once the join is recorded.
    const tab = window.open("about:blank", "_blank");
    try {
      const res = await csrfFetch(`/api/interviews/${encodeURIComponent(interviewId)}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      const target = normalizeMeetingLink(data.link);
      if (!res.ok || !target) throw new Error(data.error ?? "Couldn't join. Try again.");
      if (tab) {
        tab.opener = null;
        tab.location.href = target;
      } else {
        window.open(target, "_blank", "noopener,noreferrer");
      }
      setOpen(false);
    } catch (e) {
      tab?.close();
      setError(e instanceof TypeError || !(e instanceof Error) ? "Couldn't reach the server. Check your connection and try again." : e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAgreed(false);
          setError(null);
          setOpen(true);
        }}
        className={buttonClass({ variant, size, block })}
      >
        <Video className="size-4" aria-hidden />
        {label}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-apple-xl sm:max-w-2xl">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-ink-900">
              <ShieldAlert className="size-5 text-brand-700" aria-hidden />
              Mandatory rules while joining meetings
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-ink-600">
              By joining a meeting scheduled through Findtern, you confirm you will follow these rules.
            </DialogDescription>
          </DialogHeader>
          <MeetingRulesList />
          <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-ink-800">
            <input
              id={id}
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="size-4 rounded-sm border-ink-300 accent-brand-700"
            />
            I have read the rules and I agree to comply.
          </label>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <DialogFooter className="gap-2">
            <button type="button" onClick={() => setOpen(false)} className={buttonClass({ variant: "outline", size: "sm" })}>
              Cancel
            </button>
            <button type="button" disabled={!agreed || busy} onClick={proceed} className={buttonClass({ size: "sm" })}>
              {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              Proceed to meeting
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
