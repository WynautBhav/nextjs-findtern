import type { CmsFaqItem } from "./types";
import { feePlans, joinNames, perHireAnswer } from "../per-hire-copy.ts";
import { PER_HIRE_FEE_DEFAULT, type PerHireFeeSetting } from "../per-hire-fee.ts";
import { monthlyText, rateText } from "../pricing-copy.ts";
import { PRICING_DEFAULTS, type PricingConfig } from "../pricing-config.ts";

/**
 * The pricing page's short FAQ. Shared between the accordion (client, with the
 * visitor's currency) and the FAQPage structured data (server, INR), so the
 * answers Google indexes are the answers a visitor reads. The monthly figures
 * in "How much does an intern cost per month?" are computed from `config`.
 */
export function pricingFaq(perHire: string, feeSetting: PerHireFeeSetting = PER_HIRE_FEE_DEFAULT, config: PricingConfig = PRICING_DEFAULTS): CmsFaqItem[] {
  return [
    {
      id: "p1",
      category: "Pricing",
      question: "What is the per-hire fee?",
      answer: perHireAnswer(perHire, feeSetting),
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
        feeSetting.standard
          ? "They still get scored and still appear in the pool. They sit in the Espresso band, which is free to browse with a per-hire charge on anyone you go on to hire."
          : "They still get scored and still appear in the pool. They sit in the Espresso band, which is free to browse and, for now, carries no per-hire charge.",
      sortOrder: 2,
      isActive: true,
    },
    {
      id: "p4",
      category: "Pricing",
      question: "How much does an intern cost per month?",
      answer:
        `Multiply the hourly rate by the hours you need. A Monday-to-Friday month is billed as 22 working days of 8 hours, 176 hours: ${monthlyText(config, "skilled")} a month on Cappuccino (${rateText(config, "skilled")}) and ${monthlyText(config, "assured")} on Latte (${rateText(config, "assured")}), ${feeClause(feeSetting)}. The calculator on the pricing page does this for your own schedule.`,
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

/** "plus the one-time per-hire fee on Espresso (free for now on Cappuccino and Latte)", following the admin switch. */
function feeClause(setting: PerHireFeeSetting): string {
  const { charged, free } = feePlans(setting);
  if (charged.length === 0) return "with no per-hire fee for now";
  if (free.length === 0) return "plus the one-time per-hire fee on every plan";
  return `plus the one-time per-hire fee on ${joinNames(charged)} (free for now on ${joinNames(free)})`;
}
