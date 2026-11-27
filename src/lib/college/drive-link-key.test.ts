import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET ||= "test-session-secret-at-least-32-chars-long";

const { generateDriveToken, deriveDriveToken, hashDriveToken, tokenMatches } = await import("./tokens.ts");
// The secret the drive page and generateDriveToken use (SIGNING_SECRET when set, else SESSION_SECRET). CI sets both, to different values.
const { driveCodeSecret } = await import("../drives/code-derive.ts");
const SECRET = "a-different-server-secret-at-least-32-chars";

test("a drive link can be shown again: the stored key plus the server secret give back the token the hash was made from", () => {
  const { token, hash, key } = generateDriveToken();
  const shown = deriveDriveToken(key, driveCodeSecret());
  assert.equal(shown, token);
  assert.ok(tokenMatches(shown, hash));
  assert.equal(hashDriveToken(shown), hash);
});

test("the stored key alone is not the link, and a wrong key or secret never verifies", () => {
  const a = generateDriveToken();
  const b = generateDriveToken();
  assert.notEqual(a.key, a.token);
  assert.notEqual(a.key, b.key);
  assert.equal(tokenMatches(deriveDriveToken(a.key, SECRET), a.hash), false, "another secret");
  assert.equal(tokenMatches(deriveDriveToken(b.key, driveCodeSecret()), a.hash), false, "another key");
});

test("a short secret is refused", () => {
  assert.throws(() => deriveDriveToken("k", "short"));
});

const { shownDriveLink } = await import("./drive-link.ts");
const NOW = Date.now();
const open = { startsAt: new Date(NOW - 3600_000), endsAt: new Date(NOW + 3600_000), revokedAt: null as Date | null };

test("the page shows the current link only while the drive is open, and only when the key still matches the hash", () => {
  const S = driveCodeSecret();
  const { token, hash, key } = generateDriveToken();
  const d = { ...open, linkKey: key, tokenHash: hash };
  assert.equal(shownDriveLink(d, "https://app.test", S, NOW), `https://app.test/drive/${token}`);
  assert.equal(shownDriveLink({ ...d, revokedAt: new Date(NOW - 1000) }, "https://app.test", S, NOW), null, "closed");
  assert.equal(shownDriveLink({ ...d, endsAt: new Date(NOW - 1000) }, "https://app.test", S, NOW), null, "ended");
  assert.equal(shownDriveLink({ ...d, linkKey: null }, "https://app.test", S, NOW), null, "made before the key existed");
  assert.equal(shownDriveLink(d, "https://app.test", SECRET, NOW), null, "server secret changed");
  assert.equal(shownDriveLink({ ...d, tokenHash: generateDriveToken().hash }, "https://app.test", S, NOW), null, "link was reissued without a key");
});

test("the link key never reaches the browser: only the two routes that write it and the page's derive helper know it", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const SRC = join(import.meta.dirname, "../..");
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts") && readFileSync(p, "utf8").includes("linkKey")) hits.push(p.slice(SRC.length + 1));
    }
  };
  walk(SRC);
  assert.deepEqual(hits.sort(), ["app/api/college/drives/[id]/link/route.ts", "app/api/college/drives/route.ts", "lib/college/drive-link.ts", "lib/college/link.ts", "lib/db/schema.ts"]);
});
