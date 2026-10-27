"use client";

import { useId, useState } from "react";
import { ShieldAlert, Video } from "lucide-react";

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
import { normalizeMeetingLink } from "@/lib/employer-interview-rules";

/**
 * "Join meeting" that first shows the mandatory conduct rules with a tick
 * box, as legacy did every time (employer-schedule.tsx:1555; EMB-10). The
 * link opens in a new tab only after "I agree"; a link typed without a
 * scheme opens as https.
 */
export function JoinMeetingButton({
  link,
  size = "sm",
  variant = "primary",
  block = false,
}: {
  link: string;
  size?: "sm" | "md";
  variant?: "primary" | "outline";
  block?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const id = useId();
  const href = normalizeMeetingLink(link);
  if (!href) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAgreed(false);
          setOpen(true);
        }}
        className={buttonClass({ variant, size, block })}
      >
        <Video className="size-4" aria-hidden />
        Join meeting
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
          <DialogFooter className="gap-2">
            <button type="button" onClick={() => setOpen(false)} className={buttonClass({ variant: "outline", size: "sm" })}>
              Cancel
            </button>
            <button
              type="button"
              disabled={!agreed}
              onClick={() => {
                window.open(href, "_blank", "noopener,noreferrer");
                setOpen(false);
              }}
              className={buttonClass({ size: "sm" })}
            >
              Proceed to meeting
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
