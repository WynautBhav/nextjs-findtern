/**
 * The proposal PDF's words, from the same drawer data the Projects pop-up and the Proposal pipeline drawer show
 * (proposal-drawer-data.ts drawerOf). Pure: the route only lays these lines out with pdf-lib.
 */
import { parseOffer } from "../offer.ts";
import type { DrawerProposal } from "./proposal-drawer-data.ts";

export type PdfSection = { heading: string; rows: [label: string, value: string][] };
export type ProposalPdfText = { title: string; subtitle: string; sections: PdfSection[] };

const MODE: Record<string, string> = { remote: "Remote", onsite: "On-site", "on-site": "On-site", hybrid: "Hybrid" };
const mode = (m: string) => MODE[m.trim().toLowerCase()] ?? m;

export function proposalPdfText(input: { id: string; kind: string; drawer: DrawerProposal }, generatedAt: string): ProposalPdfText {
  const p = input.drawer;
  const o = parseOffer(p.offerDetails, p.currency);
  const who: PdfSection = {
    heading: "Candidate",
    rows: [["Name", p.candidate], ["Email", p.email ?? "-"], ["Phone", p.phone ?? "-"]],
  };
  const offer: PdfSection = {
    heading: "Offer",
    rows: [
      ["Company", p.company],
      ["Project or role", p.project],
      ["Type", input.kind],
      ["Outcome", p.expiryLabel ? `${p.outcome.label} (${p.expiryLabel})` : p.outcome.label],
      ["Flow", p.flow],
      ["Sent", p.sent],
    ],
  };
  // Pay in the drawer's labels: the employer's monthly amount and the intern's stipend, or the CTC.
  if (p.pay.employerMonthly) offer.rows.push(["Employer pays", `${p.pay.employerMonthly} a month`]);
  if (p.pay.internStipend) offer.rows.push(["Intern stipend", `${p.pay.internStipend} a month`]);
  if (!p.pay.employerMonthly && !p.pay.internStipend) offer.rows.push(["Pay", p.pay.label]);
  if (o.fullTime) {
    if (o.fullTime.jobMode) offer.rows.push(["Work mode", mode(o.fullTime.jobMode)]);
    if (o.fullTime.location) offer.rows.push(["Location", o.fullTime.location]);
    if (o.fullTime.startDate) offer.rows.push(["Start date", o.fullTime.startDate]);
    if (o.fullTime.timezone) offer.rows.push(["Timezone", o.fullTime.timezone]);
  } else {
    offer.rows.push(["Duration", `${o.months} ${o.months === 1 ? "month" : "months"}`]);
    if (o.startDate) offer.rows.push(["Start date", o.startDate]);
    if (o.mode) offer.rows.push(["Work mode", mode(o.mode)]);
    const place = [o.city, o.state].filter(Boolean).join(", ");
    if (place) offer.rows.push(["City", place]);
    if (o.timezone) offer.rows.push(["Timezone", o.timezone]);
  }
  const sections: PdfSection[] = [who, offer, { heading: "Timeline", rows: p.steps.length ? p.steps.map((s) => [s.label, s.at]) : [["Steps", "No dated steps recorded"]] }];
  if (p.interview) sections.push({ heading: "Linked interview", rows: [["Status", p.interview.status], ["Slot", p.interview.slot], ["Booked", p.interview.booked]] });
  return { title: "Findtern proposal", subtitle: `Proposal ${input.id} · generated ${generatedAt}`, sections };
}

/** Windows-1252 extras the standard PDF fonts (WinAnsi) can draw beyond Latin-1. */
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

/**
 * Text the standard Helvetica can encode: ₹ becomes "Rs ", accents are kept where Latin-1 has them or stripped, and any
 * other character (Devanagari, emoji) becomes "?" rather than failing the whole PDF.
 */
export function pdfSafe(text: string): string {
  let out = "";
  for (const ch of text.replace(/₹\s?/g, "Rs ")) {
    const c = ch.codePointAt(0)!;
    if (c === 0x09 || (c >= 0x20 && c < 0x7f) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(ch)) out += ch;
    else if (c === 0x0a || c === 0x0d) out += " ";
    else {
      const bare = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
      out += bare && [...bare].every((b) => b.codePointAt(0)! < 0x7f) ? bare : "?";
    }
  }
  return out;
}

/** proposal-<candidate>-<company>.pdf, ASCII letters, digits and dashes only. */
export function proposalPdfFilename(candidate: string, company: string): string {
  const slug = (s: string) =>
    s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `proposal-${[slug(candidate), slug(company)].filter(Boolean).join("-") || "offer"}.pdf`;
}
