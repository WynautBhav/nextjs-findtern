"use client";

import { useEffect, useState } from "react";
import { Building2, GraduationCap } from "lucide-react";

import { FaqExplorer } from "@/components/marketing/faq-explorer";
import { SITE } from "@/lib/content/site";
import type { CmsFaqItem } from "@/lib/content/types";
import { cn } from "@/lib/utils";

type Audience = "intern" | "employer";

const COPY: Record<Audience, { label: string; hint: string; Icon: typeof GraduationCap }> = {
  intern: { label: "I'm looking for an internship", hint: "Assessment, scoring, fees and the guarantee.", Icon: GraduationCap },
  employer: { label: "I'm hiring", hint: "Screening, hiring, timesheets and payment.", Icon: Building2 },
};

/**
 * Two doors instead of one long scroll. The questions are genuinely
 * different for the two sides, so the visitor picks theirs and sees only
 * those. The choice is mirrored in the URL hash (#interns / #employers) so a
 * link from an email or the chatbot can open the right set.
 */
export function FaqAudienceTabs({ intern, employer }: { intern: CmsFaqItem[]; employer: CmsFaqItem[] }) {
  const [audience, setAudience] = useState<Audience>("intern");

  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace("#", "");
      if (h === "employers") setAudience("employer");
      else if (h === "interns") setAudience("intern");
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  function choose(a: Audience) {
    setAudience(a);
    window.history.replaceState(null, "", a === "employer" ? "#employers" : "#interns");
  }

  const items = audience === "intern" ? intern : employer;

  return (
    <div className="relative">
      {/* Targets for /faq#interns and /faq#employers (the in-app FAQ links),
          so the browser lands on the tabs, not the top of the hero. */}
      <span id="interns" aria-hidden className="absolute top-0 scroll-mt-28" />
      <span id="employers" aria-hidden className="absolute top-0 scroll-mt-28" />
      <div role="tablist" aria-label="Who is asking" className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(COPY) as Audience[]).map((a) => {
          const { label, hint, Icon } = COPY[a];
          const active = audience === a;
          const count = a === "intern" ? intern.length : employer.length;
          return (
            <button
              key={a}
              type="button"
              role="tab"
              id={`faq-tab-${a}`}
              aria-selected={active}
              aria-controls="faq-panel"
              onClick={() => choose(a)}
              className={cn(
                "flex min-h-11 items-start gap-4 rounded-2xl border p-5 text-left transition-[border-color,background-color,box-shadow] duration-200",
                active
                  ? "border-primary bg-brand-50 shadow-sm"
                  : "border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50",
              )}
            >
              <span
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-xl transition-colors",
                  active ? "bg-primary text-white" : "bg-ink-100 text-ink-600",
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className={cn("block text-base font-semibold", active ? "text-primary" : "text-ink-900")}>{label}</span>
                <span className="mt-0.5 block text-sm text-ink-600">
                  {count} questions · {hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div id="faq-panel" role="tabpanel" aria-labelledby={`faq-tab-${audience}`} className="mt-10">
        {/* Keyed so search and filters reset when the audience changes. */}
        <FaqExplorer
          key={audience}
          items={items}
          showCategory={false}
          email={audience === "employer" ? SITE.adminEmail : SITE.email}
        />
      </div>
    </div>
  );
}
