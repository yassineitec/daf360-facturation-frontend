import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import {
  ButtonComponent, DataTableComponent, FieldMessageComponent, MetricCardComponent,
  ModalService, PageComponent, PageHeaderComponent, PaginationComponent,
  SearchToolbarComponent, SectionCardComponent, StatusBadgeComponent, TabsComponent,
  tabParam,
} from '@khalilrebhiitec/daf360';
import type {
  BadgeOptions, BreadcrumbItem, ButtonOptions, FilterField, FilterResult,
  MetricCardOptions, MetricDelta, PageHeaderBadge, SearchToolbarFilterConfig,
  TabItem, TableColumn, TableConfig, TableRow, ToolbarAction,
} from '@khalilrebhiitec/daf360';

import { SupplierService } from '../supplier.service';
import { SupplierDto } from '../supplier.model';
import {
  SUPPLIER_STATE_BADGE, SUPPLIER_STATE_LABEL, supplierCode, supplierState,
} from '../supplier-display';
import { PermissionDirective } from '../../../shared/permission.directive';
import { CostService } from '../../cost/cost.service';
import { CostLineDto, SupplierCostSummaryDto, SupplierLedgerDto } from '../../cost/cost.model';
import { STATUS_BADGE_VARIANT, statusKey } from '../../cost/cost-display';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
/**
 * Une ligne clé/valeur du panneau de détails. `label` est toujours une clé i18n.
 *
 * `ok` transforme la valeur en ÉTAT (point + texte) plutôt qu'en donnée — même
 * convention que `contratRows()` sur la fiche affaire : le texte reste la source,
 * le point n'est qu'un renfort, d'où son `aria-hidden` dans le gabarit.
 */
interface DetailField { label: string; value: string; ok?: boolean; }

/** Même forme que dans les fiches client et affaire, d'où les tuiles sont reprises. */
interface KpiTile {
  label:   string;
  value:   string;
  delta:   MetricDelta | null;
  options: MetricCardOptions;
}

/**
 * Deux onglets, et plus d'onglet « Informations » : identité, fiscal et bancaire
 * vivent désormais dans le panneau de gauche, comme sur la fiche affaire où la colonne
 * gauche porte TOUS les détails et la droite les données rattachées. Un onglet
 * « Informations » à côté d'un panneau qui dit la même chose était une redite.
 */
type SupplierTab = 'costs' | 'ledger';

/**
 * Page unique et généreuse plutôt qu'une seconde pagination : la fiche RÉSUME, la vue
 * fournisseur du module coûts (`/finance/cost/supplier/:id`) est l'écran complet — et
 * elle applique déjà exactement le même plafond, pour la même raison.
 */
const SUPPLIER_COST_PAGE_SIZE = 200;

/**
 * Fiche fournisseur — `/finance/suppliers/:id`.
 *
 * Elle remplace le panneau de droite du panneau scindé de la liste. Ce n'est pas qu'un
 * déplacement : la fiche y était coincée dans un tiers de largeur, n'avait pas d'URL —
 * donc pas de partage ni de rafraîchissement possible — et disparaissait dès qu'on
 * paginait. Elle suit maintenant le squelette des fiches facture, client et
 * recouvrement : deux colonnes, la gauche sticky, en **flex inline** (le `styles.css`
 * d'un remote ne contient que les classes que Tailwind a déjà vues).
 *
 * Ce qui a disparu au passage : les bordures et fonds en `rgba()` en dur, le vert
 * `#006b58` répété six fois, et les `<button class="decision-btn">` maison.
 */
@Component({
  selector: 'app-supplier-detail',
  imports: [
    TranslatePipe, PermissionDirective,
    PageComponent, PageHeaderComponent, SectionCardComponent, MetricCardComponent,
    TabsComponent, DataTableComponent, ButtonComponent, FieldMessageComponent,
    StatusBadgeComponent, SearchToolbarComponent, PaginationComponent,
  ],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  templateUrl: './supplier-detail.component.html',
  /*
   * Styles de COMPOSANT et non classes utilitaires, repris de la fiche affaire pour
   * les mêmes deux raisons :
   *
   * 1. la maquette demande des tailles que l'échelle de la lib ne porte pas (9 px pour
   *    les micro-libellés, 12,5 px pour les valeurs) et un interlettrage précis ;
   * 2. les écrire en classes Tailwind arbitraires (`text-[12.5px]`, `tracking-[.14em]`)
   *    les ferait dépendre du scan de l'app CONSOMMATRICE — le piège du remote (voir
   *    l'encadré du gabarit). Les styles de composant, eux, sont compilés avec le
   *    composant et voyagent avec lui.
   *
   * C'est aussi ce qui permet la GRILLE ci-dessous : le gabarit n'a plus à mettre son
   * flex en style en ligne pour survivre au styles.css du remote.
   */
  styles: [`
    /* ── Les deux colonnes ─────────────────────────────────────────────────── */
    .detail-split {
      display:     flex;
      flex-wrap:   wrap;
      gap:         2rem;
      align-items: flex-start;
    }

    /* Bornée en dur : au-delà de 420 px le panneau d'informations n'a plus rien à
       faire de la largeur, autant la rendre aux tableaux. */
    .detail-aside {
      flex:      0 1 30%;
      min-width: 320px;
      max-width: 420px;
    }

    .detail-main {
      flex:           1 1 480px;
      min-width:      0;
      display:        flex;
      flex-direction: column;
      gap:            1.5rem;
    }

    /* Une GRILLE, pas un flex-wrap : les quatre indicateurs passent de 4 à 3 puis 2
       colonnes ÉGALES, jamais une orpheline pleine largeur. */
    .kpi-row {
      display:             grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap:                 1.5rem;
      align-items:         stretch;
    }

    /* min-width:0 : un montant large ne doit pas pousser sa cellule au-delà de son
       1fr — c'est ce qui fait déborder une grille. */
    .kpi-cell {
      display:        flex;
      flex-direction: column;
      min-width:      0;
      min-height:     118px;
    }

    @media (max-width: 1400px) {
      .detail-split { gap: 1.5rem; }
      .detail-aside { min-width: 300px; max-width: 360px; }
    }

    /* Sous ~1150 px il n'y a plus de place pour deux colonnes : le panneau passe
       pleine largeur et son sticky n'a plus de sens (il serait collé en haut devant
       le contenu qu'on lit). */
    @media (max-width: 1150px) {
      .detail-aside {
        flex:      1 1 100%;
        max-width: none;
        min-width: 0;
      }
      .detail-aside > div { position: static !important; }
    }

    @media (max-width: 640px) {
      .kpi-row { gap: 1rem; }
    }

    /* ══ PANNEAU DE DÉTAILS (colonne gauche) ════════════════════════════════
       Mêmes classes et mêmes valeurs que la fiche affaire : les deux panneaux
       doivent se lire pareil. Toutes les couleurs viennent des jetons de la lib,
       avec un repli en dur si la feuille de la lib n'est pas encore chargée.
       ═════════════════════════════════════════════════════════════════════ */

    .dp {
      display:        flex;
      flex-direction: column;
      gap:            12px;
    }

    /* La SURFACE (fond, bordure, rayon, survol) vient de daf-section-card, comme
       toutes les autres cartes de la page — ce conteneur ne fait que la colonne de
       blocs et leurs séparateurs. */
    .dp-card {
      display:        flex;
      flex-direction: column;
    }

    .dp-block {
      display:        flex;
      flex-direction: column;
      gap:            8px;
      padding:        14px 16px;
    }

    .dp-block__head {
      display:         flex;
      align-items:     center;
      justify-content: space-between;
      gap:             8px;
    }

    /* LE style de libellé du panneau — il n'y en a pas d'autre. Toute autre taille
       ou graisse pour un libellé de section rouvrirait la hiérarchie floue que
       cette refonte supprime. */
    .dp-label {
      margin:         0;
      font-size:      9px;
      font-weight:    700;
      letter-spacing: .14em;
      text-transform: uppercase;
      color:          var(--color-on-surface-variant, #44474c);
    }

    /* 1 px = séparateur interne ; 2 px = séparateur de section majeure. C'est le
       trait qui porte le groupement, pas le blanc : dans 320 px de large, doubler
       les marges pour séparer coûte un écran de haut. */
    .dp-rule {
      height:     1px;
      background: var(--color-outline-variant, #c5c6cd);
      opacity:    .55;
    }
    .dp-rule--major { height: 2px; opacity: .4; }

    .dp-rows { margin: 0; }

    .dp-row {
      display:         flex;
      align-items:     baseline;
      justify-content: space-between;
      gap:             12px;
      padding:         6px 0;
      border-bottom:   1px solid var(--color-outline-variant, #c5c6cd);
    }
    /* Le filet de la dernière ligne doublerait le séparateur de section juste en
       dessous. */
    .dp-row--last { border-bottom: 0; padding-bottom: 0; }

    .dp-row__key {
      margin:    0;
      font-size: 12px;
      color:     var(--color-on-surface-variant, #44474c);
    }
    .dp-row__val {
      margin:      0;
      font-size:   12.5px;
      font-weight: 600;
      color:       var(--color-on-surface, #191c1e);
      text-align:  right;
    }

    /* État plutôt que valeur : le texte reste la source, le point n'est qu'un
       renfort — d'où aria-hidden sur le point dans le gabarit. */
    .dp-flag {
      display:     inline-flex;
      align-items: center;
      gap:         6px;
      font-weight: 600;
      color:       var(--color-on-surface-variant, #44474c);
    }
    .dp-flag__dot {
      width:         6px;
      height:        6px;
      border-radius: 50%;
      background:    var(--color-outline, #75777d);
      flex-shrink:   0;
    }
    .dp-flag--ok               { color: var(--color-tertiary, #00c1ad); }
    .dp-flag--ok .dp-flag__dot { background: var(--color-tertiary, #00c1ad); }

    /* L'IBAN : une seule valeur, en chiffres, qu'on lit caractère par caractère pour
       la comparer à un relevé — d'où la tabulaire et la coupure autorisée. */
    .dp-iban {
      margin:      0;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size:   12.5px;
      font-weight: 600;
      color:       var(--color-on-surface, #191c1e);
      word-break:  break-all;
    }
  `],
})
export class SupplierDetailComponent implements OnInit {
  private readonly svc       = inject(SupplierService);
  private readonly costSvc   = inject(CostService);
  private readonly translate = inject(TranslateService);
  private readonly modals    = inject(ModalService);
  private readonly router    = inject(Router);
  private readonly route     = inject(ActivatedRoute);
  private readonly currency  = inject(DisplayCurrencyPipe);

  /**
   * Lu sur `paramMap` plutôt que par `input()` lié à la route : ce remote est monté par
   * le routeur du shell, et `withComponentInputBinding()` est une option du *routeur
   * hôte*. Le paramètre d'URL, lui, est toujours là.
   */
  private readonly supplierId = Number(this.route.snapshot.paramMap.get('id'));

  supplier    = signal<SupplierDto | null>(null);
  loading     = signal(true);
  error       = signal<string | null>(null);
  actionError = signal<string | null>(null);

  isDeactivating = signal(false);

  // ═══ Volet financier ══════════════════════════════════════════════════════
  //
  // La fiche ne montrait que l'identité, l'IBAN et le fiscal : on ne pouvait pas
  // savoir, depuis le référentiel, ce qu'on avait dépensé chez un fournisseur. Ces
  // trois jeux de données viennent du module coûts, qui les expose déjà — c'est la
  // fiche qui n'allait pas les chercher.
  //
  // `paysId` vient du FOURNISSEUR et non de l'utilisateur connecté : on consulte
  // parfois un fournisseur rattaché à une autre entité, et prendre le pays du lecteur
  // afficherait alors zéro ligne sans dire pourquoi.
  summary   = signal<SupplierCostSummaryDto | null>(null);
  costLines = signal<CostLineDto[]>([]);
  ledger    = signal<SupplierLedgerDto | null>(null);
  /** Le volet financier charge après la fiche : il ne doit pas retarder l'identité. */
  loadingFinance = signal(false);

  /**
   * `tabParam` et non un `signal` nu : l'onglet actif vit dans l'URL (`?tab=`), donc
   * un lien vers le relevé d'un fournisseur s'envoie et survit à un rafraîchissement
   * — c'est ce que font déjà les fiches client et ligne de coût.
   */
  activeTab = tabParam<SupplierTab>(
    computed(() => this.tabs().map(t => t.id as SupplierTab)), 'costs');

  // ═══ En-tête ══════════════════════════════════════════════════════════════

  readonly headerSubtitle = computed(() => {
    const s = this.supplier();
    if (!s) return '';
    return [supplierCode(s), s.paysLabel].filter(Boolean).join(' · ');
  });

  readonly headerBadges = computed<PageHeaderBadge[]>(() => {
    const s = this.supplier();
    if (!s) return [];
    this.translate.currentLang();
    const state = supplierState(s);
    return [{
      label:   this.translate.instant(SUPPLIER_STATE_LABEL[state]),
      variant: SUPPLIER_STATE_BADGE[state],
      dot:     true,
    }];
  });

  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('SUPPLIERS.DETAIL.BACK'), link: ['..'] },
      { label: this.supplier()?.name ?? '—' },
    ];
  });

  // ═══ Contenu ══════════════════════════════════════════════════════════════

  readonly identityFields = computed<DetailField[]>(() => {
    const s = this.supplier();
    if (!s) return [];
    return [
      { label: 'SUPPLIERS.DETAIL.INFO.CODE',       value: supplierCode(s) },
      { label: 'SUPPLIERS.DETAIL.INFO.COUNTRY',    value: s.paysLabel ?? '—' },
      { label: 'SUPPLIERS.DETAIL.INFO.TYPE',       value: s.typeLabel ?? '—' },
      { label: 'SUPPLIERS.DETAIL.INFO.CREATED_AT', value: this.formatDate(s.createdAt) },
    ];
  });

  /**
   * Fiscal ET bancaire portés en ÉTATS et non en simples valeurs (`ok`) : sans n° de
   * TVA on ne peut pas déclarer, sans IBAN on ne peut pas payer. Un « — » disait
   * seulement « vide » ; ici la ligne dit ce qui manque, du même point coloré que
   * « Budget validé » sur la fiche affaire.
   */
  readonly fiscalFields = computed<DetailField[]>(() => {
    this.translate.currentLang();
    const s = this.supplier();
    if (!s) return [];
    const missing = this.translate.instant('SUPPLIERS.DETAIL.INFO.MISSING');
    return [
      { label: 'SUPPLIERS.DETAIL.INFO.TVA',
        value: s.numeroTva ?? missing, ok: !!s.numeroTva },
      { label: 'SUPPLIERS.DETAIL.INFO.TAX_ID',
        value: s.taxId ?? missing,     ok: !!s.taxId },
    ];
  });

  readonly ibanDisplay = computed(() => this.supplier()?.iban ?? null);

  // ═══ Centre d'actions ═════════════════════════════════════════════════════
  //
  // Trois niveaux, trois traitements visuels — repris de la fiche affaire, où cinq
  // `daf-button` de même taille ne disaient pas par où commencer. La hiérarchie vient
  // des échelons de la lib (`lg` contre `sm`), pas de balisage maison :
  //
  //   1. l'action principale, celle pour laquelle on ouvre la fiche d'un fournisseur :
  //      lui rattacher une dépense ;
  //   2. les deux actions opérationnelles, à largeurs égales sur une ligne ;
  //   3. la rangée de pied — ce qu'on cherche quand on le cherche, pas ce qu'on propose.

  readonly newCostLineOptions = computed<ButtonOptions>(() => {
    this.translate.currentLang();
    return {
      variant:   'primary',
      size:      'lg',
      fullWidth: true,
      iconStart: 'add',
      iconEnd:   'arrow_forward',
      label:     this.translate.instant('SUPPLIERS.DETAIL.ACTIONS.NEW_COST_LINE'),
    };
  });

  readonly editButtonOptions = computed<ButtonOptions>(() => {
    this.translate.currentLang();
    return {
      variant:   'secondary',
      size:      'sm',
      fullWidth: true,
      iconStart: 'edit_note',
      label:     this.translate.instant('SUPPLIERS.DETAIL.ACTIONS.EDIT'),
    };
  });

  readonly costViewButtonOptions = computed<ButtonOptions>(() => {
    this.translate.currentLang();
    return {
      variant:   'secondary',
      size:      'sm',
      fullWidth: true,
      iconStart: 'receipt_long',
      label:     this.translate.instant('SUPPLIERS.DETAIL.ACTIONS.COST_VIEW'),
    };
  });

  /**
   * La pastille de statut de la rangée de pied. Toujours HORS bouton, contrairement à
   * la fiche affaire où le statut ouvre une modale de transition : un fournisseur n'a
   * que deux états et **aucun endpoint ne le réactive**, donc il n'existe aucune
   * transition à proposer. Un bouton désactivé qui montre une donnée utile invite au
   * clic pour rien.
   */
  readonly statusChipLabel = computed(() => {
    this.translate.currentLang();
    const s = this.supplier();
    return s ? this.translate.instant(SUPPLIER_STATE_LABEL[supplierState(s)]) : '';
  });

  readonly statusChipOptions = computed<BadgeOptions>(() => {
    const s = this.supplier();
    return {
      variant: s ? SUPPLIER_STATE_BADGE[supplierState(s)] : 'neutral',
      dot:     true,
      size:    'sm',
    };
  });

  // ═══ Indicateurs ══════════════════════════════════════════════════════════
  //
  // Quatre tuiles, comme les fiches client et affaire. Les deux premières décrivent
  // l'engagement (ce qu'on a commandé), les deux dernières le règlement (ce qu'on a
  // payé et ce qui reste dû) — c'est la distinction que porte tout le module coûts.

  readonly kpiTiles = computed<KpiTile[]>(() => {
    this.translate.currentLang();
    const s = this.summary();
    const rows = this.ledger()?.rows ?? [];
    // Le solde courant est celui de la DERNIÈRE écriture : le back tient un solde
    // progressif, la dernière ligne porte donc la position actuelle du compte.
    const last = rows.length ? rows[rows.length - 1] : null;
    const due  = last?.soldeCrediteur ?? null;   // ce qu'on doit encore
    const over = last?.soldeDebiteur  ?? null;   // ce qu'on a payé en trop

    return [
      {
        label: 'SUPPLIERS.DETAIL.KPI.LINES',
        value: String(s?.lineCount ?? 0),
        delta: null,
        options: { icon: 'receipt_long', iconColor: 'text-primary', iconBg: 'bg-primary/10' },
      },
      {
        // TTC, comme la carte fournisseur de la page coûts et la tuile de la fiche
        // ligne de coût : les trois doivent s'accorder sur le total d'un fournisseur.
        label: 'SUPPLIERS.DETAIL.KPI.TOTAL_TTC',
        value: this.currency.transform(s?.totalGrossEur ?? 0, 'EUR'),
        delta: null,
        options: { icon: 'euro', iconColor: 'text-teal', iconBg: 'bg-teal/10' },
      },
      {
        label: 'SUPPLIERS.DETAIL.KPI.REGLEMENTS',
        value: String(rows.length),
        delta: null,
        options: { icon: 'payments', iconColor: 'text-secondary', iconBg: 'bg-secondary/10' },
      },
      {
        label: over != null ? 'SUPPLIERS.DETAIL.KPI.OVERPAID' : 'SUPPLIERS.DETAIL.KPI.BALANCE',
        value: this.fmtAmount(over ?? due ?? 0),
        delta: null,
        options: {
          icon: 'account_balance_wallet',
          iconColor: over != null ? 'text-warning' : 'text-on-surface-variant',
          iconBg:    over != null ? 'bg-warning/10' : 'bg-surface-container',
        },
      },
    ];
  });

  // ═══ Onglets ══════════════════════════════════════════════════════════════

  readonly tabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    return [
      { id: 'costs',  label: this.translate.instant('SUPPLIERS.DETAIL.TABS.COSTS'),
        count: this.costLines().length || null },
      { id: 'ledger', label: this.translate.instant('SUPPLIERS.DETAIL.TABS.LEDGER'),
        count: (this.ledger()?.rows ?? []).length || null },
    ];
  });

  // ═══ Barre d'outils des deux onglets ══════════════════════════════════════
  //
  // Recherche, filtre et export, comme les onglets « TS », « Factures » et
  // « Paiements » de la fiche affaire — même `daf-search-toolbar`, même action
  // d'export à droite, même `asFilterValue()` pour lire le panneau.
  //
  // Tout se fait CÔTÉ CLIENT, et c'est un choix, pas un raccourci : les deux jeux de
  // données sont déjà chargés en entier (200 lignes au plus, cf.
  // SUPPLIER_COST_PAGE_SIZE) et aucun des deux endpoints ne prend de paramètre de
  // recherche. Filtrer au serveur demanderait de nouveaux paramètres d'API pour un
  // volume qui tient en mémoire.

  costSearch = signal('');
  costStatus = signal('');
  costPage     = signal(0);
  costPageSize = signal(10);

  ledgerSearch = signal('');
  ledgerType   = signal('');
  ledgerPage     = signal(0);
  ledgerPageSize = signal(10);

  readonly filterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return {
      title:        t('SUPPLIERS.DETAIL.TOOLBAR.FILTERS'),
      applyLabel:   t('SUPPLIERS.DETAIL.TOOLBAR.APPLY'),
      cancelLabel:  t('SUPPLIERS.DETAIL.TOOLBAR.CANCEL'),
      resetLabel:   t('SUPPLIERS.DETAIL.TOOLBAR.RESET'),
      triggerLabel: t('SUPPLIERS.DETAIL.TOOLBAR.FILTERS'),
    };
  });

  /** Désactivé quand il n'y a rien à écrire — même règle que la fiche affaire. */
  private exportAction(disabled: boolean): ToolbarAction[] {
    return [{
      id:       'export',
      icon:     'download',
      label:    this.translate.instant('SUPPLIERS.DETAIL.TOOLBAR.EXPORT'),
      position: 'right',
      disabled,
    }];
  }

  readonly costToolbarActions   = computed(() => this.exportAction(this.filteredCostLines().length === 0));
  readonly ledgerToolbarActions = computed(() => this.exportAction(this.filteredLedgerRows().length === 0));

  /**
   * Les statuts RÉELLEMENT présents, pas la liste des huit statuts possibles : proposer
   * « Rejetée » à qui n'a que des lignes approuvées offre un filtre qui ne peut que
   * vider le tableau. Même construction que `tsFilterFields()` sur la fiche affaire.
   */
  readonly costFilterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    return [{
      name:    'status',
      label:   this.translate.instant('SUPPLIERS.DETAIL.COSTS.COL_STATUS'),
      type:    'select',
      options: [...new Set(this.costLines().map(l => l.status))].sort()
        .map(value => ({ value, label: this.translate.instant(statusKey(value)) })),
    }];
  });

  /**
   * Le mouvement plutôt que le montant : un relevé se lit « qu'est-ce qui reste dû »
   * (crédit), « qu'ai-je payé en trop » (débit) ou « qu'est-ce qui est soldé » (ni l'un
   * ni l'autre — un règlement au centime près ne produit aucune des deux colonnes, voir
   * SupplierLedgerService).
   */
  readonly ledgerFilterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [{
      name:    'type',
      label:   t('SUPPLIERS.DETAIL.LEDGER.FILTER_TYPE'),
      type:    'select',
      options: [
        { value: 'CREDIT',  label: t('SUPPLIERS.DETAIL.LEDGER.TYPE_CREDIT') },
        { value: 'DEBIT',   label: t('SUPPLIERS.DETAIL.LEDGER.TYPE_DEBIT') },
        { value: 'SETTLED', label: t('SUPPLIERS.DETAIL.LEDGER.TYPE_SETTLED') },
      ],
    }];
  });

  /** Le panneau renvoie `string | string[] | …` selon le type de champ. */
  asFilterValue(result: FilterResult, key: string): string {
    const v = result[key];
    if (Array.isArray(v)) return (v[0] as string) ?? '';
    return typeof v === 'string' ? v : '';
  }

  onCostSearch(value: string): void   { this.costSearch.set(value);   this.costPage.set(0); }
  onCostFilter(result: FilterResult): void {
    this.costStatus.set(this.asFilterValue(result, 'status'));
    this.costPage.set(0);
  }
  onCostFilterReset(): void { this.costStatus.set(''); this.costPage.set(0); }

  onLedgerSearch(value: string): void { this.ledgerSearch.set(value); this.ledgerPage.set(0); }
  onLedgerFilter(result: FilterResult): void {
    this.ledgerType.set(this.asFilterValue(result, 'type'));
    this.ledgerPage.set(0);
  }
  onLedgerFilterReset(): void { this.ledgerType.set(''); this.ledgerPage.set(0); }

  onCostToolbarAction(id: string): void   { if (id === 'export') this.exportCostLines(); }
  onLedgerToolbarAction(id: string): void { if (id === 'export') this.exportLedger(); }

  // ═══ Onglet « Lignes de coût » ════════════════════════════════════════════

  readonly filteredCostLines = computed<CostLineDto[]>(() => {
    const q = this.costSearch().trim().toLowerCase();
    const status = this.costStatus();
    return this.costLines().filter(l =>
      (!status || l.status === status) &&
      (!q || `${l.reference ?? ''} ${l.label ?? ''}`.toLowerCase().includes(q)));
  });

  /**
   * La page courante, bornée : vider un filtre depuis la page 4 laisserait sinon un
   * tableau vide alors qu'il reste des lignes. Les gestionnaires ci-dessus remettent
   * déjà `costPage` à 0 sur chaque changement, ceci protège le cas où les DONNÉES
   * rétrécissent sous la page (une suppression, un rechargement).
   */
  readonly pagedCostLines = computed<CostLineDto[]>(() => {
    const rows = this.filteredCostLines();
    const size = this.costPageSize();
    const page = Math.min(this.costPage(), Math.max(0, Math.ceil(rows.length / size) - 1));
    return rows.slice(page * size, page * size + size);
  });

  readonly costTotalPages = computed(() =>
    Math.ceil(this.filteredCostLines().length / this.costPageSize()));

  readonly costColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'reference', label: t('SUPPLIERS.DETAIL.COSTS.COL_REF'),    type: 'text' },
      { key: 'label',     label: t('SUPPLIERS.DETAIL.COSTS.COL_LABEL'),  type: 'text' },
      { key: 'date',      label: t('SUPPLIERS.DETAIL.COSTS.COL_DATE'),   type: 'text' },
      { key: 'status',    label: t('SUPPLIERS.DETAIL.COSTS.COL_STATUS'), type: 'badge' },
      { key: 'gross',     label: t('SUPPLIERS.DETAIL.COSTS.COL_GROSS'),  type: 'text', align: 'right' },
    ];
  });

  readonly costRows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    return this.pagedCostLines().map(l => ({
      id:        l.id,
      reference: l.reference ?? '—',
      label:     l.label ?? '—',
      date:      this.formatDate(l.transactionDate),
      // Une colonne `badge` attend un objet `{ label, options }` — pas un libellé
      // plus un champ de variante à côté (cf. cost-lines-table-section).
      status: {
        label:   this.translate.instant(statusKey(l.status)),
        options: { variant: STATUS_BADGE_VARIANT[l.status] ?? 'neutral', dot: true, size: 'sm' },
      },
      gross:     this.currency.transform(l.grossAmountLocal, l.currency ?? 'TND'),
    }));
  });

  readonly costConfig = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      showHeader:   true,
      hoverable:    true,
      loading:      this.loadingFinance(),
      // « Aucune ligne » et « aucun résultat » ne veulent pas dire la même chose : le
      // second se corrige en vidant la recherche, le premier non.
      emptyMessage: this.translate.instant(this.costLines().length === 0
        ? 'SUPPLIERS.DETAIL.COSTS.EMPTY'
        : 'SUPPLIERS.DETAIL.TOOLBAR.NO_MATCH'),
    };
  });

  // ═══ Onglet « Règlement » ═════════════════════════════════════════════════
  //
  // Le même relevé que l'onglet Règlement de la fiche ligne de coût, en lecture
  // seule : créer ou modifier un règlement se fait depuis une ligne de coût, pas
  // depuis le référentiel fournisseur. Les six colonnes de détail fiscal restent
  // là-bas — ici on montre le mouvement de compte, pas la décomposition de TVA.

  readonly ledgerColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'date',           label: t('SUPPLIERS.DETAIL.LEDGER.COL_DATE'),            type: 'text' },
      { key: 'label',          label: t('SUPPLIERS.DETAIL.LEDGER.COL_LABEL'),           type: 'text' },
      { key: 'debit',          label: t('SUPPLIERS.DETAIL.LEDGER.COL_DEBIT'),           type: 'text', align: 'right' },
      { key: 'credit',         label: t('SUPPLIERS.DETAIL.LEDGER.COL_CREDIT'),          type: 'text', align: 'right' },
      { key: 'soldeDebiteur',  label: t('SUPPLIERS.DETAIL.LEDGER.COL_SOLDE_DEBITEUR'),  type: 'text', align: 'right' },
      { key: 'soldeCrediteur', label: t('SUPPLIERS.DETAIL.LEDGER.COL_SOLDE_CREDITEUR'), type: 'text', align: 'right' },
    ];
  });

  readonly filteredLedgerRows = computed(() => {
    const q = this.ledgerSearch().trim().toLowerCase();
    const type = this.ledgerType();
    return (this.ledger()?.rows ?? []).filter(r => {
      // « Soldé » = ni débit ni crédit : le règlement couvrait la ligne au centime.
      const matchesType =
        !type ||
        (type === 'CREDIT'  && r.credit != null) ||
        (type === 'DEBIT'   && r.debit  != null) ||
        (type === 'SETTLED' && r.credit == null && r.debit == null);
      return matchesType && (!q || (r.label ?? '').toLowerCase().includes(q));
    });
  });

  readonly pagedLedgerRows = computed(() => {
    const rows = this.filteredLedgerRows();
    const size = this.ledgerPageSize();
    const page = Math.min(this.ledgerPage(), Math.max(0, Math.ceil(rows.length / size) - 1));
    return rows.slice(page * size, page * size + size);
  });

  readonly ledgerTotalPages = computed(() =>
    Math.ceil(this.filteredLedgerRows().length / this.ledgerPageSize()));

  /**
   * `id` doit rester l'identifiant du RÈGLEMENT et non l'index de la page : avec un
   * index, la première ligne de chaque page porterait `id: 0` et le suivi de `daf-data-table`
   * confondrait deux lignes différentes d'une page à l'autre. `reglementId` est
   * garanti par le back sur chaque écriture (une écriture = un règlement).
   */
  readonly ledgerRows = computed<TableRow[]>(() =>
    this.pagedLedgerRows().map(r => ({
      id:             r.reglementId,
      date:           this.formatDate(r.date),
      label:          r.label ?? '—',
      debit:          this.fmtAmount(r.debit),
      credit:         this.fmtAmount(r.credit),
      soldeDebiteur:  this.fmtAmount(r.soldeDebiteur),
      soldeCrediteur: this.fmtAmount(r.soldeCrediteur),
    })));

  readonly ledgerConfig = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      showHeader:   true,
      hoverable:    false,
      loading:      this.loadingFinance(),
      emptyMessage: this.translate.instant((this.ledger()?.rows ?? []).length === 0
        ? 'SUPPLIERS.DETAIL.LEDGER.EMPTY'
        : 'SUPPLIERS.DETAIL.TOOLBAR.NO_MATCH'),
    };
  });

  /**
   * `SupplierLedgerRowDto` ne porte aucune devise — mêmes raisons et même formatage
   * que la fiche ligne de coût : un nombre nu, pas de passage par
   * `DisplayCurrencyPipe`, qui exige un code devise que ce DTO n'a pas.
   */
  private fmtAmount(v: number | null): string {
    if (v == null) return '—';
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(v);
  }

  // ═══ Export ═══════════════════════════════════════════════════════════════
  //
  // L'ensemble FILTRÉ, pas la page affichée : on exporte ce qu'on a demandé, pas ce
  // qui tient à l'écran. Même comportement que `exportTs()` sur la fiche affaire.

  exportCostLines(): void {
    const t = (k: string) => this.translate.instant(k);
    this.downloadCsv(
      `FOURNISSEUR_${supplierCode(this.supplier()!)}_LIGNES`,
      [t('SUPPLIERS.DETAIL.COSTS.COL_REF'), t('SUPPLIERS.DETAIL.COSTS.COL_LABEL'),
       t('SUPPLIERS.DETAIL.COSTS.COL_DATE'), t('SUPPLIERS.DETAIL.COSTS.COL_STATUS'),
       t('SUPPLIERS.DETAIL.COSTS.COL_GROSS'), t('SUPPLIERS.DETAIL.EXPORT.CURRENCY')],
      this.filteredCostLines().map(l => [
        l.reference ?? '',
        l.label ?? '',
        this.formatDate(l.transactionDate),
        t(statusKey(l.status)),
        // Le nombre NU dans le CSV, sans symbole ni séparateur de milliers : la
        // cellule doit rester un nombre pour le tableur qui l'ouvre. La devise part
        // dans sa propre colonne.
        l.grossAmountLocal ?? '',
        l.currency ?? '',
      ]));
  }

  exportLedger(): void {
    const t = (k: string) => this.translate.instant(k);
    this.downloadCsv(
      `FOURNISSEUR_${supplierCode(this.supplier()!)}_RELEVE`,
      [t('SUPPLIERS.DETAIL.LEDGER.COL_DATE'), t('SUPPLIERS.DETAIL.LEDGER.COL_LABEL'),
       t('SUPPLIERS.DETAIL.LEDGER.COL_DEBIT'), t('SUPPLIERS.DETAIL.LEDGER.COL_CREDIT'),
       t('SUPPLIERS.DETAIL.LEDGER.COL_SOLDE_DEBITEUR'),
       t('SUPPLIERS.DETAIL.LEDGER.COL_SOLDE_CREDITEUR')],
      this.filteredLedgerRows().map(r => [
        this.formatDate(r.date),
        r.label ?? '',
        r.debit ?? '',
        r.credit ?? '',
        r.soldeDebiteur ?? '',
        r.soldeCrediteur ?? '',
      ]));
  }

  /**
   * Même implémentation que `downloadCsv()` sur la fiche affaire, aux deux détails qui
   * la rendent utilisable sous Excel FR : le point-virgule comme séparateur, et le BOM
   * UTF-8 en tête — sans lui, « Règlement » et « coût » arrivent en mojibake.
   */
  private downloadCsv(baseName: string, headers: string[], rows: (string | number | null)[][]): void {
    const cell = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv  = [headers, ...rows].map(r => r.map(cell).join(';')).join('\r\n');

    const url  = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href     = url;
    link.download = `${baseName}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ═══ Chargement ═══════════════════════════════════════════════════════════

  ngOnInit(): void {
    if (!this.supplierId) {
      this.loading.set(false);
      this.error.set(this.translate.instant('SUPPLIERS.DETAIL.LOAD_ERROR'));
      return;
    }
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getSupplier(this.supplierId).subscribe({
      next: s => {
        this.supplier.set(s);
        this.loading.set(false);
        this.loadFinance(s);
      },
      error: () => {
        this.error.set(this.translate.instant('SUPPLIERS.DETAIL.LOAD_ERROR'));
        this.loading.set(false);
      },
    });
  }

  /**
   * Le volet financier, en second temps et sans bloquer la fiche : l'identité est ce
   * qu'on vient lire, elle ne doit pas attendre trois appels au module coûts.
   *
   * Aucune erreur remontée à l'écran ici : les trois méthodes de `CostService`
   * utilisées rattrapent déjà leurs échecs et renvoient un résultat vide (`[]` /
   * `{ supplier: null, rows: [] }`). Un fournisseur sans dépense et un module coûts
   * injoignable se présentent donc de la même façon — c'est le compromis de ces
   * `catchError`, pas un oubli d'ici.
   */
  private loadFinance(s: SupplierDto): void {
    const paysId = s.paysId;
    if (!paysId) return;

    this.loadingFinance.set(true);
    forkJoin({
      summaries: this.costSvc.getCostLinesBySupplier(paysId),
      lines:     this.costSvc.getCostLines({ paysId, supplierId: s.id, size: SUPPLIER_COST_PAGE_SIZE }),
      ledger:    this.costSvc.getLedgerForSupplier(s.id),
    }).subscribe({
      next: ({ summaries, lines, ledger }) => {
        this.summary.set(summaries.find(x => x.supplierId === s.id) ?? null);
        this.costLines.set(lines.content);
        this.ledger.set(ledger);
        this.loadingFinance.set(false);
      },
      error: () => this.loadingFinance.set(false),
    });
  }

  /**
   * La vue fournisseur du module coûts, qui porte ce que cette fiche ne fait que
   * résumer : les lignes avec leurs actions (soumettre, régler, éditer) et le relevé
   * complet avec sa décomposition fiscale.
   */
  goToCostView(): void {
    this.router.navigate(['/finance/cost/supplier', this.supplierId]);
  }

  /**
   * Le formulaire de création d'une ligne de coût, fournisseur et pays préremplis via
   * les paramètres de requête — le même point d'entrée que le bouton de la vue
   * fournisseur du module coûts (`CostFormComponent.prefillFromQueryParams()`), pour
   * ne pas avoir à rechercher au clavier le fournisseur qu'on a sous les yeux.
   */
  goToNewCostLine(): void {
    const s = this.supplier();
    if (!s) return;
    this.router.navigate(['/finance/cost/new'], {
      queryParams: { paysId: s.paysId, supplierId: s.id },
    });
  }

  // ═══ Actions ══════════════════════════════════════════════════════════════

  /** `/finance/suppliers/:id/edit` — l'assistant de création en mode modification. */
  goToEdit(): void { this.router.navigate(['edit'], { relativeTo: this.route }); }

  openDeactivate(): void {
    const s = this.supplier();
    if (!s) return;
    this.actionError.set(null);
    this.modals.open({
      title:           this.translate.instant('SUPPLIERS.DETAIL.DEACTIVATE_TITLE'),
      // `icon` + le corps du message portent la gravité : `ModalButton.variant` ne
      // connaît que `primary` et `secondary`, il n'y a pas de bouton rouge en modale.
      icon:            'block',
      body:            this.translate.instant('SUPPLIERS.DETAIL.DEACTIVATE_MSG', { name: s.name }),
      size:            'sm',
      closeOnBackdrop: true,
      buttons: [
        { label: this.translate.instant('SUPPLIERS.COMMON.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label:   this.translate.instant('SUPPLIERS.DETAIL.DEACTIVATE_CONFIRM'),
          variant: 'primary',
          icon:    'block',
          action:  r => { r.close(); this.confirmDeactivate(); },
        },
      ],
    });
  }

  /**
   * Après désactivation, retour à la liste : ni `GET /suppliers` ni `/search` ne
   * renvoient les inactifs, donc rester sur une fiche que la liste ne référence plus
   * n'apprendrait rien. Et il n'y a pas de réactivation — aucun endpoint ne remet
   * `isActive` à vrai.
   */
  confirmDeactivate(): void {
    this.isDeactivating.set(true);
    this.svc.deactivate(this.supplierId).subscribe({
      next: () => {
        this.isDeactivating.set(false);
        this.router.navigate(['..'], { relativeTo: this.route });
      },
      error: err => {
        this.isDeactivating.set(false);
        this.actionError.set(err?.error?.message
          ?? this.translate.instant('SUPPLIERS.DETAIL.ACTION_ERROR'));
      },
    });
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString(
      this.translate.currentLang() === 'en' ? 'en-GB' : 'fr-FR',
      { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
