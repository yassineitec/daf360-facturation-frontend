/**
 * Turns the raw generic audit_trail payload (snake_case table name, JSON pk/old/new-value
 * strings) into something a non-developer can actually read, without a per-table backend
 * change: everything used here (labels aside) is derived from data the API already returns.
 */

/** Hand-picked French labels for the tables people actually look up. Anything not listed
 *  falls back to {@link humanizeTableName} -- good enough, never a raw snake_case dead end. */
const TABLE_LABELS: Record<string, string> = {
  affaire_contact_allocation: 'Affectations de contacts',
  affaire_contacts: 'Contacts affaire',
  affaire_disciplines: 'Disciplines affaire',
  affaire_events: 'Événements affaire',
  affaire_livrables: 'Livrables',
  affaire_responsables: 'Responsables affaire',
  affaire_ressources: 'Ressources affaire',
  affaire_seller_entities: 'Entités vendeuses',
  affaire_taux_avancement: "Taux d'avancement",
  affaires: 'Affaires',
  bank_reconciliation_imports: 'Imports rapprochement bancaire',
  bank_transactions: 'Transactions bancaires',
  billing_line_tm_details: 'Détails T&M',
  billing_lines: 'Lignes de facturation (WIP)',
  billing_lots: 'Lots de facturation',
  budget_lines: 'Lignes budgétaires',
  budget_references: 'Budgets de référence',
  client_contacts: 'Contacts client',
  clients: 'Clients',
  cost_approval_thresholds: "Seuils d'approbation",
  cost_attachments: 'Pièces jointes de coût',
  cost_categories: 'Catégories de coût',
  cost_category_legacy_map: 'Correspondance catégories (ancien)',
  cost_import_batches: "Lots d'import de coûts",
  cost_invoice_approvals: 'Approbations factures fournisseur',
  cost_invoice_attachments: 'Pièces jointes factures fournisseur',
  cost_invoice_changes: 'Historique factures fournisseur',
  cost_invoice_other_taxes: 'Autres taxes (factures fournisseur)',
  cost_invoice_reglements: 'Règlements factures fournisseur',
  cost_invoices: 'Factures fournisseur',
  cost_line_approvals: 'Approbations lignes de coût',
  cost_line_reglements: 'Règlements lignes de coût',
  cost_lines: 'Lignes de coût',
  cost_payment_reminder_rules: 'Règles de relance (coûts)',
  cost_payment_reminders: 'Relances de paiement (coûts)',
  couts_sous_traitance: 'Coûts de sous-traitance',
  dashboard_definitions: 'Définitions de tableaux de bord',
  dashboard_snapshots: 'Instantanés de tableaux de bord',
  disciplines_doc360: 'Disciplines',
  employee_costs: 'Coûts collaborateurs',
  expense_items: 'Notes de frais',
  fact_audit_log: "Journal d'audit (ancien)",
  fact_billing_audit_log: 'Journal de facturation (ancien)',
  fact_configurable_list_types: 'Types de listes configurables',
  fact_configurable_list_values: 'Valeurs de listes configurables',
  fact_document_templates: 'Maquettes de documents',
  group_catalogue_lines: 'Lignes de catalogue groupe',
  invoice_approvals: "Approbations de facture",
  invoice_line_carry_forward: 'Reports de ligne de facture',
  invoice_lines: 'Lignes de facture',
  invoice_sequences: 'Séquences de numérotation',
  invoice_templates: 'Modèles de facture',
  invoices: 'Factures',
  ordres_sous_traitance: 'Ordres de sous-traitance',
  parameter_sets: 'Jeux de paramètres',
  payment_reminder_rules: 'Règles de relance (clients)',
  payment_reminders: 'Relances de paiement (clients)',
  payments: 'Règlements',
  pays_ref: 'Référentiel pays',
  pl_period_edits: 'Corrections de clôture P&L',
  pl_periods: 'Clôtures P&L',
  pl_report_lines: 'Lignes de rapport P&L',
  pl_reports: 'Rapports P&L',
  rate_computation_lines: 'Lignes de calcul de taux',
  rate_computations: 'Calculs de taux',
  rate_formula_items: 'Éléments de formule de taux',
  salary_advance: 'Avances sur salaire',
  salary_advance_history: 'Historique avances sur salaire',
  salary_advance_installment: "Échéances d'avance",
  salary_advance_policy: "Politique d'avances",
  sous_traitants: 'Sous-traitants',
  submission_calendar: 'Calendrier de soumission',
  suppliers: 'Fournisseurs',
  timesheet_hours_billing: 'Heures facturables (timesheet)',
  travaux_supplementaires: 'Travaux supplémentaires (TS)',
  ts_taux_avancement: "Taux d'avancement TS",
  users_ref: 'Utilisateurs',
  variance_commentaries: 'Commentaires de variance',
  wip_email_templates: 'Modèles email WIP',
  wip_tm_hours: 'Heures T&M (WIP)',
};

export function tableLabel(tableName: string): string {
  return TABLE_LABELS[tableName] ?? humanizeTableName(tableName);
}

/** Which functional area a table belongs to -- coarser and more useful at a glance than the
 *  table name itself ("is this about an affaire, a cost, a payment, or just admin config?").
 *  Anything not listed falls back to 'Autre' rather than guessing. */
export type FunctionalDomain =
  | 'Affaire' | 'WIP / Avancement' | 'Facturation' | 'Coûts' | 'Sous-traitance'
  | 'Règlements' | 'Reporting' | 'Référentiel' | 'Administration' | 'Autre';

const TABLE_DOMAINS: Record<string, FunctionalDomain> = {
  affaires: 'Affaire', affaire_contacts: 'Affaire', affaire_contact_allocation: 'Affaire',
  affaire_disciplines: 'Affaire', affaire_events: 'Affaire', affaire_livrables: 'Affaire',
  affaire_responsables: 'Affaire', affaire_ressources: 'Affaire', affaire_seller_entities: 'Affaire',
  disciplines_doc360: 'Affaire', travaux_supplementaires: 'WIP / Avancement',

  affaire_taux_avancement: 'WIP / Avancement', ts_taux_avancement: 'WIP / Avancement',
  billing_lines: 'WIP / Avancement', billing_lots: 'WIP / Avancement',
  billing_line_tm_details: 'WIP / Avancement', timesheet_hours_billing: 'WIP / Avancement',
  wip_tm_hours: 'WIP / Avancement', wip_email_templates: 'WIP / Avancement',

  invoices: 'Facturation', invoice_lines: 'Facturation', invoice_approvals: 'Facturation',
  invoice_line_carry_forward: 'Facturation', invoice_sequences: 'Facturation',
  invoice_templates: 'Facturation', fact_billing_audit_log: 'Facturation',

  cost_approval_thresholds: 'Coûts', cost_attachments: 'Coûts', cost_categories: 'Coûts',
  cost_category_legacy_map: 'Coûts', cost_import_batches: 'Coûts', cost_invoice_approvals: 'Coûts',
  cost_invoice_attachments: 'Coûts', cost_invoice_changes: 'Coûts', cost_invoice_other_taxes: 'Coûts',
  cost_invoices: 'Coûts', cost_line_approvals: 'Coûts', cost_lines: 'Coûts',
  employee_costs: 'Coûts', expense_items: 'Coûts', group_catalogue_lines: 'Coûts',
  salary_advance: 'Coûts', salary_advance_history: 'Coûts', salary_advance_installment: 'Coûts',
  salary_advance_policy: 'Coûts',

  couts_sous_traitance: 'Sous-traitance', ordres_sous_traitance: 'Sous-traitance',
  sous_traitants: 'Sous-traitance',

  payments: 'Règlements', payment_reminder_rules: 'Règlements', payment_reminders: 'Règlements',
  cost_payment_reminder_rules: 'Règlements', cost_payment_reminders: 'Règlements',
  cost_invoice_reglements: 'Règlements', cost_line_reglements: 'Règlements',
  bank_reconciliation_imports: 'Règlements', bank_transactions: 'Règlements',

  budget_lines: 'Reporting', budget_references: 'Reporting', dashboard_definitions: 'Reporting',
  dashboard_snapshots: 'Reporting', pl_period_edits: 'Reporting', pl_periods: 'Reporting',
  pl_report_lines: 'Reporting', pl_reports: 'Reporting', rate_computation_lines: 'Reporting',
  rate_computations: 'Reporting', rate_formula_items: 'Reporting', variance_commentaries: 'Reporting',
  submission_calendar: 'Reporting',

  clients: 'Référentiel', client_contacts: 'Référentiel', suppliers: 'Référentiel',
  pays_ref: 'Référentiel', fact_configurable_list_types: 'Référentiel',
  fact_configurable_list_values: 'Référentiel',

  fact_document_templates: 'Administration', parameter_sets: 'Administration',
  fact_audit_log: 'Administration', sysdiagrams: 'Administration',
};

export function tableDomain(tableName: string): FunctionalDomain {
  return TABLE_DOMAINS[tableName] ?? 'Autre';
}

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'secondary' | 'neutral' | 'teal';

/** I/U/D -> the same create/update/delete colour convention as version control and every other
 *  audit log: green means something new exists, blue means something changed in place, red means
 *  something is gone. Reserved to the Action column only -- Domain deliberately avoids these three
 *  so a red "Suppression" badge next to a red domain badge never reads as two warnings at once. */
export function actionVariant(action: 'I' | 'U' | 'D'): BadgeVariant {
  return action === 'I' ? 'success' : action === 'D' ? 'danger' : 'info';
}

/** One colour family per functional area, grouped by what the area is about rather than
 *  assigned arbitrarily: project work (primary), money leaving the building (secondary), cost
 *  side (teal), everything support/admin (neutral). Same domain always gets the same colour. */
const DOMAIN_VARIANTS: Record<FunctionalDomain, BadgeVariant> = {
  'Affaire': 'primary',
  'WIP / Avancement': 'primary',
  'Facturation': 'secondary',
  'Règlements': 'secondary',
  'Coûts': 'teal',
  'Sous-traitance': 'teal',
  'Reporting': 'neutral',
  'Référentiel': 'neutral',
  'Administration': 'neutral',
  'Autre': 'neutral',
};

export function domainVariant(domain: FunctionalDomain): BadgeVariant {
  return DOMAIN_VARIANTS[domain];
}

/** The affaire a row belongs to, read straight from the row's own JSON -- works for the ~20
 *  tables that carry `affaire_id` directly (invoices, billing_lines, cost_lines, TS, WIP...),
 *  plus the `affaires` table itself (its own `id` IS the affaire). Tables that only reach an
 *  affaire indirectly (e.g. invoice_approvals -> invoice_id -> invoices.affaire_id) are not
 *  resolved in this version -- a one-hop join the generic mechanism doesn't attempt. */
export function rowAffaireId(entry: { tableName: string; pkJson: string; oldValue: string | null; newValue: string | null }): number | null {
  if (entry.tableName === 'affaires') {
    const pk = safeParse(entry.pkJson);
    const id = pk?.['id'];
    return typeof id === 'number' ? id : null;
  }
  const row = safeParse(entry.newValue) ?? safeParse(entry.oldValue);
  const id = row?.['affaire_id'];
  return typeof id === 'number' ? id : null;
}

function humanizeTableName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\p{L}/gu, c => c.toUpperCase());
}

/** Field names checked, in order, to find a human-meaningful label for a row -- taken from
 *  the row's own JSON (new_value, falling back to old_value on a delete), not a per-table
 *  lookup, so it works for every audited table without extra configuration. */
const IDENTITY_FIELD_CANDIDATES = [
  'reference', 'invoice_number', 'numero', 'number', 'code',
  'email', 'username', 'nom', 'name', 'libelle', 'label', 'intitule', 'titre', 'title',
];

function safeParse(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function formatPk(pkJson: string): string {
  const pk = safeParse(pkJson);
  if (!pk) return pkJson;
  return Object.entries(pk).map(([k, v]) => `${k} = ${v}`).join(', ');
}

/** The best short label this entry can offer for "which record": a meaningful field from the
 *  row itself when one exists, else the formatted primary key (never the raw {"id":30002} JSON). */
export function recordIdentity(entry: { pkJson: string; oldValue: string | null; newValue: string | null }): string {
  const row = safeParse(entry.newValue) ?? safeParse(entry.oldValue);
  if (row) {
    for (const key of IDENTITY_FIELD_CANDIDATES) {
      const value = row[key];
      if (value !== null && value !== undefined && String(value).trim() !== '') return String(value);
    }
  }
  return formatPk(entry.pkJson);
}

export interface FieldDiff {
  field: string;
  before: string;
  after: string;
  changed: boolean;
}

const NO_VALUE = '—';

function display(value: unknown): string {
  if (value === null || value === undefined) return NO_VALUE;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Field-by-field before/after for one entry -- INSERT shows every field as new (no "before"),
 *  DELETE shows every field as removed (no "after"), UPDATE shows both with `changed` flagging
 *  the rows that actually differ, so a wide table doesn't need to be scanned line by line. */
export function computeFieldDiffs(entry: { oldValue: string | null; newValue: string | null }): FieldDiff[] {
  const before = safeParse(entry.oldValue) ?? {};
  const after = safeParse(entry.newValue) ?? {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  return keys.map(field => {
    const b = before[field];
    const a = after[field];
    return {
      field,
      before: field in before ? display(b) : NO_VALUE,
      after: field in after ? display(a) : NO_VALUE,
      changed: JSON.stringify(b) !== JSON.stringify(a),
    };
  });
}

export interface AuditEntryLike {
  tableName: string;
  action: 'I' | 'U' | 'D';
  changedBy: string | null;
  changedAt: string;
}

export interface SingleRow<T> { kind: 'single'; entry: T }
export interface GroupRow<T> { kind: 'group'; members: T[]; tableName: string; action: 'I' | 'U' | 'D'; changedAt: string }
export type DisplayRow<T> = SingleRow<T> | GroupRow<T>;

const BATCH_WINDOW_MS = 2000;
/** Collapsing below this size would hide more than it declutters -- a real burst is dozens of
 *  rows, not two or three. */
const MIN_BATCH_SIZE = 3;

/** Groups consecutive, same-table/action, actor-less entries fired within a tight time window
 *  (a scheduled job writing many rows at once) into one summary row. Never touches a row with a
 *  real actor -- a human's changes are shown individually, whatever their number, since hiding
 *  them would defeat the point of an audit screen. `entries` must already be sorted newest-first
 *  (the API's own order), which this preserves. */
export function groupBatches<T extends AuditEntryLike>(entries: T[]): DisplayRow<T>[] {
  const out: DisplayRow<T>[] = [];
  let i = 0;
  while (i < entries.length) {
    const start = entries[i];
    let j = i + 1;
    if (start.changedBy === null) {
      while (
        j < entries.length &&
        entries[j].tableName === start.tableName &&
        entries[j].action === start.action &&
        entries[j].changedBy === null &&
        Math.abs(new Date(entries[j - 1].changedAt).getTime() - new Date(entries[j].changedAt).getTime()) <= BATCH_WINDOW_MS
      ) {
        j++;
      }
    }
    const size = j - i;
    if (size >= MIN_BATCH_SIZE) {
      out.push({ kind: 'group', members: entries.slice(i, j), tableName: start.tableName, action: start.action, changedAt: start.changedAt });
    } else {
      for (let k = i; k < j; k++) out.push({ kind: 'single', entry: entries[k] });
    }
    i = j;
  }
  return out;
}
