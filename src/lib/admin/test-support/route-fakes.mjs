// In-memory stand-ins for the ai-reports routes' collaborators (test-only; see route-hooks.mjs).
// A test configures them through `globalThis.__fake` before calling the route's POST.

import * as realSchema from "../../db/schema.ts";

/** @type {any} */
const g = globalThis;
g.__fake ??= {};

export const reset = () => {
  g.__fake = {
    interns: new Map(), // id -> row, the candidates that exist
    drive: new Map(), // fileId -> file as Drive would return it
    calls: [], // ordered log: { op, ... }
    inserts: [], // every row passed to .values(...)
    attached: new Map(), // internId -> { link, meta }
    liveFile: new Map(), // internId -> driveFileId currently attached
    attachError: null,
    nextFileId: 1,
  };
};
reset();

// next/server
export const NextResponse = {
  json: (body, init) => ({ status: init?.status ?? 200, body }),
};

// guards-mutation: always an admin
export const requireMutation = async () => ({ ok: true, session: { uid: "admin-1", role: "admin" } });

// google
export const publicOrigin = () => "https://example.test";

// db: only `select().from().where().limit()` is used by upload-session and attach. The where() argument is
// opaque here, so the fake reads the wanted id from the request via `g.__fake.lookupId`.
export const schema = realSchema;
// Every builder method returns the same chain; awaiting it yields the next result queued in
// `g.__fake.queue` (loaders that run several selects), or, with nothing queued, the intern chosen by `lookupId`.
export const getDb = () => {
  /** @type {any} */
  const chain = new Proxy(
    {},
    {
      get: (_t, prop) => {
        // Rows handed to insert().values(...), in order, so a test can read what a route wrote.
        if (prop === "values") return (v) => (g.__fake.inserts?.push(v), chain);
        // With echoInsert, .returning() answers with the row just inserted (plus an id), as Postgres would.
        if (prop === "returning" && g.__fake.echoInsert) {
          return () => ({ then: (resolve) => resolve([{ id: "promo-new", ...g.__fake.inserts[g.__fake.inserts.length - 1] }]) });
        }
        if (prop === "then") {
          const q = g.__fake.queue;
          const rows = q && q.length ? q.shift() : (() => {
            const row = g.__fake.interns.get(g.__fake.lookupId);
            return row ? [row] : [];
          })();
          return (resolve) => resolve(rows);
        }
        return () => chain;
      },
    },
  );
  return chain;
};

// google-drive
export const REPORT_SOURCE = "findtern-ai-report";
export class DriveError extends Error {
  constructor(message, status = 502, kind = "drive") {
    super(message);
    this.status = status;
    this.kind = kind;
  }
}
export const driveAccessToken = async () => "token";
export const createUploadSession = async (_token, input) => {
  const id = `file${String(g.__fake.nextFileId++).padStart(10, "0")}`;
  // What Drive stores: the properties the SERVER set, not anything the browser sends.
  g.__fake.pending = { id, name: input.name, appProperties: { source: REPORT_SOURCE, internId: input.internId }, size: input.size };
  g.__fake.calls.push({ op: "createUploadSession", internId: input.internId, name: input.name });
  return `https://upload.example.test/${id}`;
};
export const getFile = async (_token, fileId) => {
  const f = g.__fake.drive.get(fileId);
  if (!f) throw new DriveError("Not found", 404, "not_found");
  return f;
};
export const shareAnyoneWithLink = async (_t, fileId) => void g.__fake.calls.push({ op: "share", fileId });
export const trashFile = async (_t, fileId) => void g.__fake.calls.push({ op: "trash", fileId });

// ai-report-link
export class AttachError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
export const currentReportFileId = async (internId) => g.__fake.liveFile.get(internId) ?? null;
export const attachAiFeedbackLink = async (internId, link, meta) => {
  if (g.__fake.attachError) throw g.__fake.attachError;
  const previousDriveFileId = g.__fake.liveFile.get(internId) ?? null;
  g.__fake.attached.set(internId, { link, meta });
  g.__fake.liveFile.set(internId, meta.driveFileId);
  g.__fake.calls.push({ op: "attach", internId, fileId: meta.driveFileId });
  return { previousDriveFileId };
};
