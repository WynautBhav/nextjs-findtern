import { Download } from "lucide-react";

import { ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { ButtonAnchor } from "@/components/ui/button";
import { toQueryString } from "@/lib/admin/params";

/** Export CSV: the file is built by /api/admin/meetings/export only when pressed, from the page's own query string. */
export function ExportCsv({ params }: { params: Record<string, string> }) {
  // Every row the filters match, not one page of them.
  const filters = Object.fromEntries(Object.entries(params).filter(([k]) => k !== "page" && k !== "per"));
  return (
    <ButtonAnchor href={`/api/admin/meetings/export${toQueryString(filters)}`} variant="outline" size="sm" className={ADMIN_PILL_SECONDARY} download>
      <Download className="size-4" aria-hidden />
      Export CSV
    </ButtonAnchor>
  );
}
