import assert from "node:assert/strict";
import { test } from "node:test";

import { ROLE_GRANTS, withGrant } from "./roles-grants.ts";

test("ADP-17: default Admin and Operations roles get interns:write and cms:write once", () => {
  const grant = ROLE_GRANTS.find((g) => g.key === "admin_roles_migration:ops_interns_cms_write_v1");
  assert.ok(grant);
  assert.deepEqual(grant.grant.roles.sort(), ["admin", "exec_operations"]);
  assert.deepEqual(grant.grant.permissions.sort(), ["cms:write", "interns:write"]);
  // Keys are unique: each marker row is written once.
  assert.equal(new Set(ROLE_GRANTS.map((g) => g.key)).size, ROLE_GRANTS.length);
});

test("withGrant adds missing permissions only", () => {
  assert.deepEqual(withGrant(["interns:read"], ["interns:write", "cms:write"]), ["interns:read", "interns:write", "cms:write"]);
  assert.equal(withGrant(["interns:write", "cms:write"], ["interns:write", "cms:write"]), null);
  assert.equal(withGrant(["*"], ["interns:write"]), null);
  assert.deepEqual(withGrant(null, ["cms:write"]), ["cms:write"]);
});
