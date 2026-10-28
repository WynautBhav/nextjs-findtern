import { InlineEditor, InlineSelect, InlineToggle } from "@/components/admin/inline-control";
import type { InlineField } from "@/lib/admin/inline-request";

/**
 * Row-level controls for the candidate and user lists and the Candidate 360
 * header (DESIGN.md §6.5). Plain components with plain-data props, so a
 * server page or a client view can render them; each one only says which
 * existing endpoint it writes to.
 */

const APPROVAL = [
  { value: "Pending", label: "Pending" },
  { value: "Approved", label: "Approved" },
  { value: "Rejected", label: "Rejected" },
] as const;

export function InternApprovalCell({ internId, value }: { internId: string; value: string }) {
  return (
    <InlineSelect
      label="Review status"
      value={APPROVAL.some((o) => o.value === value) ? value : "Pending"}
      options={APPROVAL}
      request={{ url: `/api/admin/interns/${encodeURIComponent(internId)}/approval`, method: "PUT", valueKey: "approvalStatus" }}
    />
  );
}

export function InternVisibilityCell({ internId, live }: { internId: string; live: boolean }) {
  return (
    <InlineToggle
      on={live}
      onLabel="Live"
      offLabel="Hidden"
      turnOnLabel="Show"
      turnOffLabel="Hide"
      confirmOff="Hide this candidate from employers and the public directory? Their account stays active."
      onRequest={{ url: "/api/admin/interns/visibility", body: { ids: [internId], visibility: "live" } }}
      offRequest={{ url: "/api/admin/interns/visibility", body: { ids: [internId], visibility: "hidden" } }}
    />
  );
}

/**
 * Active / inactive. Candidates go through `/api/users/[id]/…`; companies
 * through the company PATCH, which also clears their cached sign-in status.
 */
export function AccountActiveCell({ id, kind, active }: { id: string; kind: "intern" | "employer"; active: boolean }) {
  const enc = encodeURIComponent(id);
  return (
    <InlineToggle
      on={active}
      onLabel="Active"
      offLabel="Inactive"
      turnOnLabel="Activate"
      turnOffLabel="Deactivate"
      confirmOff="Deactivate this account? They will not be able to sign in until it is activated again."
      {...(kind === "intern"
        ? { onRequest: { url: `/api/users/${enc}/activate` }, offRequest: { url: `/api/users/${enc}/deactivate` } }
        : { request: { url: `/api/admin/companies/${enc}`, method: "PATCH" as const, valueKey: "isActive" } })}
    />
  );
}

const RATING_FIELDS: InlineField[] = [
  { key: "communication", label: "Communication", type: "number", min: 0, max: 10, step: 0.1 },
  { key: "coding", label: "Coding", type: "number", min: 0, max: 10, step: 0.1 },
  { key: "aptitude", label: "Aptitude", type: "number", min: 0, max: 10, step: 0.1 },
  { key: "interview", label: "AI interview", type: "number", min: 0, max: 10, step: 0.1 },
];

/**
 * The four AI-interview ratings, edited in the row. The server recomputes the
 * Findtern Score (mean of the four) and the row refreshes to show it.
 */
export function InternRatingsCell({
  internId,
  name,
  ratings,
  score,
}: {
  internId: string;
  name: string;
  ratings: Partial<Record<string, number>>;
  score: number | null;
}) {
  return (
    <InlineEditor
      label={`ratings for ${name}`}
      value={{
        communication: ratings.communication ?? null,
        coding: ratings.coding ?? null,
        aptitude: ratings.aptitude ?? null,
        interview: ratings.interview ?? null,
      }}
      fields={RATING_FIELDS}
      columns={2}
      note="Empty clears that rating. The score is their mean."
      display={
        score === null ? (
          <span className="text-ink-600">Not scored</span>
        ) : (
          <span className="nums font-semibold text-ink-900">
            {score.toFixed(1)}
            <span className="ml-0.5 text-xs font-normal text-text-subtle">/10</span>
          </span>
        )
      }
      request={{ url: `/api/admin/interns/${encodeURIComponent(internId)}/ratings`, method: "PUT" }}
    />
  );
}
