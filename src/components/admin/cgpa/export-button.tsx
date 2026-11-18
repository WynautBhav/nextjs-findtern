"use client";

import { Download } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { downloadCsv, type CsvColumn } from "@/lib/admin/csv";
import { firstAcceptedAt, rowSla, type CgpaQueueRow } from "@/lib/admin/cgpa-queue";
import { cn } from "@/lib/utils";

/** CSV of the rows on screen (same filter and search), through the shared admin CSV writer. */
export function CgpaExport({ rows, now }: { rows: CgpaQueueRow[]; now: string }) {
  const at = new Date(now);
  const columns: CsvColumn<CgpaQueueRow>[] = [
    { header: "Candidate", value: (r) => r.name },
    { header: "Email", value: (r) => r.email },
    { header: "Phone", value: (r) => r.phone },
    { header: "College", value: (r) => r.college },
    { header: "Course", value: (r) => r.course },
    { header: "Semester", value: (r) => r.semester },
    { header: "Claimed score", value: (r) => r.claimedScore },
    { header: "Score type", value: (r) => r.scoreType },
    { header: "Corrected score", value: (r) => r.correctedScore },
    { header: "Status", value: (r) => r.status },
    { header: "Offer accepted at", value: (r) => firstAcceptedAt(r.proposals) },
    { header: "SLA", value: (r) => rowSla(r, at).label },
    { header: "Accepted offers", value: (r) => r.proposals.map((p) => `${p.company} - ${p.project} (starts ${p.startDate ?? "n/a"})`).join("; ") },
    { header: "Decided at", value: (r) => r.decidedAt },
  ];
  return (
    <button
      type="button"
      disabled={rows.length === 0}
      onClick={() => downloadCsv("cgpa-verifications", rows, columns)}
      className={cn(buttonClass({ variant: "outline", size: "sm" }), "min-h-11 rounded-full px-4 disabled:opacity-50")}
    >
      <Download className="size-4" aria-hidden />
      Download CSV
    </button>
  );
}
