import { BadgeVariant } from '@khalilrebhiitec/daf360';
import { InvoiceListItem, OVERDUE_STATUTS } from './invoice.model';

/**
 * Single source of truth for how an invoice is *displayed* and which quick actions
 * its status allows.
 *
 * The status→variant map used to live in the list component while the *colours* for
 * the same statuses lived as raw hex in `INVOICE_STATUT_CONFIG` (`bg`/`color`/`border`)
 * and again as `.badge--*` rules in the page SCSS — three places that could disagree.
 * Only the `label` of `INVOICE_STATUT_CONFIG` is still used; its three colour fields
 * are dead for the list.
 */
export const STATUT_BADGE_VARIANT: Record<string, BadgeVariant> = {
  DRAFT:          'neutral',
  SUBMITTED:      'info',
  RETURNED:       'warning',
  APPROVED:       'secondary',
  EMITTED:        'teal',
  SENT:           'success',
  PARTIALLY_PAID: 'warning',
  PAID:           'success',
  DISPUTED:       'danger',
  CANCELLED:      'danger',
  CREDIT_NOTED:   'info',
};

/**
 * `daf-entity-card`'s status slot has exactly three looks, hard-coded in the lib:
 * `'inactive'` → grey, `'pending'` → warning, anything else → green (UI-PLAYBOOK §6).
 * Eleven invoice statuses therefore collapse onto three, and the precision lives in
 * `statusLabel`, which overrides the visible text entirely.
 *
 * Settled or on its way (`SENT`, `PAID`) reads green; anything closed without payment
 * reads grey; everything still in flight — including `DISPUTED`, which has no danger
 * look available here — reads warning. An overdue invoice is signalled separately, by
 * the red avatar tile and its "Retard" metric.
 */
export const STATUT_ENTITY_STATUS: Record<string, 'active' | 'inactive' | 'pending'> = {
  DRAFT:          'inactive',
  CANCELLED:      'inactive',
  CREDIT_NOTED:   'inactive',
  SENT:           'active',
  PAID:           'active',
  SUBMITTED:      'pending',
  RETURNED:       'pending',
  APPROVED:       'pending',
  EMITTED:        'pending',
  PARTIALLY_PAID: 'pending',
  DISPUTED:       'pending',
};

/** Statuses that count toward the "En attente" tile — emitted but not settled. */
export const PENDING_STATUTS = ['EMITTED', 'SENT', 'PARTIALLY_PAID'];

export function isOverdue(item: InvoiceListItem): boolean {
  if (!OVERDUE_STATUTS.has(item.statut)) return false;
  if (!item.dateEcheance) return false;
  return new Date(item.dateEcheance) < new Date();
}

export function overdueDays(item: InvoiceListItem): number {
  if (!item.dateEcheance) return 0;
  return Math.floor((Date.now() - new Date(item.dateEcheance).getTime()) / 86_400_000);
}

export function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function initials(name: string | null | undefined): string {
  if (!name) return '—';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

/**
 * Which quick action a row offers, derived from its status alone.
 *
 * These four transitions were already implemented on the list component
 * (`quickEmit`, `quickMarkSent`, `openPaymentModal`, `openApprovalModal`) but were
 * **unreachable**: the table's actions cell rendered a bare `more_vert` button with no
 * click handler and no menu behind it, so the payment and approval modals could never
 * open from this page. Encoding the rules here is what wires them back up.
 */
export function canApprove(item: InvoiceListItem): boolean  { return item.statut === 'SUBMITTED'; }
export function canEmit(item: InvoiceListItem): boolean     { return item.statut === 'APPROVED'; }
export function canMarkSent(item: InvoiceListItem): boolean { return item.statut === 'EMITTED'; }
export function canRecordPayment(item: InvoiceListItem): boolean {
  return PENDING_STATUTS.includes(item.statut);
}
