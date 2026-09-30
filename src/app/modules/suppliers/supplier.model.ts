import type { PageResponse } from '../affaires/affaire.model';
export type { PageResponse };

/**
 * Contrat réel de `SupplierDto` (module `cost` côté service), champ pour champ.
 *
 * `paysLabel` est résolu côté serveur depuis `paysId` (via `pays_ref`) : ce n'est
 * plus une colonne stockée. `typeLabel` suit le même principe pour `typeId`.
 */
export interface SupplierDto {
  id:         number;
  paysId:     number | null;
  name:       string;
  taxId:      string | null;
  isActive:   boolean;
  createdAt:  string | null;
  updatedAt:  string | null;
  /** Code généré, p. ex. `"FR-0001"` (D3-121). */
  code:       string | null;
  numeroTva:  string | null;
  iban:       string | null;
  paysLabel:  string | null;
  typeId:     number | null;
  typeLabel:  string | null;
  /** Libellé EN de la catégorie (repli serveur sur le FR). */
  typeLabelEn: string | null;
  /** Code de la catégorie — stable entre la valeur globale et son surcharge pays. */
  typeCode:   string | null;
}

/** Libellé de la catégorie d'un fournisseur dans la langue courante. */
export function supplierTypeLabel(s: SupplierDto, lang: string | null | undefined): string | null {
  return lang === 'en' ? (s.typeLabelEn || s.typeLabel) : s.typeLabel;
}

/**
 * Filtre de statut de `GET /suppliers/search?status=`.
 *
 * `ACTIVE` est le défaut serveur. `INACTIVE` et `ALL` existent parce qu'un
 * fournisseur désactivé était jusqu'ici introuvable depuis l'application : rien ne le
 * listait, rien ne le réactive, et son `code` restait pourtant pris.
 */
export type SupplierStatusFilter = 'ACTIVE' | 'INACTIVE' | 'ALL';

/**
 * Filtres optionnels de la liste, envoyés à `GET /suppliers/search` ET à
 * `GET /suppliers?paysId=` (les tuiles) : `typeId` = valeur SUPPLIER_CATEGORY,
 * `hasIban` / `hasTva` = true (renseigné) / false (manquant) ; absent = indifférent.
 */
export interface SupplierExtraFilter {
  typeId?:  number | null;
  hasIban?: boolean | null;
  hasTva?:  boolean | null;
}

/**
 * Statistiques du référentiel, calculées côté client sur `GET /suppliers?paysId=`.
 *
 * ⚠️ Cet endpoint renvoie `findByPaysIdAndIsActiveTrue…` : **uniquement les actifs**.
 */
export interface SupplierStatsDto {
  total:     number;
  withIban:  number;
  withTva:   number;
  countries: number;
}

/**
 * Charge utile de `POST /suppliers`, alignée sur le `CreateSupplierRequest` Java.
 * `paysId` et `name` sont les seuls champs obligatoires côté serveur.
 */
export interface CreateSupplierRequest {
  paysId:     number;
  name:       string;
  taxId?:     string;
  numeroTva?: string;
  iban?:      string;
  typeId?:    number;
}
