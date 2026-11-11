/**
 * What the public site may show about a candidate. No internal user id (`id`
 * is a per-response list key) and no free-text bio - the candidate wrote that
 * for employers, not for the open web.
 */
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
  available: boolean;
};

export type Candidate = PublicStudent;

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

export function getCategoryKeywords(categoryName: string): string[] {
  const norm = categoryName.toLowerCase().trim();
  for (const [key, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (norm === key || norm.includes(key) || key.includes(norm)) {
      return keywords;
    }
  }
  return [norm];
}

export function matchesCategory(student: Candidate, keywords: string[]): boolean {
  const targetCategory = (student.category || "").toLowerCase();
  const allTexts = [
    targetCategory,
    ...student.skills,
    student.degree,
  ].join(" ");

  return keywords.some((kw) => {
    if (kw.length <= 3) {
      const regex = new RegExp(`\\b${kw}\\b`, "i");
      return regex.test(allTexts);
    }
    return allTexts.toLowerCase().includes(kw.toLowerCase());
  });
}

export function studentsForSkill(students: Candidate[], skill: string): Candidate[] {
  const s = skill.toLowerCase().trim();
  if (!s || s === "all") return students;
  const keywords = getCategoryKeywords(s);
  return students.filter((st) => matchesCategory(st, keywords));
}
