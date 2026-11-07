"use client";

import { Download } from "lucide-react";

import { buttonClass } from "@/components/ui/button";

/** "Save as PDF": prints this profile (one candidate per page, so the whole page). */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11 print:hidden" })}>
      <Download className="size-4" aria-hidden />
      Save as PDF
    </button>
  );
}
