import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { makeGuard, takenDownResponse, type GuardLoaders, type GuardResult, type ResolvedProject } from "./takedown-guard";

/**
 * Database binding of the takedown guard (see takedown-guard.ts). Every function reads `projects.taken_down_at` from
 * the database at call time, never from a cache, and answers `{ ok: true }` or `{ ok: false, response }` where the
 * response is the 409 `project_taken_down` the route returns as it is:
 *
 *   const td = await assertProposalActionable(id);
 *   if (!td.ok) return td.response;
 *
 * Call it in every employer route that changes something belonging to a project, after authentication and the
 * ownership check and before any write. Pass `employerId` where the caller is known so a project that is not theirs is
 * left to the route's own 403/404.
 */

const cols = {
  projectId: schema.projects.id,
  employerId: schema.projects.employerId,
  projectName: schema.projects.projectName,
  takenDownAt: schema.projects.takenDownAt,
};

const first = async (q: Promise<ResolvedProject[]>): Promise<ResolvedProject | null> => (await q)[0] ?? null;

const loaders: GuardLoaders = {
  project: (id) => first(getDb().select(cols).from(schema.projects).where(eq(schema.projects.id, id)).limit(1)),
  proposal: (id) =>
    first(
      getDb()
        .select(cols)
        .from(schema.proposals)
        .innerJoin(schema.projects, eq(schema.projects.id, schema.proposals.projectId))
        .where(eq(schema.proposals.id, id))
        .limit(1),
    ),
  interview: async (id) => {
    const direct = await first(
      getDb()
        .select(cols)
        .from(schema.interviews)
        .innerJoin(schema.projects, eq(schema.projects.id, schema.interviews.projectId))
        .where(eq(schema.interviews.id, id))
        .limit(1),
    );
    if (direct) return direct;
    // Legacy interview rows with no project of their own: the proposal that points at the interview names it.
    return first(
      getDb()
        .select(cols)
        .from(schema.proposals)
        .innerJoin(schema.projects, eq(schema.projects.id, schema.proposals.projectId))
        .where(eq(schema.proposals.interviewId, id))
        .limit(1),
    );
  },
  timesheet: (id) =>
    first(
      getDb()
        .select(cols)
        .from(schema.timesheets)
        .innerJoin(schema.proposals, eq(schema.proposals.id, schema.timesheets.proposalId))
        .innerJoin(schema.projects, eq(schema.projects.id, schema.proposals.projectId))
        .where(eq(schema.timesheets.id, id))
        .limit(1),
    ),
  cartItem: (id) =>
    first(
      getDb()
        .select(cols)
        .from(schema.employerCartItems)
        .innerJoin(schema.projects, eq(schema.projects.id, schema.employerCartItems.projectId))
        .where(eq(schema.employerCartItems.id, id))
        .limit(1),
    ),
};

const guard = makeGuard(loaders);

export const assertProjectActionable = guard.project;
export const assertProposalActionable = guard.proposal;
export const assertInterviewActionable = guard.interview;
export const assertTimesheetActionable = guard.timesheet;
export const assertCartItemActionable = guard.cartItem;

/** Several projects at once (a checkout of lines from different projects): refused if any one is taken down. */
export async function assertProjectsActionable(projectIds: string[], employerId?: string | null): Promise<GuardResult> {
  const ids = [...new Set(projectIds.filter(Boolean))];
  if (ids.length === 0) return { ok: true };
  const rows = await getDb()
    .select({ projectId: schema.projects.id })
    .from(schema.projects)
    .where(
      employerId
        ? and(inArray(schema.projects.id, ids), eq(schema.projects.employerId, employerId), isNotNull(schema.projects.takenDownAt))
        : and(inArray(schema.projects.id, ids), isNotNull(schema.projects.takenDownAt)),
    )
    .limit(1);
  return rows[0] ? { ok: false, response: takenDownResponse(rows[0].projectId) } : { ok: true };
}

/** The ids of this employer's projects that are taken down right now (for pages: banners, greyed picker rows). */
export async function takenDownProjectIdsOf(employerId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.employerId, employerId), isNotNull(schema.projects.takenDownAt)));
  return new Set(rows.map((r) => r.id));
}
