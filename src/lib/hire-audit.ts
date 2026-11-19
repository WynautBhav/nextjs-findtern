/**
 * The audit row for a hire completed by a settled payment (B-48), pure so it can be tested without a DB.
 * Written in the settling transaction, one per proposal that actually became "hired", with `strict: true`.
 * The actor is the paying employer: the payment (or its webhook) is what hired the candidate, not an admin.
 *
 * Needs the catalogue key `proposal.hired` from P5 (src/lib/admin/audit.ts). Until that merges the key is not an AuditAction.
 */
export type HireAuditOrder = { employerId: string; orderId: string; paymentRowId: string };

export function hireAuditEntry(order: HireAuditOrder, hired: { id: string; internId: string }) {
  return {
    adminId: order.employerId,
    action: "proposal.hired" as const,
    targetType: "proposal",
    targetId: hired.id,
    meta: { proposalId: hired.id, employerId: order.employerId, internId: hired.internId, orderId: order.orderId, paymentRowId: order.paymentRowId },
  };
}
