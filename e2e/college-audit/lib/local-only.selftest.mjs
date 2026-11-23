// Self-test of the loopback guard: node e2e/college-audit/lib/local-only.selftest.mjs
import assert from "node:assert/strict";
import { assertLocalDb, assertLocalOnly } from "./local-only.mjs";

const ok = "postgresql://findtern@127.0.0.1:55490/findtern_ca_final";
const refuse = (url, env = {}) => assert.throws(() => assertLocalDb(url, env), /refused/, `should refuse ${url} ${JSON.stringify(env)}`);
assertLocalDb(ok, {});
assertLocalDb("postgresql://findtern@localhost:55499/findtern_ca_x", { PGHOST: "127.0.0.1" });
refuse(null);
refuse("");
refuse("postgresql://findtern@db.example.com:55490/findtern_ca_final");
refuse("postgresql://findtern@147.93.27.44:55490/findtern_ca_final");
refuse("postgresql://findtern@127.0.0.1:5435/findtern_ca_final");
refuse("postgresql://findtern@127.0.0.1:55500/findtern_ca_final");
refuse("postgresql://findtern@127.0.0.1:55490/findtern_prod");
refuse("postgresql://127.0.0.1:55490@evil.example.com:55490/findtern_ca_final");
refuse("postgresql://findtern@evil.example.com/findtern_ca_final?x=@127.0.0.1:55490/");
refuse(`${ok}?host=evil.example.com`);
refuse(ok, { PGHOST: "db.example.com" });
refuse(ok, { PGHOSTADDR: "10.0.0.5" });
assert.throws(() => assertLocalOnly("http://example.com:3333", ok, {}), /refused/);
assert.throws(() => assertLocalOnly("http://localhost:3337", null, {}), /refused/);
assertLocalOnly("http://localhost:3337", ok, {});
console.log("local-only self-test: ok");
