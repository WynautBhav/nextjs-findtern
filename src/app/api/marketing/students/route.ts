import { NextResponse } from "next/server";
import { loadPublicStudents, studentsForSkill, type PublicStudent } from "@/lib/skill-benches";

export const dynamic = "force-dynamic";

export type { PublicStudent };

export async function GET(req: Request) {
  const rawSkill = new URL(req.url).searchParams.get("skill")?.trim() || "";

  // Real, scored, publicly listed candidates only. No placeholder profiles:
  // an empty category shows an empty state, not invented people.
  let pool: PublicStudent[];
  try {
    pool = await loadPublicStudents();
  } catch {
    return NextResponse.json({ skill: rawSkill || "all", students: [], total: 0, error: "unavailable" }, { status: 503 });
  }

  const students = studentsForSkill(pool, rawSkill).sort((a, b) => b.score - a.score);
  const visible = students.slice(0, 40).map((c, i) => ({ ...c, id: `c${i + 1}` }));
  return NextResponse.json({ skill: rawSkill || "all", students: visible, total: students.length });
}
