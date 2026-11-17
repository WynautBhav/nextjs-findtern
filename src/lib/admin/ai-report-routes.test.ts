import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

/**
 * Admin AI-report upload, traced through the REAL route handlers
 * (upload-session -> attach) with an in-memory database, Drive and attach
 * transaction (test-support/route-fakes.mjs). What this proves: a report file
 * can only be published for the candidate it was uploaded for, and a failed or
 * repeated publish never bins the live report. What it cannot prove: the SQL
 * itself (needs a database), see the report for the read-only list.
 */

type Route = { POST: (r: Request) => Promise<{ status: number; body: Record<string, unknown> }> };

register("./test-support/route-hooks.mjs", import.meta.url);

const fakes = (await import("./test-support/route-fakes.mjs")) as unknown as {
  reset: () => void;
};
const uploadSession = (await import("../../app/api/admin/ai-reports/upload-session/route.ts")) as unknown as Route;
const attach = (await import("../../app/api/admin/ai-reports/attach/route.ts")) as unknown as Route;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const F = () => (globalThis as any).__fake;
const PDF_SIZE = 200_000;
const request = (body: unknown) => new Request("https://example.test/api", { method: "POST", body: JSON.stringify(body) });

function setup() {
  fakes.reset();
  for (const id of ["internA", "internB"]) F().interns.set(id, { id });
}
async function post(route: typeof uploadSession, body: { internId: string }) {
  F().lookupId = body.internId;
  return route.POST(request(body));
}

/** Browser flow: ask for a session for `internId`, then Drive stores the PDF with the server's properties. */
async function upload(internId: string, canId: string | null = "CAN00269", file: Record<string, unknown> = {}) {
  const res = await post(uploadSession, { internId, canId, size: PDF_SIZE } as never);
  assert.equal(res.status, 200, `upload-session for ${internId}: ${JSON.stringify(res.body)}`);
  const pending = F().pending;
  const stored = { id: pending.id, name: pending.name, mimeType: "application/pdf", size: String(PDF_SIZE), trashed: false, appProperties: pending.appProperties, webViewLink: `https://drive.google.com/file/d/${pending.id}/view`, ...file };
  F().drive.set(pending.id, stored);
  return stored;
}
const attachOf = (internId: string, fileId: string) => post(attach, { internId, fileId } as never);
const ops = (op: string) => F().calls.filter((c: { op: string }) => c.op === op);

test("positive control: upload for A, attach for A -> the report is on A and nobody else", async () => {
  setup();
  const file = await upload("internA");
  const res = await attachOf("internA", file.id);
  console.log("expected: 200, attached to internA only. actual:", res.status, [...F().attached.keys()]);
  assert.equal(res.status, 200);
  assert.deepEqual([...F().attached.keys()], ["internA"]);
  assert.equal(F().attached.get("internA").meta.driveFileId, file.id);
  assert.equal(ops("share").length, 1);
});

test("a file uploaded for A cannot be attached to B (wrong match blocked at the server)", async () => {
  setup();
  const file = await upload("internA");
  const res = await attachOf("internB", file.id);
  console.log("expected: 400 and B has no report. actual:", res.status, res.body, "attached:", [...F().attached.keys()]);
  assert.equal(res.status, 400);
  assert.equal(F().attached.size, 0);
  assert.equal(ops("share").length, 0, "a mismatched file must not be made public");
});

test("a file id the browser invents (not made by upload-session) is refused", async () => {
  setup();
  F().drive.set("foreignFile1", { id: "foreignFile1", name: "x.pdf", mimeType: "application/pdf", size: "5000", appProperties: {} });
  assert.equal((await attachOf("internA", "foreignFile1")).status, 400);
  assert.equal(F().attached.size, 0);
});

test("a file with the right owner but not a PDF, trashed, empty or over 25 MB is refused", async () => {
  for (const [what, patch] of [
    ["not a pdf", { mimeType: "text/html" }],
    ["trashed", { trashed: true }],
    ["empty", { size: "0" }],
    ["over 25 MB", { size: String(26 * 1024 * 1024) }],
  ] as const) {
    setup();
    const file = await upload("internA", "CAN00269", patch);
    const res = await attachOf("internA", file.id);
    assert.equal(res.status, 400, what);
    assert.equal(F().attached.size, 0, what);
  }
});

test("attaching to a candidate that does not exist (or is not an intern) is a 404, nothing is shared", async () => {
  setup();
  const file = await upload("internA");
  const res = await attachOf("ghost", file.id);
  assert.equal(res.status, 404);
  assert.equal(ops("share").length, 0);
  const noSession = await post(uploadSession, { internId: "ghost", size: PDF_SIZE } as never);
  assert.equal(noSession.status, 404);
});

test("the Drive name never carries the candidate's name; it carries the CAN id (or an id prefix)", async () => {
  setup();
  const a = await upload("internA", "CAN00269");
  assert.equal(a.name, "Feedback Report CAN00269 (redacted).pdf");
  const b = await upload("internB", null);
  assert.equal(b.name, "Feedback Report internB (redacted).pdf");
});

test("someone else's report: a new report for A replaces only A's, and A's old file is binned, never the new one", async () => {
  setup();
  const first = await upload("internA", "CAN00001");
  await attachOf("internA", first.id);
  const bFile = await upload("internB", "CAN00002");
  await attachOf("internB", bFile.id);
  const second = await upload("internA", "CAN00003");
  const res = await attachOf("internA", second.id);
  const trashed = ops("trash").map((c: { fileId: string }) => c.fileId);
  console.log("expected: A -> second, B untouched, trashed [first]. actual:", F().liveFile.get("internA") === second.id, F().liveFile.get("internB") === bFile.id, trashed);
  assert.equal(res.status, 200);
  assert.equal(F().liveFile.get("internA"), second.id);
  assert.equal(F().liveFile.get("internB"), bFile.id, "B's report is untouched");
  assert.deepEqual(trashed, [first.id]);
});

test("re-submitting the live file does not bin it", async () => {
  setup();
  const file = await upload("internA");
  await attachOf("internA", file.id);
  const again = await attachOf("internA", file.id);
  assert.equal(again.status, 200);
  assert.deepEqual(ops("trash"), [], "the live report must never be trashed by its own re-submit");
});

test("a failed attach bins the orphan file; a failed re-attach of the live file does not", async () => {
  setup();
  const { AttachError } = (await import("./test-support/route-fakes.mjs")) as unknown as { AttachError: new (c: string, m: string) => Error };
  const file = await upload("internA");
  F().attachError = new AttachError("conflict", "just updated");
  const res = await attachOf("internA", file.id);
  assert.equal(res.status, 409);
  assert.deepEqual(ops("trash").map((c: { fileId: string }) => c.fileId), [file.id], "unattached public file is binned");

  setup();
  const live = await upload("internA");
  await attachOf("internA", live.id);
  F().attachError = new AttachError("conflict", "just updated");
  F().calls.length = 0;
  await attachOf("internA", live.id);
  assert.deepEqual(ops("trash"), [], "the live report survives a failed re-attach");
});

test("bad payloads: size under 1 KB, a malformed file id, a path-like intern id are 400", async () => {
  setup();
  assert.equal((await post(uploadSession, { internId: "internA", size: 10 } as never)).status, 400);
  assert.equal((await post(attach, { internId: "internA", fileId: "../etc" } as never)).status, 400);
  assert.equal((await post(attach, { internId: "a/b", fileId: "file0000000001" } as never)).status, 400);
});
