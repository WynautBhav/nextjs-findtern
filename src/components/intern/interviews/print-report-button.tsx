"use client";

import { Download } from "lucide-react";

import { buttonClass } from "@/components/ui/button";

/** Prints only the enclosing section, using the same `printing-one` path as the employer's AiFeedbackReport. */
export function PrintReportButton() {
  function print(e: React.MouseEvent<HTMLButtonElement>) {
    const el = e.currentTarget.closest("section");
    if (!el) return window.print();
    const root = document.createElement("div");
    root.id = "print-root";
    root.innerHTML = el.outerHTML;
    document.body.appendChild(root);
    document.body.classList.add("printing-one");
    const cleanup = () => {
      root.remove();
      document.body.classList.remove("printing-one");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }

  return (
    <button type="button" onClick={print} className={buttonClass({ variant: "outline", size: "sm" })}>
      <Download className="size-4" aria-hidden />
      Save as PDF
    </button>
  );
}
