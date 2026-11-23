import { DRIVE_DISCOUNT_PERCENT, DRIVE_PPO_FEE_PERCENT, STANDARD_PPO_FEE_PERCENT } from "@/lib/college/drive-pricing";
import { ExitDriveButton } from "./exit-drive-button";

/**
 * What the drive gives the company, inside the drive's dark header: one line on how it got here, then the three terms
 * side by side (a strip, not cards), and the way out. Figures come from lib/college/drive-pricing.ts, the same constants
 * the server stamps on each offer.
 */
export function DriveBenefits({ driveId, collegeName, daysRemaining }: { driveId: string; collegeName: string; daysRemaining: number }) {
  const terms: [value: string, label: string][] = [
    [`${DRIVE_DISCOUNT_PERCENT}% off`, "every internship hire's monthly charges"],
    [`${DRIVE_PPO_FEE_PERCENT}% full-time fee`, `instead of ${STANDARD_PPO_FEE_PERCENT}% of CTC, PPOs later included`],
    ["Findtern Pro on", "CGPA, college and verified filters, free for the drive"],
    [daysRemaining <= 1 ? "Last day" : `${daysRemaining} days left`, "in the drive"],
  ];
  return (
    <div className="mt-6 border-t border-white/15 pt-5">
      <p className="max-w-3xl text-pretty text-[0.9375rem] leading-relaxed text-on-dark">
        You have been selected for the campus drive of {collegeName}, in partnership with Findtern. While you&apos;re in it, Candidates shows{" "}
        {collegeName}&apos;s students only, and you hire them the usual way.
      </p>
      <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4 lg:grid-cols-4">
        {terms.map(([value, label]) => (
          // Label read first, figure shown first.
          <div key={label} className="flex min-w-0 flex-col-reverse justify-end">
            <dt className="mt-0.5 text-sm text-on-dark-subtle">{label}</dt>
            <dd className="nums text-2xl font-light tracking-[-0.02em] text-white">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5">
        <ExitDriveButton driveId={driveId} collegeName={collegeName} />
      </div>
    </div>
  );
}
