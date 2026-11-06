/**
 * A stand-in for api.razorpay.com's refund endpoints, for the refunds spec.
 *
 * The app calls it when RAZORPAY_API_BASE points here (honoured only when
 * VERCEL_ENV !== "production"; e2e/run.mjs sets it). Nothing here can reach
 * Razorpay, and the server's key id/secret are throwaway test values.
 *
 * Razorpay API surface used (WP-R, PLAN §3.5):
 *   POST /v1/payments/:paymentId/refund   { amount, speed, receipt, notes }
 *   GET  /v1/payments/:paymentId/refunds
 *   GET  /v1/refunds/:id
 * Control (the spec only):
 *   GET  /__stub/calls          every call seen, newest last
 *   POST /__stub/mode           { mode: "processed" | "pending" | "fail" | "timeout" }
 *   POST /__stub/reset          forget calls and refunds, back to "processed"
 *   POST /__stub/settle         { id, status: "processed" | "failed" }   flip a refund like the gateway would
 *
 * Modes: "processed" answers a created refund as processed; "pending" as
 * pending (settles later through the webhook); "fail" answers 400 with an
 * error body; "timeout" creates the refund but never answers (the caller
 * gives up) so a refresh has to find it.
 *
 * Run alone:  node e2e/lib/razorpay-stub.mjs [port]
 */
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

export const STUB_KEY_ID = "rzp_test_e2estub";
export const STUB_KEY_SECRET = "e2e-stub-key-secret";
export const STUB_WEBHOOK_SECRET = "e2e-stub-webhook-secret";

export function startStub(port) {
  const calls = [];
  const refunds = new Map(); // id -> refund entity
  let mode = "processed";
  let seq = 0;
  const STARTED = Date.now().toString(36);

  const json = (res, status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) =>
    new Promise((resolve) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          resolve({});
        }
      });
    });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://stub");
    const path = url.pathname;
    const body = req.method === "POST" ? await readBody(req) : {};

    if (path === "/__stub/calls") return json(res, 200, { calls });
    if (path === "/__stub/mode" && req.method === "POST") {
      mode = body.mode ?? "processed";
      return json(res, 200, { mode });
    }
    if (path === "/__stub/reset" && req.method === "POST") {
      calls.length = 0;
      refunds.clear();
      mode = "processed";
      return json(res, 200, { ok: true });
    }
    if (path === "/__stub/settle" && req.method === "POST") {
      const r = refunds.get(body.id);
      if (!r) return json(res, 404, { error: "unknown refund" });
      r.status = body.status === "failed" ? "failed" : "processed";
      return json(res, 200, r);
    }

    const auth = req.headers.authorization ?? "";
    const expected = `Basic ${Buffer.from(`${STUB_KEY_ID}:${STUB_KEY_SECRET}`).toString("base64")}`;
    calls.push({ method: req.method, path, body, authorised: auth === expected, at: Date.now(), mode });
    if (auth !== expected) return json(res, 401, { error: { code: "BAD_REQUEST_ERROR", description: "Authentication failed" } });

    let m = /^\/v1\/payments\/([^/]+)\/refund$/.exec(path);
    if (m && req.method === "POST") {
      if (mode === "fail") return json(res, 400, { error: { code: "BAD_REQUEST_ERROR", description: "Stub: the refund was refused" } });
      // Unique per stub start: the refunds table keeps gateway ids across runs on a reused test database.
      const id = `rfnd_e2e_${STARTED}${++seq}`;
      const entity = {
        id,
        entity: "refund",
        payment_id: m[1],
        amount: body.amount,
        currency: "INR",
        receipt: body.receipt ?? null,
        notes: body.notes ?? {},
        speed_requested: body.speed ?? "normal",
        status: mode === "pending" || mode === "timeout" ? "pending" : "processed",
        created_at: Math.floor(Date.now() / 1000),
      };
      refunds.set(id, entity);
      if (mode === "timeout") return; // never answered; the caller times out
      return json(res, 200, entity);
    }
    m = /^\/v1\/payments\/([^/]+)\/refunds$/.exec(path);
    if (m && req.method === "GET") {
      const items = [...refunds.values()].filter((r) => r.payment_id === m[1]);
      return json(res, 200, { entity: "collection", count: items.length, items });
    }
    m = /^\/v1\/refunds\/([^/]+)$/.exec(path);
    if (m && req.method === "GET") {
      const r = refunds.get(m[1]);
      return r ? json(res, 200, r) : json(res, 404, { error: { description: "The requested id does not exist" } });
    }
    return json(res, 404, { error: { description: `stub: no route for ${req.method} ${path}` } });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () =>
      resolve({
        port,
        origin: `http://127.0.0.1:${port}`,
        stop: () => new Promise((r) => server.close(() => r())),
      }),
    );
  });
}

/** Client for the control endpoints, used by the spec. */
export function stubControl(origin) {
  const call = async (path, body) => {
    const res = await fetch(`${origin}${path}`, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return res.json();
  };
  return {
    calls: async () => (await call("/__stub/calls")).calls,
    refundCalls: async () => (await call("/__stub/calls")).calls.filter((c) => c.method === "POST" && /\/refund$/.test(c.path)),
    mode: (m) => call("/__stub/mode", { mode: m }),
    reset: () => call("/__stub/reset", {}),
    settle: (id, status) => call("/__stub/settle", { id, status }),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const port = Number(process.argv[2] || 4346);
  const s = await startStub(port);
  console.log(`[razorpay-stub] listening on ${s.origin}`);
}
