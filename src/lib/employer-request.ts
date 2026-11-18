import { cache } from "react";
import { eq } from "drizzle-orm";

import { getDb, schema } from "./db";
import { gated } from "./request-gate";

/**
 * The employer's own row, read once per request. The layout (company name, terms version), the setup check, the
 * checkout figures and the dashboard each used to read it separately (3-4 identical statements on one page load).
 * `cache` is request-scoped: nothing is shared between requests or users. Rows, not a single object, so callers keep
 * their existing `[row]` destructuring and `employerSetupStep` keeps its settled-result handling.
 */
export const getEmployerRows = cache((employerId: string) =>
  gated(() => getDb().select().from(schema.employers).where(eq(schema.employers.id, employerId)).limit(1)),
);
