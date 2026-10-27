/**
 * 500 students with Findtern open during a drive: each posts a heartbeat
 * every 30 s (the client's HEARTBEAT_MS), arriving spread out like real tabs.
 *
 *   k6 run -e BASE=http://localhost:3201 -e SESSIONS=/tmp/…/sessions.json loadtest/college/heartbeat.k6.js
 *
 * Pass/fail lives in `thresholds`; k6 exits non-zero when one is crossed.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import exec from "k6/execution";

const BASE = __ENV.BASE || "http://localhost:3201";
const students = new SharedArray("students", () => JSON.parse(open(__ENV.SESSIONS)).students);
const VUS = Number(__ENV.VUS || students.length);

export const options = {
  scenarios: {
    tabs: { executor: "constant-vus", vus: VUS, duration: __ENV.DURATION || "3m", gracefulStop: "35s" },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{name:heartbeat}": ["p(95)<200", "p(99)<500"],
    checks: ["rate>0.99"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

export default function studentTab() {
  const me = students[(exec.vu.idInTest - 1) % students.length];
  if (exec.vu.iterationInScenario === 0) sleep(Math.random() * 30); // tabs don't open in lockstep
  const res = http.post(`${BASE}/api/intern/college/heartbeat`, null, {
    headers: { cookie: me.cookie, "x-csrf-token": me.csrf },
    tags: { name: "heartbeat" },
  });
  check(res, {
    "200": (r) => r.status === 200,
    "drive in reply": (r) => r.status === 200 && r.json("drive") !== null,
  });
  sleep(30);
}
