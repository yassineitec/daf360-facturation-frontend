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
