import type { PageResponse } from '../affaires/affaire.model';
export type { PageResponse };

/**
 * Contrat réel de `SupplierDto` (module `cost` côté service), champ pour champ.
 *
 * Deux champs ont été retirés parce qu'ils n'existent nulle part côté serveur :
 * `tvaUniqueActive` et `notes`. Le `SupplierDto` Java ne les porte pas, le
 * `CreateSupplierRequest` Java ne les accepte pas — Jackson les jetait silencieusement à
 * la création. L'assistant les affichait pourtant : une bascule « TVA unique » et un
 * champ « Notes » qui n'écrivaient rien, et une fiche qui rendait un bloc
 * `@if (s.tvaUniqueActive)` toujours faux.
 *
 * Les noms sont en anglais — ceux du DTO Java, pas du français des autres modules.
 */
export interface SupplierDto {
  id:                  number;
  paysId:              number | null;
  name:                string;
  supplierCode:        string | null;
  country:             string | null;
  taxId:               string | null;
  isIntercompany:      boolean | null;
  intercompanyPaysId:  number | null;
  isActive:            boolean;
  createdAt:           string | null;
  /** Code généré, p. ex. `"FR-0001"` (D3-121). */
  code:                string | null;
  numeroTva:           string | null;
  /** Toujours masqué. L'IBAN complet passe par `revealIban()` (D3-122). */
  ibanMasked:          string | null;
  paysCode:            string | null;
  paysLabel:           string | null;
}

/**
 * Statistiques du référentiel, calculées côté client sur `GET /suppliers?paysId=`.
 *
 * ⚠️ Cet endpoint renvoie `findByPaysIdAndIsActiveTrue…` : **uniquement les actifs**.
 * L'ancien trio `{ total, active, pendingValidation }` était donc dégénéré —
 * `active === total` par construction et `pendingValidation` valait toujours 0, ce qui
 * donnait une tuile « En attente de validation » figée à zéro sur toutes les entités.
 * Les compteurs ci-dessous ne portent que sur ce que la réponse contient vraiment.
 */
export interface SupplierStatsDto {
  /** Fournisseurs actifs — le référentiel utilisable, pas le référentiel total. */
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
  paysId:          number;
  name:            string;
  supplierCode?:   string;
  country?:        string;
  taxId?:          string;
  isIntercompany?: boolean;
  numeroTva?:      string;
  iban?:           string;
  paysCode?:       string;
  paysLabel?:      string;
}
