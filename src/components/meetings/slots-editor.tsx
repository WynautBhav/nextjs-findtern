"use client";

import { Plus } from "lucide-react";

import { MeetingSlots, type Slots } from "@/components/employer/meeting-slots";
import { MAX_SLOTS, MIN_SLOTS, nextSlot } from "@/components/employer/meeting-slots-model";
import { buttonClass } from "@/components/ui/button";

/** One to three times to offer: the slot rows, a Remove on each while more than one, and "Add another time" up to three. */
export function SlotsEditor({
  slots,
  onChange,
  timezone,
  disabled,
  invalid,
  describedBy,
}: {
  slots: Slots;
  onChange: (next: Slots) => void;
  timezone: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const more = nextSlot(slots);
  return (
    <div className="space-y-3">
      <MeetingSlots
        slots={slots}
        onChange={onChange}
        timezone={timezone}
        disabled={disabled}
        invalid={invalid}
        describedBy={describedBy}
        onRemove={slots.length > MIN_SLOTS ? (idx) => onChange(slots.filter((_, i) => i !== idx)) : undefined}
      />
      {slots.length < MAX_SLOTS && more !== null ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...slots, more])}
          className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}
        >
          <Plus className="size-4" aria-hidden />
          Add another time
        </button>
      ) : null}
    </div>
  );
}
