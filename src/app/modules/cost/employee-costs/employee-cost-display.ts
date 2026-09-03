import { BadgeVariant } from '@khalilrebhiitec/daf360';
import { EmployeeCostDto } from './employee-cost.model';

/**
 * Single source of truth for how an employee cost row is *displayed* — same reasoning
 * as ../cost-display.ts: colour comes from badge variants rather than inline hex, every
 * label goes through an i18n key, and the two i18n keys used here (STATUS_ACTIVE /
 * STATUS_EXPIRED) are the ones already shipped in en/fr — this file only centralises how
 * they're picked, it doesn't rename them.
 */

export const STATUS_BADGE_VARIANT: Record<'Current' | 'Expired', BadgeVariant> = {
  Current: 'teal',
  Expired: 'neutral',
};

/** `daf-entity-card`'s status slot only knows 'active' | 'inactive' | 'pending' —
 * there is no "pending" concept for an employee cost, so it's a straight two-way map. */
export const STATUS_ENTITY_STATUS: Record<'Current' | 'Expired', 'active' | 'inactive'> = {
  Current: 'active',
  Expired: 'inactive',
};

export function statusKey(status: string | null): string {
  if (status === 'Current') return 'COST.EMPLOYEE_COST.STATUS_ACTIVE';
  if (status === 'Expired') return 'COST.EMPLOYEE_COST.STATUS_EXPIRED';
  return '';
}

/** The name shown everywhere a row identifies its person: the referential's full name
 * when we have one, the login email otherwise (the only case being a row whose
 * `user_ref_id` never resolved — see EmployeeCostService.resolveCurrentCost). */
export function displayName(row: EmployeeCostDto): string {
  return row.fullName?.trim() || row.employeeEmail;
}

export function initials(text: string | null | undefined): string {
  if (!text) return '—';
  return text.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

export function formatDate(date: string | null): string {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return date;
  }
}

export function formatPeriod(dateDebut: string | null, dateFin: string | null): string {
  return `${formatDate(dateDebut)} – ${formatDate(dateFin)}`;
}

/** Plain grouped amount, no currency symbol: `employee_costs` carries no currency column
 * (unlike `CostLineDto`), so showing one here would be a guess `DisplayCurrencyPipe` can't
 * back up. */
export function formatAmount(value: number): string {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}
