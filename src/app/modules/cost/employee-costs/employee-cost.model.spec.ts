import { describe, it, expect } from 'vitest';
import {
  EmployeeCostDto, deriveEmployeeCostFields, latestCostFor, nextPeriodAfter,
} from './employee-cost.model';

function row(id: number, email: string, dateDebut: string, dateFin: string): EmployeeCostDto {
  return {
    id, employeeEmail: email, userRefId: null, fullName: null,
    basicCost: 100, internalSellingCost: 110, externalSellingCost: 120, currency: 'EUR',
    dateDebut, dateFin, sourceStatus: null, createdAt: null, updatedAt: null,
  };
}

describe('latestCostFor', () => {
  const rows = [
    row(1, 'a@x.com', '2025-01-01', '2025-12-31'),
    row(2, 'a@x.com', '2026-01-01', '2026-06-30'),
    row(3, 'b@x.com', '2026-03-01', '2026-12-31'),
  ];

  it('returns the row with the latest dateDebut for that email', () => {
    expect(latestCostFor(rows, 'a@x.com')?.id).toBe(2);
  });

  it('matches the email case-insensitively', () => {
    expect(latestCostFor(rows, 'A@X.COM')?.id).toBe(2);
  });

  it('returns null for an unknown or empty email', () => {
    expect(latestCostFor(rows, 'c@x.com')).toBeNull();
    expect(latestCostFor(rows, '')).toBeNull();
  });

  it('breaks a dateDebut tie on the highest id', () => {
    const tie = [row(5, 'a@x.com', '2026-01-01', '2026-12-31'), row(7, 'a@x.com', '2026-01-01', '2026-12-31')];
    expect(latestCostFor(tie, 'a@x.com')?.id).toBe(7);
  });
});

describe('nextPeriodAfter', () => {
  it('starts the day after and ends on Dec 31 of the same year', () => {
    expect(nextPeriodAfter('2026-06-30')).toEqual({ dateDebut: '2026-07-01', dateFin: '2026-12-31' });
  });

  it('rolls over to the next year after a Dec 31 end', () => {
    expect(nextPeriodAfter('2026-12-31')).toEqual({ dateDebut: '2027-01-01', dateFin: '2027-12-31' });
  });

  it('handles month ends and leap years', () => {
    expect(nextPeriodAfter('2028-02-28')).toEqual({ dateDebut: '2028-02-29', dateFin: '2028-12-31' });
    expect(nextPeriodAfter('2026-01-31')).toEqual({ dateDebut: '2026-02-01', dateFin: '2026-12-31' });
  });
});

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
