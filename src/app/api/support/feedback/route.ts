import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { cleanPageUrl, formatSupportMessage, legacyKindOf } from "@/lib/admin/contact-meta";

const KEY = /^[A-Za-z0-9_.-]+$/;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;
const TOPICS = new Set(["bug", "idea", "question", "feedback", "report"]);

/**
 * In-app "Report a problem". Stored in the legacy envelope (DB-14, see
 * lib/admin/contact-meta): kind / userType / userId / pageUrl header lines,
 * subject "Support <kind>", one video and up to five other attachments, so
 * the admin inbox (and the legacy inbox, on a rollback) shows who sent it,
 * from which page, with the files.
 */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern", "employer", "admin"] });
  if (!guard.ok) return guard.response;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const topicRaw = String(form.get("kind") ?? "").trim().toLowerCase();
  const topic = TOPICS.has(topicRaw) ? topicRaw : "feedback";
  const message = String(form.get("message") ?? "").trim().slice(0, 5000);
  if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 });

  // Role and id come from the session, never the client: the triage queue
  // must be trustworthy about who is asking.
  const role = guard.session.role;
  const userType = role === "employer" ? "employer" : role === "admin" ? "admin" : "intern";
  const uid = guard.session.uid;

  // Uploaded with kind "support" (/api/uploads); referenced by key and opened
  // by admins through the access-checked support-file route.
  const keys = [...form.getAll("attachmentKey"), form.get("videoKey")]
    .map((v) => String(v ?? "").trim())
    .filter((k) => k && KEY.test(k));
  const unique = [...new Set(keys)];
  const video = unique.find((k) => VIDEO_EXT.test(k)) ?? null;
  const others = unique.filter((k) => k !== video && !VIDEO_EXT.test(k));
  if (others.length > 5 || unique.filter((k) => VIDEO_EXT.test(k)).length > 1) {
    return NextResponse.json({ error: "Attach at most one video and five other files." }, { status: 400 });
  }
  const href = (k: string) => `/api/admin/support-file/${k}`;

  const db = getDb();
  // Legacy names the sender the same way: interns by name, employers by company.
  const [who] =
    userType === "employer"
      ? await db
          .select({ first: schema.employers.companyName, last: schema.employers.name, email: schema.employers.companyEmail })
          .from(schema.employers)
          .where(eq(schema.employers.id, uid))
          .limit(1)
      : userType === "intern"
        ? await db
            .select({ first: schema.users.firstName, last: schema.users.lastName, email: schema.users.email })
            .from(schema.users)
            .where(eq(schema.users.id, uid))
            .limit(1)
        : [{ first: "Admin", last: "", email: guard.session.email }];

  const kind = legacyKindOf(topic);
  await db.insert(schema.contactMessages).values({
    firstName: (who?.first || (userType === "employer" ? "Employer" : userType === "admin" ? "Admin" : "Intern")).trim(),
    // Legacy: company name only for employers (lastName ""), the user id when unknown.
    lastName: userType === "employer" ? "" : (who?.last ?? uid).trim(),
    email: who?.email || `${userType}@findtern.support`,
    subject: `Support ${kind}`,
    message: formatSupportMessage({
      kind,
      userType,
      userId: uid,
      pageUrl: cleanPageUrl(form.get("pageUrl")),
      topic: topic === kind ? null : topic,
      message,
      video: video ? href(video) : null,
      attachments: others.map(href),
    }),
    // Legacy buckets: "hiring" for employers, "intern" for interns. Staff
    // reports are neither; "general" is the legacy contact-form value that
    // is not mistaken for a candidate's message (DB-24).
    queryType: userType === "employer" ? "hiring" : userType === "admin" ? "general" : "intern",
  });
  return NextResponse.json({ ok: true });
}
