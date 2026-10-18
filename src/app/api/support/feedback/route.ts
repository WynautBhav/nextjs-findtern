import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern", "employer", "admin"] });
  if (!guard.ok) return guard.response;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const kind = form.get("kind") as string;
  const message = form.get("message") as string;
  if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 });

  // Role comes from the session, never the client - the triage queue must be
  // trustworthy about who is asking.
  const role = guard.session.role;
  const userType = role === "employer" ? "employer" : role === "admin" ? "admin" : "intern";

  // Who sent it, so the team can reply. Attachments uploaded with kind
  // "support" are referenced by key and opened by admins from the inbox.
  const db = getDb();
  const uid = guard.session.uid;
  const [who] =
    userType === "employer"
      ? await db.select({ first: schema.employers.name, last: schema.employers.companyName, email: schema.employers.companyEmail }).from(schema.employers).where(eq(schema.employers.id, uid)).limit(1)
      : userType === "intern"
        ? await db.select({ first: schema.users.firstName, last: schema.users.lastName, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, uid)).limit(1)
        : [{ first: "Admin", last: "-", email: guard.session.email }];
  const attachment = String(form.get("attachmentKey") ?? "");
  await db.insert(schema.contactMessages).values({
    firstName: who?.first || userType,
    lastName: who?.last || "-",
    email: who?.email ?? "",
    subject: `In-app ${kind || "feedback"}`,
    message: attachment && /^[A-Za-z0-9_.-]+$/.test(attachment) ? `${message}\n\nAttachment: /api/admin/support-file/${attachment}` : message,
    queryType: userType === "employer" ? "hiring" : "intern",
  });
  return NextResponse.json({ ok: true });
}
