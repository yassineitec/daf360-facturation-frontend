import { BadgeVariant } from '@khalilrebhiitec/daf360';
import { OSTDto, ostBudgetPct, ostIsOver } from './subcontracting.model';

/**
 * Single source of truth for how a sous-traitant and an ordre ST are *displayed*.
 *
 * It replaces `statColor()` in the ordres tab, which returned three raw hex triples
 * (`{ bg, color, border }`) painted through `[style]` bindings, and the duplicated
 * `.status-chip--*` rules in the tab SCSS.
 */

/** Badge variant for an OST status. */
export const OST_BADGE_VARIANT: Record<string, BadgeVariant> = {
  EN_COURS: 'teal',
  SUSPENDU: 'warning',
  CLOTURE:  'neutral',
};

/**
 * `daf-entity-card`'s status slot has three looks: `'inactive'` → grey, `'pending'` →
 * warning, anything else → green (UI-PLAYBOOK §6). The precision stays in `statusLabel`.
 */
export const OST_ENTITY_STATUS: Record<string, 'active' | 'inactive' | 'pending'> = {
  EN_COURS: 'active',
  SUSPENDU: 'pending',
  CLOTURE:  'inactive',
};

/** i18n key for an OST status — replaces the hardcoded-French `OST_STATUT_LABELS`. */
export function ostStatutKey(statut: string): string {
  return `SUBCONTRACTING.OST.STATUT.${statut}`;
}

export const budgetPct = ostBudgetPct;
export const isOver    = ostIsOver;

/**
 * Consumption tone for an ordre's budget bar. `daf-progress-bar` gained a `tertiary`
 * variant in 4.9.0 and that is the "on track" fill everywhere now (§4).
 */
export function budgetVariant(ost: OSTDto): 'tertiary' | 'warning' | 'danger' {
  if (isOver(ost))            return 'danger';
  if (budgetPct(ost) >= 80)   return 'warning';
  return 'tertiary';
}

export function initials(name: string | null | undefined): string {
  if (!name) return '—';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

export function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
