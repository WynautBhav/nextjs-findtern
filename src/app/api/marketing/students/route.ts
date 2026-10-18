import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { initialsOf } from "@/lib/employer-candidates";
import { draftFromRecord } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export type PublicStudent = {
  id: string;
  initials: string;
  shortName: string;
  score: number;
  band: "Espresso" | "Cappuccino" | "Latte";
  college: string;
  degree: string;
  city: string;
  state: string;
  category?: string;
  skills: string[];
  ratings: {
    coding?: number;
    aptitude?: number;
    communication?: number;
    interview?: number;
    domain?: number;
  };
  summary: string;
  available: boolean;
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "human resource": [
    "human resource", "human resources", "hr", "talent acquisition", "recruiting", "recruitment",
    "employee onboarding", "employee relations", "hrms", "payroll", "people operations", "people ops", "pgdhrm"
  ],
  "sales": [
    "sales", "b2b sales", "cold outreach", "lead qualification", "lead generation",
    "salesforce", "pipeline management", "negotiation", "prospecting", "cold calling", "inside sales", "solution selling"
  ],
  "marketing": [
    "marketing", "digital marketing", "seo", "sem", "meta ads", "google ads", "funnel optimization",
    "growth marketing", "content strategy", "brand strategy", "copywriting", "campaign analytics", "performance marketing"
  ],
  "finance": [
    "finance", "financial modeling", "dcf valuation", "equity research", "corporate finance",
    "accounting", "auditing", "taxation", "quickbooks", "tally", "capital budgeting", "ratio analysis"
  ],
  "technology": [
    "technology", "react", "next.js", "node.js", "typescript", "python",
    "full stack", "frontend", "backend", "web development", "cloud", "software engineer"
  ],
  "engineering": [
    "engineering", "computer science", "software", "devops", "docker",
    "kubernetes", "linux", "system design", "mobile ui", "react native", "information technology"
  ],
  "business": [
    "business", "business strategy", "consulting", "product strategy",
    "business analytics", "market research", "economics", "management", "international business"
  ],
  "social media and content": [
    "social media and content", "social media", "content writing", "copywriting", "video editing",
    "reels", "canva", "trend jacking", "media studies", "creative direction", "community management"
  ],
  "operations": [
    "operations", "supply chain", "logistics", "process optimization",
    "vendor coordination", "inventory management", "lean operations", "six sigma", "procurement", "warehouse operations"
  ],
  "healthcare": [
    "healthcare", "health informatics", "clinical research", "pharmacology",
    "pharmacovigilance", "medical writing", "biotechnology", "pharmacy", "medical records"
  ],
};

function getCategoryKeywords(categoryName: string): string[] {
  const norm = categoryName.toLowerCase().trim();
  for (const [key, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (norm === key || norm.includes(key) || key.includes(norm)) {
      return keywords;
    }
  }
  return [norm];
}

function matchesCategory(student: PublicStudent, keywords: string[]): boolean {
  const targetCategory = (student.category || "").toLowerCase();
  const allTexts = [
    targetCategory,
    ...student.skills,
    student.degree,
    student.summary,
  ].join(" ");

  return keywords.some((kw) => {
    if (kw.length <= 3) {
      const regex = new RegExp(`\\b${kw}\\b`, "i");
      return regex.test(allTexts);
    }
    return allTexts.toLowerCase().includes(kw.toLowerCase());
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawSkill = searchParams.get("skill")?.trim() || "";
  const skillParam = rawSkill.toLowerCase();

  // Real, scored, publicly listed candidates only. No placeholder profiles:
  // an empty category shows an empty state, not invented people.
  let students: PublicStudent[] = [];
  try {
    const rows = await getDb()
      .select({ user: schema.users, onboarding: schema.internOnboarding })
      .from(schema.internOnboarding)
      .innerJoin(schema.users, eq(schema.users.id, schema.internOnboarding.userId))
      .where(
        and(
          eq(schema.users.role, "intern"),
          eq(schema.users.isActive, true),
          eq(schema.users.profileVisibility, "live"),
        ),
      )
      .orderBy(desc(schema.internOnboarding.updatedAt))
      .limit(300);

    students = rows.flatMap(({ user, onboarding }) => {
      const extra = (onboarding.extraData ?? {}) as Record<string, unknown>;
      const score = typeof extra.findternScore === "number" ? Math.round(extra.findternScore * 10) / 10 : 0;
      if (score <= 0) return [];
      const draft = draftFromRecord(onboarding);
      const ratings = (extra.ratings ?? {}) as Record<string, unknown>;
      const real = (k: string) => (typeof ratings[k] === "number" && (ratings[k] as number) > 0 ? (ratings[k] as number) : undefined);
      const initials = initialsOf((user.firstName || "").trim(), (user.lastName || "").trim());
      return [
        {
          id: user.id,
          initials,
          shortName: `Candidate ${initials}`,
          score,
          band: score >= 8 ? "Latte" : score >= 6 ? "Cappuccino" : "Espresso",
          college: draft.academics?.institution ?? "",
          degree: [draft.academics?.degree, draft.academics?.branch].filter(Boolean).join(", "),
          city: onboarding.city || "",
          state: onboarding.state || "",
          category: typeof extra.category === "string" ? extra.category : undefined,
          skills: draft.skills ?? [],
          ratings: {
            coding: real("coding"),
            aptitude: real("aptitude"),
            communication: real("communication"),
            interview: real("interview"),
            domain: real("domain"),
          },
          summary: onboarding.bio || onboarding.previewSummary || "",
          available: extra.openToWork !== false,
        } satisfies PublicStudent,
      ];
    });
  } catch {
    return NextResponse.json({ skill: rawSkill || "all", students: [], total: 0, error: "unavailable" }, { status: 503 });
  }

  if (skillParam && skillParam !== "all") {
    const keywords = getCategoryKeywords(skillParam);
    students = students.filter((s) => matchesCategory(s, keywords));
  }
  students.sort((a, b) => b.score - a.score);
  return NextResponse.json({ skill: rawSkill || "all", students: students.slice(0, 40), total: students.length });
}
