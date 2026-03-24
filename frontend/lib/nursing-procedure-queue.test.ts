import { describe, expect, it } from 'vitest';
import {
  excludeWardInstructionOrdersForProceduresQueue,
  isWardInstructionOrderType,
} from './nursing-procedure-queue';

describe('nursing-procedure-queue', () => {
  it('isWardInstructionOrderType matches ward instruction case-insensitively', () => {
    expect(isWardInstructionOrderType('ward instruction')).toBe(true);
    expect(isWardInstructionOrderType('Ward Instruction')).toBe(true);
    expect(isWardInstructionOrderType('medication')).toBe(false);
    expect(isWardInstructionOrderType(undefined)).toBe(false);
  });

  it('excludeWardInstructionOrdersForProceduresQueue removes ward instructions only', () => {
    const orders = [
      { id: 1, order_type: 'ward instruction' },
      { id: 2, order_type: 'medication' },
      { id: 3, order_type: 'injection' },
    ];
    const filtered = excludeWardInstructionOrdersForProceduresQueue(orders);
    expect(filtered.map((o) => o.id)).toEqual([2, 3]);
  });
});
