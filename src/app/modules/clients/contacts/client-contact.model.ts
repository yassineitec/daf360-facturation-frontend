/**
 * Un client a plusieurs contacts ; chaque contact appartient à UN client et se
 * rattache ensuite à plusieurs affaires de ce client.
 *
 * `fonction` est du TEXTE LIBRE (« Contact finance », « Ingénierie »,
 * « Administratif ») : c'est un libellé saisi, pas une nomenclature. Rien ne doit
 * s'y brancher — le destinataire des factures est désigné par `isBilling` sur le
 * rattachement à l'affaire.
 */
export interface ClientContactDto {
  id:           number;
  clientId:     number;
  fullName:     string;
  fonction:     string | null;
  email:        string | null;
  phone:        string | null;
  /** L'interlocuteur principal DU CLIENT — au plus un. */
  isPrimary:    boolean;
  isActive:     boolean;
  notes:        string | null;
  /** Nombre d'affaires qui l'utilisent : ce qui explique un refus de désactivation. */
  affaireCount: number;
  createdAt:    string | null;
  updatedAt:    string | null;
}

export interface SaveClientContactRequest {
  fullName:   string;
  fonction?:  string | null;
  email?:     string | null;
  phone?:     string | null;
  isPrimary?: boolean | null;
  notes?:     string | null;
}

/**
 * Une ligne de l'éditeur de contacts. `id` est absent tant que le contact n'a pas
 * été enregistré : à la CRÉATION d'un client, les contacts partent dans la même
 * requête que le client (il n'y a pas encore d'id de client à qui les rattacher).
 */
export interface ContactDraft {
  id?:       number;
  fullName:  string;
  fonction:  string;
  email:     string;
  phone:     string;
  isPrimary: boolean;
}

export function emptyContactDraft(isPrimary = false): ContactDraft {
  return { fullName: '', fonction: '', email: '', phone: '', isPrimary };
}

export function toContactDraft(c: ClientContactDto): ContactDraft {
  return {
    id:        c.id,
    fullName:  c.fullName ?? '',
    fonction:  c.fonction ?? '',
    email:     c.email    ?? '',
    phone:     c.phone    ?? '',
    isPrimary: c.isPrimary,
  };
}

/** Un contact tel que rattaché à une affaire. `isBilling` vient du rattachement. */
export interface AffaireContactDto {
  contactId: number;
  fullName:  string;
  fonction:  string | null;
  email:     string | null;
  phone:     string | null;
  isBilling: boolean;
  isActive:  boolean;
}

export interface ConfigureContactsRequest {
  contacts: { contactId: number; isBilling: boolean }[];
}
