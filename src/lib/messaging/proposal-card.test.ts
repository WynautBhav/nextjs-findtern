import { test, mock } from "node:test";
import assert from "node:assert/strict";

// Nothing listens on port 1, so the first query rejects: this is the DB-error path, with no real database.
process.env.DATABASE_URL = "postgresql://nobody:***@127.0.0.1:1/none";
const { threadProposalCard } = await import("./proposal-card.ts");

test("threadProposalCard: a database error is logged and yields no card, not a throw", async () => {
  const log = mock.method(console, "error", () => {});
  try {
    for (const role of ["employer", "intern"] as const) {
      assert.equal(await threadProposalCard("00000000-0000-0000-0000-000000000000", "u1", role), null);
    }
    assert.equal(log.mock.callCount(), 2);
    assert.match(String(log.mock.calls[0].arguments[0]), /proposal card failed/);
  } finally {
    log.mock.restore();
  }
});
