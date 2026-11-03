"use client";

import { ADMIN_PILL_PRIMARY } from "@/components/admin/surface";
import { buttonClass } from "@/components/ui/button";

/** Same as pressing J on the desk: selects and focuses the first row. */
export const WORK_QUEUE_EVENT = "triage:work";

export function WorkQueueButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(WORK_QUEUE_EVENT))}
      className={buttonClass({
        variant: "primary",
        size: "md",
        className: `${ADMIN_PILL_PRIMARY} outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`,
      })}
    >
      Work the queue
    </button>
  );
}
