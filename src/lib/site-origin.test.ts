import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const ORIGINAL = process.env.PUBLIC_ORIGIN;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.PUBLIC_ORIGIN;
  else process.env.PUBLIC_ORIGIN = ORIGINAL;
});

/** SITE.url is read once, when the module loads, so each case loads a fresh copy. */
async function siteUrlWith(origin: string | undefined): Promise<string> {
  if (origin === undefined) delete process.env.PUBLIC_ORIGIN;
  else process.env.PUBLIC_ORIGIN = origin;
  const mod = await import(`./content/site.ts?origin=${encodeURIComponent(String(origin))}`);
  return mod.SITE.url;
}

test("the site URL follows PUBLIC_ORIGIN, without a trailing slash", async () => {
  assert.equal(await siteUrlWith("https://nextjs-findtern.vercel.app"), "https://nextjs-findtern.vercel.app");
  assert.equal(await siteUrlWith("https://findtern.in/"), "https://findtern.in");
  assert.equal(await siteUrlWith("  https://www.findtern.in//  "), "https://www.findtern.in");
});

test("an unset or unusable PUBLIC_ORIGIN falls back to the real domain", async () => {
  for (const origin of [undefined, "", "   ", "findtern.in", "ftp://findtern.in", "https://", "https://a b.example", "https://findtern.in/some/path"]) {
    assert.equal(await siteUrlWith(origin), "https://findtern.in", `fallback for ${JSON.stringify(origin)}`);
  }
});
