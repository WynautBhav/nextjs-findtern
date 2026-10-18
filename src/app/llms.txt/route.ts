import { getBlogPosts, getPlans } from "@/lib/content";
import { FAQ_EMPLOYER, FAQ_INTERN } from "@/lib/content/faq";
import { SITE } from "@/lib/content/site";
import { formatMoney, formatRate } from "@/lib/format";
import { plainTextExcerpt } from "@/lib/richtext";
import { SITE_URL } from "@/lib/seo";
import { tidyText } from "@/lib/text";

/** Rebuilt hourly, like the sitemap. */
export const revalidate = 3600;

/**
 * /llms.txt - the llmstxt.org convention: a Markdown summary of the site for
 * language-model crawlers, so an answer engine quoting Findtern quotes the
 * published terms rather than a guess. Everything here is already public on
 * the pages it links to.
 */
export async function GET() {
  const [plans, posts] = await Promise.all([getPlans(true), getBlogPosts().catch(() => [])]);

  const lines: string[] = [
    `# ${SITE.name}`,
    "",
    `> ${SITE.description} ${SITE.name} is an internship hiring platform based in ${SITE.city}. Candidates are academically verified, AI-interviewed and aptitude-tested before an employer sees them, and each receives a Findtern Score out of 10 that sets the hourly rate an employer pays.`,
    "",
    "## Key facts",
    "",
    `- Website: ${SITE_URL}`,
    `- Contact: ${SITE.email} (${SITE_URL}/contact)`,
    `- Founded: ${SITE.foundedYear}, ${SITE.city}`,
    "- Audience: companies hiring interns (in India or from abroad) and students looking for paid internships",
    "- Screening: academic verification, structured AI interview, aptitude test, coding test for technical tracks",
    "- Findtern Score: one number out of 10 across communication, aptitude, role depth, coding and academics; the score band sets the rate",
    "- Billing: hourly rate against approved weekly timesheets, plus one fixed per-hire charge; prices in INR include GST; USD is derived at ₹100 = $1",
    "- Overseas employers: contract with Findtern for the service and pay in USD; Findtern engages and pays the intern in India (no visa, no local entity)",
    "- Candidate guarantee: placed within the guarantee window or the refundable deposit is returned (terms at /guaranteed-internship-program)",
    "",
    "## Plans (INR, published rate card)",
    "",
  ];

  for (const p of plans) {
    const was = p.compareAtHourlyMinor && p.compareAtHourlyMinor > p.priceHourlyMinor ? ` (2026 offer; from 2027 ${formatRate(p.compareAtHourlyMinor, "INR")})` : "";
    lines.push(
      `- **${p.displayName}** - ${p.features[1] ?? ""}: ${formatRate(p.priceHourlyMinor, "INR")}${was}, ${formatMoney(p.perHireChargeMinor, "INR")} per hire, ${p.internshipDuration}. ${p.features[0] ?? ""}.`,
    );
  }

  lines.push(
    "",
    "## Pages",
    "",
    `- [Home](${SITE_URL}/): what Findtern does, for employers and candidates`,
    `- [For employers](${SITE_URL}/employers): how screening works, plans, cost calculator, hiring from outside India`,
    `- [Pricing](${SITE_URL}/pricing): the full rate card, monthly cost calculator, comparison with agencies and in-house hiring`,
    `- [For interns](${SITE_URL}/interns): the assessment, the score, the guarantee`,
    `- [Guaranteed Internship Program](${SITE_URL}/guaranteed-internship-program): deposit, clock, refund conditions`,
    `- [Open roles](${SITE_URL}/opportunities): live internship listings`,
    `- [About](${SITE_URL}/about): mission and method`,
    `- [FAQ](${SITE_URL}/faq): ${FAQ_INTERN.length + FAQ_EMPLOYER.length} answered questions`,
    `- [Blog](${SITE_URL}/blog): articles on hiring and interning`,
    `- [Contact](${SITE_URL}/contact)`,
    `- [Terms](${SITE_URL}/terms-and-conditions), [Intern terms](${SITE_URL}/intern-terms-and-conditions), [Employer terms](${SITE_URL}/employer-terms-and-conditions), [Privacy](${SITE_URL}/privacy)`,
    "",
    "## Blog posts",
    "",
  );

  for (const post of posts) {
    lines.push(`- [${tidyText(post.title)}](${SITE_URL}/blog/${post.slug}): ${plainTextExcerpt(post.body, 140)}`);
  }

  lines.push("", "## Frequently asked", "");
  for (const f of [...FAQ_EMPLOYER.slice(0, 8), ...FAQ_INTERN.slice(0, 8)]) {
    lines.push(`- **${tidyText(f.question)}** ${tidyText(f.answer).replace(/\s+/g, " ")}`);
  }
  lines.push("", `Full list: ${SITE_URL}/faq`, "");

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
