/**
 * The placement officer's view during the load test: connects to the
 * presence SSE stream and logs every update, so we can see how fast the
 * count climbs to N and that the stream stays up.
 *
 *   node loadtest/college/sse-probe.mjs http://localhost:3201 /tmp/…/sessions.json 240
 */
import { readFileSync } from "node:fs";

const [base, sessionsPath, seconds = "240"] = process.argv.slice(2);
const { tpo, students } = JSON.parse(readFileSync(sessionsPath, "utf8"));
const N = students.length;
const t0 = Date.now();
const ac = new AbortController();
setTimeout(() => ac.abort(), Number(seconds) * 1000);

let events = 0;
let firstFull = null;
let peak = 0;
try {
  const res = await fetch(`${base}/api/college/presence/stream`, { headers: { cookie: tpo.cookie }, signal: ac.signal });
  console.log(`stream ${res.status} ${res.headers.get("content-type")}`);
  const dec = new TextDecoder();
  let buf = "";
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = block.split("\n").find((l) => l.startsWith("data: "));
      if (!data) continue;
      const snap = JSON.parse(data.slice(6));
      events++;
      peak = Math.max(peak, snap.online);
      const s = ((Date.now() - t0) / 1000).toFixed(1);
      if (snap.online === snap.total && firstFull === null) firstFull = s;
      console.log(`${s}s  ${snap.online}/${snap.total} online, ${snap.offline.length} offline`);
    }
  }
} catch (err) {
  if (err.name !== "AbortError") throw err;
}
console.log(JSON.stringify({ N, events, peak, allOnlineAfterSeconds: firstFull }));
