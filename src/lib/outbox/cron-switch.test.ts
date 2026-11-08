import assert from "node:assert/strict";
import test from "node:test";

import { outboxCronOff } from "./cron-switch.ts";

test("OUTBOX_CRON kill switch: only 'off' (any case, trimmed) turns the outbox cron off; unset and anything else stays on", () => {
  assert.equal(outboxCronOff({}), false);
  assert.equal(outboxCronOff({ OUTBOX_CRON: "" }), false);
  assert.equal(outboxCronOff({ OUTBOX_CRON: "on" }), false);
  assert.equal(outboxCronOff({ OUTBOX_CRON: "0" }), false);
  assert.equal(outboxCronOff({ OUTBOX_CRON: "off" }), true);
  assert.equal(outboxCronOff({ OUTBOX_CRON: " OFF " }), true);
});
