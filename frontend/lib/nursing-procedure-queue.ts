/**
 * Nursing orders that should not appear on the Procedures queue (ward-only instructions).
 */
export function isWardInstructionOrderType(orderType: string | undefined | null): boolean {
  return String(orderType || '').trim().toLowerCase() === 'ward instruction';
}

/** Filter API nursing order results before building procedure queue items. */
export function excludeWardInstructionOrdersForProceduresQueue<T extends { order_type?: string }>(
  orders: T[]
): T[] {
  return orders.filter((o) => !isWardInstructionOrderType(o.order_type));
}
