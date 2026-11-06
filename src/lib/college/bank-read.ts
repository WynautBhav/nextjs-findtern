import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";

export type CollegeBank = { holder: string; bankName: string; last4: string; ifsc: string };

/** The college's bank as the pages see it: the account number is only ever its last four digits. */
export async function collegeBank(collegeId: string): Promise<CollegeBank | null> {
  const c = schema.colleges;
  const [r] = await getDb()
    .select({ holder: c.bankAccountName, bankName: c.bankName, n: c.bankAccountNumber, ifsc: c.bankIfsc })
    .from(c)
    .where(eq(c.id, collegeId))
    .limit(1);
  if (!r?.n || !r.ifsc) return null;
  return { holder: r.holder ?? "", bankName: r.bankName ?? "", last4: r.n.slice(-4), ifsc: r.ifsc };
}
