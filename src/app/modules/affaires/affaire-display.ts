import { BadgeVariant } from '@khalilrebhiitec/daf360';
import { AffaireListItem, TYPE_LABELS } from './affaire.model';

/**
 * Single source of truth for how an affaire is *displayed*.
 *
 * The card grid, the table and the KPI row all read from here, so the same affaire
 * can never be badged one way in the list and another way in the cards — which is
 * exactly what the two hand-rolled status maps in the old `app-affaire-table` did
 * (a `statutBadgeCfg` returning raw hex for the cards, a chain of `@if`s writing
 * `.statut-badge--*` SCSS classes for the table rows).
 */

/** Badge variant for `daf-data-table`'s `type: 'badge'` column. */
export const STATUT_BADGE_VARIANT: Record<string, BadgeVariant> = {
  DRAFT:     'neutral',
  EN_COURS:  'success',
  SUSPENDUE: 'warning',
  CLOTUREE:  'secondary',
  ARCHIVEE:  'neutral',
};

/**
 * `daf-entity-card`'s status slot has exactly three looks, hard-coded in the lib:
 * `'inactive'` → grey, `'pending'` → warning, anything else → green (UI-PLAYBOOK §6).
 * Five affaire states therefore collapse onto three, and the precision lives in
 * `statusLabel`, which overrides the visible text entirely.
 */
export const STATUT_ENTITY_STATUS: Record<string, 'active' | 'inactive' | 'pending'> = {
  DRAFT:     'pending',
  EN_COURS:  'active',
  SUSPENDUE: 'pending',
  CLOTUREE:  'inactive',
  ARCHIVEE:  'inactive',
};

/** How healthy the remaining-to-invoice figure is, relative to the affaire's own threshold. */
export type RafTone = 'ok' | 'warn' | 'danger' | 'unknown';

export function rafTone(a: AffaireListItem): RafTone {
  if (!a.budgetPrevisionnel || a.rafDisponible == null) return 'unknown';
  const pct = (a.rafDisponible / a.budgetPrevisionnel) * 100;
  if (pct > 20)                  return 'ok';
  if (pct > a.rafAlerteSeuilPct) return 'warn';
  return 'danger';
}

/**
 * Complete literal classes, never assembled at runtime (UI-PLAYBOOK §3) — and lib
 * tokens rather than the `#006c49` / `#f59e0b` / `#ba1a1a` hexes the old table
 * pushed through `[style.color]`.
 */
export const RAF_TONE_CLASS: Record<RafTone, string> = {
  ok:      'text-success',
  warn:    'text-warning',
  danger:  'text-danger',
  unknown: 'text-on-surface-variant',
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '—';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
}
