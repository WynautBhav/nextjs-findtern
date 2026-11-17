// In-memory stand-in for the database, for the subscription / CGPA / platform-settings readers (test-only; see
// sem-hooks.mjs). A test configures it through `globalThis.__sem` before calling the reader.
//
//   __sem.rows       table name -> rows a select() returns, or a function (n) => rows for the n-th select of that table
//   __sem.execute    rows db.execute(sql) returns (default: none), or a function (sqlText) => rows
//   __sem.calls      ordered log: { op, table? , sql? }
//   __sem.dbDown     true: getDb() throws, as when the database is unreachable
//   __sem.noDb       true: hasDb() is false, as with no DATABASE_URL
//   __sem.failSelect table name whose select rejects
//   __sem.failExecute true: execute rejects

import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import * as realSchema from "../../db/schema.ts";

/** @type {any} */
const g = globalThis;
const dialect = new PgDialect();

export const reset = () => {
  g.__sem = { rows: {}, execute: [], calls: [], dbDown: false, noDb: false, failSelect: null, failExecute: false };
};
reset();

export const schema = realSchema;
export const hasDb = () => !g.__sem.noDb;

function select(table) {
  const name = getTableName(table);
  /** @type {any} */
  const api = {
    where: () => api,
    limit: () => api,
    orderBy: () => api,
    then: (resolve, reject) => {
      const nth = g.__sem.calls.filter((c) => c.op === "select" && c.table === name).length;
      g.__sem.calls.push({ op: "select", table: name });
      if (g.__sem.failSelect === name) return reject(new Error(`select ${name} failed`));
      const r = g.__sem.rows[name];
      return resolve(typeof r === "function" ? r(nth) : (r ?? []));
    },
  };
  return api;
}

const db = {
  select: () => ({ from: (t) => select(t) }),
  execute: async (query) => {
    const text = dialect.sqlToQuery(query).sql;
    g.__sem.calls.push({ op: "execute", sql: text });
    if (g.__sem.failExecute) throw new Error("execute failed");
    const r = g.__sem.execute;
    return { rows: typeof r === "function" ? r(text) : r };
  },
};

export const getDb = () => {
  if (g.__sem.dbDown) throw new Error("database unreachable");
  return db;
};
