"use client";

import { useToast } from "@/components/app/toast";
import { InlineSelect } from "@/components/admin/inline-control";
import type { StatusTone } from "@/lib/admin/status-tone";

/** The review-status select with a toast once the server accepted the change (B-31). Client-side only for the toast hook. */
export function InternApprovalSelect({
  internId,
  value,
  options,
  tones,
}: {
  internId: string;
  value: string;
  options: readonly { value: string; label: string }[];
  tones?: Record<string, StatusTone>;
}) {
  const toast = useToast();
  return (
    <InlineSelect
      label="Review status"
      tones={tones}
      value={value}
      options={options}
      onSaved={(next) => toast.show({ title: `Review status set to ${options.find((o) => o.value === next)?.label ?? next}`, tone: "success" })}
      request={{ url: `/api/admin/interns/${encodeURIComponent(internId)}/approval`, method: "PUT", valueKey: "approvalStatus" }}
    />
  );
}
