export interface CostReminderRule {
  id:           number;
  paysId:       number | null;
  scope:        string;
  code:         string;
  labelFr:      string;
  labelEn:      string;
  offsetDays:   number;
  roles:        string[];
  emailSubject: string | null;
  emailBody:    string | null;
  sortOrder:    number;
  isActive:     boolean;
  inUse:        boolean;
  updatedAt:    string | null;
}

export interface SaveCostReminderRuleRequest {
  paysId?:       number | null;
  code:          string;
  labelFr:       string;
  labelEn:       string;
  offsetDays:    number;
  roles?:        string[];
  emailSubject?: string | null;
  emailBody?:    string | null;
  sortOrder?:    number;
  isActive?:     boolean;
}

export const COST_REMINDER_TEMPLATE_TOKENS = [
  '{invoice}', '{supplier}', '{dueDate}', '{amount}', '{currency}', '{daysLate}',
] as const;
