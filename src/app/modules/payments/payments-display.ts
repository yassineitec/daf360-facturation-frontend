import { BadgeVariant } from '@khalilrebhiitec/daf360';
import { AgingRow } from './payment.model';

/**
 * Single source of truth for how an unpaid invoice is *displayed* on
 * `/finance/payments`.
 *
 * It replaces `agingRowColor()` in `payment.model.ts`, which returned raw hex
 * (`#fef3c7` / `#ffedd5` / `#fee2e2`) that the table painted onto a `.row-bg` wrapper
 * div **inside every one of the seven cells** — a hand-rolled row tint that the lib's
 * table has no concept of, duplicated seven times per row, and invisible for the two
 * lowest tiers since they returned `''`. The severity now lives in the `joursRetard`
 * badge variant alone, which already carried it.
 */

/** Aging severity, from the invoice's own days-late count. */
export function retardVariant(joursRetard: number): BadgeVariant {
  if (joursRetard > 60) return 'danger';
  if (joursRetard > 30) return 'warning';
  return 'neutral';
}

/** Complete literal classes (UI-PLAYBOOK §3), for the card's days-late figure. */
export function retardToneClass(joursRetard: number): string {
  if (joursRetard > 60) return 'text-danger';
  if (joursRetard > 30) return 'text-warning';
  return 'text-on-surface-variant';
}

/**
 * i18n key for a reminder type. The five labels used to be a hardcoded **French**
 * `Record` in the component even though `PAYMENTS.DASHBOARD.REMINDER.*` already
 * existed in fr and en.
 */
export function reminderLabelKey(type: string | null): string | null {
  return type ? `PAYMENTS.DASHBOARD.REMINDER.${type}` : null;
}

export function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function initials(name: string | null | undefined): string {
  if (!name) return '—';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

/** An invoice past its due date — the only urgency cue an entity-card can carry (§6). */
export function isLate(row: AgingRow): boolean {
  return row.joursRetard > 0;
}
