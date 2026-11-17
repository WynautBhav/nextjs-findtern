// In-memory stand-ins for the collaborators of the admin CMS route and the project publish / takedown routes
// (test-only; see publish-hooks.mjs). A test configures them through `globalThis.__pub` before calling a handler.
//
//   __pub.calls        ordered log of every db write and read: { op, table, values? }
//   __pub.revalidated  every revalidatePath / revalidateTag call, in order
//   __pub.rows         table name -> rows a select() returns
//   __pub.updateRows   table name -> rows an update().returning() returns (default: one row { id: "row-1" })
//   __pub.failOn       { op, table, error }: that write throws instead of recording
//   __pub.deny         a response the guard returns instead of letting the request through
//   __pub.session      the session the guard hands back

import { getTableName } from "drizzle-orm";

import * as realSchema from "../../db/schema.ts";

/** @type {any} */
const g = globalThis;

export const reset = () => {
  g.__pub = {
    calls: [],
    revalidated: [],
    notified: [],
    rows: {},
    updateRows: {},
    failOn: null,
    deny: null,
    session: { uid: "admin-1", role: "admin" },
  };
};
reset();

// next/server
export const NextResponse = { json: (body, init) => ({ status: init?.status ?? 200, body }) };

// next/cache
export const revalidatePath = (path, type) => void g.__pub.revalidated.push({ fn: "revalidatePath", path, type });
export const revalidateTag = (tag) => void g.__pub.revalidated.push({ fn: "revalidateTag", tag });

// guards-mutation: whoever the test says is signed in
export const requireMutation = async (input) => {
  g.__pub.calls.push({ op: "guard", roles: input.roles });
  if (g.__pub.deny) return { ok: false, response: g.__pub.deny };
  return { ok: true, session: g.__pub.session };
};

// notify, and the offer sweep a takedown runs (not what these tests are about)
export const notify = async (n) => void g.__pub.notified.push(n);
export const lockOpenOfferRows = async () => {};
export const withdrawOpenOffers = async () => ({ withdrawn: [], skipped: [] });
export const notifyWithdrawnOffers = async () => {};

// db
export const schema = realSchema;
export const hasDb = () => true;

function chain(op, table) {
  const name = getTableName(table);
  const entry = { op, table: name };
  let returning = false;
  /** @type {any} */
  const api = {
    values: (v) => ((entry.values = v), api),
    set: (v) => ((entry.values = v), api),
    from: (t) => ((entry.table = getTableName(t)), api),
    returning: () => ((returning = true), api),
    where: () => api,
    limit: () => api,
    for: () => api,
    orderBy: () => api,
    then: (resolve, reject) => {
      const f = g.__pub.failOn;
      if (f && f.op === op && f.table === entry.table) return reject(f.error);
      g.__pub.calls.push(entry);
      if (op === "select") return resolve(g.__pub.rows[entry.table] ?? []);
      if (op === "update" && returning) return resolve(g.__pub.updateRows[entry.table] ?? [{ id: "row-1" }]);
      if (op === "insert" && returning) return resolve([{ id: "new-1" }]);
      return resolve([]);
    },
  };
  return api;
}

const db = {
  insert: (t) => chain("insert", t),
  update: (t) => chain("update", t),
  delete: (t) => chain("delete", t),
  select: () => ({ from: (t) => chain("select", t) }),
  transaction: async (fn) => fn(db),
};
export const getDb = () => db;
