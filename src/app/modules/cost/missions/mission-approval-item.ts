import { BadgeVariant } from '@khalilrebhiitec/daf360';
import { MissionDto, MissionScope } from './mission-approval.service';
import { currencyFractionDigits } from '../../../shared/currency-decimals.util';

/**
 * The one shape both views of `/finance/cost/missions` render, mirroring `ApprovalItem` on
 * the cost-approval queue next door: the card grid, the table and the filters all read
 * this, so they cannot drift apart the way two near-identical template blocks do.
 */
export interface MissionApprovalMetric {
  label: string;
  value: string;
}

export interface MissionApprovalItem {
  id: number;
  /** Traveller — the card title and the table's identity column. */
  employee: string;
  /** Subject of the mission — the second identity line. */
  title: string;
  destination: string;
  scope: MissionScope;
  periodLabel: string;
  /** Who validated it on the RH side, which is who finance asks when the sheet is odd. */
  validatedBy: string;
  amountLabel: string;
  /** Sortable/filterable figure behind {@link amountLabel}. */
  amount: number;
  urgency: MissionUrgency;
  metrics: MissionApprovalMetric[];
  mission: MissionDto;
}

/**
 * How pressing the decision is. Deliberately derived from the DEPARTURE DATE and not from
 * an approval level: a mission has no level, and what makes one urgent is that the person
 * flies soon — a ticket unapproved three days out is a ticket that gets cancelled.
 */
export type MissionUrgency = 'urgent' | 'soon' | 'normal';

export const MISSION_URGENCY_VARIANT: Record<MissionUrgency, BadgeVariant> = {
  urgent: 'danger',
  soon:   'warning',
  normal: 'neutral',
};

export function missionUrgencyKey(urgency: MissionUrgency): string {
  return `FACTURATION.MISSIONS.URGENCY_${urgency.toUpperCase()}`;
}

/** ≤ 3 days out (or already started) is urgent, ≤ 10 is soon. */
export function missionUrgency(days: number): MissionUrgency {
  if (days <= 3) return 'urgent';
  if (days <= 10) return 'soon';
  return 'normal';
}

export const MISSION_SCOPE_VARIANT: Record<MissionScope, BadgeVariant> = {
  NATIONAL:      'info',
  INTERNATIONAL: 'secondary',
};

export function missionScopeKey(scope: MissionScope): string {
  return `FACTURATION.MISSIONS.SCOPE_${scope}`;
}

/**
 * The BCP-47 tag for the active UI language — the same en-GB / fr-FR mapping the rest of
 * the finance app uses. It matters: the formatters below were hard-wired to fr-FR, so an
 * English UI printed "14 sept. 2026" under an English label.
 */
export function localeOf(lang: string | null | undefined): string {
  return lang === 'en' ? 'en-GB' : 'fr-FR';
}

/** Whole days between today and the departure. Negative once the mission has started. */
export function daysUntil(startIso: string, today = new Date()): number {
  const [y, m, d] = (startIso ?? '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return 0;
  const start = new Date(y, m - 1, d).getTime();
  const ref = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((start - ref) / 86_400_000);
}

/**
 * The amount in ITS OWN currency, never through `DisplayCurrencyPipe`: the finance
 * currency switcher converts affaire amounts, and converting the figure being approved
 * would validate a number that is neither what RH entered nor what the employee receives.
 */
export function missionAmountLabel(mission: MissionDto, locale = 'fr-FR'): string {
  const value = mission.expenses?.totalEstimatedCost;
  if (value === null || value === undefined) return '—';
  const currency = mission.expenses?.currency;
  const digits = currencyFractionDigits(currency);
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(value);
  return currency ? `${formatted} ${currency}` : formatted;
}

export function missionDestination(mission: MissionDto): string {
  return mission.countryLabel ? `${mission.city}, ${mission.countryLabel}` : mission.city;
}

export function missionDate(iso: string | null, locale = 'fr-FR'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}
