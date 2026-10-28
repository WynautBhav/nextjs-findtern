"use client";

import { InlineEditor } from "@/components/admin/inline-control";

/**
 * Row-level payout editor for the payout and transaction tables.
 *
 * Bank transfers happen outside the app, so the ledger needs a hand: pick
 * paid or failed, type the UTR / bank reference, optionally leave a note for
 * the team. Paid requires the reference (the API refuses it otherwise, and
 * the refusal is shown as is). Only a pending payout can be settled
 * (ADP-31); a settled one is history, so nothing renders for it when
 * `status` is passed.
 *
 * The note is an ops note (`raw.opsNote`); the payout's `notes` column keeps
 * its legacy meaning, the role name in the stipend email (DB-17).
 */
export function PayoutEditor({
  payoutId,
  initialReference,
  initialNote,
  status,
}: {
  payoutId: string;
  initialReference: string | null;
  initialNote?: string | null;
  /** Current status; when given and not pending, nothing is rendered. */
  status?: string;
}) {
  if (status !== undefined && status !== "pending") return null;
  return (
    <InlineEditor
      label="payout status"
      value={{ status: "paid", referenceId: initialReference ?? "", opsNote: initialNote ?? "" }}
      display={<span className="whitespace-nowrap font-medium text-brand-800">Mark paid or failed</span>}
      fields={[
        {
          key: "status",
          label: "New status",
          type: "choice",
          options: [
            { value: "paid", label: "Paid" },
            { value: "failed", label: "Failed" },
          ],
        },
        { key: "referenceId", label: "Bank reference (required when paid)", type: "text", placeholder: "UTR / NEFT reference", maxLength: 64 },
        { key: "opsNote", label: "Note for the team (optional)", type: "text", maxLength: 500, onlyIfChanged: true },
      ]}
      request={{ url: `/api/admin/payouts/${encodeURIComponent(payoutId)}`, method: "PATCH" }}
      // Checked here too, so a missing reference is said before a request
      // goes out rather than as a 400 from the API (QA-103).
      check={(v) => (v.status === "paid" && !(typeof v.referenceId === "string" && v.referenceId.trim()) ? "Add the bank reference to mark it paid." : null)}
    />
  );
}
