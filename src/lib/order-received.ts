/** Why an order can't be marked "received in the bank", or null. Only paid money can be received, and the first stamp is kept. */
export function receivedRefusal(order: { status: string; raw: unknown }): string | null {
  if (order.status !== "paid") return "Only a paid order can be marked received.";
  if ((order.raw as { receivedAt?: unknown } | null)?.receivedAt) return "This order is already marked received.";
  return null;
}
