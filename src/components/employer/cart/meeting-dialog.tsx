"use client";

import { CheckCircle2, Loader2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { MeetingSlots, TimezoneSelect, type Slots } from "@/components/employer/meeting-slots";
import { labelClass } from "@/components/employer/ui-tokens";
import { suggestedSlots } from "@/lib/employer-interview-rules";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { nowMs } from "./cart-helpers";

/** The "Book a meeting" dialog; all state and the submit handler stay with the cart manager. */
export function MeetingDialog({
  name,
  open,
  onClose,
  success,
  error,
  booking,
  slots,
  setSlots,
  setSlotsTouched,
  slotsTouched,
  timezone,
  setTimezone,
  onSubmit,
}: {
  name: string | null;
  open: boolean;
  onClose: () => void;
  success: boolean;
  error: string;
  booking: boolean;
  slots: Slots;
  setSlots: (s: Slots) => void;
  slotsTouched: boolean;
  setSlotsTouched: (b: boolean) => void;
  timezone: string;
  setTimezone: (tz: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{name ? `Book a meeting with ${name}` : "Book a meeting"}</DialogTitle>
            <DialogDescription>
              Offer three times on the quarter hour. We suggest the next quarter hour and the two hours after it; change any of
              them. The candidate picks one.
            </DialogDescription>
          </DialogHeader>

          {success ? (
            <div className="rounded-apple-md border border-brand-200 bg-brand-50 p-6 text-center transition-[opacity,scale] duration-[var(--dur-standard)] ease-[var(--ease-out-quart)] starting:scale-[0.97] starting:opacity-0">
              <CheckCircle2 className="mx-auto size-8 text-brand-700" aria-hidden />
              <p id="meeting-sent-title" className="mt-2 text-base font-semibold text-ink-900">Meeting request sent</p>
              <p id="meeting-sent-body" className="mt-1 text-sm text-ink-600">It is on your Schedule as &ldquo;Waiting on candidate&rdquo; until they pick one of your times.</p>
              {/* The form that held focus is gone: focus lands here and reads the result with it. */}
              <button
                type="button"
                autoFocus
                aria-describedby="meeting-sent-title meeting-sent-body"
                onClick={() => onClose()}
                className={buttonClass({ variant: "outline", size: "sm", className: "mt-4 min-h-11" })}
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4 pt-1">
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
              {error ? (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              ) : null}
              <DialogFooter>
                <button type="button" onClick={() => onClose()} className={buttonClass({ variant: "light", size: "sm", className: "min-h-11" })}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={booking}
                  className={buttonClass({ variant: "primary", size: "sm", className: "min-h-11" })}
                >
                  {booking ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                  Send meeting request
                </button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
  );
}
