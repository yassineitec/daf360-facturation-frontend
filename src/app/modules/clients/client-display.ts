import type { BadgeVariant } from '@khalilrebhiitec/daf360';
import { ClientListItemDto } from './client.model';

/**
 * Source unique de la manière dont un client est **présenté**, sur le modèle de
 * `affaire-display.ts`.
 *
 * Les deux vues de la liste (cartes et tableau) et la fiche client lisent d'ici, donc un
 * client ne peut pas être badgé d'une façon dans les cartes et d'une autre dans le
 * tableau — c'est exactement ce qui arrivait aux affaires avant que ce fichier n'existe
 * de leur côté.
 */

/**
 * L'état d'un client tient en DEUX drapeaux (`isActive`, `isKycDone`) pour une seule
 * pastille. L'exception l'emporte (UI-PLAYBOOK §6) : inactif d'abord, puis KYC.
 */
export type ClientState = 'INACTIVE' | 'KYC_DONE' | 'KYC_PENDING';

export function clientState(c: Pick<ClientListItemDto, 'isActive' | 'isKycDone'>): ClientState {
  if (!c.isActive) return 'INACTIVE';
  return c.isKycDone ? 'KYC_DONE' : 'KYC_PENDING';
}

/** Clé i18n du libellé d'état — jamais de texte en dur. */
export const CLIENT_STATE_LABEL: Record<ClientState, string> = {
  INACTIVE:    'CLIENTS.LIST.CARD.INACTIVE',
  KYC_DONE:    'CLIENTS.LIST.CARD.KYC_DONE',
  KYC_PENDING: 'CLIENTS.LIST.CARD.KYC_PENDING',
};

/** Variante de pastille pour la colonne `type: 'badge'` de `daf-data-table`. */
export const CLIENT_STATE_BADGE: Record<ClientState, BadgeVariant> = {
  INACTIVE:    'neutral',
  KYC_DONE:    'success',
  KYC_PENDING: 'warning',
};

/**
 * `daf-entity-card` n'a que trois allures pour sa pastille d'état — `'inactive'` gris,
 * `'pending'` ambre, tout le reste vert. Les trois états du client s'y projettent donc
 * directement, la précision restant portée par `statusLabel`.
 */
export const CLIENT_STATE_ENTITY: Record<ClientState, 'active' | 'inactive' | 'pending'> = {
  INACTIVE:    'inactive',
  KYC_DONE:    'active',
  KYC_PENDING: 'pending',
};

export function initials(name: string | null | undefined): string {
  if (!name) return '—';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}
