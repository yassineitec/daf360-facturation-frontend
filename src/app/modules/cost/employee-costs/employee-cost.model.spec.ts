import { describe, it, expect } from 'vitest';
import { deriveEmployeeCostFields } from './employee-cost.model';

describe('deriveEmployeeCostFields', () => {
  it('derives internal (x1.1) and external (x1.2) from basicCost', () => {
    const result = deriveEmployeeCostFields('basic', 100);
    expect(result.basicCost).toBe(100);
    expect(result.internalSellingCost).toBe(110);
    expect(result.externalSellingCost).toBe(120);
  });

  it('back-derives basicCost from internalSellingCost', () => {
    const result = deriveEmployeeCostFields('internal', 110);
    expect(result.basicCost).toBe(100);
    expect(result.internalSellingCost).toBe(110); // round-trips back to the driver's own value
    expect(result.externalSellingCost).toBe(120);
  });

  it('back-derives basicCost from externalSellingCost', () => {
    const result = deriveEmployeeCostFields('external', 120);
    expect(result.basicCost).toBe(100);
    expect(result.internalSellingCost).toBe(110);
    expect(result.externalSellingCost).toBe(120); // round-trips back to the driver's own value
  });

  it('rounds to 2 decimal places', () => {
    const result = deriveEmployeeCostFields('basic', 33.333);
    expect(result.basicCost).toBe(33.33);
    expect(result.internalSellingCost).toBe(36.66);
    expect(result.externalSellingCost).toBe(40.0);
  });
});
