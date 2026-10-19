import type { Metadata } from "next";

import { EmptyScene, PageHead } from "@/components/app/primitives";
import { RoleCard } from "@/components/marketing/role-card";
import { requireRole } from "@/lib/auth";
import { loadInternData, openProjects } from "@/lib/intern-data";

export const metadata: Metadata = {
  title: "Open roles",
  robots: { index: false, follow: false },
};

/**
 * Open roles, signed in.
 *
 * The old version rendered six cards that were not links. Not one of them went
 * anywhere. A card that looks like a button and is not a link is worse than a
 * plain list, because it spends the reader's attention and gives nothing back.
 *
 * Every card is a link, and the cards themselves are the shared `RoleCard` the
 * public browser at /opportunities uses - the only difference a signed-in
 * candidate sees is which roles they have already been considered for. The
 * list is newest-first, because a role posted eight weeks ago is a weaker
 * offer than the same role posted yesterday.
 */
export default async function InternOpportunities() {
  const session = await requireRole("intern");

  const data = await loadInternData(session.uid);
  const rows = await openProjects();
  const applied = new Set(data.proposals.map((p) => p.projectId).filter(Boolean));

  return (
    <div>
      <PageHead
        title="Open roles"
        lede="What companies are hiring for right now. Every role here is accepting people today."
      />

      {rows.length === 0 ? (
        <EmptyScene
          art
          title="No roles are open at the moment"
          body="Companies post projects as they open them, and this list fills up regularly. Your profile is what they search, so the most useful thing you can do while this is empty is make sure it is complete."
          next={{ label: "Check what employers can see", href: "/intern/profile" }}
          who="You are in control here"
        />
      ) : (
        <>
          <p className="mb-5 text-sm text-ink-600">
            {rows.length} role{rows.length === 1 ? "" : "s"} open
            {applied.size > 0 ? `, ${applied.size} you have already been considered for` : ""}
          </p>
          <ul className="grid gap-3 lg:grid-cols-2">
            {rows.map((role) => (
              <li key={role.id}>
                <RoleCard
                  role={role}
                  applied={applied.has(role.id)}
                  hrefBase="/intern/opportunities"
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}