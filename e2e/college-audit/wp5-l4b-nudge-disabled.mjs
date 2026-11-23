// WP5 L4: a nudge never reaches a disabled / banned account (bell, push or email).
import { login, q, mkUser, check, failures, closeDb, SFX, mailLog, sleep } from "./wp5-lib.mjs";
const tpo = await login("tpo", "tpo@jklu.edu.in");
const u = await mkUser({ first: "Dis", last: "Abled", email: `dis.${SFX}@jklu.edu.in` });
await tpo.post("/api/college/students/decide", { userIds: [u.id], action: "accept" });
await q("update users set is_active=false, banned_at=now() where id=$1", [u.id]);
const m0 = mailLog().length;
const r = await tpo.post("/api/college/nudge", { kind: "online", userIds: [u.id] });
await sleep(400);
check("no mail to a disabled account", !mailLog().slice(m0).includes(u.email), r.text);
check("no bell and no nudge row for a disabled account", (await q("select (select count(*) from notifications where recipient_id=$1 and type like 'college_nudge_%')::int a, (select count(*) from college_nudges where user_id=$1)::int b", [u.id]))[0].a === 0);
check("counted as skipped", r.json?.sent === 0 && r.json.skipped === 1, r.text);
await closeDb();
process.exit(failures() ? 1 : 0);
