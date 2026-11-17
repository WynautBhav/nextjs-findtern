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
    signatureOk: true,
    gatewayPaid: null,
  };
};
reset();

export const NextResponse = { json: (body, init) => ({ status: init?.status ?? 200, body }) };
export const requireMutation = async () => ({ ok: true, session: { uid: "admin-1", role: "admin" } });
// Any query builder chain resolves to no rows (the verify routes only write a "failed" status on a bad signature).
export const getDb = () => {
  /** @type {any} */
  const chain = new Proxy({}, { get: (_t, prop) => (prop === "then" ? (resolve) => resolve([]) : () => chain) });
  return chain;
};
// Any table.column reads as an opaque value (the verify route names a column only inside a query the fake ignores).
const opaque = () => new Proxy({}, { get: () => opaque() });
export const schema = opaque();

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

// @/lib/razorpay, used only when PAY_FAKE_RAZORPAY is set (the verify route tests).
export const verifySignature = () => g.__pay.signatureOk;
export const verifyWebhookSignature = () => true;
export async function fetchGatewayPaid() {
  return g.__pay.gatewayPaid;
}
