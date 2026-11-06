import { generateTpoCode } from "@/lib/college/code";
import { getDb, schema } from "@/lib/db";
import { isUniqueViolation } from "@/lib/promo";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Insert the college's TPO code (100% off the interview fee) with seat cap `cap`.
 * A duplicate random code retries; each try is a savepoint, so a unique violation
 * does not abort an outer transaction. Null when the college already has a code
 * (its own unique index) or five codes collided.
 */
export async function createTpoCode(ex: Db | Tx, collegeId: string, cap: number): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [row] = await ex.transaction((sp) =>
        sp
          .insert(schema.promoCodes)
          .values({ code: generateTpoCode(), description: "College TPO code", discountType: "percentage", discountValue: 100, maxUsages: cap, appliesTo: "intern", collegeId })
          .returning({ code: schema.promoCodes.code }),
      );
      return row.code;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  return null;
}
