import type { PageResponse } from '../affaires/affaire.model';
export type { PageResponse };

export interface ClientListItemDto {
  id:                number;
  clientCode:        string;
  clientName:        string;
  /** Le pays du CLIENT (adresse) — à ne pas confondre avec l'entité qui le facture. */
  countryId:         number | null;
  countryLabel:      string | null;
  sector:            string | null;
  paymentTermsDays:  number | null;
  defaultCurrency:   string | null;
  isKycDone:         boolean;
  isActive:          boolean;
  activeAffaireCount:number;
  totalCA:           number;
}

export interface ClientDetailDto {
  id:                number;
  paysId:            number;
  paysLabel:         string | null;
  clientCode:        string;
  clientName:        string;
  countryId:         number | null;
  countryLabel:      string | null;
  taxId:             string | null;
  paymentTermsDays:  number | null;
  defaultCurrency:   string | null;
  isKycDone:         boolean;
  isActive:          boolean;
  address:           string | null;
  city:              string | null;
  postalCode:        string | null;
  website:           string | null;
  sector:            string | null;
  notes:             string | null;
  kycApprovedByName: string | null;
  kycApprovedAt:     string | null;
  activeAffaireCount:number;
  createdAt:         string | null;
  updatedAt:         string | null;
}

export interface ClientDropdownItemDto {
  id:               number;
  clientCode:       string;
  clientName:       string;
  isKycDone:        boolean;
  defaultCurrency:  string | null;
  paymentTermsDays: number | null;
}

export interface ClientStatsDto {
  clientId:                number;
  clientName:              string;
  totalAffaires:           number;
  activeAffaires:          number;
  totalInvoiced:           number;
  totalPaid:               number;
  pendingAmount:           number;
  averagePaymentDelayDays: number | null;
  lastActivityDate:        string | null;
}

export interface CreateClientRequest {
  paysId:            number;
  clientCode?:       string | null;
  clientName:        string;
  countryId?:        number | null;
  taxId?:            string | null;
  paymentTermsDays?: number | null;
  defaultCurrency?:  string | null;
  address?:          string | null;
  city?:             string | null;
  postalCode?:       string | null;
  website?:          string | null;
  sector?:           string | null;
  notes?:            string | null;
  /**
   * Contacts créés AVEC le client, dans la même transaction. AU MOINS UN à la création :
   * le contact principal est désormais la seule source d'un destinataire de facture,
   * les colonnes héritées de `clients` ayant été supprimées (V72). Le serveur refuse une
   * liste vide en création (`@NotEmpty`).
   *
   * Ignoré par le PATCH de
   * modification : passé le premier enregistrement, les contacts ont leurs propres
   * endpoints (`/clients/{id}/contacts`).
   */
  contacts?: {
    fullName:  string;
    fonction:  string | null;
    email:     string | null;
    phone:     string | null;
    isPrimary: boolean;
  }[];
}

export interface ClientFilter {
  paysId?:    number;
  search?:    string | null;
  isActive?:  boolean | null;
  isKycDone?: boolean | null;
  sector?:    string | null;
  page?:      number;
  size?:      number;
}
