// Pure decision for an admin taking a listing down or restoring it. No DB, no clock unless passed.

export const TAKEDOWN_REASON_MAX = 500;

export interface TakedownProject {
  takenDownAt: Date | null;
}

export type TakedownPlan =
  | { ok: true; noop: true }
  | {
      ok: true;
      noop: false;
      set: { takenDownAt: Date | null; takenDownBy: string | null; takenDownReason: string | null };
    }
  | { ok: false; status: 422; error: string };

/**
 * Takedown leaves `status` alone: the listing keeps whatever the employer set, and the
 * `taken_down_at` guards (discovery, proposals, interviews, cart) do the hiding. Taking down a
 * listing that is already down, or restoring one that is up, changes nothing (idempotent).
 */
export function planTakedown(input: {
  project: TakedownProject;
  action: "takedown" | "restore";
  adminId: string;
  reason?: string | null;
  now?: Date;
}): TakedownPlan {
  const { project, action } = input;
  if (action === "restore") {
    if (!project.takenDownAt) return { ok: true, noop: true };
    return { ok: true, noop: false, set: { takenDownAt: null, takenDownBy: null, takenDownReason: null } };
  }
  const reason = (input.reason ?? "").trim();
  if (!reason) return { ok: false, status: 422, error: "A takedown needs a reason." };
  if (project.takenDownAt) return { ok: true, noop: true };
  return {
    ok: true,
    noop: false,
    set: { takenDownAt: input.now ?? new Date(), takenDownBy: input.adminId, takenDownReason: reason.slice(0, TAKEDOWN_REASON_MAX) },
  };
}

/**
 * A taken-down listing also freezes the offers already made on it: the intern can't accept one,
 * the employer can't open a payment for one, and a pending interview can't be booked. Declining
 * and withdrawing stay open, and hired placements (money already moving) are not touched.
 * Returns the refusal text (answer 409), or null when the listing is up.
 */
export const TAKEDOWN_BLOCKS = {
  accept: "Findtern took this listing down, so this offer can't be accepted right now. You can still turn it down.",
  pay: "Findtern took this listing down, so this offer can't be paid for right now. Contact support.",
  schedule: "Findtern took this listing down, so this interview can't be scheduled right now.",
} as const;

export function takedownBlock(
  project: { takenDownAt: Date | string | null } | null | undefined,
  action: keyof typeof TAKEDOWN_BLOCKS,
): string | null {
  return project?.takenDownAt ? TAKEDOWN_BLOCKS[action] : null;
}

/**
 * Which payable lines a taken-down listing blocks the employer from paying. Only a NEW internship
 * hire: a due month (placement already hired) and a full-time fee (accepting the full-time offer
 * was the hire, so the fee is owed on a hire that already happened) are not new business.
 */
export function takedownCheckedLineIds(lines: { id: string; due?: unknown; fullTime?: boolean }[]): string[] {
  return lines.filter((l) => !l.due && !l.fullTime).map((l) => l.id);
}
