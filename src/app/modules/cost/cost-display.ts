import { BadgeVariant } from '@khalilrebhiitec/daf360';
import { CostLineDto } from './cost.model';

/**
 * Single source of truth for how a cost line is *displayed*.
 *
 * `COST_STATUS_CONFIG` in `cost.model.ts` carries a hardcoded **French** `label` plus a
 * raw `bg`/`text` hex pair per status, and `APPROVAL_LEVEL_CONFIG` does the same for the
 * four levels — even though `COST.STATUS.*`, `COST.APPROVAL.LEVEL_*` and `COST.URGENCY.*`
 * have existed in fr and en the whole time. Everything here goes through the keys, so the
 * page finally responds to a language switch, and colour comes from badge variants rather
 * than inline hex (UI-PLAYBOOK §4).
 */

export const STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  DRAFT:     'neutral',
  SUBMITTED: 'info',
  RETURNED:  'warning',
  APPROVED:  'success',
  VALIDATED: 'success',
  POSTED:    'secondary',
  CANCELLED: 'danger',
  REJECTED:  'danger',
};

/**
 * `daf-entity-card`'s status slot has three looks: `'inactive'` → grey, `'pending'` →
 * warning, anything else → green (UI-PLAYBOOK §6). Eight statuses collapse onto three,
 * and the precision stays in `statusLabel`.
 */
export const STATUS_ENTITY_STATUS: Record<string, 'active' | 'inactive' | 'pending'> = {
  DRAFT:     'inactive',
  CANCELLED: 'inactive',
  REJECTED:  'inactive',
  SUBMITTED: 'pending',
  RETURNED:  'pending',
  APPROVED:  'active',
  VALIDATED: 'active',
  POSTED:    'active',
};

export function statusKey(status: string): string {
  return `COST.STATUS.${status}`;
}

export function approvalLevelKey(level: string | null): string | null {
  return level ? `COST.APPROVAL.LEVEL_${level}` : null;
}

export const APPROVAL_BADGE_VARIANT: Record<string, BadgeVariant> = {
  L1: 'neutral',
  L2: 'info',
  L3: 'warning',
  L4: 'danger',
};

/** How urgent an approval is, from the level the line requires. */
export type Urgency = 'low' | 'normal' | 'urgent';

export function urgency(level: string | null): Urgency {
  if (!level || level === 'L1') return 'low';
  if (level === 'L2')           return 'normal';
  return 'urgent';
}

export function urgencyKey(level: string | null): string {
  return `COST.URGENCY.${urgency(level).toUpperCase()}`;
}

export const URGENCY_BADGE_VARIANT: Record<Urgency, BadgeVariant> = {
  low:    'neutral',
  normal: 'info',
  urgent: 'danger',
};

/** A line the current user may still edit or submit — DRAFT and RETURNED only. */
export function canEdit(line: CostLineDto): boolean {
  return line.status === 'DRAFT' || line.status === 'RETURNED';
}
export const canSubmit = canEdit;

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

export function initials(text: string | null | undefined): string {
  if (!text) return '—';
  return text.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}
