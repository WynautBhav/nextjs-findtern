import {
  getBlogPosts,
  getFaqItems,
  getPlans,
} from "@/lib/content";
import { SITE } from "@/lib/content/site";
import { perHireFreeForNow } from "@/lib/plan-offer";
import type { PerHireFeeSetting } from "@/lib/per-hire-fee";
import { activationFeeText } from "@/lib/pricing-copy";
import { feeSettingOf, type PricingConfig } from "@/lib/pricing-config";
import { brandContext, platformHelpContext } from "@/lib/chatbot/knowledge-text";

export { systemPrompt } from "@/lib/chatbot/knowledge-text";

/**
 * Chatbot knowledge layer.
 *
 * The widget is "trained on Findtern's data" via retrieval, not fine-tuning:
 * every chat request pulls live CMS content through the same accessors the
 * marketing pages use (async, DB-backed with TS fallback), scores FAQ items
 * against the user's question with a token-overlap ranker, and injects the
 * winners into the DeepSeek system prompt as ground truth.
 *
 * No new data files, no direct imports of `src/lib/content/*.ts` data -
 * pages and the bot share the accessor seam per project rules.
 */

export type ChatFaqHit = {
  question: string;
  answer: string;
  category: string;
};

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "and", "or", "but", "if", "then", "else", "when", "at", "by", "for",
  "with", "about", "into", "through", "during", "before", "after", "to",
  "from", "up", "down", "in", "out", "on", "off", "over", "under", "of",
  "what", "which", "who", "whom", "this", "that", "these", "those", "am",
  "i", "me", "my", "we", "our", "you", "your", "he", "she", "it", "its",
  "they", "them", "their", "do", "does", "did", "doing", "have", "has",
  "had", "having", "can", "could", "should", "would", "how", "why", "where",
  "there", "here", "so", "than", "too", "very", "just", "also", "please",
  "tell", "give", "know", "need", "want",
]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9₹/.\s-]/g, " ")
      .split(/[\s/.-]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

/** Token-overlap ranker: cheap, dependency-free, good enough for ~90 FAQs. */
export function rankFaq(
  query: string,
  faqs: ChatFaqHit[],
  limit = 6,
): ChatFaqHit[] {
  const q = tokens(query);
  if (q.size === 0) return faqs.slice(0, limit);
  return faqs
    .map((faq) => {
      const doc = tokens(`${faq.question} ${faq.answer} ${faq.category}`);
      let overlap = 0;
      for (const t of q) if (doc.has(t)) overlap += 1;
      // Phrase bonus: exact question words appearing in order.
      const qLower = query.toLowerCase();
      const phraseBonus =
        faq.question.toLowerCase().includes(qLower.slice(0, 24)) ? 1.5 : 0;
      return { faq, score: overlap + phraseBonus };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.faq);
}


export async function pricingContext(feeSetting: PerHireFeeSetting): Promise<string> {
  try {
    const plans = await getPlans(true);
    if (!plans.length) return "";
    return (
      "Live pricing plans (CMS):\n" +
      plans
        .map(
          (p) =>
            `- ${p.displayName}: ${(p.priceHourlyMinor / 100).toFixed(0)} ${p.currency}/hr${p.perHireChargeMinor ? (perHireFreeForNow(p.slug, feeSetting) ? ` (per-hire charge of ${(p.perHireChargeMinor / 100).toFixed(0)} ${p.currency} shown struck through, free for now)` : ` + ${(p.perHireChargeMinor / 100).toFixed(0)} ${p.currency} per hire`) : ""} (${p.internshipDuration}; ${p.features.join("; ")})`,
        )
        .join("\n")
    );
  } catch {
    return "";
  }
}

export async function blogContext(): Promise<string> {
  try {
    const posts = await getBlogPosts();
    if (!posts.length) return "";
    return (
      "Blog (titles only, suggest reading at /blog/<slug>):\n" +
      posts
        .slice(0, 10)
        .map((p) => `- "${p.title}" (/blog/${p.slug}): ${p.excerpt.slice(0, 140)}`)
        .join("\n")
    );
  } catch {
    return "";
  }
}

export async function retrieveContext(query: string, config: PricingConfig): Promise<string> {
  const feeSetting = feeSettingOf(config);
  const [faqs, pricing, blogs] = await Promise.all([
    getFaqItems().catch(() => []),
    pricingContext(feeSetting),
    blogContext(),
  ]);
  const hits = rankFaq(
    query,
    faqs.map((f) => ({
      question: f.question,
      answer: f.answer,
      category: f.category,
    })),
    6,
  );
  const faqBlock = hits.length
    ? "Relevant FAQs (answer from these first, quote faithfully):\n" +
      hits
        .map((h, i) => `[${i + 1}] (${h.category}) Q: ${h.question}\nA: ${h.answer}`)
        .join("\n\n")
    : "";
  return [brandContext(feeSetting, config), platformHelpContext(config), pricing, blogs, faqBlock]
    .filter(Boolean)
    .join("\n\n");
}


/** Extractive fallback when DEEPSEEK_API_KEY is unset (dev/offline). */
export async function localAnswer(query: string, config: PricingConfig): Promise<string> {
  const faqs = await getFaqItems().catch(() => []);
  const hits = rankFaq(
    query,
    faqs.map((f) => ({
      question: f.question,
      answer: f.answer,
      category: f.category,
    })),
    3,
  );
  if (!hits.length) {
    return (
      `I couldn't find that in Findtern's help content. Try asking about the AI interview (${activationFeeText(config)}, 30–60 min, laptop required), the Findtern Score, the placement guarantee, or employer pricing (Espresso / Cappuccino / Latte). ` +
      `For anything else, reach us at ${SITE.email} or ${SITE.url}/contact.`
    );
  }
  const top = hits[0];
  const more =
    hits.length > 1
      ? `\n\nRelated: ${hits
          .slice(1)
          .map((h) => `"${h.question}"`)
          .join(" · ")}`
      : "";
  return `${top.answer.trim()}${more}\n\n(Source: Findtern FAQ - ${top.category}. Ask me anything else!)`;
}

