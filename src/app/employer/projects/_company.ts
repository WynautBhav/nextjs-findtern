import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";

/** What a project form needs from its company: the name a project may not use, and its place. */
export async function projectCompany(employerId: string) {
  const [company] = await getDb()
    .select({ companyName: schema.employers.companyName, country: schema.employers.country, state: schema.employers.state, city: schema.employers.city })
    .from(schema.employers)
    .where(eq(schema.employers.id, employerId))
    .limit(1);
  return company;
}
