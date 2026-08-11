import { Route } from '@angular/router';

/**
 * La liste des modules finance — **une seule fois**, pour la barre latérale ET la page
 * d'accueil.
 *
 * Elles divergeaient : ordres différents, « Fournisseurs » pointant `fournisseurs` d'un
 * côté (un simple `redirectTo`) et `suppliers` de l'autre, « Approbation Coûts »
 * uniquement dans la barre, « Recouvrement » et « Trésorerie » uniquement sur l'accueil,
 * et surtout des libellés **codés en dur en français** dans la barre là où l'accueil
 * passait par i18n — changer de langue ne traduisait que la moitié de l'écran.
 *
 * Ce que ce fichier ne porte PAS, volontairement :
 * - **les permissions** : elles sont déjà déclarées sur les routes
 *   (`data: { permissions: [...] }`, lues par `permissionGuard`). Les redéclarer ici
 *   créerait une seconde vérité qui dériverait de la première. {@link routePermissions}
 *   les lit sur la config de route.
 * - **la validité d'une route** : idem, {@link isNavigableRoute} regarde la config. Une
 *   entrée dont la route n'est qu'un `redirectTo` ne doit pas apparaître dans la barre.
 */
export interface FinanceModuleDef {
  id: string;
  /** Route réelle, jamais un alias de redirection (`suppliers`, pas `fournisseurs`). */
  route: string;
  /** Clé i18n du libellé — le même dans la barre et sur la carte d'accueil. */
  labelKey: string;
  /** Clé i18n de la description. Seule la carte d'accueil s'en sert. */
  descKey?: string;
  icon: string;
  /**
   * Teinte de l'icône. Tokens de la lib uniquement : les variantes locales
   * (`icon-bg--fact`, `--pay`, `--amber`…) vivaient dans 253 lignes de SCSS d'accueil.
   */
  tone: 'primary' | 'secondary' | 'tertiary' | 'teal' | 'warning' | 'danger';
  /**
   * Sous-entrées. **Barre latérale uniquement** : l'accueil reste une grille de modules
   * de premier niveau, la navigation fine est le rôle de la barre.
   */
  children?: FinanceModuleDef[];
  /** Carte sur la page d'accueil. Défaut : oui. `false` pour « Accueil » (lien vers soi). */
  home?: boolean;
  /**
   * Largeur de la carte d'accueil, en parts d'une ligne de **4**. `1` (défaut) = un quart,
   * `2` = la moitié. C'est le seul réglage de mise en page porté par un module : la grille
   * reste à 4 colonnes, une carte peut juste en prendre deux.
   */
  homeSpan?: 1 | 2;
  /**
   * Entrée de barre latérale. Défaut : oui — mais {@link isNavigableRoute} peut encore
   * l'écarter si la route n'est pas navigable.
   */
  sidebar?: boolean;
}

/**
 * L'ordre est celui du parcours métier : on crée une affaire, on la rattache à un client,
 * on facture, on encaisse, puis viennent les coûts et le pilotage.
 */
export const FINANCE_MODULES: FinanceModuleDef[] = [
  {
    id: 'home',
    route: 'home',
    icon: 'home',
    tone: 'primary',
    labelKey: 'FACTURATION.layout.NAV.HOME',
    home: false, // une carte « Accueil » sur l'accueil n'a pas de sens
  },
  {
    id: 'affaires',
    route: 'affaires',
    icon: 'work',
    tone: 'primary',
    labelKey: 'FACTURATION.layout.NAV.AFFAIRES',
    descKey: 'HOME.MODULES.PROJECTS.DESC',
  },
  {
    id: 'clients',
    route: 'clients',
    icon: 'corporate_fare',
    tone: 'secondary',
    labelKey: 'FACTURATION.layout.NAV.CLIENTS',
    descKey: 'HOME.MODULES.CLIENTS.DESC',
  },
  {
    id: 'invoicing',
    route: 'invoicing',
    icon: 'receipt_long',
    tone: 'tertiary',
    labelKey: 'FACTURATION.layout.NAV.INVOICING',
    descKey: 'HOME.MODULES.INVOICING.DESC',
  },
  {
    id: 'payments',
    route: 'payments',
    icon: 'credit_card',
    tone: 'teal',
    labelKey: 'FACTURATION.layout.NAV.PAYMENTS',
    descKey: 'HOME.MODULES.PAYMENTS.DESC',
  },
  // Les deux suivantes n'ont pas d'écran : leurs routes sont des `redirectTo: 'home'`.
  // Elles restent des cartes d'accueil (elles annoncent le périmètre à venir) et sont
  // écartées de la barre par `isNavigableRoute` — pas par un drapeau posé à la main, pour
  // qu'elles y entrent d'elles-mêmes le jour où la route existera.
  {
    id: 'recouvrement',
    route: 'recouvrement',
    icon: 'assignment_late',
    tone: 'danger',
    labelKey: 'HOME.MODULES.RECOVERY.LABEL',
    descKey: 'HOME.MODULES.RECOVERY.DESC',
  },
  {
    id: 'cost',
    route: 'cost',
    icon: 'payments',
    tone: 'warning',
    labelKey: 'FACTURATION.layout.NAV.COST',
    descKey: 'HOME.MODULES.COSTS.DESC',
    children: [
      {
        id: 'cost-approval',
        route: 'cost/approval',
        icon: 'price_check',
        tone: 'warning',
        labelKey: 'FACTURATION.layout.NAV.COST_APPROVAL',
      },
    ],
  },
  {
    id: 'tresorerie',
    route: 'tresorerie',
    icon: 'account_balance_wallet',
    tone: 'primary',
    labelKey: 'HOME.MODULES.TREASURY.LABEL',
    descKey: 'HOME.MODULES.TREASURY.DESC',
    // Sur deux parts, comme dans l'ancienne mise en page (`wide: true`).
    homeSpan: 2,
  },
  {
    id: 'subcontracting',
    route: 'subcontracting',
    icon: 'group',
    tone: 'teal',
    labelKey: 'FACTURATION.layout.NAV.SUBCONTRACTING',
    descKey: 'HOME.MODULES.SUBCONTRACTING.DESC',
  },
  {
    id: 'suppliers',
    route: 'suppliers',
    icon: 'storefront',
    tone: 'secondary',
    labelKey: 'FACTURATION.layout.NAV.SUPPLIERS',
    descKey: 'HOME.MODULES.SUPPLIERS.DESC',
  },
  {
    id: 'reporting',
    route: 'reporting',
    icon: 'bar_chart',
    tone: 'primary',
    labelKey: 'FACTURATION.layout.NAV.REPORTING',
    descKey: 'HOME.MODULES.REPORTING.DESC',
  },
  {
    id: 'admin',
    route: 'admin',
    icon: 'admin_panel_settings',
    tone: 'secondary',
    labelKey: 'FACTURATION.layout.NAV.ADMIN',
    descKey: 'HOME.MODULES.ADMIN.DESC',
  },
];

/** Modules qui méritent une carte sur l'accueil, dans l'ordre déclaré. */
export const HOME_MODULES = FINANCE_MODULES.filter((m) => m.home !== false);

/**
 * Une route est navigable si la config déclare un écran pour elle — donc **pas** si elle
 * n'est qu'un `redirectTo`. C'est la règle qui garde `recouvrement` et `tresorerie` hors
 * de la barre latérale tant qu'elles renvoient sur l'accueil, sans drapeau à maintenir.
 *
 * Le test porte sur le **premier segment** : les enfants (`cost/approval`) vivent dans un
 * `loadChildren` paresseux, donc absents de la config statique — on vérifie que leur
 * module parent existe, ce qui est la seule chose vérifiable sans charger le bundle.
 */
export function isNavigableRoute(children: Route[], route: string): boolean {
  const first = route.split('/')[0];
  const match = children.find((c) => c.path === first);
  return !!match && !match.redirectTo;
}

/**
 * Les permissions exigées par la route, telles que `permissionGuard` les lira. Vide =
 * accessible à tous. Sémantique **« au moins une »**, le mode par défaut du garde.
 */
export function routePermissions(children: Route[], route: string): string[] {
  const first = route.split('/')[0];
  const match = children.find((c) => c.path === first);
  const perms = match?.data?.['permissions'];
  return Array.isArray(perms) ? (perms as string[]) : [];
}

/**
 * L'URL courante ramenée au segment de nav correspondant.
 *
 * `daf-side-nav` compare en **égalité stricte** (`activeRoute === item.route`), alors que
 * les routes de nav sont des segments (`affaires`) et l'URL est absolue
 * (`/finance/affaires/3`) : sans cette conversion, aucune entrée ne s'allume jamais.
 *
 * Le plus long d'abord, et les enfants dans le même lot : sur `/finance/cost/approval`,
 * `cost/approval` et `cost` correspondent tous les deux, et renvoyer le parent laisserait
 * l'enfant éteint en permanence. La lib allume le parent de son côté via `hasActiveChild`.
 */
export function activeNavRoute(url: string, modules: FinanceModuleDef[]): string {
  const path = (url ?? '').split(/[?#]/)[0];
  const match = modules
    .flatMap((m) => [m, ...(m.children ?? [])])
    .sort((a, b) => b.route.length - a.route.length)
    .find((m) => new RegExp(`(^|/)${m.route}(/|$)`).test(path));
  return match ? match.route : '';
}
