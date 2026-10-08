import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

export async function GET(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const [interns, companies, interviews, proposals] = await Promise.all([
    db.$count(schema.users),
    db.$count(schema.employers),
    db.$count(schema.interviews),
    db.$count(schema.proposals),
  ]);
  return NextResponse.json({ interns, companies, interviews, proposals });
}
