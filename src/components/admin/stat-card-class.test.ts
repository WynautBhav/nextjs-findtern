import assert from "node:assert/strict";
import { test } from "node:test";

import { statValueClass } from "./stat-card-class.ts";

for (const fit of [false, true]) {
  for (const featured of [false, true]) {
    test(`StatCard figure keeps leading-none after cn (fit=${fit}, featured=${featured})`, () => {
      const classes = statValueClass(fit, featured).split(/\s+/);
      assert.ok(classes.includes("leading-none"), classes.join(" "));
      // The size and the colour both survive too: the size classes must not be merged away.
      assert.ok(classes.some((c) => c.startsWith("text-[") && /rem|cqi/.test(c)), classes.join(" "));
      assert.ok(classes.some((c) => c.includes("--admin-tile-ink") || c === "text-foreground"), classes.join(" "));
    });
  }
}
