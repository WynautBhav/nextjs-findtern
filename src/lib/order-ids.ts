type Raw = Record<string, unknown> | null | undefined;

/** Proposal IDs an employer order covers; same lookup as the legacy app. Pure, so tests and client code can use it. */
export function orderProposalIds(raw: Raw): string[] {
  const r = (raw ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const notes = r.notes ?? r.order?.notes ?? {};
  let ids = notes.proposalIds ?? notes.proposal_ids ?? r.proposalIds ?? r.proposal_ids ?? [];
  if (typeof ids === "string") {
    try {
      ids = JSON.parse(ids);
    } catch {
      ids = [];
    }
  }
  return Array.isArray(ids) ? ids.map((v) => String(v ?? "").trim()).filter(Boolean) : [];
}
