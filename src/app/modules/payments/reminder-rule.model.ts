/**
 * Contrat de `/api/fact/reminder-rules`, aligné sur `ReminderRuleDto`.
 *
 * Une règle est un palier de l'échéancier de recouvrement. Elle porte ce qui définit le
 * palier — quand il tombe, comment il s'appelle, qui il convoque — et non ce qui est
 * arrivé à une facture donnée : ça, c'est `ReminderDto`, qui référence la règle par son
 * `code`.
 */
export interface ReminderRule {
  id:           number;
  /** `null` = règle du groupe. Une règle d'entité remplace celle du groupe, même code. */
  paysId:       number | null;
  /** `GROUPE` ou le libellé de l'entité — dérivé côté serveur. */
  scope:        string;
  /**
   * Clé technique écrite dans `payment_reminders.reminder_type`. Immuable dès qu'une
   * relance la porte (`inUse`) : la renommer orphelinerait l'historique.
   */
  code:         string;
  labelFr:      string;
  labelEn:      string;
  /**
   * Décalage signé par rapport à l'échéance : -7 = avant, 0 = jour J, 120 = après.
   * Le nombre brut — la mise en forme (« J+30 » / « D+30 ») dépend de la langue et vit
   * dans `offsetLabel()` (`payments-display.ts`).
   */
  offsetDays:   number;
  /** Valeurs de `users_ref.role_name` : c'est sur cette colonne que le planificateur résout les adresses. */
  roles:        string[];
  notifyClient: boolean;
  emailSubject: string | null;
  emailBody:    string | null;
  sortOrder:    number;
  isActive:     boolean;
  /** Des relances portent déjà ce code — le code est verrouillé et la règle non supprimable. */
  inUse:        boolean;
  updatedAt:    string | null;
}

export interface SaveReminderRuleRequest {
  paysId?:       number | null;
  code:          string;
  labelFr:       string;
  labelEn:       string;
  offsetDays:    number;
  roles?:        string[];
  notifyClient?: boolean;
  emailSubject?: string | null;
  emailBody?:    string | null;
  sortOrder?:    number;
  isActive?:     boolean;
}

/**
 * Jetons acceptés dans les gabarits de message, substitués par le planificateur.
 * Listés ici pour que l'écran d'administration les propose au lieu de les faire deviner.
 */
export const REMINDER_TEMPLATE_TOKENS = [
  '{invoice}', '{client}', '{dueDate}', '{amount}', '{currency}', '{daysLate}',
] as const;
