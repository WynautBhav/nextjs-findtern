import Link from "next/link";

import { AiLinkRows } from "@/components/admin/ai-link-rows";
import { AdminEmpty, AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { buttonClass } from "@/components/ui/button";
import { aiLinkState, pickQueue, type AiLinkState } from "@/lib/admin/ai-link-queue";
import { loadAiLinkRows } from "@/lib/admin/ai-link-queue-load";
import { flattenParams, type RawSearchParams } from "@/lib/admin/params";
import { canWrite as mayWrite } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

const TABS: { key: "waiting" | "sent" | "completed"; label: string }[] = [
  { key: "waiting", label: "Waiting for a link" },
  { key: "sent", label: "Link sent" },
  { key: "completed", label: "Completed" },
];

/** Every AI interview by where it stands. Waiting shows paid applicants only (oldest first); the others show everyone. */
export default async function AiInterviewsPage({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const filter = flattenParams(await searchParams).filter;
  const tab = TABS.find((t) => t.key === filter)?.key ?? "waiting";
  const session = await getSession();
  const canWrite = mayWrite(session?.permissions, "/admin/ai-interviews");
  const now = new Date();

  let all: Awaited<ReturnType<typeof loadAiLinkRows>>;
  try {
    all = await loadAiLinkRows();
  } catch (error) {
    console.error("[admin/ai-interviews] load failed", error);
    return (
      <Panel>
        <AdminLoadError what="the AI interviews" retryHref="/admin/ai-interviews" />
      </Panel>
    );
  }

  const { waiting, unpaid } = pickQueue(all);
  const newestFirst = (a: { createdAt: Date | string | null }, b: { createdAt: Date | string | null }) => +new Date(b.createdAt ?? 0) - +new Date(a.createdAt ?? 0);
  const byState = (s: AiLinkState) => all.filter((r) => aiLinkState(r) === s).sort(newestFirst);
  const rows = tab === "waiting" ? waiting : byState(tab);

  return (
    <div>
      <AdminPageHeader title="AI interviews" subtitle={`${waiting.length} paid applicant${waiting.length === 1 ? "" : "s"} waiting for a link${unpaid ? `, ${unpaid} unpaid not counted` : ""}.`} />
      <nav aria-label="Filter" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/ai-interviews?filter=${t.key}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={cn(buttonClass({ variant: t.key === tab ? "primary" : "outline", size: "sm" }), "min-h-11 max-sm:flex-1")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <Panel>
        {rows.length === 0 ? <AdminEmpty title="Nothing here" body="No AI interviews in this view." /> : <AiLinkRows rows={rows} now={now} canWrite={canWrite} state={tab === "sent" ? "sent" : tab} />}
      </Panel>
    </div>
  );
}
