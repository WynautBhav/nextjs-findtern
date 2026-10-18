import type { CmsFaqItem } from "./types";

/**
 * The pricing page's short FAQ. Shared between the accordion (client, with the
 * visitor's currency) and the FAQPage structured data (server, INR), so the
 * answers Google indexes are the answers a visitor reads.
 */
export function pricingFaq(perHire: string): CmsFaqItem[] {
  return [
    {
      id: "p1",
      category: "Pricing",
      question: "What is the per-hire fee?",
      answer: `Every plan carries a fixed ${perHire} per-hire charge that covers candidate screening, testing, rubric scoring, and ongoing placement management.`,
      sortOrder: 0,
      isActive: true,
    },
    {
      id: "p2",
      category: "Pricing",
      question: "Can we negotiate the rate?",
      answer:
        "No. The rate is the score band, and the band is the score. Negotiating it would mean the published rate card was not the real one.",
      sortOrder: 1,
      isActive: true,
    },
    {
      id: "p3",
      category: "Pricing",
      question: "What happens if an intern scores below 6?",
      answer:
        "They still get scored and still appear in the pool. They sit in the Espresso band, which is free to browse with a per-hire charge on anyone you go on to hire.",
      sortOrder: 2,
      isActive: true,
    },
    {
      id: "p4",
      category: "Pricing",
      question: "How much does an intern cost per month?",
      answer:
        "Multiply the hourly rate by the hours you need. At 8 hours a day, 5 days a week, 4 weeks a month that is 160 hours: ₹16,000 a month on Cappuccino (₹100/hr) and ₹32,000 on Latte (₹200/hr), plus the one-time per-hire fee. The calculator on the pricing page does this for your own schedule.",
      sortOrder: 3,
      isActive: true,
    },
    {
      id: "p5",
      category: "Pricing",
      question: "Is there a minimum engagement length?",
      answer:
        "The Skilled and Assured bands carry a 160-hour minimum, roughly four full working weeks. Below that neither side gets enough from the placement to make it worth doing.",
      sortOrder: 4,
      isActive: true,
    },
    {
      id: "p6",
      category: "Pricing",
      question: "Do you charge for the trial period?",
      answer:
        "No. The scope agreed in the proposal is the scope billed. If work happens outside it, it is not billed - the timesheet is the contract.",
      sortOrder: 5,
      isActive: true,
    },
  ];
}
