// Pure decision flow for project lifecycle routes. No DB, no clock unless passed.
import {
  EDITABLE_WHILE_PUBLISHED,
  canTransition,
  isEditableByEmployer,
  normalizeStatus,
  submitReadiness,
  transitionError,
  type CanonicalProjectStatus,
  type LifecycleRole,
} from "./lifecycle.ts";

/** Raw `status` values an intern may see: canonical `published` and legacy `active` (SQL filter twin of isVisibleToInterns). */
export const INTERN_VISIBLE_STATUSES = ["published", "active"] as const;

export interface TransitionProject {
  status: string | null;
  projectName?: string | null;
  scopeOfWork?: string | null;
  skills?: string[] | null;
  locationType?: string | null;
  publishedAt?: Date | null;
}

export interface TransitionSet {
  status: CanonicalProjectStatus;
  submittedAt?: Date;
  publishedAt?: Date;
  rejectionReason?: string | null;
}

export type TransitionPlan =
  | { ok: true; from: CanonicalProjectStatus; to: CanonicalProjectStatus; set: TransitionSet }
  | { ok: false; status: 400 | 403 | 422; error: string; missing?: string[] };

export function planTransition(input: {
  project: TransitionProject;
  to: string;
  actorRole: LifecycleRole;
  reason?: string | null;
  now?: Date;
}): TransitionPlan {
  const { project, actorRole } = input;
  const now = input.now ?? new Date();
  const from = normalizeStatus(project.status);
  const to = normalizeStatus(input.to);
  const err = transitionError(project.status ?? "", input.to, actorRole);
  if (err || !from || !to) return { ok: false, status: from && to ? 403 : 400, error: err ?? "Unknown status." };

  if (to === "pending_review") {
    const missing = submitReadiness(project);
    if (missing.length) {
      return { ok: false, status: 422, error: `Complete these before submitting: ${missing.join(", ")}.`, missing };
    }
    return { ok: true, from, to, set: { status: to, submittedAt: now, rejectionReason: null } };
  }
  if (to === "published") {
    // A draft going live is the employer's own Submit: it must be complete first.
    if (from === "draft") {
      const missing = submitReadiness(project);
      if (missing.length) {
        return { ok: false, status: 422, error: `Complete these before publishing: ${missing.join(", ")}.`, missing };
      }
      return {
        ok: true, from, to,
        set: { status: to, submittedAt: now, publishedAt: project.publishedAt ?? now, rejectionReason: null },
      };
    }
    // A backlog or admin approval stamps the first publish; a resume from paused keeps it.
    return { ok: true, from, to, set: { status: to, publishedAt: project.publishedAt ?? now, rejectionReason: null } };
  }
  return { ok: true, from, to, set: { status: to } };
}

/** Conditional UPDATE `WHERE status = current` touching 0 rows means someone else moved it first. */
export function isTransitionConflict(affectedRows: number): boolean {
  return affectedRows < 1;
}

const PUBLISHED_ALLOWED = new Set<string>(EDITABLE_WHILE_PUBLISHED);

/** Why an employer edit is refused for this status, or null. `changed` lists the fields that differ. */
export function editBlockedReason(status: string | null | undefined, changed: readonly string[]): string | null {
  const s = normalizeStatus(status);
  if (isEditableByEmployer(status)) return null;
  if (s === "published") {
    const bad = changed.filter((k) => !PUBLISHED_ALLOWED.has(k));
    return bad.length ? `While published you can only change: ${EDITABLE_WHILE_PUBLISHED.join(", ")}.` : null;
  }
  if (s === "pending_review") return "This project is in review. Move it back to draft to edit it.";
  return "A closed project can't be edited.";
}

/** Re-export so routes need one import. */
export { canTransition };
