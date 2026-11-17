// The one server-side answer to "may this employer change anything about this project right now?".
// While admin has a project taken down (projects.taken_down_at set) the owning employer may only view it and contact
// admin: every employer route that mutates something belonging to a project asks this guard first. Pure part only
// (no database, no Next runtime), so it is unit tested; the database binding is takedown-guard-server.ts.
// Admin routes and the intern side do not call it.

export const PROJECT_TAKEN_DOWN_CODE = "project_taken_down";
export const PROJECT_TAKEN_DOWN_MESSAGE =
  "This project was taken down by Findtern. You can view it but not change it. Contact admin to resolve this.";

/** The one predicate: a project is taken down when `takenDownAt` is set. `status` is left alone by a takedown. */
export function isTakenDown(project: { takenDownAt?: Date | string | null } | null | undefined): boolean {
  return Boolean(project?.takenDownAt);
}

/** The 409 every refused employer action answers with. */
export function takenDownResponse(projectId?: string): Response {
  return Response.json(
    { error: PROJECT_TAKEN_DOWN_MESSAGE, code: PROJECT_TAKEN_DOWN_CODE, ...(projectId ? { projectId } : {}) },
    { status: 409 },
  );
}

export type GuardResult = { ok: true } | { ok: false; response: Response };

/** What a loader returns for the project an id resolves to; null when the id does not exist / has no project. */
export type ResolvedProject = { projectId: string; employerId: string | null; projectName?: string | null; takenDownAt: Date | string | null };

export type GuardLoaders = {
  project: (projectId: string) => Promise<ResolvedProject | null>;
  proposal: (proposalId: string) => Promise<ResolvedProject | null>;
  interview: (interviewId: string) => Promise<ResolvedProject | null>;
  timesheet: (timesheetId: string) => Promise<ResolvedProject | null>;
  cartItem: (cartItemId: string) => Promise<ResolvedProject | null>;
};

const OK: GuardResult = { ok: true };

/**
 * Builds the guard over a set of loaders. Every call reads through the loader again: nothing is cached between calls,
 * so a restore takes effect on the very next request. An id that resolves to nothing (or to another employer's
 * project when `employerId` is given) is let through: the route's own 404/403 answers it and the guard never tells a
 * caller anything about a project that is not theirs.
 */
export function makeGuard(load: GuardLoaders) {
  const decide = (row: ResolvedProject | null, employerId?: string | null): GuardResult => {
    if (!row) return OK;
    if (employerId && row.employerId && row.employerId !== employerId) return OK;
    return isTakenDown(row) ? { ok: false, response: takenDownResponse(row.projectId) } : OK;
  };
  return {
    project: async (projectId: string, employerId?: string | null) => decide(await load.project(projectId), employerId),
    proposal: async (proposalId: string, employerId?: string | null) => decide(await load.proposal(proposalId), employerId),
    interview: async (interviewId: string, employerId?: string | null) => decide(await load.interview(interviewId), employerId),
    timesheet: async (timesheetId: string, employerId?: string | null) => decide(await load.timesheet(timesheetId), employerId),
    cartItem: async (cartItemId: string, employerId?: string | null) => decide(await load.cartItem(cartItemId), employerId),
  };
}
