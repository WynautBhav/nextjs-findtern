import { formatMoney } from "@/lib/format";
import { HIDDEN_COMPANY } from "@/lib/intern-data";
import { internOfferKey, offerWasEdited, type InternOfferKey } from "@/lib/intern-offer-view";
import type { ProposalRow } from "@/lib/journey";
import { internStipendInrMinor, parseOffer, type Offer } from "@/lib/offer";

/**
 * What the offers list and the offer page both say about one offer, worked
 * out once so the two never disagree (bug sheet 7, S1 r42: the stipend is
 * the intern's half of the employer's monthly amount, in INR, on both).
 */
export type OfferFacts = {
  key: InternOfferKey;
  edited: boolean;
  offer: Offer;
  fullTime: boolean;
  role: string;
  /** The company name once revealed, else null (hidden until hire). */
  company: string | null;
  /** "Stipend" or "Annual CTC". */
  moneyLabel: string;
  money: string;
  /** `money` split for a large figure: "₹40,000" + "/ month". */
  amount: string;
  per: string;
  /** Raw joining date (YYYY-MM-DD) or null. */
  startDate: string | null;
  mode: string;
  location: string;
  duration: string;
};

export function offerFacts(
  p: ProposalRow & { updatedAt?: Date | null },
  ctx: { score: number; names: Record<string, string> },
): OfferFacts {
  const offer = parseOffer(p.offerDetails, p.currency);
  const ft = offer.fullTime;
  const name = ctx.names[p.employerId];
  const company = name && name !== HIDDEN_COMPANY ? name : null;

  let amount: string;
  let per = "";
  if (ft) {
    amount = ft.annualCtcMinor ? formatMoney(ft.annualCtcMinor, offer.currency) : "Shared in the offer letter";
    if (ft.annualCtcMinor) per = "/ year";
  } else {
    const minor = internStipendInrMinor(offer, ctx.score);
    amount = minor == null ? "No stipend" : minor === 0 ? "Not eligible for stipend" : formatMoney(minor, "INR");
    if (minor) per = "/ month";
  }
  const money = per ? `${amount} ${per}` : amount;

  const mode = ((ft ? ft.jobMode : offer.mode) || "remote").toLowerCase();
  const place = ft ? ft.location : offer.location.toLowerCase() === "remote" ? "" : offer.location;
  const location = mode === "remote" ? "Remote" : place || "To be shared";

  return {
    key: internOfferKey(p),
    edited: offerWasEdited({ status: p.status, createdAt: p.createdAt, updatedAt: p.updatedAt ?? null, offerDetails: p.offerDetails }),
    offer,
    fullTime: Boolean(ft),
    role: offer.roleTitle || (ft ? "Full-time role" : "Internship"),
    company,
    moneyLabel: ft ? "Annual CTC" : "Stipend",
    money,
    amount,
    per,
    startDate: offer.startDate,
    mode,
    location,
    duration: `${offer.months} month${offer.months === 1 ? "" : "s"}`,
  };
}

/** Offers this intern turned down themselves (the guarantee counts these). */
export function declinesUsedBy(proposals: ProposalRow[]): number {
  return proposals.filter(
    (p) => p.status === "rejected" && ((p.offerDetails ?? {}) as Record<string, unknown>).declinedBy === "intern",
  ).length;
}

export const MODE_LABEL: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site", "on-site": "On-site", office: "On-site" };
export const modeLabel = (mode: string) => MODE_LABEL[mode] ?? mode.charAt(0).toUpperCase() + mode.slice(1);
