/**
 * Content of the « Aide & guides » page (/finance/aide), per Finance page. Every text is an
 * i18n key: GUIDE.CENTER.* for the help page's own texts, GUIDE.<PAGE>.* reused for the
 * documentation so a page's guide and its documentation never say two things.
 *
 * Filled in for the Finance home page; a new page adds its FAQ, documentation and videos
 * here, keyed by its `GUIDE_PAGES.guideKey`.
 */

export interface HelpFaq {
  id: string;
  questionKey: string;
  answerKey: string;
}

/** One section of a page's documentation: a title and its text. */
export interface HelpDocSection {
  titleKey: string;
  textKey: string;
}

export interface HelpVideo {
  titleKey: string;
  /** Shown as « 2 min ». */
  minutes: number;
  /**
   * Address of the video FILE (.mp4 / .webm), played in a `<video>` inside a modal — a
   * page link (a SharePoint or Stream viewer page) won't play there. Empty until the
   * video exists — the card then reads « Bientôt disponible ».
   */
  url: string;
}

export interface HelpPageContent {
  faq: HelpFaq[];
  docs: HelpDocSection[];
  videos: HelpVideo[];
}

const faq = (page: string, key: string, id: string): HelpFaq => ({
  id: `${page}-${id}`,
  questionKey: `GUIDE.CENTER.FAQ.${key}.Q`,
  answerKey: `GUIDE.CENTER.FAQ.${key}.A`,
});

export const HELP_CONTENT: Record<string, HelpPageContent> = {
  home: {
    faq: [
      faq('home', 'HOME.DASH',       'dash'),
      faq('home', 'HOME.SCOPE',      'scope'),
      faq('home', 'HOME.PENDING',    'pending'),
      faq('home', 'HOME.COLLECTED',  'collected'),
      faq('home', 'HOME.CURRENCY',   'currency'),
      faq('home', 'HOME.TO_VALIDATE', 'to-validate'),
      faq('home', 'HOME.FORBIDDEN',  'forbidden'),
      faq('home', 'HOME.SAME',       'same'),
    ],
    docs: [
      { titleKey: 'GUIDE.HOME.KPIS_TITLE',     textKey: 'GUIDE.HOME.KPIS_TEXT' },
      { titleKey: 'GUIDE.HOME.MODULES_TITLE',  textKey: 'GUIDE.HOME.MODULES_TEXT' },
      { titleKey: 'GUIDE.HOME.ACTIVITY_TITLE', textKey: 'GUIDE.HOME.ACTIVITY_TEXT' },
      { titleKey: 'GUIDE.HOME.CURRENCY_TITLE', textKey: 'GUIDE.HOME.CURRENCY_TEXT' },
    ],
    videos: [],
  },
  affaires: {
    faq: [
      faq('affaires', 'AFFAIRES.CREATE',   'create'),
      faq('affaires', 'AFFAIRES.PENDING',  'pending'),
      faq('affaires', 'AFFAIRES.RAF',      'raf'),
      faq('affaires', 'AFFAIRES.WIP',      'wip'),
      faq('affaires', 'AFFAIRES.TILES',    'tiles'),
      faq('affaires', 'AFFAIRES.TOTAL',    'total'),
      faq('affaires', 'AFFAIRES.DELETE',   'delete'),
      faq('affaires', 'AFFAIRES.CLIENT',   'client'),
      faq('affaires', 'AFFAIRES.MEMORY',   'memory'),
    ],
    docs: [
      { titleKey: 'GUIDE.AFFAIRES.NEW_TITLE',     textKey: 'GUIDE.AFFAIRES.NEW_TEXT' },
      { titleKey: 'GUIDE.AFFAIRES.KPIS_TITLE',    textKey: 'GUIDE.AFFAIRES.KPIS_TEXT' },
      { titleKey: 'GUIDE.AFFAIRES.TOOLBAR_TITLE', textKey: 'GUIDE.AFFAIRES.TOOLBAR_TEXT' },
      { titleKey: 'GUIDE.AFFAIRES.LIST_TITLE',    textKey: 'GUIDE.AFFAIRES.LIST_TEXT' },
      { titleKey: 'GUIDE.AFFAIRES.STATUS_TITLE',  textKey: 'GUIDE.AFFAIRES.STATUS_TEXT' },
    ],
    videos: [],
  },
  'affaire-new': {
    faq: [
      faq('affaire-new', 'AFFAIRE_NEW.SAVED',    'saved'),
      faq('affaire-new', 'AFFAIRE_NEW.KYC',      'kyc'),
      faq('affaire-new', 'AFFAIRE_NEW.NEXT_OFF', 'next-off'),
      faq('affaire-new', 'AFFAIRE_NEW.ALLOC',    'alloc'),
      faq('affaire-new', 'AFFAIRE_NEW.DOC360',   'doc360'),
      faq('affaire-new', 'AFFAIRE_NEW.MODE',     'mode'),
      faq('affaire-new', 'AFFAIRE_NEW.ENTITY',   'entity'),
      faq('affaire-new', 'AFFAIRE_NEW.ACTIVATE', 'activate'),
    ],
    docs: [
      { titleKey: 'GUIDE.AFFAIRE_NEW.DOC.S1_TITLE', textKey: 'GUIDE.AFFAIRE_NEW.DOC.S1_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_NEW.DOC.S2_TITLE', textKey: 'GUIDE.AFFAIRE_NEW.DOC.S2_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_NEW.DOC.S3_TITLE', textKey: 'GUIDE.AFFAIRE_NEW.DOC.S3_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_NEW.DOC.S4_TITLE', textKey: 'GUIDE.AFFAIRE_NEW.DOC.S4_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_NEW.DOC.S5_TITLE', textKey: 'GUIDE.AFFAIRE_NEW.DOC.S5_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_NEW.DOC.S6_TITLE', textKey: 'GUIDE.AFFAIRE_NEW.DOC.S6_TEXT' },
    ],
    videos: [],
  },
  invoices: {
    faq: [
      faq('invoices', 'INVOICES.LIFECYCLE', 'lifecycle'),
      faq('invoices', 'INVOICES.NUMBER',    'number'),
      faq('invoices', 'INVOICES.APPROVE',   'approve'),
      faq('invoices', 'INVOICES.SENT',      'sent'),
      faq('invoices', 'INVOICES.PAYMENT',   'payment'),
      faq('invoices', 'INVOICES.KPIS',      'kpis'),
      faq('invoices', 'INVOICES.OVERDUE',   'overdue'),
      faq('invoices', 'INVOICES.DRAFT_DATE', 'draft-date'),
      faq('invoices', 'INVOICES.DELETE',    'delete'),
    ],
    docs: [
      { titleKey: 'GUIDE.INVOICES.LIFECYCLE_TITLE', textKey: 'GUIDE.INVOICES.LIFECYCLE_TEXT' },
      { titleKey: 'GUIDE.INVOICES.KPIS_TITLE',      textKey: 'GUIDE.INVOICES.KPIS_TEXT' },
      { titleKey: 'GUIDE.INVOICES.TOOLBAR_TITLE',   textKey: 'GUIDE.INVOICES.TOOLBAR_TEXT' },
      { titleKey: 'GUIDE.INVOICES.LIST_TITLE',      textKey: 'GUIDE.INVOICES.LIST_TEXT' },
      { titleKey: 'GUIDE.INVOICES.QUICK_TITLE',     textKey: 'GUIDE.INVOICES.QUICK_TEXT' },
    ],
    videos: [],
  },
  'invoice-new': {
    faq: [
      faq('invoice-new', 'INVOICE_NEW.AFFAIRE_MISSING', 'affaire-missing'),
      faq('invoice-new', 'INVOICE_NEW.RAF',      'raf'),
      faq('invoice-new', 'INVOICE_NEW.BUDGET',   'budget'),
      faq('invoice-new', 'INVOICE_NEW.MANUAL',   'manual'),
      faq('invoice-new', 'INVOICE_NEW.ACOMPTE',  'acompte'),
      faq('invoice-new', 'INVOICE_NEW.DUE_DATE', 'due-date'),
      faq('invoice-new', 'INVOICE_NEW.DRAFT_OR_SUBMIT', 'draft-or-submit'),
      faq('invoice-new', 'INVOICE_NEW.APPROVAL', 'approval'),
    ],
    docs: [
      { titleKey: 'GUIDE.INVOICE_NEW.S1_TITLE',      textKey: 'GUIDE.INVOICE_NEW.S1_TEXT' },
      { titleKey: 'GUIDE.INVOICE_NEW.S2_TITLE',      textKey: 'GUIDE.INVOICE_NEW.S2_TEXT' },
      { titleKey: 'GUIDE.INVOICE_NEW.S3_TITLE',      textKey: 'GUIDE.INVOICE_NEW.S3_TEXT' },
      { titleKey: 'GUIDE.INVOICE_NEW.S4_TITLE',      textKey: 'GUIDE.INVOICE_NEW.S4_TEXT' },
      { titleKey: 'GUIDE.INVOICE_NEW.ACTIONS_TITLE', textKey: 'GUIDE.INVOICE_NEW.ACTIONS_TEXT' },
    ],
    videos: [],
  },
  'invoice-edit': {
    faq: [
      faq('invoice-edit', 'INVOICE_EDIT.WHICH',    'which'),
      faq('invoice-edit', 'INVOICE_EDIT.AMEND',    'amend'),
      faq('invoice-edit', 'INVOICE_EDIT.RETURNED', 'returned'),
      faq('invoice-edit', 'INVOICE_EDIT.PAID',     'paid'),
    ],
    docs: [
      { titleKey: 'GUIDE.INVOICE_EDIT.INTRO_TITLE',   textKey: 'GUIDE.INVOICE_EDIT.INTRO_TEXT' },
      { titleKey: 'GUIDE.INVOICE_EDIT.ACTIONS_TITLE', textKey: 'GUIDE.INVOICE_EDIT.ACTIONS_TEXT' },
    ],
    videos: [],
  },
  'invoice-detail': {
    faq: [
      faq('invoice-detail', 'INVOICE_DETAIL.NEXT',      'next'),
      faq('invoice-detail', 'INVOICE_DETAIL.EMIT',      'emit'),
      faq('invoice-detail', 'INVOICE_DETAIL.EMAIL',     'email'),
      faq('invoice-detail', 'INVOICE_DETAIL.PARTIAL',   'partial'),
      faq('invoice-detail', 'INVOICE_DETAIL.FIX',       'fix'),
      faq('invoice-detail', 'INVOICE_DETAIL.CREDIT',    'credit'),
      faq('invoice-detail', 'INVOICE_DETAIL.DISPUTE',   'dispute'),
      faq('invoice-detail', 'INVOICE_DETAIL.REMINDERS', 'reminders'),
      faq('invoice-detail', 'INVOICE_DETAIL.PDF',       'pdf'),
    ],
    docs: [
      { titleKey: 'GUIDE.INVOICE_DETAIL.ACTIONS_TITLE',   textKey: 'GUIDE.INVOICE_DETAIL.ACTIONS_TEXT' },
      { titleKey: 'GUIDE.INVOICE_DETAIL.KPIS_TITLE',      textKey: 'GUIDE.INVOICE_DETAIL.KPIS_TEXT' },
      { titleKey: 'GUIDE.INVOICE_DETAIL.LINES_TITLE',     textKey: 'GUIDE.INVOICE_DETAIL.LINES_TEXT' },
      { titleKey: 'GUIDE.INVOICE_DETAIL.REMINDERS_TITLE', textKey: 'GUIDE.INVOICE_DETAIL.REMINDERS_TEXT' },
      { titleKey: 'GUIDE.INVOICE_DETAIL.AUDIT_TITLE',     textKey: 'GUIDE.INVOICE_DETAIL.AUDIT_TEXT' },
      { titleKey: 'GUIDE.INVOICE_DETAIL.TRACE_TITLE',     textKey: 'GUIDE.INVOICE_DETAIL.TRACE_TEXT' },
    ],
    videos: [],
  },
  collections: {
    faq: [
      faq('collections', 'COLLECTIONS.WHAT',      'what'),
      faq('collections', 'COLLECTIONS.MISSING',   'missing'),
      faq('collections', 'COLLECTIONS.KPIS',      'kpis'),
      faq('collections', 'COLLECTIONS.CURRENCY',  'currency'),
      faq('collections', 'COLLECTIONS.FILTER_ID', 'filter-id'),
      faq('collections', 'COLLECTIONS.PERIOD',    'period'),
      faq('collections', 'COLLECTIONS.RECON',     'recon'),
    ],
    docs: [
      { titleKey: 'GUIDE.COLLECTIONS.KPIS_TITLE',     textKey: 'GUIDE.COLLECTIONS.KPIS_TEXT' },
      { titleKey: 'GUIDE.COLLECTIONS.TOOLBAR_TITLE',  textKey: 'GUIDE.COLLECTIONS.TOOLBAR_TEXT' },
      { titleKey: 'GUIDE.COLLECTIONS.LIST_TITLE',     textKey: 'GUIDE.COLLECTIONS.LIST_TEXT' },
      { titleKey: 'GUIDE.COLLECTIONS.REMINDER_TITLE', textKey: 'GUIDE.COLLECTIONS.REMINDER_TEXT' },
    ],
    videos: [],
  },
  reconciliation: {
    faq: [
      faq('reconciliation', 'RECONCILIATION.FORMATS',  'formats'),
      faq('reconciliation', 'RECONCILIATION.MATCHING', 'matching'),
      faq('reconciliation', 'RECONCILIATION.CONFIRM',  'confirm'),
      faq('reconciliation', 'RECONCILIATION.PARTIAL',  'partial'),
      faq('reconciliation', 'RECONCILIATION.UNDO',     'undo'),
      faq('reconciliation', 'RECONCILIATION.ACOMPTE',  'acompte'),
      faq('reconciliation', 'RECONCILIATION.TWICE',    'twice'),
    ],
    docs: [
      { titleKey: 'GUIDE.RECONCILIATION.IMPORT_TITLE',       textKey: 'GUIDE.RECONCILIATION.IMPORT_TEXT' },
      { titleKey: 'GUIDE.RECONCILIATION.MANUAL_TITLE',       textKey: 'GUIDE.RECONCILIATION.MANUAL_TEXT' },
      { titleKey: 'GUIDE.RECONCILIATION.TRANSACTIONS_TITLE', textKey: 'GUIDE.RECONCILIATION.TRANSACTIONS_TEXT' },
      { titleKey: 'GUIDE.RECONCILIATION.ACTIONS_TITLE',      textKey: 'GUIDE.RECONCILIATION.ACTIONS_TEXT' },
      { titleKey: 'GUIDE.RECONCILIATION.UNMATCHED_TITLE',    textKey: 'GUIDE.RECONCILIATION.UNMATCHED_TEXT' },
    ],
    videos: [],
  },
  'collection-detail': {
    faq: [
      faq('collection-detail', 'COLLECTION_DETAIL.RECORD',   'record'),
      faq('collection-detail', 'COLLECTION_DETAIL.FIX',      'fix'),
      faq('collection-detail', 'COLLECTION_DETAIL.SUSPEND',  'suspend'),
      faq('collection-detail', 'COLLECTION_DETAIL.SENT',     'sent'),
      faq('collection-detail', 'COLLECTION_DETAIL.DISPUTED', 'disputed'),
      faq('collection-detail', 'COLLECTION_DETAIL.ERROR',    'error'),
    ],
    docs: [
      { titleKey: 'GUIDE.COLLECTION_DETAIL.ACTIONS_TITLE',   textKey: 'GUIDE.COLLECTION_DETAIL.ACTIONS_TEXT' },
      { titleKey: 'GUIDE.COLLECTION_DETAIL.KPIS_TITLE',      textKey: 'GUIDE.COLLECTION_DETAIL.KPIS_TEXT' },
      { titleKey: 'GUIDE.COLLECTION_DETAIL.REMINDERS_TITLE', textKey: 'GUIDE.COLLECTION_DETAIL.REMINDERS_TEXT' },
      { titleKey: 'GUIDE.COLLECTION_DETAIL.PAYMENTS_TITLE',  textKey: 'GUIDE.COLLECTION_DETAIL.PAYMENTS_TEXT' },
    ],
    videos: [],
  },
  'approval-queue': {
    faq: [
      faq('approval-queue', 'APPROVAL_QUEUE.WHAT',     'what'),
      faq('approval-queue', 'APPROVAL_QUEUE.ORIGIN',   'origin'),
      faq('approval-queue', 'APPROVAL_QUEUE.VALIDATE', 'validate'),
      faq('approval-queue', 'APPROVAL_QUEUE.COMBINED', 'combined'),
      faq('approval-queue', 'APPROVAL_QUEUE.CLIENT',   'client'),
      faq('approval-queue', 'APPROVAL_QUEUE.LIVRABLE', 'livrable'),
      faq('approval-queue', 'APPROVAL_QUEUE.RETURN',   'return'),
      faq('approval-queue', 'APPROVAL_QUEUE.UNDO',     'undo'),
      faq('approval-queue', 'APPROVAL_QUEUE.CREDIT',   'credit'),
      faq('approval-queue', 'APPROVAL_QUEUE.NOTHING',  'nothing'),
    ],
    docs: [
      { titleKey: 'GUIDE.APPROVAL_QUEUE.SUBTABS_TITLE',  textKey: 'GUIDE.APPROVAL_QUEUE.SUBTABS_TEXT' },
      { titleKey: 'GUIDE.APPROVAL_QUEUE.ACTIONS_TITLE',  textKey: 'GUIDE.APPROVAL_QUEUE.ACTIONS_TEXT' },
      { titleKey: 'GUIDE.APPROVAL_QUEUE.LIVRABLE_TITLE', textKey: 'GUIDE.APPROVAL_QUEUE.LIVRABLE_TEXT' },
      { titleKey: 'GUIDE.APPROVAL_QUEUE.CREDIT_TITLE',   textKey: 'GUIDE.APPROVAL_QUEUE.CREDIT_TEXT' },
      { titleKey: 'GUIDE.APPROVAL_QUEUE.HISTORY_TITLE',  textKey: 'GUIDE.APPROVAL_QUEUE.HISTORY_TEXT' },
    ],
    videos: [],
  },
  'approval-detail': {
    faq: [
      faq('approval-detail', 'APPROVAL_DETAIL.NO_BUTTONS', 'no-buttons'),
      faq('approval-detail', 'APPROVAL_DETAIL.AFTER',      'after'),
      faq('approval-detail', 'APPROVAL_DETAIL.RETURNED',   'returned'),
      faq('approval-detail', 'APPROVAL_DETAIL.CUMUL',      'cumul'),
    ],
    docs: [
      { titleKey: 'GUIDE.APPROVAL_DETAIL.IDENTITY_TITLE', textKey: 'GUIDE.APPROVAL_DETAIL.IDENTITY_TEXT' },
      { titleKey: 'GUIDE.APPROVAL_DETAIL.ACTIONS_TITLE',  textKey: 'GUIDE.APPROVAL_DETAIL.ACTIONS_TEXT' },
      { titleKey: 'GUIDE.APPROVAL_DETAIL.KPIS_TITLE',     textKey: 'GUIDE.APPROVAL_DETAIL.KPIS_TEXT' },
      { titleKey: 'GUIDE.APPROVAL_DETAIL.ITEMS_TITLE',    textKey: 'GUIDE.APPROVAL_DETAIL.ITEMS_TEXT' },
      { titleKey: 'GUIDE.APPROVAL_DETAIL.AUDIT_TITLE',    textKey: 'GUIDE.APPROVAL_DETAIL.AUDIT_TEXT' },
    ],
    videos: [],
  },
  subcontracting: {
    faq: [
      faq('subcontracting', 'SUBCONTRACTING.ST_NEW',     'st-new'),
      faq('subcontracting', 'SUBCONTRACTING.ST_OFF',     'st-off'),
      faq('subcontracting', 'SUBCONTRACTING.ORDER_NEW',  'order-new'),
      faq('subcontracting', 'SUBCONTRACTING.STATUS',     'status'),
      faq('subcontracting', 'SUBCONTRACTING.COST',       'cost'),
      faq('subcontracting', 'SUBCONTRACTING.OVERRUN',    'overrun'),
      faq('subcontracting', 'SUBCONTRACTING.MARGIN',     'margin'),
      faq('subcontracting', 'SUBCONTRACTING.NO_BUTTONS', 'no-buttons'),
    ],
    docs: [
      { titleKey: 'GUIDE.SUBCONTRACTING.ST_TITLE',       textKey: 'GUIDE.SUBCONTRACTING.ST_TEXT' },
      { titleKey: 'GUIDE.SUBCONTRACTING.ORDERS_TITLE',   textKey: 'GUIDE.SUBCONTRACTING.ORDERS_TEXT' },
      { titleKey: 'GUIDE.SUBCONTRACTING.COSTS_TITLE',    textKey: 'GUIDE.SUBCONTRACTING.COSTS_TEXT' },
      { titleKey: 'GUIDE.SUBCONTRACTING.ANALYSIS_TITLE', textKey: 'GUIDE.SUBCONTRACTING.ANALYSIS_TEXT' },
    ],
    videos: [],
  },
  costs: {
    faq: [
      faq('costs', 'COSTS.WHAT',      'what'),
      faq('costs', 'COSTS.LIFECYCLE', 'lifecycle'),
      faq('costs', 'COSTS.AUTO',      'auto'),
      faq('costs', 'COSTS.LEVELS',    'levels'),
      faq('costs', 'COSTS.REJECTED',  'rejected'),
      faq('costs', 'COSTS.POSTED',    'posted'),
      faq('costs', 'COSTS.KPIS',      'kpis'),
      faq('costs', 'COSTS.SUPPLIER',  'supplier'),
    ],
    docs: [
      { titleKey: 'GUIDE.COSTS.LIFECYCLE_TITLE', textKey: 'GUIDE.COSTS.LIFECYCLE_TEXT' },
      { titleKey: 'GUIDE.COSTS.KPIS_TITLE',      textKey: 'GUIDE.COSTS.KPIS_TEXT' },
      { titleKey: 'GUIDE.COSTS.TOOLBAR_TITLE',   textKey: 'GUIDE.COSTS.TOOLBAR_TEXT' },
      { titleKey: 'GUIDE.COSTS.LIST_TITLE',      textKey: 'GUIDE.COSTS.LIST_TEXT' },
      { titleKey: 'GUIDE.COSTS.ACTIONS_TITLE',   textKey: 'GUIDE.COSTS.ACTIONS_TEXT' },
    ],
    videos: [],
  },
  'cost-new': {
    faq: [
      faq('cost-new', 'COST_NEW.REQUIRED',  'required'),
      faq('cost-new', 'COST_NEW.DUPLICATE', 'duplicate'),
      faq('cost-new', 'COST_NEW.TAXES',     'taxes'),
      faq('cost-new', 'COST_NEW.NO_SUPPLIER', 'no-supplier'),
      faq('cost-new', 'COST_NEW.CATEGORY',  'category'),
      faq('cost-new', 'COST_NEW.RATE',      'rate'),
      faq('cost-new', 'COST_NEW.ATTACH',    'attach'),
    ],
    docs: [
      { titleKey: 'GUIDE.COST_NEW.INVOICE_TITLE', textKey: 'GUIDE.COST_NEW.INVOICE_TEXT' },
      { titleKey: 'GUIDE.COST_NEW.LINES_TITLE',   textKey: 'GUIDE.COST_NEW.LINES_TEXT' },
      { titleKey: 'GUIDE.COST_NEW.TAXES_TITLE',   textKey: 'GUIDE.COST_NEW.TAXES_TEXT' },
      { titleKey: 'GUIDE.COST_NEW.CIRCUIT_TITLE', textKey: 'GUIDE.COST_NEW.CIRCUIT_TEXT' },
      { titleKey: 'GUIDE.COST_NEW.ACTIONS_TITLE', textKey: 'GUIDE.COST_NEW.ACTIONS_TEXT' },
    ],
    videos: [],
  },
  'cost-edit': {
    faq: [
      faq('cost-edit', 'COST_EDIT.WHICH', 'which'),
      faq('cost-edit', 'COST_EDIT.DAF',   'daf'),
    ],
    docs: [
      { titleKey: 'GUIDE.COST_EDIT.INTRO_TITLE',   textKey: 'GUIDE.COST_EDIT.INTRO_TEXT' },
      { titleKey: 'GUIDE.COST_EDIT.ACTIONS_TITLE', textKey: 'GUIDE.COST_EDIT.ACTIONS_TEXT' },
    ],
    videos: [],
  },
  'cost-detail': {
    faq: [
      faq('cost-detail', 'COST_DETAIL.PAY',       'pay'),
      faq('cost-detail', 'COST_DETAIL.PAY_TWICE', 'pay-twice'),
      faq('cost-detail', 'COST_DETAIL.ATTACH',    'attach'),
      faq('cost-detail', 'COST_DETAIL.REMINDERS', 'reminders'),
      faq('cost-detail', 'COST_DETAIL.FIX',       'fix'),
    ],
    docs: [
      { titleKey: 'GUIDE.COST_DETAIL.IDENTITY_TITLE',    textKey: 'GUIDE.COST_DETAIL.IDENTITY_TEXT' },
      { titleKey: 'GUIDE.COST_DETAIL.KPIS_TITLE',        textKey: 'GUIDE.COST_DETAIL.KPIS_TEXT' },
      { titleKey: 'GUIDE.COST_DETAIL.APPROVALS_TITLE',   textKey: 'GUIDE.COST_DETAIL.APPROVALS_TEXT' },
      { titleKey: 'GUIDE.COST_DETAIL.ATTACHMENTS_TITLE', textKey: 'GUIDE.COST_DETAIL.ATTACHMENTS_TEXT' },
      { titleKey: 'GUIDE.COST_DETAIL.REMINDERS_TITLE',   textKey: 'GUIDE.COST_DETAIL.REMINDERS_TEXT' },
      { titleKey: 'GUIDE.COST_DETAIL.LEDGER_TITLE',      textKey: 'GUIDE.COST_DETAIL.LEDGER_TEXT' },
    ],
    videos: [],
  },
  'cost-supplier': {
    faq: [
      faq('cost-supplier', 'COST_SUPPLIER.LEDGER', 'ledger'),
      faq('cost-supplier', 'COST_SUPPLIER.UNPAID', 'unpaid'),
    ],
    docs: [
      { titleKey: 'GUIDE.COST_SUPPLIER.INVOICES_TITLE', textKey: 'GUIDE.COST_SUPPLIER.INVOICES_TEXT' },
      { titleKey: 'GUIDE.COST_SUPPLIER.LEDGER_TITLE',   textKey: 'GUIDE.COST_SUPPLIER.LEDGER_TEXT' },
    ],
    videos: [],
  },
  'cost-unassigned': {
    faq: [faq('cost-unassigned', 'COST_UNASSIGNED.WHY', 'why')],
    docs: [{ titleKey: 'GUIDE.COST_UNASSIGNED.INTRO_TITLE', textKey: 'GUIDE.COST_UNASSIGNED.INTRO_TEXT' }],
    videos: [],
  },
  'cost-approval': {
    faq: [
      faq('cost-approval', 'COST_APPROVAL.WHAT',     'what'),
      faq('cost-approval', 'COST_APPROVAL.LEVELS',   'levels'),
      faq('cost-approval', 'COST_APPROVAL.L4',       'l4'),
      faq('cost-approval', 'COST_APPROVAL.DECISIONS', 'decisions'),
      faq('cost-approval', 'COST_APPROVAL.HIRING',   'hiring'),
      faq('cost-approval', 'COST_APPROVAL.ADVANCES', 'advances'),
      faq('cost-approval', 'COST_APPROVAL.EMPTY',    'empty'),
    ],
    docs: [
      { titleKey: 'GUIDE.COST_APPROVAL.COSTS_TITLE',    textKey: 'GUIDE.COST_APPROVAL.COSTS_TEXT' },
      { titleKey: 'GUIDE.COST_APPROVAL.HIRING_TITLE',   textKey: 'GUIDE.COST_APPROVAL.HIRING_TEXT' },
      { titleKey: 'GUIDE.COST_APPROVAL.ADVANCES_TITLE', textKey: 'GUIDE.COST_APPROVAL.ADVANCES_TEXT' },
    ],
    videos: [],
  },
  'cost-missions': {
    faq: [
      faq('cost-missions', 'COST_MISSIONS.FLOW',   'flow'),
      faq('cost-missions', 'COST_MISSIONS.TOTAL',  'total'),
      faq('cost-missions', 'COST_MISSIONS.REJECT', 'reject'),
      faq('cost-missions', 'COST_MISSIONS.COST',   'cost'),
    ],
    docs: [
      { titleKey: 'GUIDE.COST_MISSIONS.LIST_TITLE',   textKey: 'GUIDE.COST_MISSIONS.LIST_TEXT' },
      { titleKey: 'GUIDE.COST_MISSIONS.DECIDE_TITLE', textKey: 'GUIDE.COST_MISSIONS.DECIDE_TEXT' },
    ],
    videos: [],
  },
  'rate-computations': {
    faq: [
      faq('rate-computations', 'RATES.WHAT',     'what'),
      faq('rate-computations', 'RATES.STEPS',    'steps'),
      faq('rate-computations', 'RATES.AUTO',     'auto'),
      faq('rate-computations', 'RATES.METHODS',  'methods'),
      faq('rate-computations', 'RATES.LOCKED',   'locked'),
    ],
    docs: [
      { titleKey: 'GUIDE.RATES.FORMULA_TITLE',    textKey: 'GUIDE.RATES.FORMULA_TEXT' },
      { titleKey: 'GUIDE.RATES.LIFECYCLE_TITLE',  textKey: 'GUIDE.RATES.LIFECYCLE_TEXT' },
      { titleKey: 'GUIDE.RATES.ALLOCATION_TITLE', textKey: 'GUIDE.RATES.ALLOCATION_TEXT' },
    ],
    videos: [],
  },
  'employee-costs': {
    faq: [
      faq('employee-costs', 'EMPLOYEE_COSTS.WHAT',    'what'),
      faq('employee-costs', 'EMPLOYEE_COSTS.CALC',    'calc'),
      faq('employee-costs', 'EMPLOYEE_COSTS.EXPIRED', 'expired'),
      faq('employee-costs', 'EMPLOYEE_COSTS.OVERLAP', 'overlap'),
      faq('employee-costs', 'EMPLOYEE_COSTS.SOURCE',  'source'),
    ],
    docs: [
      { titleKey: 'GUIDE.EMPLOYEE_COSTS.KPIS_TITLE', textKey: 'GUIDE.EMPLOYEE_COSTS.KPIS_TEXT' },
      { titleKey: 'GUIDE.EMPLOYEE_COSTS.LIST_TITLE', textKey: 'GUIDE.EMPLOYEE_COSTS.LIST_TEXT' },
      { titleKey: 'GUIDE.EMPLOYEE_COSTS.ADD_TITLE',  textKey: 'GUIDE.EMPLOYEE_COSTS.ADD_TEXT' },
    ],
    videos: [],
  },
  'admin': {
    faq: [
      faq('admin', 'ADMIN.TABS_MISSING', 'tabs-missing'),
      faq('admin', 'ADMIN.RATE', 'rate'),
      faq('admin', 'ADMIN.REFRESH', 'refresh'),
      faq('admin', 'ADMIN.REMINDERS', 'reminders'),
      faq('admin', 'ADMIN.SEND_NOW', 'send-now'),
      faq('admin', 'ADMIN.PERMISSIONS', 'permissions'),
      faq('admin', 'ADMIN.AUDIT', 'audit'),
      faq('admin', 'ADMIN.GLOBAL', 'global'),
      faq('admin', 'ADMIN.HELP_FAQ', 'help-faq'),
    ],
    docs: [
      { titleKey: 'GUIDE.ADMIN.LISTS_TITLE', textKey: 'GUIDE.ADMIN.LISTS_TEXT' },
      { titleKey: 'GUIDE.ADMIN.FOREX_TITLE', textKey: 'GUIDE.ADMIN.FOREX_TEXT' },
      { titleKey: 'GUIDE.ADMIN.FOREX_API_TITLE', textKey: 'GUIDE.ADMIN.FOREX_API_TEXT' },
      { titleKey: 'GUIDE.ADMIN.ENTITY_CURRENCY_TITLE', textKey: 'GUIDE.ADMIN.ENTITY_CURRENCY_TEXT' },
      { titleKey: 'GUIDE.ADMIN.COST_CONFIG_TITLE', textKey: 'GUIDE.ADMIN.COST_CONFIG_TEXT' },
      { titleKey: 'GUIDE.ADMIN.REMINDERS_TITLE', textKey: 'GUIDE.ADMIN.REMINDERS_TEXT' },
      { titleKey: 'GUIDE.ADMIN.COST_REMINDERS_TITLE', textKey: 'GUIDE.ADMIN.COST_REMINDERS_TEXT' },
      { titleKey: 'GUIDE.ADMIN.PERMISSIONS_TITLE', textKey: 'GUIDE.ADMIN.PERMISSIONS_TEXT' },
      { titleKey: 'GUIDE.ADMIN.DOC_TEMPLATES_TITLE', textKey: 'GUIDE.ADMIN.DOC_TEMPLATES_TEXT' },
      { titleKey: 'GUIDE.ADMIN.WIP_EMAILS_TITLE', textKey: 'GUIDE.ADMIN.WIP_EMAILS_TEXT' },
      { titleKey: 'GUIDE.ADMIN.AUDIT_TITLE', textKey: 'GUIDE.ADMIN.AUDIT_TEXT' },
      { titleKey: 'GUIDE.ADMIN.HELP_FAQ_TITLE', textKey: 'GUIDE.ADMIN.HELP_FAQ_TEXT' },
    ],
    videos: [],
  },
  'admin-roles': {
    faq: [
      faq('admin-roles', 'ADMIN_ROLES.DELAY', 'delay'),
      faq('admin-roles', 'ADMIN_ROLES.LOCKOUT', 'lockout'),
      faq('admin-roles', 'ADMIN_ROLES.NEW_ROLE', 'new-role'),
    ],
    docs: [
      { titleKey: 'GUIDE.ADMIN_ROLES.GROUPS_TITLE', textKey: 'GUIDE.ADMIN_ROLES.GROUPS_TEXT' },
      { titleKey: 'GUIDE.ADMIN_ROLES.BULK_TITLE', textKey: 'GUIDE.ADMIN_ROLES.BULK_TEXT' },
      { titleKey: 'GUIDE.ADMIN_ROLES.SAVE_TITLE', textKey: 'GUIDE.ADMIN_ROLES.SAVE_TEXT' },
    ],
    videos: [],
  },
  'admin-document-templates': {
    faq: [
      faq('admin-document-templates', 'ADMIN_DOC_TEMPLATES.USED', 'used'),
      faq('admin-document-templates', 'ADMIN_DOC_TEMPLATES.ACTIVE', 'active'),
      faq('admin-document-templates', 'ADMIN_DOC_TEMPLATES.VARS', 'vars'),
      faq('admin-document-templates', 'ADMIN_DOC_TEMPLATES.PREVIEW', 'preview'),
    ],
    docs: [
      { titleKey: 'GUIDE.ADMIN_DOC_TEMPLATES.EDITOR_TITLE', textKey: 'GUIDE.ADMIN_DOC_TEMPLATES.EDITOR_TEXT' },
      { titleKey: 'GUIDE.ADMIN_DOC_TEMPLATES.VARIABLES_TITLE', textKey: 'GUIDE.ADMIN_DOC_TEMPLATES.VARIABLES_TEXT' },
      { titleKey: 'GUIDE.ADMIN_DOC_TEMPLATES.PREVIEW_TITLE', textKey: 'GUIDE.ADMIN_DOC_TEMPLATES.PREVIEW_TEXT' },
      { titleKey: 'GUIDE.ADMIN_DOC_TEMPLATES.ACTIVE_TITLE', textKey: 'GUIDE.ADMIN_DOC_TEMPLATES.ACTIVE_TEXT' },
    ],
    videos: [],
  },
  'treasury': {
    faq: [
      faq('treasury', 'TREASURY.BALANCE', 'balance'),
      faq('treasury', 'TREASURY.IN', 'in'),
      faq('treasury', 'TREASURY.OUT', 'out'),
      faq('treasury', 'TREASURY.OLD', 'old'),
      faq('treasury', 'TREASURY.RATE', 'rate'),
      faq('treasury', 'TREASURY.PAID_COST', 'paid-cost'),
      faq('treasury', 'TREASURY.ENTITY', 'entity'),
    ],
    docs: [
      { titleKey: 'GUIDE.TREASURY.KPIS_TITLE', textKey: 'GUIDE.TREASURY.KPIS_TEXT' },
      { titleKey: 'GUIDE.TREASURY.LOW_POINT_TITLE', textKey: 'GUIDE.TREASURY.LOW_POINT_TEXT' },
      { titleKey: 'GUIDE.TREASURY.TABLE_TITLE', textKey: 'GUIDE.TREASURY.TABLE_TEXT' },
      { titleKey: 'GUIDE.TREASURY.FLOWS_TITLE', textKey: 'GUIDE.TREASURY.FLOWS_TEXT' },
      { titleKey: 'GUIDE.TREASURY.LIMITS_TITLE', textKey: 'GUIDE.TREASURY.LIMITS_TEXT' },
    ],
    videos: [],
  },
  'reporting': {
    faq: [
      faq('reporting', 'REPORTING.OPEN_MONTH', 'open-month'),
      faq('reporting', 'REPORTING.REVENUE', 'revenue'),
      faq('reporting', 'REPORTING.CLOSE', 'close'),
      faq('reporting', 'REPORTING.GENERATE', 'generate'),
      faq('reporting', 'REPORTING.NEW_PERIOD', 'new-period'),
      faq('reporting', 'REPORTING.FX', 'fx'),
    ],
    docs: [
      { titleKey: 'GUIDE.REPORTING.KPIS_TITLE', textKey: 'GUIDE.REPORTING.KPIS_TEXT' },
      { titleKey: 'GUIDE.REPORTING.LIST_TITLE', textKey: 'GUIDE.REPORTING.LIST_TEXT' },
      { titleKey: 'GUIDE.REPORTING.LIFECYCLE_TITLE', textKey: 'GUIDE.REPORTING.LIFECYCLE_TEXT' },
      { titleKey: 'GUIDE.REPORTING.ACTIONS_TITLE', textKey: 'GUIDE.REPORTING.ACTIONS_TEXT' },
    ],
    videos: [],
  },
  'reporting-budget': {
    faq: [
      faq('reporting-budget', 'PL_BUDGET.USE', 'use'),
      faq('reporting-budget', 'PL_BUDGET.WHEN', 'when'),
      faq('reporting-budget', 'PL_BUDGET.APPROVAL', 'approval'),
      faq('reporting-budget', 'PL_BUDGET.READONLY', 'readonly'),
    ],
    docs: [
      { titleKey: 'GUIDE.PL_BUDGET.INTRO_TITLE', textKey: 'GUIDE.PL_BUDGET.INTRO_TEXT' },
      { titleKey: 'GUIDE.PL_BUDGET.GRID_TITLE', textKey: 'GUIDE.PL_BUDGET.GRID_TEXT' },
      { titleKey: 'GUIDE.PL_BUDGET.SAVE_TITLE', textKey: 'GUIDE.PL_BUDGET.SAVE_TEXT' },
      { titleKey: 'GUIDE.PL_BUDGET.APPROVALS_TITLE', textKey: 'GUIDE.PL_BUDGET.APPROVALS_TEXT' },
    ],
    videos: [],
  },
  'reporting-calendar': {
    faq: [
      faq('reporting-calendar', 'PL_CALENDAR.BLOCK', 'block'),
      faq('reporting-calendar', 'PL_CALENDAR.EDIT', 'edit'),
      faq('reporting-calendar', 'PL_CALENDAR.CLEAR', 'clear'),
    ],
    docs: [
      { titleKey: 'GUIDE.PL_CALENDAR.INTRO_TITLE', textKey: 'GUIDE.PL_CALENDAR.INTRO_TEXT' },
      { titleKey: 'GUIDE.PL_CALENDAR.TABLE_TITLE', textKey: 'GUIDE.PL_CALENDAR.TABLE_TEXT' },
      { titleKey: 'GUIDE.PL_CALENDAR.EDIT_TITLE', textKey: 'GUIDE.PL_CALENDAR.EDIT_TEXT' },
    ],
    videos: [],
  },
  'report-detail': {
    faq: [
      faq('report-detail', 'REPORT_DETAIL.WORKFLOW', 'workflow'),
      faq('report-detail', 'REPORT_DETAIL.NO_ACTION', 'no-action'),
      faq('report-detail', 'REPORT_DETAIL.AMENDED', 'amended'),
      faq('report-detail', 'REPORT_DETAIL.REOPEN', 'reopen'),
      faq('report-detail', 'REPORT_DETAIL.VARIANCE', 'variance'),
      faq('report-detail', 'REPORT_DETAIL.COMMENTS', 'comments'),
      faq('report-detail', 'REPORT_DETAIL.EXPORT', 'export'),
    ],
    docs: [
      { titleKey: 'GUIDE.REPORT_DETAIL.ACTIONS_TITLE', textKey: 'GUIDE.REPORT_DETAIL.ACTIONS_TEXT' },
      { titleKey: 'GUIDE.REPORT_DETAIL.AMEND_TITLE', textKey: 'GUIDE.REPORT_DETAIL.AMEND_TEXT' },
      { titleKey: 'GUIDE.REPORT_DETAIL.KPIS_TITLE', textKey: 'GUIDE.REPORT_DETAIL.KPIS_TEXT' },
      { titleKey: 'GUIDE.REPORT_DETAIL.OVERVIEW_TITLE', textKey: 'GUIDE.REPORT_DETAIL.OVERVIEW_TEXT' },
      { titleKey: 'GUIDE.REPORT_DETAIL.RECAP_TITLE', textKey: 'GUIDE.REPORT_DETAIL.RECAP_TEXT' },
      { titleKey: 'GUIDE.REPORT_DETAIL.COMMENTS_TITLE', textKey: 'GUIDE.REPORT_DETAIL.COMMENTS_TEXT' },
      { titleKey: 'GUIDE.REPORT_DETAIL.TREASURY_TITLE', textKey: 'GUIDE.REPORT_DETAIL.TREASURY_TEXT' },
      { titleKey: 'GUIDE.REPORT_DETAIL.EXPORTS_TITLE', textKey: 'GUIDE.REPORT_DETAIL.EXPORTS_TEXT' },
    ],
    videos: [],
  },
  'suppliers': {
    faq: [
      faq('suppliers', 'SUPPLIERS.MISSING', 'missing'),
      faq('suppliers', 'SUPPLIERS.KPIS', 'kpis'),
      faq('suppliers', 'SUPPLIERS.COUNTRIES', 'countries'),
      faq('suppliers', 'SUPPLIERS.IBAN', 'iban'),
      faq('suppliers', 'SUPPLIERS.NO_BUTTON', 'no-button'),
    ],
    docs: [
      { titleKey: 'GUIDE.SUPPLIERS.KPIS_TITLE', textKey: 'GUIDE.SUPPLIERS.KPIS_TEXT' },
      { titleKey: 'GUIDE.SUPPLIERS.TOOLBAR_TITLE', textKey: 'GUIDE.SUPPLIERS.TOOLBAR_TEXT' },
      { titleKey: 'GUIDE.SUPPLIERS.STATUS_TITLE', textKey: 'GUIDE.SUPPLIERS.STATUS_TEXT' },
      { titleKey: 'GUIDE.SUPPLIERS.LIST_TITLE', textKey: 'GUIDE.SUPPLIERS.LIST_TEXT' },
    ],
    videos: [],
  },
  'supplier-new': {
    faq: [
      faq('supplier-new', 'SUPPLIER_NEW.REQUIRED', 'required'),
      faq('supplier-new', 'SUPPLIER_NEW.CODE', 'code'),
      faq('supplier-new', 'SUPPLIER_NEW.TVA', 'tva'),
      faq('supplier-new', 'SUPPLIER_NEW.PROFILE', 'profile'),
      faq('supplier-new', 'SUPPLIER_NEW.COUNTRY', 'country'),
    ],
    docs: [
      { titleKey: 'GUIDE.SUPPLIER_NEW.S1_TITLE', textKey: 'GUIDE.SUPPLIER_NEW.S1_TEXT' },
      { titleKey: 'GUIDE.SUPPLIER_NEW.S2_TITLE', textKey: 'GUIDE.SUPPLIER_NEW.S2_TEXT' },
      { titleKey: 'GUIDE.SUPPLIER_NEW.S3_TITLE', textKey: 'GUIDE.SUPPLIER_NEW.S3_TEXT' },
      { titleKey: 'GUIDE.SUPPLIER_NEW.NEXT_TITLE', textKey: 'GUIDE.SUPPLIER_NEW.NEXT_TEXT' },
    ],
    videos: [],
  },
  'supplier-edit': {
    faq: [
      faq('supplier-edit', 'SUPPLIER_EDIT.COUNTRY', 'country'),
      faq('supplier-edit', 'SUPPLIER_EDIT.SAVED', 'saved'),
      faq('supplier-edit', 'SUPPLIER_EDIT.INACTIVE', 'inactive'),
    ],
    docs: [
      { titleKey: 'GUIDE.SUPPLIER_EDIT.INTRO_TITLE', textKey: 'GUIDE.SUPPLIER_EDIT.INTRO_TEXT' },
      { titleKey: 'GUIDE.SUPPLIER_EDIT.S1_TITLE', textKey: 'GUIDE.SUPPLIER_EDIT.S1_TEXT' },
      { titleKey: 'GUIDE.SUPPLIER_EDIT.NEXT_TITLE', textKey: 'GUIDE.SUPPLIER_EDIT.NEXT_TEXT' },
    ],
    videos: [],
  },
  'supplier-detail': {
    faq: [
      faq('supplier-detail', 'SUPPLIER_DETAIL.REACTIVATE', 'reactivate'),
      faq('supplier-detail', 'SUPPLIER_DETAIL.DELETE', 'delete'),
      faq('supplier-detail', 'SUPPLIER_DETAIL.TOTAL', 'total'),
      faq('supplier-detail', 'SUPPLIER_DETAIL.LEDGER', 'ledger'),
      faq('supplier-detail', 'SUPPLIER_DETAIL.BALANCE', 'balance'),
      faq('supplier-detail', 'SUPPLIER_DETAIL.PAY', 'pay'),
    ],
    docs: [
      { titleKey: 'GUIDE.SUPPLIER_DETAIL.IDENTITY_TITLE', textKey: 'GUIDE.SUPPLIER_DETAIL.IDENTITY_TEXT' },
      { titleKey: 'GUIDE.SUPPLIER_DETAIL.ACTIONS_TITLE', textKey: 'GUIDE.SUPPLIER_DETAIL.ACTIONS_TEXT' },
      { titleKey: 'GUIDE.SUPPLIER_DETAIL.DEACTIVATE_TITLE', textKey: 'GUIDE.SUPPLIER_DETAIL.DEACTIVATE_TEXT' },
      { titleKey: 'GUIDE.SUPPLIER_DETAIL.KPIS_TITLE', textKey: 'GUIDE.SUPPLIER_DETAIL.KPIS_TEXT' },
      { titleKey: 'GUIDE.SUPPLIER_DETAIL.COSTS_TITLE', textKey: 'GUIDE.SUPPLIER_DETAIL.COSTS_TEXT' },
      { titleKey: 'GUIDE.SUPPLIER_DETAIL.LEDGER_TITLE', textKey: 'GUIDE.SUPPLIER_DETAIL.LEDGER_TEXT' },
    ],
    videos: [],
  },
  'employee-cost-history': {
    faq: [faq('employee-cost-history', 'EMPLOYEE_COST_HISTORY.NORMALIZED', 'normalized')],
    docs: [{ titleKey: 'GUIDE.EMPLOYEE_COST_HISTORY.LIST_TITLE', textKey: 'GUIDE.EMPLOYEE_COST_HISTORY.LIST_TEXT' }],
    videos: [],
  },
  clients: {
    faq: [
      faq('clients', 'CLIENTS.KYC',        'kyc'),
      faq('clients', 'CLIENTS.DELETE',     'delete'),
      faq('clients', 'CLIENTS.CA',         'ca'),
      faq('clients', 'CLIENTS.PAGE_TILES', 'page-tiles'),
      faq('clients', 'CLIENTS.SEARCH',     'search'),
      faq('clients', 'CLIENTS.ACTIVE',     'active'),
      faq('clients', 'CLIENTS.DUPLICATE',  'duplicate'),
      faq('clients', 'CLIENTS.NO_BUTTON',  'no-button'),
    ],
    docs: [
      { titleKey: 'GUIDE.CLIENTS.NEW_TITLE',     textKey: 'GUIDE.CLIENTS.NEW_TEXT' },
      { titleKey: 'GUIDE.CLIENTS.KPIS_TITLE',    textKey: 'GUIDE.CLIENTS.KPIS_TEXT' },
      { titleKey: 'GUIDE.CLIENTS.TOOLBAR_TITLE', textKey: 'GUIDE.CLIENTS.TOOLBAR_TEXT' },
      { titleKey: 'GUIDE.CLIENTS.LIST_TITLE',    textKey: 'GUIDE.CLIENTS.LIST_TEXT' },
      { titleKey: 'GUIDE.CLIENTS.STATE_TITLE',   textKey: 'GUIDE.CLIENTS.STATE_TEXT' },
    ],
    videos: [],
  },
  'client-new': {
    faq: [
      faq('client-new', 'CLIENT_NEW.SAVED',    'saved'),
      faq('client-new', 'CLIENT_NEW.CODE',     'code'),
      faq('client-new', 'CLIENT_NEW.REQUIRED', 'required'),
      faq('client-new', 'CLIENT_NEW.EMAIL',    'email'),
      faq('client-new', 'CLIENT_NEW.PRIMARY',  'primary'),
      faq('client-new', 'CLIENT_NEW.ENTITY',   'entity'),
      faq('client-new', 'CLIENT_NEW.AFTER',    'after'),
    ],
    docs: [
      { titleKey: 'GUIDE.CLIENT_NEW.S1_TITLE',   textKey: 'GUIDE.CLIENT_NEW.S1_TEXT' },
      { titleKey: 'GUIDE.CLIENT_NEW.S2_TITLE',   textKey: 'GUIDE.CLIENT_NEW.S2_TEXT' },
      { titleKey: 'GUIDE.CLIENT_NEW.S3_TITLE',   textKey: 'GUIDE.CLIENT_NEW.S3_TEXT' },
      { titleKey: 'GUIDE.CLIENT_NEW.NEXT_TITLE', textKey: 'GUIDE.CLIENT_NEW.NEXT_TEXT' },
    ],
    videos: [],
  },
  'client-edit': {
    faq: [
      faq('client-edit', 'CLIENT_EDIT.SAVED',    'saved'),
      faq('client-edit', 'CLIENT_EDIT.CONTACTS', 'contacts'),
      faq('client-edit', 'CLIENT_EDIT.PRIMARY',  'primary'),
      faq('client-edit', 'CLIENT_EDIT.KYC',      'kyc'),
    ],
    docs: [
      { titleKey: 'GUIDE.CLIENT_EDIT.RAIL_TITLE', textKey: 'GUIDE.CLIENT_EDIT.RAIL_TEXT' },
      { titleKey: 'GUIDE.CLIENT_EDIT.S2_TITLE',   textKey: 'GUIDE.CLIENT_EDIT.S2_TEXT' },
      { titleKey: 'GUIDE.CLIENT_EDIT.NEXT_TITLE', textKey: 'GUIDE.CLIENT_EDIT.NEXT_TEXT' },
      { titleKey: 'GUIDE.CLIENT_EDIT.BACK_TITLE', textKey: 'GUIDE.CLIENT_EDIT.BACK_TEXT' },
    ],
    videos: [],
  },
  'client-detail': {
    faq: [
      faq('client-detail', 'CLIENT_DETAIL.KYC',        'kyc'),
      faq('client-detail', 'CLIENT_DETAIL.REVOKE',     'revoke'),
      faq('client-detail', 'CLIENT_DETAIL.BLOCK',      'block'),
      faq('client-detail', 'CLIENT_DETAIL.FIND',       'find'),
      faq('client-detail', 'CLIENT_DETAIL.PENDING',    'pending'),
      faq('client-detail', 'CLIENT_DETAIL.CONTACT_OFF', 'contact-off'),
      faq('client-detail', 'CLIENT_DETAIL.NO_EMAIL',   'no-email'),
      faq('client-detail', 'CLIENT_DETAIL.INVOICE',    'invoice'),
    ],
    docs: [
      { titleKey: 'GUIDE.CLIENT_DETAIL.IDENTITY_TITLE', textKey: 'GUIDE.CLIENT_DETAIL.IDENTITY_TEXT' },
      { titleKey: 'GUIDE.CLIENT_DETAIL.ACTIONS_TITLE',  textKey: 'GUIDE.CLIENT_DETAIL.ACTIONS_TEXT' },
      { titleKey: 'GUIDE.CLIENT_DETAIL.KPIS_TITLE',     textKey: 'GUIDE.CLIENT_DETAIL.KPIS_TEXT' },
      { titleKey: 'GUIDE.CLIENT_DETAIL.OVERVIEW_TITLE', textKey: 'GUIDE.CLIENT_DETAIL.OVERVIEW_TEXT' },
      { titleKey: 'GUIDE.CLIENT_DETAIL.CONTACTS_TITLE', textKey: 'GUIDE.CLIENT_DETAIL.CONTACTS_TEXT' },
      { titleKey: 'GUIDE.CLIENT_DETAIL.TRACE_TITLE',    textKey: 'GUIDE.CLIENT_DETAIL.TRACE_TEXT' },
    ],
    videos: [],
  },
  'affaire-edit': {
    faq: [
      faq('affaire-edit', 'AFFAIRE_EDIT.SAVED',     'saved'),
      faq('affaire-edit', 'AFFAIRE_EDIT.JUMP',      'jump'),
      faq('affaire-edit', 'AFFAIRE_EDIT.MODE',      'mode'),
      faq('affaire-edit', 'AFFAIRE_EDIT.CLIENT',    'client'),
      faq('affaire-edit', 'AFFAIRE_EDIT.ENTITY',    'entity'),
      faq('affaire-edit', 'AFFAIRE_EDIT.ALLOC',     'alloc'),
      faq('affaire-edit', 'AFFAIRE_EDIT.CLOSED',    'closed'),
      faq('affaire-edit', 'AFFAIRE_EDIT.FINISH',    'finish'),
      faq('affaire-edit', 'AFFAIRE_EDIT.NO_BUTTON', 'no-button'),
    ],
    docs: [
      { titleKey: 'GUIDE.AFFAIRE_EDIT.RAIL_TITLE', textKey: 'GUIDE.AFFAIRE_EDIT.RAIL_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_EDIT.S2_TITLE',   textKey: 'GUIDE.AFFAIRE_EDIT.S2_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_EDIT.S3_TITLE',   textKey: 'GUIDE.AFFAIRE_EDIT.S3_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_EDIT.S4_TITLE',   textKey: 'GUIDE.AFFAIRE_EDIT.S4_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_EDIT.S5_TITLE',   textKey: 'GUIDE.AFFAIRE_EDIT.S5_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_EDIT.S6_TITLE',   textKey: 'GUIDE.AFFAIRE_EDIT.S6_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_EDIT.NEXT_TITLE', textKey: 'GUIDE.AFFAIRE_EDIT.NEXT_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_EDIT.BACK_TITLE', textKey: 'GUIDE.AFFAIRE_EDIT.BACK_TEXT' },
    ],
    videos: [],
  },
  'affaire-detail': {
    faq: [
      faq('affaire-detail', 'AFFAIRE_DETAIL.PAYMENT', 'payment'),
      faq('affaire-detail', 'AFFAIRE_DETAIL.PARTIAL', 'partial'),
      faq('affaire-detail', 'AFFAIRE_DETAIL.CHART_URL', 'chart-url'),
      faq('affaire-detail', 'AFFAIRE_DETAIL.COMBINE', 'combine'),
      faq('affaire-detail', 'AFFAIRE_DETAIL.TS_CREATE', 'ts-create'),
      faq('affaire-detail', 'AFFAIRE_DETAIL.TS_BUDGET', 'ts-budget'),
      faq('affaire-detail', 'AFFAIRE_DETAIL.INVOICE_BLOCKED', 'invoice-blocked'),
      faq('affaire-detail', 'AFFAIRE_DETAIL.OVERRUN', 'overrun'),
      faq('affaire-detail', 'AFFAIRE_DETAIL.TABS_MISSING', 'tabs-missing'),
      faq('affaire-detail', 'AFFAIRE_DETAIL.STATUS', 'status'),
      faq('affaire-detail', 'AFFAIRE_DETAIL.BUDGET', 'budget'),
      faq('affaire-detail', 'AFFAIRE_DETAIL.DELETE', 'delete'),
    ],
    docs: [
      { titleKey: 'GUIDE.AFFAIRE_DETAIL.HEADER_TITLE', textKey: 'GUIDE.AFFAIRE_DETAIL.HEADER_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_DETAIL.DETAILS_TITLE', textKey: 'GUIDE.AFFAIRE_DETAIL.DETAILS_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_DETAIL.ACTIONS_TITLE', textKey: 'GUIDE.AFFAIRE_DETAIL.ACTIONS_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_DETAIL.KPIS_TITLE', textKey: 'GUIDE.AFFAIRE_DETAIL.KPIS_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_DETAIL.TABS_TITLE', textKey: 'GUIDE.AFFAIRE_DETAIL.TABS_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_DETAIL.OVERVIEW_TITLE', textKey: 'GUIDE.AFFAIRE_DETAIL.OVERVIEW_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_DETAIL.TS_TITLE', textKey: 'GUIDE.AFFAIRE_DETAIL.TS_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_DETAIL.TS_WIP_TITLE', textKey: 'GUIDE.AFFAIRE_DETAIL.TS_WIP_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_DETAIL.WIP_TITLE', textKey: 'GUIDE.AFFAIRE_DETAIL.WIP_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_DETAIL.RESSOURCES_TITLE', textKey: 'GUIDE.AFFAIRE_DETAIL.RESSOURCES_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_DETAIL.DEPENSE_TITLE', textKey: 'GUIDE.AFFAIRE_DETAIL.DEPENSE_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_DETAIL.INVOICES_TITLE', textKey: 'GUIDE.AFFAIRE_DETAIL.INVOICES_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_DETAIL.PAYMENTS_TITLE', textKey: 'GUIDE.AFFAIRE_DETAIL.PAYMENTS_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_DETAIL.EXPENSES_TITLE', textKey: 'GUIDE.AFFAIRE_DETAIL.EXPENSES_TEXT' },
      { titleKey: 'GUIDE.AFFAIRE_DETAIL.DRAWER_TITLE', textKey: 'GUIDE.AFFAIRE_DETAIL.DRAWER_TEXT' },
    ],
    videos: [],
  },
};

/**
 * Support contact shown on the help page. Empty = not configured yet: the « Support »
 * card is then hidden rather than offering a dead « Écrire au support ».
 */
export const SUPPORT_CONTACT = {
  email: '',
};
