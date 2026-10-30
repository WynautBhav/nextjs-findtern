import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { formatSupportMessage } from "@/lib/admin/contact-meta";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { bucketKey, clientIp, limiters } from "@/lib/security/rate-limit";

// One line each: the values are written into the contact-message envelope, so a newline must not start a header.
const line = (min: number, max: number) =>
  z.string().transform((v) => v.replace(/\s+/g, " ").trim()).pipe(z.string().min(min).max(max));

const bodySchema = z.object({ name: line(3, 200), city: line(2, 100), state: line(2, 60) });

/**
 * "My college isn't listed". Lands in the admin Messages inbox (contact_messages,
 * the same envelope as the in-app report widget), so no schema change.
 */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  if (!limiters.contact.take(bucketKey(clientIp(req.headers), `college-request:${guard.session.uid}`))) {
    return NextResponse.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add your college's name, city and state." }, { status: 400 });
  const { name, city, state } = parsed.data;

  const uid = guard.session.uid;
  const [who] = await getDb()
    .select({ first: schema.users.firstName, last: schema.users.lastName, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, uid))
    .limit(1);
  await getDb()
    .insert(schema.contactMessages)
    .values({
      firstName: (who?.first || "Intern").trim(),
      lastName: (who?.last ?? uid).trim(),
      email: who?.email || "intern@findtern.support",
      subject: "College not listed",
      message: formatSupportMessage({
        kind: "feedback",
        userType: "intern",
        userId: uid,
        pageUrl: "/intern/college",
        topic: "college",
        message: `College not listed\nName: ${name}\nCity: ${city}\nState: ${state}`,
      }),
      queryType: "intern",
    });
  return NextResponse.json({ ok: true });
}
