"use client";

import { Download } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { buttonClass } from "@/components/ui/button";
import type { CgpaQueueRow } from "@/lib/admin/cgpa-queue";
import { cn } from "@/lib/utils";

const CLASS = cn(buttonClass({ variant: "outline", size: "sm" }), "min-h-11 rounded-full px-4");

/**
 * Downloads the CSV from the server (which audits it) for the filter and search in the page's URL.
 * `now` is accepted only because the page still passes it; the server stamps its own clock.
 */
export function CgpaExport({ rows }: { rows: CgpaQueueRow[]; now?: string }) {
  const params = useSearchParams();
  const query = new URLSearchParams();
  const filter = params.get("filter");
  const q = params.get("q");
  if (filter) query.set("filter", filter);
  if (q) query.set("q", q);
  const href = `/api/admin/cgpa-verifications/export${query.size ? `?${query}` : ""}`;

  if (rows.length === 0) {
    return (
      <button type="button" disabled className={cn(CLASS, "opacity-50")}>
        <Download className="size-4" aria-hidden />
        Download CSV
      </button>
    );
  }
  return (
    <a href={href} download className={CLASS}>
      <Download className="size-4" aria-hidden />
      Download CSV
    </a>
  );
}
