import { BadgeVariant } from '@khalilrebhiitec/daf360';
import { AffaireListItem, AffaireResponsable, TYPE_LABELS } from './affaire.model';

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

/**
 * Les responsables de l'affaire, UNE ENTRÉE PAR PERSONNE, principal en tête.
 *
 * `affaire_responsables` porte une ligne par couple (personne, activité) depuis V26 :
 * compter les lignes ferait « et 4 autres » là où il n'y a que deux personnes portant
 * deux activités chacune. L'ordre du serveur est conservé (`is_primary DESC, added_at`),
 * donc la première entrée est bien le responsable principal.
 *
 * Repli sur `responsableFullName` quand la table est vide : une affaire créée avant V18
 * — ou par l'écran de création simple, qui n'écrit que `responsable_user_id` — n'a
 * aucune ligne de jointure, et la fiche ne doit pas pour autant afficher « — ».
 */
export function distinctResponsables(a: AffaireListItem): AffaireResponsable[] {
  const rows = a.responsables ?? [];
  if (!rows.length) {
    return a.responsableFullName
      ? [{
          id: -1, userId: a.responsableUserId ?? -1, fullName: a.responsableFullName,
          isPrimary: true, role: null, activiteId: null, activiteLabel: null,
          disciplineId: null, disciplineLabel: null,
          budgetAllocation: null, budgetCurrency: null,
        }]
      : [];
  }
  const seen = new Set<number>();
  return rows.filter(r => {
    if (seen.has(r.userId)) return false;
    seen.add(r.userId);
    return true;
  });
}

/**
 * « John Doe » seul, « John Doe et 3 autres » à plusieurs — le format des cartes et de
 * la colonne responsable, où il n'y a pas la place d'énumérer.
 *
 * `translate` est passé plutôt qu'injecté : ce fichier est un module de présentation
 * pur, sans dépendance Angular (c'est ce qui permet aux trois vues de le partager).
 */
export function responsablesSummary(
  a: AffaireListItem,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  const people = distinctResponsables(a);
  if (!people.length)      return '—';
  if (people.length === 1) return people[0].fullName;
  return t('AFFAIRES.LIST.TABLE.CARD.MANAGERS_MORE', {
    name:  people[0].fullName,
    count: people.length - 1,
  });
}

export function initials(name: string | null | undefined): string {
  if (!name) return '—';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
}
