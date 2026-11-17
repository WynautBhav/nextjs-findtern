// In-memory stand-ins for the webhook route's collaborators (test-only; see payments-hooks.mjs).
// A test sets what each answers through `globalThis.__pay` and reads the calls back from it.
/** @type {any} */
const g = globalThis;

export const reset = () => {
  g.__pay = {
    calls: [], // ordered { op, input }
    intern: { ok: false, status: 404, error: "Unknown order" },
    employer: { ok: true, hired: 1 },
    refund: "ok",
    refundThrows: false,
    settleThrows: false,
  };
};
reset();

export const NextResponse = { json: (body, init) => ({ status: init?.status ?? 200, body }) };
export const requireMutation = async () => ({ ok: true, session: { uid: "admin-1", role: "admin" } });
export const getDb = () => ({});
export const schema = {};

export async function settleInternOrder(input) {
  g.__pay.calls.push({ op: "intern", input });
  if (g.__pay.settleThrows) throw new Error("db down");
  return g.__pay.intern;
}
export async function settleEmployerOrder(input) {
  g.__pay.calls.push({ op: "employer", input });
  if (g.__pay.settleThrows) throw new Error("db down");
  return g.__pay.employer;
}
export async function settleRefundWebhook(event) {
  g.__pay.calls.push({ op: "refund", input: event });
  if (g.__pay.refundThrows) throw new Error("db down");
  return g.__pay.refund;
}
