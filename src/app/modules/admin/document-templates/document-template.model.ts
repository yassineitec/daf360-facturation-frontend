export interface FactDocumentTemplateDto {
  id:           number;
  documentType: string;
  name:         string;
  description:  string | null;
  htmlContent:  string;
  isActive:     boolean;
  createdAt:    string;
  updatedAt:    string | null;
}

export interface SaveFactDocumentTemplateRequest {
  documentType: string;
  name:         string;
  description:  string | null;
  htmlContent:  string;
}

/**
 * Types de documents facturation pour lesquels une maquette peut exister — un seul
 * aujourd'hui (export PDF des factures en mode AV). En ajouter un nouveau ici ne crée
 * PAS le pipeline de génération correspondant : il faut d'abord que FactPdfService sache
 * produire ce document (cf. FactDocumentTemplate.java côté backend). C'est la même
 * relation que côté RH entre le "name" d'un document_templates et le générateur
 * PdfDocumentService qui sait le produire.
 */
/** `labelKey` : clé i18n (ADMIN.DOCUMENT_TEMPLATES.DOC_TYPES.*). */
export interface DocumentTypeOption { value: string; labelKey: string; }

export const DOCUMENT_TYPES: DocumentTypeOption[] = [
  { value: 'INVOICE_AV', labelKey: 'ADMIN.DOCUMENT_TEMPLATES.DOC_TYPES.INVOICE_AV' },
];

/**
 * Jetons Handlebars disponibles dans le HTML de la maquette — doit rester synchronisé
 * à la main avec FactPdfService.buildAvData()/buildMockAvData() côté backend (même
 * principe que DocumentVariableCatalog côté RH : catalogue documentaire, pas imposé).
 * `snippet` plutôt qu'un simple `{{clé}}` pour les tableaux/conditions : contrairement
 * au remplacement littéral de RH, nos maquettes utilisent le vrai Handlebars (boucles,
 * blocs conditionnels) — insérer juste "{{lines}}" n'aurait aucun sens.
 * Propres au type de document "INVOICE_AV" pour l'instant — si un second type de
 * document est ajouté un jour, ce catalogue devra être scindé par documentType.
 */
export interface TemplateVariableDef {
  key:     string;
  labelFr: string;
  group:   string;
  snippet: string;
}

export const INVOICE_TEMPLATE_VARIABLES: TemplateVariableDef[] = [
  { key: 'invoiceNumberDisplay', labelFr: 'N° de facture (ou "BROUILLON")', group: 'INVOICE', snippet: '{{invoiceNumberDisplay}}' },
  { key: 'editionDate',          labelFr: "Date d'édition ou d'émission",   group: 'INVOICE', snippet: '{{editionDate}}' },
  { key: 'isDraft',              labelFr: 'Bloc affiché seulement si brouillon (pas encore émise)', group: 'INVOICE', snippet: '{{#if isDraft}}\n  BROUILLON\n{{/if}}' },
  { key: 'clientName',           labelFr: 'Nom du client',            group: 'CLIENT', snippet: '{{clientName}}' },
  { key: 'clientAddress',        labelFr: 'Adresse du client',        group: 'CLIENT', snippet: '{{clientAddress}}' },
  { key: 'clientTaxId',          labelFr: 'Matricule fiscal / RCS-ICE', group: 'CLIENT', snippet: '{{clientTaxId}}' },
  { key: 'clientReferent',       labelFr: 'Référent client (contact principal)', group: 'CLIENT', snippet: '{{clientReferent}}' },
  {
    key: 'lines', labelFr: 'Lignes de facturation (tableau)', group: 'LINES',
    snippet:
`{{#each lines}}
  {{inc @index}}. {{this.projet}} — {{this.description}}
  Bon de commande : {{this.bonDeCommande}}
  Montant contrat (H.T.) : {{this.budgetAffaireFmt}}
  Avancement déjà facturé : {{this.pctFactureFmt}}
  Avancement à date : {{this.pctAvancementFmt}}
  Avancement à facturer : {{this.pctAFacturerFmt}}
  TVA : {{this.vatRatePct}}%
  Total à facturer HT : {{this.lineTotalFmt}}
{{/each}}`,
  },
  {
    key: 'vatBreakdown', labelFr: 'Répartition TVA par taux (tableau)', group: 'TOTALS',
    snippet:
`{{#each vatBreakdown}}
  Base {{this.baseFmt}} — Taux {{this.rate}}% — Montant TVA {{this.montantFmt}}
{{/each}}`,
  },
  { key: 'totalHtFmt',      labelFr: 'Total net HT',   group: 'TOTALS', snippet: '{{totalHtFmt}}' },
  { key: 'totalTvaFmt',     labelFr: 'Montant TVA',    group: 'TOTALS', snippet: '{{totalTvaFmt}}' },
  { key: 'droitTimbreFmt',  labelFr: 'Droit de timbre', group: 'TOTALS', snippet: '{{droitTimbreFmt}}' },
  { key: 'netAPayerFmt',    labelFr: 'Net à payer',    group: 'TOTALS', snippet: '{{netAPayerFmt}}' },
];
