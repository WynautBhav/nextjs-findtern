import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const kind = form.get("kind") as string;
  const userType = form.get("userType") as string;
  const message = form.get("message") as string;
  if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 });

  const db = getDb();
  await db.insert(schema.contactMessages).values({
    firstName: userType ?? "unknown",
    lastName: "-",
    email: "",
    subject: kind ?? "feedback",
    message,
    queryType: userType === "employer" ? "hiring" : "intern",
  });
  return NextResponse.json({ ok: true });
}
