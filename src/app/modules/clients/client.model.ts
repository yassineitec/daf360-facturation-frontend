import type { PageResponse } from '../affaires/affaire.model';
export type { PageResponse };

export interface ClientListItemDto {
  id:                number;
  clientCode:        string;
  clientName:        string;
  country:           string | null;
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
  country:           string | null;
  taxId:             string | null;
  paymentTermsDays:  number | null;
  defaultCurrency:   string | null;
  isKycDone:         boolean;
  isActive:          boolean;
  address:           string | null;
  city:              string | null;
  postalCode:        string | null;
  phone:             string | null;
  email:             string | null;
  website:           string | null;
  contactName:       string | null;
  contactEmail:      string | null;
  contactPhone:      string | null;
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
  country?:          string | null;
  taxId?:            string | null;
  paymentTermsDays?: number | null;
  defaultCurrency?:  string | null;
  address?:          string | null;
  city?:             string | null;
  postalCode?:       string | null;
  phone?:            string | null;
  email?:            string | null;
  website?:          string | null;
  contactName?:      string | null;
  contactEmail?:     string | null;
  contactPhone?:     string | null;
  sector?:           string | null;
  notes?:            string | null;
}

export interface ClientFilter {
  paysId:     number;          // required — backend @NotNull
  search?:    string | null;
  isActive?:  boolean | null;
  isKycDone?: boolean | null;
  sector?:    string | null;
  page?:      number;
  size?:      number;
}
