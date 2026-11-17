// In-memory stand-ins for the takedown guard's database reads (test-only; see takedown-guard.test.ts).
// A test fills `store` (the rows that "exist"), calls the guard, then edits `store` and calls it again:
// `reads` counts every database read, so a test can prove the takedown flag is read on every call and never cached.
//
//   store.projects   id -> { id, employerId, projectName, takenDownAt }
//   store.proposals  id -> { id, projectId }
//   store.interviews id -> { id, projectId, proposalId? }
//   store.timesheets id -> { id, proposalId }
//   store.cart       id -> { id, projectId }

export const makeStore = () => ({
  projects: new Map(),
  proposals: new Map(),
  interviews: new Map(),
  timesheets: new Map(),
  cart: new Map(),
  reads: 0,
});

/** Loader set shaped like the guard's `GuardLoaders`, reading `store` fresh every call. */
export const loadersFor = (store) => {
  const project = (id) => {
    store.reads += 1;
    const p = store.projects.get(id);
    return p ? { projectId: p.id, employerId: p.employerId, projectName: p.projectName, takenDownAt: p.takenDownAt ?? null } : null;
  };
  return {
    project: async (id) => project(id),
    proposal: async (id) => {
      const row = store.proposals.get(id);
      return row ? project(row.projectId) : null;
    },
    interview: async (id) => {
      const row = store.interviews.get(id);
      return row?.projectId ? project(row.projectId) : null;
    },
    timesheet: async (id) => {
      const ts = store.timesheets.get(id);
      const prop = ts ? store.proposals.get(ts.proposalId) : null;
      return prop ? project(prop.projectId) : null;
    },
    cartItem: async (id) => {
      const row = store.cart.get(id);
      return row ? project(row.projectId) : null;
    },
  };
};
