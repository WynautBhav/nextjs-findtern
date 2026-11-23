// In-memory stand-ins for the admin academics route's collaborators (test-only; see academics-hooks.mjs).
// A test configures them through `globalThis.__acad`:
//   extra        the candidate's extra_data (null: no onboarding row)      permissions  the admin's permissions
//   offers       accepted proposals [{ id, offerDetails }]                  failAudit    true: the audit insert throws
// and reads back: `extra` (after the write), `offers`, `audits`, `locked` (select ... for update was used), `committed`.
import { getTableName } from "drizzle-orm";

import * as realSchema from "../../db/schema.ts";
import { allows, requiredPermissions } from "../permissions.ts";

/** @type {any} */
const g = globalThis;
export const reset = () => {
  g.__acad = { extra: {}, permissions: ["interns:read", "interns:write"], offers: [], audits: [], locked: false, committed: false, failAudit: false, updates: [] };
};
reset();

export const NextResponse = { json: (body, init) => ({ status: init?.status ?? 200, body }) };
export const schema = realSchema;

// The real permission rule for the route's path, applied to the test's permissions (the guard itself has its own tests).
export const requireMutation = async ({ req }) => {
  const needed = requiredPermissions(new URL(req.url).pathname, req.method);
  if (!allows(g.__acad.permissions, needed)) return { ok: false, response: { status: 403, body: { error: "Your role doesn't allow this" } } };
  return { ok: true, session: { uid: "admin-1", role: "admin", permissions: g.__acad.permissions } };
};

function tx() {
  return {
    select: () => ({
      from: (table) => {
        const name = getTableName(table);
        /** @type {any} */
        const api = {
          where: () => api,
          orderBy: (...cols) => {
            g.__acad.orderBy = cols;
            return api;
          },
          limit: () => api,
          for: () => {
            g.__acad.locked = true;
            return api;
          },
          then: (resolve) => {
            if (name === "intern_onboarding") return resolve(g.__acad.extra === null ? [] : [{ id: "row-1", extra: g.__acad.extra }]);
            if (name === "proposals") return resolve(g.__acad.offers.map((o) => ({ id: o.id, offer: o.offerDetails })));
            return resolve([]);
          },
        };
        return api;
      },
    }),
    update: (table) => ({
      set: (values) => ({
        where: async () => {
          const name = getTableName(table);
          g.__acad.updates.push({ table: name, values });
          if (name === "intern_onboarding") g.__acad.extra = values.extraData;
          if (name === "proposals") {
            // the where() id is opaque here; the tests use one offer unless they look at `updates`
            const offer = g.__acad.offers[g.__acad.updates.filter((u) => u.table === "proposals").length - 1];
            if (offer) offer.offerDetails = values.offerDetails;
          }
        },
      }),
    }),
    insert: () => ({
      values: async (v) => {
        if (g.__acad.failAudit) throw new Error("audit insert failed");
        g.__acad.audits.push(v);
      },
    }),
  };
}

export const getDb = () => ({
  transaction: async (cb) => {
    const snapshot = structuredClone({ extra: g.__acad.extra, offers: g.__acad.offers });
    try {
      const out = await cb(tx());
      g.__acad.committed = true;
      return out;
    } catch (e) {
      g.__acad.extra = snapshot.extra;
      g.__acad.offers = snapshot.offers;
      throw e;
    }
  },
});
