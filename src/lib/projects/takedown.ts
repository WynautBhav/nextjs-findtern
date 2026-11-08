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
