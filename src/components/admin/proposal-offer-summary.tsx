import { FileDown } from "lucide-react";

import { DetailRow } from "@/components/app/primitives";
import { ButtonAnchor } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/format";
import { parseOffer, WEEKLY_SCHEDULES } from "@/lib/offer";
import { sanitizeRichText } from "@/lib/richtext";

/**
 * A proposal's offer, structured the way legacy's admin showed it (role,
 * mode, location, dates, pricing, schedule, laptop, leave, JD as formatted
 * text, and the full-time block with its offer letter). Replaces the raw
 * `offer_details` key dump, which printed "[object Object]" for full-time
 * offers and the JD as raw HTML.
 *
 * No hooks and no server-only imports, so client dialogs can render it too.
 */
export function ProposalOfferSummary({
  proposalId,
  offerDetails,
  currency,
}: {
  proposalId: string;
  offerDetails: unknown;
  currency: string | null;
}) {
  const offer = parseOffer(offerDetails, currency);
  const raw = (offerDetails && typeof offerDetails === "object" ? offerDetails : {}) as Record<string, unknown>;
  const money = (minor: number | null) => (minor == null ? "-" : formatMoney(minor, offer.currency, { zeroLabel: false }));
  const office = Number(raw.wfoDays);
  const home = Number(raw.wfhDays);
  const jd = offer.jd ? sanitizeRichText(offer.jd) : "";

  if (offer.fullTime) {
    const ft = offer.fullTime;
    return (
      <div className="space-y-5">
        <dl className="divide-y divide-ink-100">
          <DetailRow label="Offer" value="Full-time" />
          <DetailRow label="Role" value={offer.roleTitle || "-"} />
          <DetailRow label="Annual CTC" value={money(ft.annualCtcMinor)} mono />
          <DetailRow label="Work mode" value={<span className="capitalize">{ft.jobMode || offer.mode || "-"}</span>} />
          <DetailRow label="Location" value={ft.location || offer.location || "-"} />
          <DetailRow label="Joining" value={formatDate(offer.startDate)} />
          <DetailRow label="Hours" value={ft.shiftFrom && ft.shiftTo ? `${ft.shiftFrom} to ${ft.shiftTo}` : "-"} />
          <DetailRow label="Timezone" value={ft.timezone || offer.timezone || "-"} />
        </dl>
        {ft.offerLetterKey || ft.offerLetterUrl ? (
          <ButtonAnchor href={`/api/proposals/${proposalId}/offer-letter`} target="_blank" rel="noopener noreferrer" variant="outline" size="sm">
            <FileDown className="size-4" aria-hidden />
            Offer letter
          </ButtonAnchor>
        ) : (
          <p className="text-sm text-ink-600">No offer letter uploaded.</p>
        )}
        {jd ? <JobDescription html={jd} /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <dl className="divide-y divide-ink-100">
        <DetailRow label="Offer" value={`Internship · ${offer.months} month${offer.months === 1 ? "" : "s"}`} />
        <DetailRow label="Role" value={offer.roleTitle || "-"} />
        <DetailRow
          label="Work mode"
          value={
            <span className="capitalize">
              {offer.mode || "-"}
              {offer.mode === "hybrid" && Number.isFinite(office) && Number.isFinite(home) ? ` · ${office} office / ${home} home days` : ""}
            </span>
          }
        />
        <DetailRow label="Location" value={offer.location || "-"} />
        <DetailRow label="Start date" value={formatDate(offer.startDate)} />
        <DetailRow label="Monthly" value={money(offer.monthlyMinor)} mono />
        <DetailRow label="Total" value={money(offer.totalMinor)} mono />
        <DetailRow label="Hourly rate" value={money(offer.hourlyRateMinor)} mono />
        <DetailRow label="Hiring fee" value={money(offer.perHireMinor)} mono />
        <DetailRow label="Hours a month" value={offer.monthlyHours || "-"} mono />
        <DetailRow label="Working week" value={WEEKLY_SCHEDULES[offer.weeklySchedule].label} />
        <DetailRow label="Shift" value={offer.shiftFrom && offer.shiftTo ? `${offer.shiftFrom} to ${offer.shiftTo}` : offer.shiftFrom || "-"} />
        <DetailRow label="Timezone" value={offer.timezone || "-"} />
        <DetailRow label="Laptop" value={<span className="capitalize">{offer.laptop || "-"}</span>} />
        <DetailRow label="Paid leave a month" value={offer.paidLeavesPerMonth} mono />
      </dl>
      {jd ? <JobDescription html={jd} /> : null}
    </div>
  );
}

function JobDescription({ html }: { html: string }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-ink-900">Job description</p>
      <div
        className="prose-sm max-h-72 overflow-y-auto rounded-apple-md border border-ink-200/80 bg-ink-50 p-4 text-sm leading-relaxed text-ink-800 [&_li]:ml-5 [&_ol]:list-decimal [&_p+p]:mt-2 [&_ul]:list-disc"
        // Allowlist-sanitised (lib/richtext), the same as blog bodies.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
