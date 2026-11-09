/**
 * A Finance page that has a guide, as listed by « Aide & guides » (/finance/aide).
 * `guideKey` is the `storageKey` of the page's `app-page-guide`; `route` is its path under
 * the Finance shell (`/finance/<route>`). Its FAQ, documentation and videos are in
 * `help-content.ts`, under the same key.
 */
export interface GuidePageDef {
  guideKey: string;
  labelKey: string;
  icon: string;
  route: string;
  /** Any-of gate; empty = every user. Same codes as the route's `data.permissions`. */
  permissions: string[];
  /**
   * Help-page tab the guide is listed under, for a sub-page (an invoice under « Factures »).
   * Omitted = the guide has its own tab, keyed by `guideKey`.
   */
  helpTab?: string;
  /** For a page whose URL carries an id (`invoicing/42`): the pattern of its path. */
  pattern?: RegExp;
  /** Query parameters the URL must carry (a section opened by `?tab=`). */
  query?: Record<string, string>;
}

/** A new page with a guide adds one line here. Sub-pages first: they are matched first. */
export const GUIDE_PAGES: GuidePageDef[] = [
  // Sub-pages first. The creation wizard (`affaires/new`), then an affaire's edit page and file.
  { guideKey: 'affaire-new', labelKey: 'AFFAIRES.wizard.shell.title_new', icon: 'add_business', route: 'affaires/new',
    permissions: ['FACT_MANAGE_AFFAIRE'], helpTab: 'affaires' },
  // La fiche d'une affaire (`affaires/42`, onglet et graphique en paramètres) : guidée seulement
  // depuis une fiche ouverte, l'URL portant l'id.
  { guideKey: 'affaire-detail', labelKey: 'GUIDE.AFFAIRE_DETAIL.PAGE', icon: 'folder_open', route: 'affaires',
    pattern: /(^|\/)affaires\/\d+\/?$/, permissions: ['FACT_VIEW_AFFAIRE', 'FACT_MANAGE_AFFAIRE'], helpTab: 'affaires' },
  // La modification (`affaires/42/edit`) : même assistant, son propre guide ; guidée
  // seulement depuis l'écran ouvert, l'URL portant l'id.
  { guideKey: 'affaire-edit', labelKey: 'GUIDE.AFFAIRE_EDIT.PAGE', icon: 'edit_note', route: 'affaires',
    pattern: /(^|\/)affaires\/\d+\/edit\/?$/, permissions: ['FACT_MANAGE_AFFAIRE', 'FACT_UPDATE_AFFAIRE'], helpTab: 'affaires' },
  // Clients : l'assistant (création, puis modification `clients/42/edit`) et la fiche.
  { guideKey: 'client-new', labelKey: 'GUIDE.CLIENT_NEW.PAGE', icon: 'person_add', route: 'clients/new',
    permissions: ['FACT_MANAGE_INVOICING'], helpTab: 'clients' },
  { guideKey: 'client-edit', labelKey: 'GUIDE.CLIENT_EDIT.PAGE', icon: 'edit_note', route: 'clients',
    pattern: /(^|\/)clients\/\d+\/edit\/?$/, permissions: ['FACT_MANAGE_INVOICING'], helpTab: 'clients' },
  { guideKey: 'client-detail', labelKey: 'GUIDE.CLIENT_DETAIL.PAGE', icon: 'person', route: 'clients',
    pattern: /(^|\/)clients\/\d+\/?$/, permissions: ['FACT_VIEW_INVOICING', 'FACT_MANAGE_INVOICING'], helpTab: 'clients' },
  // Factures : l'assistant (création, puis modification `invoicing/42/edit`) et la fiche.
  { guideKey: 'invoice-new', labelKey: 'GUIDE.INVOICE_NEW.PAGE', icon: 'add_card', route: 'invoicing/new',
    permissions: ['FACT_VIEW_INVOICING', 'FACT_MANAGE_INVOICING'], helpTab: 'invoices' },
  { guideKey: 'invoice-edit', labelKey: 'GUIDE.INVOICE_EDIT.PAGE', icon: 'edit_note', route: 'invoicing',
    pattern: /(^|\/)invoicing\/\d+\/edit\/?$/, permissions: ['FACT_VIEW_INVOICING', 'FACT_MANAGE_INVOICING'], helpTab: 'invoices' },
  { guideKey: 'invoice-detail', labelKey: 'GUIDE.INVOICE_DETAIL.PAGE', icon: 'receipt_long', route: 'invoicing',
    pattern: /(^|\/)invoicing\/\d+\/?$/, permissions: ['FACT_VIEW_INVOICING', 'FACT_MANAGE_INVOICING'], helpTab: 'invoices' },
  // Recouvrement : le rapprochement bancaire et le dossier d'une facture (`recouvrement/42`).
  { guideKey: 'reconciliation', labelKey: 'GUIDE.RECONCILIATION.PAGE', icon: 'account_balance',
    route: 'recouvrement/reconciliation', permissions: ['FACT_BANK_RECONCILIATION'], helpTab: 'collections' },
  { guideKey: 'collection-detail', labelKey: 'GUIDE.COLLECTION_DETAIL.PAGE', icon: 'request_quote', route: 'recouvrement',
    pattern: /(^|\/)recouvrement\/\d+\/?$/, permissions: ['FACT_VIEW_PAYMENT', 'FACT_MANAGE_PAYMENT'], helpTab: 'collections' },
  // File d'approbation : le détail d'une demande (`billing/approval/line/42`, `…/livrable/7`).
  { guideKey: 'approval-detail', labelKey: 'GUIDE.APPROVAL_DETAIL.PAGE', icon: 'fact_check', route: 'billing/approval',
    pattern: /(^|\/)billing\/approval\/[a-z]+\/\d+\/?$/, permissions: ['FACT_VIEW_BILLING', 'FACT_MANAGE_BILLING'],
    helpTab: 'approval-queue' },
  // Coûts : chaque écran du module, sous l'onglet « Coûts » de l'aide.
  { guideKey: 'cost-approval', labelKey: 'GUIDE.COST_APPROVAL.PAGE', icon: 'fact_check', route: 'cost/approval',
    permissions: ['FACT_APPROVE_COST_L1', 'APPROVE_HIRING_COST', 'FACT_APPROVE_SALARY_ADVANCE'], helpTab: 'costs' },
  { guideKey: 'cost-missions', labelKey: 'GUIDE.COST_MISSIONS.PAGE', icon: 'flight_takeoff', route: 'cost/missions',
    permissions: ['FACT_APPROVE_MISSION_COST'], helpTab: 'costs' },
  { guideKey: 'cost-new', labelKey: 'GUIDE.COST_NEW.PAGE', icon: 'add_card', route: 'cost/new',
    permissions: ['FACT_MANAGE_COST', 'FACT_ADMIN_COST'], helpTab: 'costs' },
  { guideKey: 'cost-edit', labelKey: 'GUIDE.COST_EDIT.PAGE', icon: 'edit_note', route: 'cost',
    pattern: /(^|\/)cost\/\d+\/edit\/?$/, permissions: ['FACT_MANAGE_COST', 'FACT_ADMIN_COST'], helpTab: 'costs' },
  { guideKey: 'rate-computations', labelKey: 'GUIDE.RATES.PAGE', icon: 'calculate', route: 'cost/rate-computations',
    permissions: ['FACT_VIEW_COST', 'FACT_MANAGE_COST', 'FACT_ADMIN_COST'], helpTab: 'costs' },
  { guideKey: 'employee-cost-history', labelKey: 'GUIDE.EMPLOYEE_COST_HISTORY.PAGE', icon: 'history', route: 'cost',
    pattern: /(^|\/)cost\/employee-costs\/\d+\/history\/?$/, permissions: ['FACT_VIEW_COST', 'FACT_MANAGE_COST', 'FACT_ADMIN_COST'],
    helpTab: 'costs' },
  { guideKey: 'employee-costs', labelKey: 'GUIDE.EMPLOYEE_COSTS.PAGE', icon: 'badge', route: 'cost/employee-costs',
    permissions: ['FACT_VIEW_COST', 'FACT_MANAGE_COST', 'FACT_ADMIN_COST'], helpTab: 'costs' },
  { guideKey: 'cost-unassigned', labelKey: 'GUIDE.COST_UNASSIGNED.PAGE', icon: 'store', route: 'cost/supplier/none',
    permissions: ['FACT_VIEW_COST', 'FACT_MANAGE_COST', 'FACT_ADMIN_COST'], helpTab: 'costs' },
  { guideKey: 'cost-supplier', labelKey: 'GUIDE.COST_SUPPLIER.PAGE', icon: 'store', route: 'cost',
    pattern: /(^|\/)cost\/supplier\/\d+\/?$/, permissions: ['FACT_VIEW_COST', 'FACT_MANAGE_COST', 'FACT_ADMIN_COST'],
    helpTab: 'costs' },
  { guideKey: 'cost-detail', labelKey: 'GUIDE.COST_DETAIL.PAGE', icon: 'request_quote', route: 'cost',
    pattern: /(^|\/)cost\/\d+\/?$/, permissions: ['FACT_VIEW_COST', 'FACT_MANAGE_COST', 'FACT_ADMIN_COST'], helpTab: 'costs' },
  // Fournisseurs : l'assistant (création, puis modification `suppliers/42/edit`) et la fiche.
  { guideKey: 'supplier-new', labelKey: 'GUIDE.SUPPLIER_NEW.PAGE', icon: 'add_business', route: 'suppliers/new',
    permissions: ['FACT_MANAGE_COST'], helpTab: 'suppliers' },
  { guideKey: 'supplier-edit', labelKey: 'GUIDE.SUPPLIER_EDIT.PAGE', icon: 'edit_note', route: 'suppliers',
    pattern: /(^|\/)suppliers\/\d+\/edit\/?$/, permissions: ['FACT_MANAGE_COST'], helpTab: 'suppliers' },
  { guideKey: 'supplier-detail', labelKey: 'GUIDE.SUPPLIER_DETAIL.PAGE', icon: 'store', route: 'suppliers',
    pattern: /(^|\/)suppliers\/\d+\/?$/, permissions: ['FACT_VIEW_COST', 'FACT_MANAGE_COST'], helpTab: 'suppliers' },
  // Reporting P&L : le budget de référence, le calendrier de soumission et la fiche d'un rapport.
  { guideKey: 'reporting-budget', labelKey: 'GUIDE.PL_BUDGET.PAGE', icon: 'request_quote', route: 'reporting/budget',
    permissions: ['FACT_VIEW_PL_REPORT'], helpTab: 'reporting' },
  { guideKey: 'reporting-calendar', labelKey: 'GUIDE.PL_CALENDAR.PAGE', icon: 'calendar_month', route: 'reporting/calendar',
    permissions: ['FACT_VIEW_PL_REPORT'], helpTab: 'reporting' },
  { guideKey: 'report-detail', labelKey: 'GUIDE.REPORT_DETAIL.PAGE', icon: 'summarize', route: 'reporting',
    pattern: /(^|\/)reporting\/\d+\/?$/, permissions: ['FACT_VIEW_PL_REPORT'], helpTab: 'reporting' },
  // Administration : les pages autonomes des rôles et des maquettes de documents.
  { guideKey: 'admin-roles', labelKey: 'GUIDE.ADMIN_ROLES.PAGE', icon: 'admin_panel_settings', route: 'admin/roles',
    permissions: ['FACT_SUPER_ADMIN'], helpTab: 'admin' },
  { guideKey: 'admin-document-templates', labelKey: 'GUIDE.ADMIN_DOC_TEMPLATES.PAGE', icon: 'description',
    route: 'admin/document-templates', permissions: ['FACT_SUPER_ADMIN'], helpTab: 'admin' },
  { guideKey: 'home', labelKey: 'FACTURATION.layout.NAV.HOME', icon: 'home', route: 'home', permissions: [] },
  // Same order as the sidebar. Same permissions as the route's guard.
  { guideKey: 'affaires', labelKey: 'FACTURATION.layout.NAV.AFFAIRES', icon: 'work', route: 'affaires',
    permissions: ['FACT_VIEW_AFFAIRE', 'FACT_MANAGE_AFFAIRE'] },
  { guideKey: 'invoices', labelKey: 'GUIDE.INVOICES.PAGE', icon: 'receipt_long', route: 'invoicing',
    permissions: ['FACT_VIEW_INVOICING', 'FACT_MANAGE_INVOICING'] },
  { guideKey: 'collections', labelKey: 'GUIDE.COLLECTIONS.PAGE', icon: 'request_quote', route: 'recouvrement',
    permissions: ['FACT_VIEW_PAYMENT', 'FACT_MANAGE_PAYMENT'] },
  { guideKey: 'approval-queue', labelKey: 'GUIDE.APPROVAL_QUEUE.PAGE', icon: 'fact_check', route: 'billing/approval',
    permissions: ['FACT_VIEW_BILLING', 'FACT_MANAGE_BILLING'] },
  { guideKey: 'subcontracting', labelKey: 'GUIDE.SUBCONTRACTING.PAGE', icon: 'handshake', route: 'subcontracting',
    permissions: ['FACT_VIEW_AFFAIRE', 'FACT_MANAGE_AFFAIRE'] },
  { guideKey: 'costs', labelKey: 'GUIDE.COSTS.PAGE', icon: 'request_quote', route: 'cost',
    permissions: ['FACT_VIEW_COST', 'FACT_MANAGE_COST', 'FACT_ADMIN_COST'] },
  { guideKey: 'suppliers', labelKey: 'GUIDE.SUPPLIERS.PAGE', icon: 'storefront', route: 'suppliers',
    permissions: ['FACT_VIEW_COST', 'FACT_MANAGE_COST'] },
  { guideKey: 'reporting', labelKey: 'GUIDE.REPORTING.PAGE', icon: 'monitoring', route: 'reporting',
    permissions: ['FACT_VIEW_PL_REPORT'] },
  { guideKey: 'treasury', labelKey: 'GUIDE.TREASURY.PAGE', icon: 'account_balance', route: 'tresorerie',
    permissions: ['FACT_VIEW_PAYMENT'] },
  { guideKey: 'admin', labelKey: 'GUIDE.ADMIN.PAGE', icon: 'settings', route: 'admin',
    permissions: ['FACT_SUPER_ADMIN', 'FACT_ADMIN_COST'] },
  { guideKey: 'clients', labelKey: 'GUIDE.CLIENTS.PAGE', icon: 'groups', route: 'clients',
    permissions: ['FACT_VIEW_INVOICING', 'FACT_MANAGE_INVOICING'] },
];

/** Help-page tab of a guide. */
export function helpTabOf(page: GuidePageDef): string {
  return page.helpTab ?? page.guideKey;
}

/**
 * The guide of the page at `url` (an app URL, query string allowed), if it has one.
 * `route` matches the END of the path (`/finance/affaires`, not `/finance/affaires/42` nor
 * `/affaires/new`): an affaire's file or the creation wizard are other pages, with their
 * own anchors — they get their own entry (`pattern`) when they get a guide.
 */
export function guidePageAt(url: string): GuidePageDef | undefined {
  const [path, rest = ''] = url.split('?');
  const params = new URLSearchParams(rest.split('#')[0]);
  return GUIDE_PAGES.find(p =>
    (p.pattern ?? new RegExp(`(^|/)${p.route}/?$`)).test(path.split('#')[0])
    && Object.entries(p.query ?? {}).every(([k, v]) => params.get(k) === v));
}
