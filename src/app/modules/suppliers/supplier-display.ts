import { BadgeVariant } from '@khalilrebhiitec/daf360';
import { SupplierDto } from './supplier.model';

/**
 * Source unique de la façon dont un fournisseur est *affiché*, partagée par la liste en
 * cartes, la liste en tableau et la fiche.
 *
 * Les trois vues peignaient auparavant le même état trois fois et différemment : la
 * table via `activeBadgeOptions()` (`success` / `danger`), la liste mobile via deux
 * classes SCSS `.mob-row__statut--active/--inactive` avec leurs propres couleurs, et la
 * fiche via un `<span class="material-symbols-outlined text-success">verified</span>`.
 * Un seul de ces trois endroits changeait quand la règle changeait.
 */

export type SupplierState = 'active' | 'inactive';

export function supplierState(s: SupplierDto): SupplierState {
  return s.isActive ? 'active' : 'inactive';
}

/** Pastille de la table et de l'en-tête de fiche. */
export const SUPPLIER_STATE_BADGE: Record<SupplierState, BadgeVariant> = {
  active:   'success',
  inactive: 'danger',
};

/**
 * `daf-entity-card` n'a que trois looks pour son emplacement de statut, codés dans la
 * lib : `'inactive'` → gris, `'pending'` → warning, tout le reste → vert (UI-PLAYBOOK
 * §6). Un fournisseur n'a que deux états, la traduction est donc directe.
 */
export const SUPPLIER_STATE_ENTITY: Record<SupplierState, 'active' | 'inactive'> = {
  active:   'active',
  inactive: 'inactive',
};

export const SUPPLIER_STATE_LABEL: Record<SupplierState, string> = {
  active:   'SUPPLIERS.LIST.STATUS_ACTIVE',
  inactive: 'SUPPLIERS.LIST.STATUS_INACTIVE',
};

/** Le code lisible du fournisseur, avec le repli qu'utilisaient déjà les trois vues. */
export function supplierCode(s: SupplierDto): string {
  return s.code ?? s.supplierCode ?? `S-${s.id}`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '—';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}
