import { Component, OnInit, TemplateRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  AvatarGroupComponent, BarChartComponent, ButtonComponent, ButtonOptions,
  ChipGroupComponent, DataTableComponent, MetricCardComponent,
  DrawerComponent, FormFieldComponent, FormFieldOptions, GaugeComponent, ModalService,
  PageComponent, PageHeaderComponent, ProgressBarComponent, ProgressBarOptions,
  RadioGroupComponent, SearchToolbarComponent, SectionCardComponent, StatusBadgeComponent,
  TabsComponent,
} from '@khalilrebhiitec/daf360';
import type {
  AvatarData, BadgeCell, BadgeOptions, BarChartBar, BarChartOptions, BreadcrumbItem,
  ChipGroupConfig, ChipOption, DrawerConfig,
  MetricCardOptions, MetricDelta,
  FilterField, FilterResult, GaugeOptions, PageHeaderBadge, RadioOption,
  SearchToolbarFilterConfig, TabItem, TableAction, TableColumn, TableConfig, TableRow,
  ToolbarAction,
} from '@khalilrebhiitec/daf360';
import { AffaireService } from './affaire.service';
import { AffaireWizardService } from './affaire-wizard.service';
import {
  AffaireDetail, RafDetailsDto, AffaireKpisDto, TsDto,
  AffaireInvoiceItem, AffairePaymentItem, PaysRefDto,
  STATUT_TRANSITIONS, STATUT_LABELS,
} from './affaire.model';
import { distinctResponsables } from './affaire-display';
import { UserStore } from '../../core/user.store';
import { PermissionDirective } from '../../shared/permission.directive';
import { TsFormComponent } from './ts/ts-form.component';
import { ExpenseFormComponent } from './billing/modes/expense-form.component';
import { ExpenseHistoryComponent } from './billing/modes/expense-history.component';
import { DisplayCurrencyPipe } from '../../shared/display-currency.pipe';
import { STATUT_BADGE_VARIANT } from './affaire-display';
import {
  INVOICE_STATUT_BADGE, TS_STATUT_BADGE, enumLabel,
} from '../../shared/enum-labels';
import { EmployeeAvatar, EmployeeAvatarService } from '../../core/employee-avatar.service';

/** A read-only label/value pair. `label` is always a translation key. */
interface DetailField { label: string; value: string; }

/**
 * Un responsable de l'affaire tel que la fiche l'affiche : UNE ENTRÉE PAR PERSONNE,
 * ses activités et disciplines regroupées, son budget alloué cumulé.
 *
 * `affaire_responsables` porte une ligne par couple (personne, activité) depuis V26 :
 * lister les lignes brutes ferait apparaître deux fois la même personne dès qu'elle
 * porte deux activités.
 */
interface ResponsableEntry {
  userId:    number;
  fullName:  string;
  /** Rôle · activités · disciplines, dédoublonnés et joints — vide si rien n'est renseigné. */
  detail:    string;
  /** Somme des allocations de la personne, déjà formatée — vide si aucune n'est renseignée. */
  budget:    string;
}

/** One `daf-metric-card` of the right column's KPI row. `label` is a translation key. */
interface KpiTile {
  label:   string;
  value:   string;
  delta:   MetricDelta | null;
  options: MetricCardOptions;
}

interface RowDetail {
  titleKey: string;
  ref:      string;
  fields:   DetailField[];
  /** Optional footer button — hands the row over to its own module. */
  openAction?: { labelKey: string; run: () => void };
}

interface ActivityRow {
  id:       string;
  icon:     string;
  titleKey: string;
  params:   Record<string, string>;
  sub:      string;
  ts:       number;
}


const MONTH_LABELS = ['JAN', 'FÉV', 'MAR', 'AVR', 'MAI', 'JUN', 'JUL', 'AOÛ', 'SEP', 'OCT', 'NOV', 'DÉC'];

/** Statuts de facture qui ne génèrent plus d'échéance à suivre. */
const SETTLED_INVOICE_STATUTS = new Set(['PAID', 'CANCELLED', 'CREDIT_NOTED']);

/** Statuts où la facture accepte encore une modification (cf. son propre écran). */
const EDITABLE_INVOICE_STATUTS = new Set(['DRAFT', 'RETURNED']);

const PRIORITY_BADGE: Record<string, 'danger' | 'warning' | 'neutral'> = {
  high: 'danger', medium: 'warning', standard: 'neutral',
};

@Component({
  selector: 'app-affaire-detail',
  imports: [
    TranslatePipe, DisplayCurrencyPipe, DecimalPipe, PermissionDirective,
    PageComponent, PageHeaderComponent, SectionCardComponent, TabsComponent, ButtonComponent,
    ProgressBarComponent, StatusBadgeComponent, SearchToolbarComponent, DataTableComponent, MetricCardComponent,
    DrawerComponent, RadioGroupComponent, FormFieldComponent,
    GaugeComponent, BarChartComponent, AvatarGroupComponent, ChipGroupComponent,
    TsFormComponent,
    // La fiche utilise les deux morceaux séparément : le formulaire dans la modale
    // « Frais remboursables », l'historique dans l'onglet « Frais ».
    ExpenseFormComponent, ExpenseHistoryComponent,
  ],
  // Injected to format amounts inside computeds (table rows, CSV, bar labels), so it
  // has to be provided — the pipe is only ambient in a template.
  providers: [DisplayCurrencyPipe],
  templateUrl: './affaire-detail.component.html',
  // ═══════════════════════════════════════════════════════════════════════════
  // Pourquoi des styles de composant, alors que la page est en styles inline
  //
  // La page évitait les classes parce que le `styles.css` d'un remote ne contient que les
  // classes que Tailwind a déjà vues à la compilation : une classe neuve n'existe pas dans
  // le CSS servi tant que le remote n'est pas reconstruit, et la mise en page retombe en
  // une colonne. Mais les styles d'un COMPOSANT ne passent pas par ce scan — ils sont
  // compilés dans le composant lui-même, donc ils voyagent avec lui.
  //
  // C'est ce qui débloque les MEDIA QUERIES, impossibles dans un attribut `style` : sans
  // elles, la seule mise en page possible était `flex-wrap` avec une base en pixels, et
  // c'est précisément ce qui cassait sur un écran de portable — quatre tuiles de base
  // 200 px dans 700 px de colonne se replient 3 + 1, laissant une tuile orpheline sur sa
  // propre ligne. Les rangées sont donc des GRILLES `auto-fit`/`minmax` (ce que les
  // commentaires du template décrivaient déjà sans que ce soit implémenté) : les colonnes
  // en `1fr` sont égales par construction et le nombre par ligne s'adapte tout seul.
  // ═══════════════════════════════════════════════════════════════════════════
  styles: [`
    /* ── Les deux colonnes ─────────────────────────────────────────────────── */
    .detail-split {
      display:     flex;
      flex-wrap:   wrap;
      gap:         2rem;
      align-items: flex-start;
    }

    /* Colonne gauche : ~30 % au-delà du portable, mais bornée en dur — au-delà de 420 px
       la carte d'informations n'a plus rien à faire de la largeur, autant la donner au
       graphique. */
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

    /* ── Rangées de cartes : des grilles, pas du flex-wrap ─────────────────── */
    .kpi-row, .tile-row, .bottom-row {
      display: grid;
      gap:     1.5rem;
      align-items: stretch;
    }

    /* 170 px : les quatre indicateurs tiennent sur une ligne dès ~740 px de colonne, donc
       sur un portable de 1366 px. En dessous, la grille passe à trois puis deux colonnes
       ÉGALES — jamais une orpheline pleine largeur. */
    .kpi-row    { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
    .tile-row   { grid-template-columns: repeat(auto-fit, minmax(215px, 1fr)); }
    .bottom-row { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }

    /* Les hôtes de carte : display:flex pour que la carte remplisse sa cellule, et
       min-width:0 pour qu'un contenu large (un montant, un libellé) ne pousse pas la
       colonne au-delà de son 1fr — c'est ce qui fait déborder une grille. */
    .kpi-cell, .tile-cell, .bottom-cell {
      display:        flex;
      flex-direction: column;
      min-width:      0;
    }
    .kpi-cell    { min-height: 118px; }
    .tile-cell   { min-height: 210px; height: auto; }
    .bottom-cell { min-height: 300px; height: auto; }

    /* ── En-tête du panneau graphique ──────────────────────────────────────── */
    /* Deux rangées : titre + puces, puis légendes + cumul. En une seule rangée, le bloc
       « Total cumulé » se repliait en emportant sa bordure gauche, qui pendait alors dans
       le vide à côté du chiffre. Ici la séparation est le border-top de la seconde
       rangée : elle court sur toute la largeur et ne peut pas devenir orpheline. */
    .chart-head {
      display:         flex;
      flex-wrap:       wrap;
      gap:             1rem;
      align-items:     center;
      justify-content: space-between;
    }

    .chart-legend {
      display:         flex;
      flex-wrap:       wrap;
      gap:             0.75rem 1.5rem;
      align-items:     flex-end;
      justify-content: space-between;
      padding-top:     1rem;
      border-top:      1px solid var(--color-outline-variant, #bdc9c4);
    }

    /* ── Portable et en dessous ────────────────────────────────────────────── */
    /* 1400 px : la fenêtre d'un portable moins la barre latérale de 256 px et les marges
       du shell, c'est ~1050 px de contenu. On resserre la gouttière et la colonne gauche
       pour rendre cette largeur au graphique et aux tableaux. */
    @media (max-width: 1400px) {
      .detail-split { gap: 1.5rem; }
      .detail-aside { min-width: 300px; max-width: 360px; }
    }

    /* En dessous de ~1150 px il n'y a plus de place pour deux colonnes : la carte
       d'informations passe pleine largeur au-dessus du reste, et son sticky n'a plus de
       sens (elle serait collée en haut devant le contenu qu'on lit). */
    @media (max-width: 1150px) {
      .detail-aside {
        flex:      1 1 100%;
        max-width: none;
        min-width: 0;
      }
      .detail-aside > div { position: static !important; }
    }

    @media (max-width: 640px) {
      .kpi-row, .tile-row, .bottom-row { gap: 1rem; }
      .chart-legend { align-items: flex-start; }
      .chart-legend > .text-right { text-align: left; }
    }
  `],
})
export class AffaireDetailComponent implements OnInit {
  // Bound from route param via withComponentInputBinding()
  id = input<string>();

  private readonly svc       = inject(AffaireService);
  private readonly wizardSvc = inject(AffaireWizardService);
  private readonly store     = inject(UserStore);
  private readonly router    = inject(Router);
  private readonly route     = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);
  private readonly modals    = inject(ModalService);
  private readonly avatarSvc = inject(EmployeeAvatarService);

  private readonly rowDetailTpl   = viewChild.required<TemplateRef<unknown>>('rowDetailTpl');
  private readonly statutTpl      = viewChild.required<TemplateRef<unknown>>('statutTpl');
  private readonly tsValidationTpl = viewChild.required<TemplateRef<unknown>>('tsValidationTpl');
  private readonly expensesTpl    = viewChild.required<TemplateRef<unknown>>('expensesTpl');
  private readonly tsFormTpl      = viewChild.required<TemplateRef<unknown>>('tsFormTpl');
  /** Le corps du formulaire TS : la modale délègue Confirmer / Annuler à ses méthodes. */
  private readonly tsForm         = viewChild<TsFormComponent>('tsForm');
  /** Idem pour le formulaire de frais remboursable. */
  private readonly expenseForm    = viewChild<ExpenseFormComponent>('expenseForm');
  private tsFormModalRef: { close: () => void } | null = null;

  affaire  = signal<AffaireDetail | null>(null);
  raf      = signal<RafDetailsDto | null>(null);
  kpis     = signal<AffaireKpisDto | null>(null);
  tsList   = signal<TsDto[]>([]);
  invoices = signal<AffaireInvoiceItem[]>([]);
  payments = signal<AffairePaymentItem[]>([]);
  /** Photos RH de l'équipe, par user id. Vide = initiales, ce qui est un état normal. */
  avatars  = signal<Map<number, EmployeeAvatar>>(new Map());

  /** Whole-page skeleton on the very first load only (§5) — a re-fetch keeps the page. */
  firstLoad   = signal(true);
  error       = signal<string | null>(null);
  actionError = signal<string | null>(null);
  /** Error surfaced *inside* an open modal, where the page banner isn't visible. */
  modalError  = signal<string | null>(null);

  activeTab          = signal<string>('overview');
  activityDrawerOpen = signal(false);
  budgetLoading      = signal(false);
  // `showTsForm` a disparu avec la fenêtre maison : la modale TS est portée par
  // ModalService, dont la référence suffit à savoir si elle est ouverte.

  // Statut modal
  targetStatut = signal('');
  motif        = signal('');

  // TS validation modal
  private tsValidationTarget = signal<{ ts: TsDto; step: 'technique' | 'commerciale' } | null>(null);
  tsNotes = signal('');

  // Row detail modal
  private modalRowState = signal<RowDetail | null>(null);
  readonly modalRow = this.modalRowState.asReadonly();

  // Filtres de tableaux
  tsSearch      = signal('');
  tsStatut      = signal('');
  invoiceSearch = signal('');
  invoiceStatut = signal('');
  paymentSearch = signal('');
  paymentMethod = signal('');

  get numId(): number { return Number(this.id()); }

  // ═══ En-tête ══════════════════════════════════════════════════════════════

  readonly affaireDevise = computed(() => this.affaire()?.devise || 'TND');

  /**
   * Le libellé lisible d'un code technique (`ENUMS.<domaine>.<code>`).
   *
   * La page affichait ses énumérations brutes — `EN_ATTENTE_RF`, `CREDIT_NOTED`,
   * `BANK_TRANSFER` — ou passait par des tables locales aux couleurs en dur. Tout
   * converge maintenant vers `shared/enum-labels`, donc un statut se lit pareil dans un
   * tableau, une pastille et un export.
   */
  private enumText(domain: string, code: string | null | undefined): string {
    return enumLabel(this.translate, domain, code);
  }

  /**
   * Le pays de l'affaire. La fiche ne reçoit qu'un `paysId` ; le référentiel est chargé
   * une fois et mémorisé pour la session par le service, donc l'afficher ici ne coûte
   * aucun appel supplémentaire quand on vient de la liste.
   */
  private readonly paysList = signal<PaysRefDto[]>([]);
  readonly paysLabel = computed(() =>
    this.paysList().find(p => p.id === this.affaire()?.paysId)?.frenchLabel ?? '—');

  readonly headerSubtitle = computed(() => {
    const a = this.affaire();
    if (!a) return '';
    return [a.reference, a.clientName].filter(Boolean).join(' · ');
  });

  readonly headerBadges = computed<PageHeaderBadge[]>(() => {
    const a = this.affaire();
    if (!a) return [];
    this.translate.currentLang();

    const badges: PageHeaderBadge[] = [{
      label:   this.translate.instant(STATUT_LABELS[a.statut] ?? a.statut),
      variant: STATUT_BADGE_VARIANT[a.statut] ?? 'neutral',
      dot:     true,
    }];

    const health = this.healthState();
    badges.push({ label: this.translate.instant(health.labelKey), variant: health.variant });

    if (!a.budgetValide) {
      badges.push({
        label:   this.translate.instant('AFFAIRES.DETAIL.BUDGET_NOT_VALIDATED'),
        variant: 'warning',
      });
    }

    // Pas de pastille d'alerte RAF ici : depuis la 4.18.0 le rappel est porté par
    // `DrawerConfig.signal`, donc par l'onglet qui ouvre le panneau où vit l'alerte.
    // Le doubler sur le titre ferait deux marqueurs pour une seule condition.
    return badges;
  });

  /**
   * Le fil « Affaires » est un vrai lien, et rien n'écoute `(breadcrumbNavigate)`.
   *
   * C'est ce qui clochait : la lib rend un `<a routerLink>` **et** émet
   * `breadcrumbNavigate` au clic. Avec les deux branchés, le lien allait bien sur la
   * liste puis le handler renavigait — et il pointait `['../..']`, soit `/finance`. La
   * seconde navigation gagnait, donc le fil ramenait à l'accueil du module.
   *
   * `['..']` relatif plutôt que `/finance/affaires` absolu : la route de détail est
   * `affaires/:id`, donc `..` EST la liste, et ça reste juste quand l'app est servie
   * seule sur son port (les routes sont alors à la racine, pas sous `/finance`) —
   * c'est aussi la convention du reste de la page (`['../../invoicing']`, etc.).
   * Le dernier fil n'est jamais un lien côté lib, il n'y a rien à traiter pour lui.
   */
  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('AFFAIRES.DETAIL.BACK_TO_LIST'), link: ['..'] },
      { label: this.affaire()?.reference ?? '' },
    ];
  });

  // ═══ Centre d'actions ═════════════════════════════════════════════════════
  //
  // Trois niveaux de hiérarchie, trois traitements visuels — et non cinq boutons de
  // même poids comme avant, où « Statut » criait aussi fort que « Nouvelle facture » :
  //
  //   1. Émettre une facture      → appel à l'action pleine largeur, teinté marque
  //   2. Saisir temps / frais     → deux tuiles `daf-card` identiques, surface claire
  //   3. Modifier / Statut        → rangée de pied discrète, sous un filet
  //
  // Le libellé de l'étape 1 reste « Nouvelle facture » : c'est le vocabulaire du module
  // Facturation, le renommer ici désaccorderait la fiche et l'écran d'arrivée.

  /** Libellé de l'action de modification — un brouillon se « complète », il ne se corrige pas. */
  readonly editLabel = computed(() => {
    this.translate.currentLang();
    return this.translate.instant(this.affaire()?.statut === 'DRAFT'
      ? 'AFFAIRES.DETAIL.SIDEBAR.COMPLETE_DRAFT_BTN'
      : 'AFFAIRES.DETAIL.ACTIONS.EDIT_LONG');
  });

  /**
   * L'action principale : `variant: 'primary'` (la teinte marque), `size: 'lg'` et
   * `fullWidth`. La flèche de fin porte l'affordance « ça mène ailleurs » — cliquer
   * quitte la fiche pour l'écran Facturation ; la lib l'anime déjà au survol.
   */
  readonly newInvoiceOptions = computed<ButtonOptions>(() => {
    this.translate.currentLang();
    return {
      variant:   'primary',
      size:      'lg',
      fullWidth: true,
      iconStart: 'receipt',
      iconEnd:   'arrow_forward',
      label:     this.translate.instant('AFFAIRES.DETAIL.SIDEBAR.NEW_INVOICE'),
    };
  });

  /**
   * Les deux actions opérationnelles : mêmes options à l'icône et au libellé près, donc
   * même hauteur et même poids visuel. `size: 'sm'` contre le `lg` de l'action principale,
   * et `variant: 'secondary'` contre `primary` : l'écart de hiérarchie tient aux deux
   * échelons de la lib, sans style maison.
   *
   * `fullWidth` : la largeur vient de la cellule de grille, sinon deux libellés de
   * longueurs différentes donnent deux boutons de largeurs différentes sur la même ligne.
   */
  /**
   * Le bouton disait « Saisir du temps » avec une icône d'horloge, mais il appelle
   * `openTsForm()` et il est gardé par `FACT_CREATE_TS` : il crée un TRAVAIL
   * SUPPLÉMENTAIRE, pas une saisie de temps. Le libellé et l'icône disaient donc une
   * fonctionnalité qui n'existe pas sur cette fiche. Il reprend maintenant le libellé
   * déjà employé partout ailleurs pour la même action (`ACTIONS.NEW_TS`).
   */
  readonly tsButtonOptions = computed<ButtonOptions>(() => {
    this.translate.currentLang();
    return {
      variant:   'secondary',
      size:      'sm',
      fullWidth: true,
      iconStart: 'post_add',
      label:     this.translate.instant('AFFAIRES.DETAIL.ACTIONS.NEW_TS'),
    };
  });

  /**
   * « Ajouter des frais ». Sans garde de permission : le panneau ouvert applique déjà les
   * siennes, et RMB n'étant plus un mode de facturation, l'action doit être proposée sur
   * toute affaire — pas seulement sur celles qui portaient ce mode.
   */
  readonly expenseButtonOptions = computed<ButtonOptions>(() => {
    this.translate.currentLang();
    return {
      variant:   'secondary',
      size:      'sm',
      fullWidth: true,
      iconStart: 'receipt_long',
      label:     this.translate.instant('AFFAIRES.DETAIL.ACTIONS.EXPENSES_TITLE'),
    };
  });

  /**
   * La pastille de statut de la rangée de pied. Même variante et même point coloré que la
   * pastille de l'en-tête de page : c'est le même statut, il ne peut pas se présenter de
   * deux façons sur la même page.
   */
  readonly statusChipOptions = computed<BadgeOptions>(() => ({
    variant: STATUT_BADGE_VARIANT[this.affaire()?.statut ?? ''] ?? 'neutral',
    size:    'sm',
    dot:     true,
  }));

  readonly statusChipLabel = computed(() => {
    this.translate.currentLang();
    const s = this.affaire()?.statut ?? '';
    return this.translate.instant(STATUT_LABELS[s] ?? s);
  });

  /** Aucune transition possible = rien à ouvrir : la rangée montre le statut sans être cliquable. */
  readonly canChangeStatus = computed(() => this.availableTransitions().length > 0);

  readonly validateBudgetOptions = computed<ButtonOptions>(() => ({
    variant:   'primary',
    size:      'sm',
    fullWidth: true,
    iconStart: 'verified',
    label:     this.translate.instant('AFFAIRES.DETAIL.ACTIONS.VALIDATE_BUDGET'),
    loading:   this.budgetLoading(),
  }));

  // ═══ Colonne identité ═════════════════════════════════════════════════════

  /** Bloc pleine largeur en tête de carte : client, période. */
  readonly identityLeadFields = computed<DetailField[]>(() => {
    const a = this.affaire();
    if (!a) return [];
    // Plus de ligne « Manager » ici : elle n'affichait que `responsableFullName`, donc le
    // seul responsable principal. La liste complète est un bloc à part (`responsables()`),
    // parce qu'une ligne label/valeur ne peut pas porter N personnes avec leur activité.
    return [
      { label: 'AFFAIRES.DETAIL.INFO.CLIENT',  value: a.clientName ?? '—' },
      { label: 'AFFAIRES.DETAIL.INFO.PERIOD',  value: `${this.formatDate(a.dateDebut)} — ${this.formatDate(a.dateFin)}` },
    ];
  });

  /**
   * TOUS les responsables de l'affaire, une entrée par personne — le bloc « Managers »
   * de la carte d'informations.
   *
   * La fiche n'affichait que `responsableFullName`, la colonne de compatibilité qui ne
   * désigne que le responsable principal : une affaire à quatre responsables se lisait
   * comme une affaire à un seul, alors que `affaire_responsables` les porte tous.
   */
  readonly responsables = computed<ResponsableEntry[]>(() => {
    const a = this.affaire();
    if (!a) return [];

    const rows = a.responsables ?? [];
    // Affaire créée hors assistant (ou avant V18) : aucune ligne de jointure, mais un
    // responsable principal quand même — `distinctResponsables` gère ce repli.
    if (!rows.length) {
      return distinctResponsables(a).map(r => ({
        userId: r.userId, fullName: r.fullName, detail: '', budget: '',
      }));
    }

    const devise = this.affaireDevise();
    const byUser = new Map<number, { entry: ResponsableEntry; parts: Set<string>; total: number | null }>();

    for (const r of rows) {
      let acc = byUser.get(r.userId);
      if (!acc) {
        acc = {
          entry: { userId: r.userId, fullName: r.fullName, detail: '', budget: '' },
          parts: new Set<string>(),
          total: null,
        };
        byUser.set(r.userId, acc);
      }
      for (const part of [r.role, r.activiteLabel, r.disciplineLabel]) {
        if (part) acc.parts.add(part);
      }
      if (r.budgetAllocation != null) acc.total = (acc.total ?? 0) + r.budgetAllocation;
    }

    return [...byUser.values()].map(({ entry, parts, total }) => ({
      ...entry,
      detail: [...parts].join(' · '),
      budget: total != null ? this.currency.transform(total, devise) : '',
    }));
  });

  /**
   * « Pays d'origine » nommait le pays de rattachement de l'affaire ; le champ désigne en
   * réalité l'entité mère du groupe, toujours ARX, qualifiée par ce pays — d'où le préfixe
   * en dur. Sans pays connu, ARX seul : « ARX — » se lirait comme une donnée manquante
   * alors que l'entité, elle, est certaine.
   */
  readonly entiteMere = computed(() => {
    const pays = this.paysLabel();
    return pays === '—' ? 'ARX' : `ARX ${pays}`;
  });

  /**
   * Somme des `budget_allocation` de tous les responsables, ou `null` si aucun n'en porte.
   * Le serveur valide déjà que la somme ne dépasse pas `budget_previsionnel` ; l'afficher
   * rend visible la part encore non répartie.
   */
  readonly budgetAllocated = computed<number | null>(() => {
    const rows = this.affaire()?.responsables ?? [];
    const total = rows.reduce((s, r) => s + (r.budgetAllocation ?? 0), 0);
    return rows.some(r => r.budgetAllocation != null) ? total : null;
  });

  /** Grille 2 colonnes sous le bloc principal — comme la maquette. */
  readonly identityGridFields = computed<DetailField[]>(() => {
    const a = this.affaire();
    if (!a) return [];
    const fields: DetailField[] = [
      { label: 'AFFAIRES.DETAIL.INFO.ENTITE_MERE',  value: this.entiteMere() },
      { label: 'AFFAIRES.DETAIL.INFO.CURRENCY',     value: this.affaireDevise() },
      // Le budget prévisionnel n'était nulle part sur la fiche : la ligne « Budget validé »
      // disait s'il était approuvé sans jamais dire de combien, et les quatre tuiles du haut
      // montrent CA, RAF, marge et WIP — pas le budget dont elles se déduisent.
      { label: 'AFFAIRES.DETAIL.INFO.BUDGET',       value: this.money(a.budgetPrevisionnel) },
      // Pas de « type d'engagement » ici : `typeAffaire` n'est jamais renseigné par
      // l'assistant (il retombe systématiquement sur FORFAIT côté service), la ligne
      // affichait donc toujours la même valeur juste à côté du mode de facturation, qui
      // est la vraie information contractuelle.
      { label: 'AFFAIRES.DETAIL.INFO.BILLING_MODE', value: this.enumText('BILLING_MODE', a.billingMode) },
      {
        label: 'AFFAIRES.DETAIL.INFO.BUDGET_VALIDATED',
        value: this.translate.instant(a.budgetValide
          ? 'AFFAIRES.DETAIL.INFO.YES' : 'AFFAIRES.DETAIL.INFO.NO'),
      },
    ];
    // Le montant du contrat n'existe que sur les modes contractuels (AV / LIVRABLE) ;
    // sur TM, CP et RMB le montant saisi n'est qu'une enveloppe, et le serveur laisse
    // `contract_amount` nul — une ligne vide dirait « donnée manquante » à tort.
    if (a.contractAmount != null) {
      fields.push({ label: 'AFFAIRES.DETAIL.INFO.CONTRACT_AMOUNT', value: this.money(a.contractAmount) });
    }
    // La somme allouée aux responsables, seulement si elle est renseignée ET qu'elle ne
    // couvre pas déjà exactement le budget : sinon la ligne répète le budget juste au-dessus.
    const allocated = this.budgetAllocated();
    if (allocated != null && allocated !== (a.budgetPrevisionnel ?? 0)) {
      fields.push({ label: 'AFFAIRES.DETAIL.INFO.BUDGET_ALLOCATED', value: this.money(allocated) });
    }
    if (a.doc360Ref)    fields.push({ label: 'AFFAIRES.DETAIL.INFO.DOC360',  value: a.doc360Ref });
    if (a.erpReference) fields.push({ label: 'AFFAIRES.DETAIL.INFO.ERP_REF', value: a.erpReference });
    return fields;
  });

  /**
   * Les 4 indicateurs financiers du haut de la colonne droite, sur `daf-metric-card`.
   *
   * Toutes les classes de couleur sont des **littéraux complets** (§3) : assemblées à
   * l'exécution elles ne survivraient pas au scan Tailwind de l'app consommatrice.
   *
   * La part du RAF passe par `delta` — `daf-metric-card` n'a pas de slot pastille, et
   * `delta` est exactement ça : une valeur secondaire à côté du chiffre. `direction:
   * 'neutral'` parce que c'est une part, pas une variation.
   *
   * **`help` sur les quatre** (lib 4.20.0) : la définition du chiffre, révélée au survol
   * de la tuile — sans icône ni bouton, la tuile est identique tant qu'on ne la survole
   * pas. Ces quatre-là en avaient besoin plus que les autres : deux mesurent autre chose
   * que ce que leur nom suggère (le CA est de l'ENCAISSÉ et pas du facturé ; la marge est
   * un % du CA et pas du budget), un troisième vaut 0 en dur côté serveur, et le RAF se
   * calcule sur l'enveloppe et non sur le prévisionnel. Ces réserves ne vivaient que dans
   * les commentaires de ce fichier, donc nulle part pour qui lit la page.
   *
   * `helpPlacement` reste au défaut (`bottom`) : la rangée est en haut de la colonne, un
   * panneau au-dessus sortirait de l'écran.
   *
   * ⚠️ Le survol est une annotation, pas un contrôle : rien d'actionnable ni
   * d'indispensable ne va dedans, un écran tactile ne le lira pas.
   */
  readonly kpiTiles = computed<KpiTile[]>(() => {
    // `help` est résolu ICI et non par le pipe du template : sans cette lecture, changer
    // de langue laisserait les popovers dans l'ancienne. `label` reste une clé, il passe
    // par `| translate` dans le template.
    this.translate.currentLang();
    const k = this.kpis();
    const t = (key: string) => this.translate.instant(key);
    return [
      {
        label: 'AFFAIRES.DETAIL.KPI.CA',
        value: this.money(k?.ca),
        delta: null,
        options: { icon: 'account_balance_wallet', iconColor: 'text-primary', iconBg: 'bg-primary/10',
                   help: t('AFFAIRES.DETAIL.KPI.CA_HELP') },
      },
      {
        label: 'AFFAIRES.DETAIL.KPI.RAF',
        value: this.money(this.raf()?.rafDisponible),
        delta: this.budgetTotal() > 0
          ? { value: `${Math.round(this.rafAvailablePct())}%`, direction: 'neutral' }
          : null,
        options: { icon: 'request_quote', iconColor: 'text-teal', iconBg: 'bg-teal/10',
                   valueColor: 'text-primary',
                   help: t('AFFAIRES.DETAIL.KPI.RAF_HELP') },
      },
      {
        label: 'AFFAIRES.DETAIL.KPI.MARGIN',
        value: this.formatPct(k?.margeBrutePct ?? null),
        delta: null,
        options: { icon: 'trending_up', iconColor: 'text-secondary', iconBg: 'bg-secondary/10',
                   valueColor: 'text-secondary',
                   help: t('AFFAIRES.DETAIL.KPI.MARGIN_HELP') },
      },
      {
        label: 'AFFAIRES.DETAIL.KPI.WIP',
        value: this.money(k?.wip),
        delta: null,
        options: { icon: 'pending_actions', iconColor: 'text-warning', iconBg: 'bg-warning/10',
                   help: t('AFFAIRES.DETAIL.KPI.WIP_HELP') },
      },
    ];
  });

  readonly traceFields = computed<DetailField[]>(() => {
    const a = this.affaire();
    if (!a) return [];
    const fields: DetailField[] = [
      { label: 'AFFAIRES.DETAIL.SIDEBAR.CREATED_AT', value: this.formatDate(a.createdAt) },
    ];
    if (a.updatedAt) {
      fields.push({ label: 'AFFAIRES.DETAIL.SIDEBAR.LAST_MODIFIED', value: this.formatDate(a.updatedAt) });
    }
    fields.push({ label: 'AFFAIRES.DETAIL.SIDEBAR.RAF_THRESHOLD', value: `${a.rafAlerteSeuilPct}%` });
    return fields;
  });

  /**
   * Les personnes rattachées à l'affaire — TOUS les responsables, pas seulement le
   * principal. La pile n'en montrait qu'un parce qu'elle lisait `responsableFullName` ;
   * elle lit maintenant `responsables()`, et `daf-avatar-group` gère le « +N » au-delà
   * de quatre.
   *
   * `AvatarData` directement : `daf-avatar` dérive les initiales (`deriveInitials`, la même
   * fonction que la cellule avatar de `daf-data-table`, donc une personne s'affiche pareil
   * dans un tableau et sur une carte) et retombe dessus tout seul si l'image échoue — ce
   * qui arrive souvent, `photo_url` étant renseigné sur des profils dont le fichier manque
   * du stockage. C'est ce qui a remplacé le handler `onAvatarError` local.
   */
  readonly team = computed<AvatarData[]>(() =>
    this.responsables().map(r => ({
      name:      r.fullName,
      avatarUrl: this.avatarSvc.photoUrl(this.avatars().get(r.userId)),
      // Un seul libellé de repli : « Principal » / « Responsable » distinguait deux rangs
      // qui n'existent plus.
      subtitle:  r.detail || this.translate.instant('AFFAIRES.DETAIL.INFO.MANAGER'),
    })),
  );

  /** Tous les noms de l'équipe — la tuile n'en montrait qu'un, la pile en compte N. */
  readonly teamNames = computed(() => this.team().map(m => m.name).join(', '));

  /** Les user ids dont on veut la photo : toute l'équipe, résolue en un seul appel groupé. */
  private teamUserIds(a: AffaireDetail): number[] {
    const ids = distinctResponsables(a).map(r => r.userId).filter(id => id > 0);
    return ids.length ? ids : (a.responsableUserId ? [a.responsableUserId] : []);
  }

  // ═══ Indicateurs ══════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // D'où viennent les chiffres de la page
  //
  // Deux endpoints seulement alimentent tous les indicateurs, et AUCUN pourcentage
  // n'est calculé côté serveur — ils sont tous dérivés ici, ce qui est la raison
  // d'être de ce bloc.
  //
  //   GET /affaires/{id}/raf   → RafDetailsDto  : budgetPrevisionnel, totalFacturesEmises,
  //                                              montantTsIntegres, rafDisponible
  //   GET /affaires/{id}/kpis  → AffaireKpisDto : ca, wip, margeBrutePct
  //
  //   budgetPrevisionnel = raf.budgetPrevisionnel, sinon affaire.budgetPrevisionnel
  //                        (le RAF arrive après l'affaire : sans ce repli les tuiles
  //                        affichent 0 % pendant un instant au chargement)
  //   budgetTotal        = budgetPrevisionnel + montantTsIntegres — l'ENVELOPPE
  //                        FACTURABLE, et le dénominateur de tous les taux de la page.
  //                        C'est celle que le serveur utilise déjà pour le RAF
  //                        (RAF = budget + TS − facturé), donc facturé + RAF = budget
  //                        total : les tuiles se réconcilient, ce qui n'était pas le
  //                        cas quand les taux étaient rapportés au seul prévisionnel.
  //   billingPct         = totalFacturesEmises / budgetTotal × 100   « taux de facturation »
  //   collectedPct       = kpis.ca / budgetTotal × 100               « santé du projet »
  //   tsIntegratedPct    = montantTsIntegres / budgetTotal × 100
  //   rafAvailablePct    = rafDisponible / budgetTotal × 100         (pastille RAF)
  //   healthState        = seuils sur billingPct, comparés au **seuil propre à
  //                        l'affaire** (rafAlerteSeuilPct) : < seuil = Optimale,
  //                        ≥ seuil = Vigilance, ≥ 100 % = Critique
  //   rafAlertActive     = billingPct ≥ rafAlerteSeuilPct (même règle, pour l'encart)
  //   budgetOverrun      = rafDisponible < 0, c'est-à-dire facturé > enveloppe
  //
  //   ⚠️ Les deux taux vont dans des SENS OPPOSÉS et n'ont donc pas la même échelle
  //   de couleur — c'est tout le sujet du bug « couleurs inversées » :
  //     · facturation : consommer l'enveloppe est neutre jusqu'à 100 %, la DÉPASSER
  //       est l'accident → échelle de risque (`healthState`), rouge au-delà de 100 % ;
  //     · encaissement : plus haut = mieux → rampe rouge → vert du composant `daf-gauge`.
  //   Faire porter `healthState` aux deux, ce que la page faisait, peignait la bonne
  //   nouvelle en rouge.
  //
  //   Il n'y a plus de « taux de consommation » : l'ancien valait
  //   (budget − RAF) / budget = (facturé − TS) / budget, donc un TS intégré le FAISAIT
  //   BAISSER sans que rien ne soit défacturé. Consommer l'enveloppe, ici, c'est la
  //   facturer — un TS l'agrandit, il n'en consomme rien.
  //
  //   CA encaissé, WIP et Marge brute sont pris **tels quels** dans les KPIs du
  //   backend, la page ne les recalcule pas. À savoir sur ces trois-là :
  //     · ca   = SUM(payments.amount_local) des factures de l'affaire (encaissé réel),
  //              d'où son emploi comme numérateur de « Santé du projet » ;
  //     · wip  = 0 EN DUR côté serveur, la tuile affichera donc toujours 0 ;
  //     · margeBrutePct = (ca − sous-traitance) / ca × 100, donc un % du CA et non du
  //       budget, nul dès que ca vaut 0 ; les coûts internes sont un placeholder à 0
  //       (pas de timesheet), la marge est donc surévaluée tant qu'ils manquent.
  //
  //   Graphique de facturation : DEUX NIVEAUX, voir la section « Facturation » plus bas.
  // ═══════════════════════════════════════════════════════════════════════════

  /** Le prévisionnel seul — le contrat. Ce n'est PAS le dénominateur des taux. */
  readonly budgetPrevisionnel = computed(() =>
    this.raf()?.budgetPrevisionnel ?? this.affaire()?.budgetPrevisionnel ?? 0);

  /**
   * L'enveloppe facturable : prévisionnel + TS intégrés.
   *
   * Un TS intégré est facturable, donc il agrandit ce que l'affaire a le droit de
   * facturer — c'est exactement ce que fait le RAF côté serveur. Rapporter les taux au
   * seul prévisionnel faisait dépasser 100 % une affaire parfaitement saine dès qu'elle
   * facturait un TS.
   */
  readonly budgetTotal = computed(() =>
    this.budgetPrevisionnel() + (this.raf()?.montantTsIntegres ?? 0));

  /** Taux de facturation : ce qui est facturé sur l'enveloppe facturable. */
  readonly billingPct = computed(() => {
    const b = this.budgetTotal();
    return b > 0 ? ((this.raf()?.totalFacturesEmises ?? 0) / b) * 100 : 0;
  });

  /** Encaissé réel — `kpis.ca`, la somme des paiements reçus. */
  readonly collectedAmount = computed(() => this.kpis()?.ca ?? 0);

  /** Santé du projet : encaissé / budget total. Plus c'est haut, mieux c'est. */
  readonly collectedPct = computed(() => {
    const b = this.budgetTotal();
    return b > 0 ? (this.collectedAmount() / b) * 100 : 0;
  });

  readonly tsIntegratedPct = computed(() => {
    const b = this.budgetTotal();
    return b > 0 ? ((this.raf()?.montantTsIntegres ?? 0) / b) * 100 : 0;
  });

  readonly rafAvailablePct = computed(() => {
    const b = this.budgetTotal();
    return b > 0 ? ((this.raf()?.rafDisponible ?? 0) / b) * 100 : 0;
  });

  readonly rafAlertActive = computed(() => {
    const a = this.affaire();
    return !!a && this.budgetTotal() > 0 && this.billingPct() >= a.rafAlerteSeuilPct;
  });

  /**
   * Dépassement de budget : le RAF est passé négatif, donc l'affaire a facturé plus que
   * son enveloppe.
   *
   * Sur `rafDisponible < 0` et non sur un pourcentage : c'est le chiffre du serveur, donc
   * le bandeau ne peut pas contredire la tuile RAF, et il n'y a pas de division par zéro
   * à traiter. C'est le second niveau d'alerte, au-dessus de `rafAlertActive` (le seuil de
   * vigilance paramétré sur l'affaire) — et le seul à sortir du drawer pour s'afficher sur
   * la page, parce qu'un dépassement ne doit pas attendre qu'on ouvre un panneau.
   */
  readonly budgetOverrun = computed(() => (this.raf()?.rafDisponible ?? 0) < 0);

  /** Le montant du dépassement, positif. 0 quand il n'y a pas de dépassement. */
  readonly overrunAmount = computed(() => Math.max(0, -(this.raf()?.rafDisponible ?? 0)));

  /**
   * L'état de RISQUE de l'affaire : où en est la facturation par rapport au seuil d'alerte
   * paramétré sur l'affaire. Échelle « plus haut = pire » — elle habille la facturation et
   * la pastille d'en-tête, **jamais** l'encaissement.
   */
  readonly healthState = computed<{ variant: 'success' | 'warning' | 'danger' | 'neutral'; labelKey: string }>(() => {
    const a = this.affaire();
    if (!a || this.budgetTotal() <= 0) {
      return { variant: 'neutral', labelKey: 'AFFAIRES.DETAIL.HEALTH.UNKNOWN' };
    }
    const pct = this.billingPct();
    if (pct > 100)                  return { variant: 'danger',  labelKey: 'AFFAIRES.DETAIL.HEALTH.CRITICAL' };
    if (pct >= a.rafAlerteSeuilPct) return { variant: 'warning', labelKey: 'AFFAIRES.DETAIL.HEALTH.WATCH' };
    return { variant: 'success', labelKey: 'AFFAIRES.DETAIL.HEALTH.OPTIMAL' };
  });

  /** Pastille de la tuile « Santé du projet ». */
  readonly healthBadge = computed<PageHeaderBadge>(() => {
    const h = this.healthState();
    return { label: this.translate.instant(h.labelKey), variant: h.variant, size: 'sm' };
  });

  /**
   * L'anneau de la tuile « Santé du projet » — il affiche `collectedPct`, l'encaissé.
   *
   * **`ramp: true`** : la rampe du composant va du rouge (0) à l'ambre (50) au vert (100),
   * ce qui est exactement le sens de l'encaissement — n'avoir rien encaissé est mauvais,
   * avoir tout encaissé est l'objectif. C'est le correctif du bug de couleurs : l'anneau
   * prenait sa teinte de `healthState`, une échelle de risque « plus haut = pire », donc
   * une affaire intégralement encaissée s'affichait en rouge. `healthState` reste la
   * **pastille** à côté du titre, où « plus haut = pire » est le bon sens.
   *
   * Enveloppe absente (budget à 0) : pas de rampe, sinon un anneau à 0 % s'afficherait en
   * rouge alors que le taux n'est pas calculable — la pastille dit déjà « Indéterminée ».
   *
   * **Valeur seule au centre** : pas de `sublabel`, l'en-tête de la tuile dit de quoi il
   * s'agit. `ariaLabel` porte le sens pour les lecteurs d'écran.
   */
  readonly healthGaugeOptions = computed<GaugeOptions>(() => {
    const known = this.budgetTotal() > 0;
    return {
      size:      '116px',
      thickness: 10,
      ramp:      known,
      variant:   known ? undefined : 'primary',
      ariaLabel: `${this.translate.instant('AFFAIRES.DETAIL.OVERVIEW.HEALTH_TITLE')} : `
               + `${Math.round(this.collectedPct())}% — `
               + `${this.money(this.collectedAmount())} / ${this.money(this.budgetTotal())}`,
    };
  });

  /**
   * L'anneau de la carte « Progression facturation » de la colonne droite.
   *
   * Il ne double plus l'anneau de « Santé du projet » : celui-ci porte le facturé, l'autre
   * l'encaissé. Deux chiffres différents, deux échelles de couleur différentes.
   *
   * `> 100` et non `>= 100` : facturer exactement son enveloppe est l'objectif atteint, pas
   * un accident. Seul le dépassement est rouge.
   */
  readonly billingGaugeOptions = computed<GaugeOptions>(() => ({
    size:      '132px',
    thickness: 12,
    variant:   this.billingPct() > 100 ? 'danger' : 'tertiary',
    ariaLabel: `${this.translate.instant('AFFAIRES.DETAIL.IDENTITY.BILLING_PROGRESS')} : `
             + `${Math.round(this.billingPct())}%`,
  }));

  // ── Barres de progression ────────────────────────────────────────────────
  readonly alertBarOptions: ProgressBarOptions = { variant: 'warning',   size: 'xs', showLabel: false, showPercent: false };
  readonly tsBarOptions: ProgressBarOptions    = { variant: 'secondary', size: 'sm' };
  readonly rafBarOptions: ProgressBarOptions   = { variant: 'primary',   size: 'sm' };

  /** Barre de la carte d'identité : le % est déjà affiché en gros au-dessus. */
  readonly identityBarOptions = computed<ProgressBarOptions>(() => ({
    ...this.billingBarOptions(), showLabel: false, showPercent: false,
  }));

  readonly billingBarLabel = computed(() =>
    `${this.translate.instant('AFFAIRES.DETAIL.RAF_SECTION.INVOICED')} — `
    + `${this.money(this.raf()?.totalFacturesEmises)} / ${this.money(this.budgetTotal())}`);

  readonly tsBarLabel = computed(() =>
    `${this.translate.instant('AFFAIRES.DETAIL.RAF_SECTION.TS_INTEGRATED')} — `
    + `${this.money(this.raf()?.montantTsIntegres)}`);

  readonly rafBarLabel = computed(() =>
    `${this.translate.instant('AFFAIRES.DETAIL.RAF_SECTION.REMAINING')} — `
    + `${this.money(this.raf()?.rafDisponible)}`);

  /**
   * La barre du taux de facturation — échelle de risque, `> 100` seul en rouge (facturer
   * pile son enveloppe est l'objectif atteint). Le seuil de vigilance de l'affaire passe
   * par `healthState`, qui tient compte de `rafAlerteSeuilPct`.
   *
   * C'est cette barre que porte la tuile « Taux de facturation », à la place de l'ancienne
   * `consumptionBarOptions` qui prenait sa couleur telle quelle de `healthState` : une
   * affaire à 0 % facturé y sortait en vert vif et une affaire bien avancée en rouge.
   */
  readonly billingBarOptions = computed<ProgressBarOptions>(() => {
    const v = this.healthState().variant;
    return {
      variant: v === 'danger' ? 'danger' : v === 'warning' ? 'warning' : 'tertiary',
      size:    'sm',
    };
  });

  // ── Facturation : un graphique, deux granularités ────────────────────────

  // ═══════════════════════════════════════════════════════════════════════════
  // UN SEUL graphique, dont les puces Année / Mois changent la GRANULARITÉ
  //
  // Ce n'est pas une navigation : il n'y a ni niveau où descendre, ni bouton retour, ni
  // titre qui change de nature. Les puces sont un filtre, comme ceux des tableaux — le
  // panneau reste le même, seules les barres changent de forme.
  //
  //   granularité « années » : une barre par année couverte par l'affaire.
  //                            Objectif = enveloppe / nombre d'années de l'axe.
  //   granularité « mois »   : les 12 mois de `chartYear()`.
  //                            Objectif = enveloppe / durée de l'affaire en mois.
  //
  // `chartGranularityEffective` et non `chartGranularity` partout : une affaire tenant
  // dans un seul exercice n'a pas de vue « années » qui vaille la peine — une barre unique
  // n'est pas un graphique. Elle s'affiche donc en mois et les puces disparaissent, faute
  // d'un choix à offrir. C'est le cas le plus courant.
  //
  // **Une seule série est calculée à la fois** : `chartValues()` branche sur la
  // granularité active, il n'y a pas deux agrégats vivant en parallèle. Et pas d'appel
  // serveur pour changer de forme — `getAffaireInvoices` ramène les factures de l'affaire
  // sans pagination, donc la série brute est déjà en mémoire et l'agrégat coûte une passe
  // sur un tableau. Un endpoint par granularité serait un aller-retour réseau pour
  // recalculer ce qu'on a déjà. Si une affaire devait porter des milliers de factures,
  // c'est ici que passerait un agrégat serveur.
  // ═══════════════════════════════════════════════════════════════════════════

  /** La granularité demandée. Voir `chartGranularityEffective` pour celle qui s'affiche. */
  /**
   * `null` = l'utilisateur n'a pas encore choisi, on prend le défaut calculé par
   * `chartGranularityEffective`. Un défaut en dur (`'years'`) affichait une barre unique
   * sur une affaire dont une seule année est commencée.
   */
  private readonly chartGranularity = signal<'years' | 'months' | null>(null);

  // ── L'axe s'arrête à AUJOURD'HUI ─────────────────────────────────────────
  //
  // Le graphique montre ce qui a été facturé, donc du passé. Une affaire qui court
  // jusqu'en 2028 étalait l'axe jusqu'en 2028 : deux ou trois barres à zéro pour des
  // années qui ne sont pas arrivées, qui écrasaient l'échelle des barres réelles et
  // faisaient lire « on a arrêté de facturer » là où il n'y avait rien à facturer encore.
  // Même chose sur les mois : un graphique 2026 affichait décembre en août.
  //
  // La borne est la période EN COURS et non la précédente : le mois courant est
  // partiellement facturé, c'est une information (et il porte `highlight`). Ce sont les
  // périodes entièrement à venir qui disparaissent.
  //
  // Rien n'est filtré côté données : une facture post-datée reste comptée dans son année
  // (cf. `invoiceYears`), donc si quelqu'un émet une facture en 2027, 2027 réapparaît sur
  // l'axe par l'union — sinon le cumul en tête de panneau ne retomberait plus sur la somme
  // des barres. On coupe le FUTUR VIDE, pas les données.

  /** L'année en cours — la borne haute de l'axe. */
  private readonly currentYear = new Date().getFullYear();

  /** Le mois en cours (0-11), borne haute de l'axe quand on affiche l'année en cours. */
  private readonly currentMonth = new Date().getMonth();

  /** Les années porteuses d'au moins une facture émise. */
  private readonly invoiceYears = computed(() =>
    this.invoices()
      .map(i => (i.dateEmission ? new Date(i.dateEmission).getFullYear() : null))
      .filter((y): y is number => y !== null));

  /**
   * L'axe de la granularité « années » : la période de l'affaire, **union** les années
   * porteuses d'une facture, **coupée à l'année en cours**.
   *
   * L'union et non la seule période : une facture émise après `dateFin` — un solde, un
   * avoir tardif — sortirait sinon du graphique sans que rien ne le signale, et le cumul
   * ne retomberait pas sur la somme des barres. Bornée à 20 ans, par sécurité contre une
   * `dateFin` saisie de travers.
   *
   * Le repli `[currentYear]` couvre l'affaire qui n'a pas encore commencé : sa période est
   * entièrement future, donc entièrement coupée, et un axe vide n'afficherait rien du tout.
   */
  readonly chartYears = computed<number[]>(() => {
    const years = new Set<number>(this.invoiceYears());
    const a = this.affaire();
    if (a?.dateDebut) {
      const from = new Date(a.dateDebut).getFullYear();
      const to   = a.dateFin ? new Date(a.dateFin).getFullYear() : from;
      for (let y = from; y <= Math.min(to, from + 19); y++) years.add(y);
    }
    const past = [...years].filter(y => y <= this.currentYear).sort((x, y) => x - y);
    return past.length ? past : [this.currentYear];
  });

  /**
   * L'affaire couvre-t-elle plus d'une année ? Sur sa PÉRIODE, pas sur l'axe.
   *
   * L'axe s'arrête à l'année en cours ; une affaire 2026→2028 n'a donc qu'une année
   * d'axe en 2026, et c'est ce qui faisait disparaître les puces Année / Mois — la bascule
   * s'était retirée elle-même sur une affaire qui est bel et bien pluriannuelle. Le choix
   * offert dépend de ce que l'affaire EST, pas de ce qui s'est déjà écoulé.
   */
  private readonly spansMultipleYears = computed(() => {
    const a = this.affaire();
    const years = new Set<number>(this.invoiceYears());
    if (a?.dateDebut) {
      years.add(new Date(a.dateDebut).getFullYear());
      if (a.dateFin) years.add(new Date(a.dateFin).getFullYear());
    }
    return years.size > 1;
  });

  /** Les puces n'ont de sens que sur une affaire pluriannuelle. */
  readonly chartGranularitySwitchable = computed(() => this.spansMultipleYears());

  /**
   * La granularité réellement affichée.
   *
   * Le DÉFAUT dépend de l'axe (une seule année écoulée → les mois, un graphique à une
   * barre n'apprend rien), mais le CHOIX de l'utilisateur l'emporte : s'il demande la vue
   * par année sur une affaire pluriannuelle dont une seule année est commencée, il obtient
   * cette unique barre. C'est son choix, pas un défaut à lui imposer.
   */
  readonly chartGranularityEffective = computed<'years' | 'months'>(() => {
    if (!this.chartGranularitySwitchable()) return 'months';
    return this.chartGranularity() ?? (this.chartYears().length > 1 ? 'years' : 'months');
  });

  /**
   * L'année de la granularité « mois » : la dernière année de l'axe.
   *
   * Elle vient de `chartYears()` et non plus de `max(invoiceYears)` : l'axe est déjà coupé
   * à l'année en cours, donc une facture post-datée en 2027 n'emmène plus la vue des mois
   * sur une année entièrement à venir. Elle est nommée dans le titre.
   */
  readonly chartYear = computed(() => {
    const years = this.chartYears();
    return years[years.length - 1];
  });

  /**
   * Combien de mois l'axe montre pour `chartYear()` : les 12, sauf sur l'année en cours où
   * il s'arrête au mois courant inclus. Les mois entièrement à venir ne sont pas des
   * barres à zéro, ils ne sont pas encore arrivés.
   */
  private readonly chartMonthCount = computed(() =>
    this.chartYear() === this.currentYear ? this.currentMonth + 1 : 12);

  /**
   * La série affichée — **une seule**, celle de la granularité active.
   *
   * Une passe unique sur les factures dans les deux cas : on remplit un tableau indexé par
   * mois, ou une entrée par année de l'axe (0 sur une année vide, une année sans facture
   * étant une information et pas un trou).
   */
  readonly chartValues = computed<number[]>(() => {
    if (this.chartGranularityEffective() === 'months') {
      const year   = this.chartYear();
      const totals = Array(this.chartMonthCount()).fill(0) as number[];
      for (const inv of this.invoices()) {
        if (!inv.dateEmission) continue;
        const d = new Date(inv.dateEmission);
        // `d.getMonth() < totals.length` : une facture post-datée dans l'année en cours
        // (émise en septembre alors qu'on est en août) tomberait hors du tableau.
        if (d.getFullYear() === year && d.getMonth() < totals.length) {
          totals[d.getMonth()] += inv.montantTtc ?? 0;
        }
      }
      return totals;
    }

    const sums = new Map<number, number>(this.chartYears().map(y => [y, 0]));
    for (const inv of this.invoices()) {
      if (!inv.dateEmission) continue;
      const y = new Date(inv.dateEmission).getFullYear();
      if (sums.has(y)) sums.set(y, sums.get(y)! + (inv.montantTtc ?? 0));
    }
    return this.chartYears().map(y => sums.get(y)!);
  });

  /** Le cumul en tête du panneau : celui de la série visible, pas un total figé. */
  readonly chartTotal = computed(() => this.chartValues().reduce((s, v) => s + v, 0));

  /**
   * Les barres du graphique.
   *
   * `label` ne porte QUE la légende d'axe (le mois, ou l'année) : le montant va dans
   * `valueLabel`, que le composant met dans sa pastille au survol.
   *
   * `highlight` sur la période courante — le mois en cours seulement si le graphique montre
   * l'année en cours, sinon on surlignerait août 2025 sur un graphique 2026.
   */
  readonly chartBars = computed<BarChartBar[]>(() => {
    const values = this.chartValues();

    if (this.chartGranularityEffective() === 'months') {
      // `values` s'arrête déjà au mois courant sur l'année en cours, donc la dernière
      // barre EST le mois courant — pas besoin de comparer les index.
      const isCurrentYear = this.chartYear() === this.currentYear;
      return values.map((value, index) => ({
        label:      MONTH_LABELS[index],
        value,
        valueLabel: this.money(value),
        highlight:  isCurrentYear && index === this.currentMonth,
      }));
    }

    return this.chartYears().map((year, index) => ({
      label:      String(year),
      value:      values[index],
      valueLabel: this.money(values[index]),
      highlight:  year === this.currentYear,
    }));
  });

  readonly chartOptions = computed<BarChartOptions>(() => {
    this.translate.currentLang();
    const years  = this.chartGranularityEffective() === 'years';
    const target = years ? this.yearlyTarget() : this.monthlyTarget();
    return {
      orientation: 'vertical',
      height:      '200px',
      variant:     'tertiary',
      // Pas de `clickable` : les barres ne mènent nulle part, ce sont les puces qui
      // changent la forme. Une barre focusable qui ne fait rien est un piège au clavier.
      // `max` est laissé au composant : son défaut est déjà max(valeurs, target).
      target:      target > 0 ? target : undefined,
      targetLabel: target > 0 ? `${this.chartTargetLabel()} : ${this.money(target)}` : undefined,
      emptyMessage: this.translate.instant('AFFAIRES.DETAIL.OVERVIEW.NO_CHART_DATA'),
      ariaLabel: `${this.chartTitle()} — `
               + `${this.translate.instant('AFFAIRES.DETAIL.OVERVIEW.CUMUL')} ${this.money(this.chartTotal())}`,
    };
  });

  /** Le titre du panneau, qui porte l'année en granularité « mois ». */
  readonly chartTitle = computed(() => {
    this.translate.currentLang();
    return this.chartGranularityEffective() === 'years'
      ? this.translate.instant('AFFAIRES.DETAIL.OVERVIEW.CHART_TITLE_YEARS')
      : this.translate.instant('AFFAIRES.DETAIL.OVERVIEW.CHART_TITLE', { year: this.chartYear() });
  });

  /** « Objectif annuel » / « Objectif mensuel » — la légende ET l'aria de la ligne. */
  readonly chartTargetLabel = computed(() => {
    this.translate.currentLang();
    return this.translate.instant(this.chartGranularityEffective() === 'years'
      ? 'AFFAIRES.DETAIL.OVERVIEW.LEGEND_TARGET_YEAR'
      : 'AFFAIRES.DETAIL.OVERVIEW.LEGEND_TARGET');
  });

  /** L'objectif de la granularité active — une seule valeur à afficher en légende. */
  readonly chartTarget = computed(() =>
    this.chartGranularityEffective() === 'years' ? this.yearlyTarget() : this.monthlyTarget());

  /** Les puces Année / Mois. `selected` est un tableau : `daf-chip-group` est multi-capable. */
  readonly chartGranularityChips = computed<ChipOption[]>(() => {
    this.translate.currentLang();
    return [
      { value: 'years',  label: this.translate.instant('AFFAIRES.DETAIL.OVERVIEW.LEVEL_YEARS') },
      { value: 'months', label: this.translate.instant('AFFAIRES.DETAIL.OVERVIEW.LEVEL_MONTHS') },
    ];
  });

  readonly chartGranularitySelection = computed<string[]>(() => [this.chartGranularityEffective()]);

  readonly chartGranularityChipConfig: ChipGroupConfig = { multiple: false };

  /**
   * Les puces sont un `model()` : le composant renvoie la sélection complète. Vide (on a
   * décoché la puce active) = on garde la granularité courante, il faut bien afficher
   * quelque chose.
   */
  setChartGranularity(selection: string[]): void {
    const next = selection[0];
    if (next === 'years' || next === 'months') this.chartGranularity.set(next);
  }

  /** Objectif mensuel = enveloppe répartie sur la durée de l'affaire (légende du panneau). */
  private readonly monthlyTarget = computed(() => {
    const a = this.affaire();
    const b = this.budgetTotal();
    if (!a || b <= 0) return 0;
    const months = this.affaireMonths(a.dateDebut, a.dateFin);
    return months > 0 ? b / months : 0;
  });

  /**
   * Objectif annuel = enveloppe répartie sur la DURÉE DE L'AFFAIRE en années.
   *
   * Sur la durée de l'affaire et non plus sur `chartYears().length` : depuis que l'axe
   * s'arrête à l'année en cours, sa longueur n'est plus la durée de l'affaire. Une affaire
   * de quatre ans dont deux sont écoulées aurait vu son objectif annuel doubler
   * (enveloppe / 2 au lieu de / 4), et la ligne aurait sauté d'un cran chaque 1er janvier
   * — un objectif qui bouge parce qu'on a changé d'année n'est pas un objectif.
   *
   * Comme le mensuel, c'est une répartition linéaire, pas un objectif saisi ; les deux
   * dérivent donc de la même `affaireMonths` pour ne pas se contredire (12 barres
   * mensuelles doivent valoir une barre annuelle).
   */
  private readonly yearlyTarget = computed(() => {
    const a = this.affaire();
    const b = this.budgetTotal();
    if (!a || b <= 0) return 0;
    const years = this.affaireMonths(a.dateDebut, a.dateFin) / 12;
    return years > 0 ? b / years : 0;
  });

  /** Nombre de mois couverts par l'affaire, borné à [1, 60]. */
  private affaireMonths(debut: string | null, fin: string | null): number {
    if (!debut || !fin) return 12;
    const d = new Date(debut), f = new Date(fin);
    const months = (f.getFullYear() - d.getFullYear()) * 12 + (f.getMonth() - d.getMonth()) + 1;
    return Math.min(Math.max(months, 1), 60);
  }

  // ═══ Onglets ══════════════════════════════════════════════════════════════

  readonly tabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    // L'onglet « Facturation » (les écrans par mode AV / JAL / TM / CP / RMB) est
    // supprimé — pas masqué. Il n'est plus conditionné à `billingMode`, il n'existe plus.
    const tabs: TabItem[] = [
      { id: 'overview', label: t('AFFAIRES.DETAIL.TABS.OVERVIEW') },
      { id: 'ts',       label: t('AFFAIRES.DETAIL.TABS.BUDGET_TS'), count: this.tsList().length },
    ];
    tabs.push(
      { id: 'factures',  label: t('AFFAIRES.DETAIL.TABS.INVOICES'), count: this.invoices().length },
      { id: 'paiements', label: t('AFFAIRES.DETAIL.TABS.PAYMENTS'), count: this.payments().length },
      // Frais remboursables : présent sur TOUTE affaire, quel que soit le mode de
      // facturation — les frais ne sont plus un mode mais une opération de la fiche.
      { id: 'frais',     label: t('AFFAIRES.EXPENSES.TAB') },
    );
    return tabs;
  });

  // ═══ Barres d'outils (recherche + filtre + export) ════════════════════════

  readonly filterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return {
      title:       t('AFFAIRES.DETAIL.TOOLBAR.FILTERS'),
      applyLabel:  t('AFFAIRES.DETAIL.TOOLBAR.APPLY'),
      cancelLabel: t('AFFAIRES.DETAIL.MODAL.CANCEL'),
      resetLabel:  t('AFFAIRES.DETAIL.TOOLBAR.RESET'),
      triggerLabel: t('AFFAIRES.DETAIL.TOOLBAR.FILTERS'),
    };
  });

  private exportAction(disabled: boolean): ToolbarAction[] {
    return [{
      id:       'export',
      icon:     'download',
      label:    this.translate.instant('AFFAIRES.DETAIL.TOOLBAR.EXPORT'),
      position: 'right',
      disabled,
    }];
  }

  readonly tsToolbarActions      = computed(() => this.exportAction(this.filteredTs().length === 0));
  readonly invoiceToolbarActions = computed(() => this.exportAction(this.filteredInvoices().length === 0));
  readonly paymentToolbarActions = computed(() => this.exportAction(this.filteredPayments().length === 0));

  readonly tsFilterFields = computed<FilterField[]>(() => [{
    name:    'statut',
    label:   this.translate.instant('AFFAIRES.DETAIL.INVOICES.STATUS'),
    type:    'select',
    options: [...new Set(this.tsList().map(t => t.statut))].sort()
      .map(value => ({ value, label: this.enumText('TS_STATUT', value) })),
  }]);

  readonly invoiceFilterFields = computed<FilterField[]>(() => [{
    name:    'statut',
    label:   this.translate.instant('AFFAIRES.DETAIL.INVOICES.STATUS'),
    type:    'select',
    options: [...new Set(this.invoices().map(i => i.statut).filter((s): s is string => !!s))]
      .sort().map(value => ({ value, label: this.enumText('INVOICE_STATUT', value) })),
  }]);

  readonly paymentFilterFields = computed<FilterField[]>(() => [{
    name:    'method',
    label:   this.translate.instant('AFFAIRES.DETAIL.PAYMENTS.METHOD'),
    type:    'select',
    options: [...new Set(this.payments().map(p => p.paymentMethod).filter((m): m is string => !!m))]
      .sort().map(value => ({ value, label: this.enumText('PAYMENT_METHOD', value) })),
  }]);

  /** `daf-filter` renders a select as `string[]` internally and emits a scalar — normalise both. */
  asFilterValue(result: FilterResult, key: string): string {
    const v = result[key];
    if (Array.isArray(v)) return (v[0] as string) ?? '';
    return typeof v === 'string' ? v : '';
  }

  onTsToolbarAction(id: string): void      { if (id === 'export') this.exportTs(); }
  onInvoiceToolbarAction(id: string): void { if (id === 'export') this.exportInvoices(); }
  onPaymentToolbarAction(id: string): void { if (id === 'export') this.exportPayments(); }

  // ═══ Tableaux ═════════════════════════════════════════════════════════════

  readonly filteredTs = computed(() => {
    const q = this.tsSearch().trim().toLowerCase(), statut = this.tsStatut();
    return this.tsList().filter(t =>
      (!statut || t.statut === statut) &&
      (!q || `${t.referenceTs} ${t.intitule}`.toLowerCase().includes(q)));
  });

  readonly filteredInvoices = computed(() => {
    const q = this.invoiceSearch().trim().toLowerCase(), statut = this.invoiceStatut();
    return this.invoices().filter(i =>
      (!statut || i.statut === statut) &&
      (!q || `${i.invoiceNumber ?? ''} ${i.invoiceType ?? ''}`.toLowerCase().includes(q)));
  });

  readonly filteredPayments = computed(() => {
    const q = this.paymentSearch().trim().toLowerCase(), method = this.paymentMethod();
    return this.payments().filter(p =>
      (!method || p.paymentMethod === method) &&
      (!q || `${p.invoiceNumber ?? ''} ${p.bankReference ?? ''}`.toLowerCase().includes(q)));
  });

  // Aucune colonne `sortable` : la lib trie côté client sur les lignes qu'on lui
  // donne, et une colonne `badge` compare "[object Object]" (§10b).

  readonly tsColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'reference', label: t('AFFAIRES.DETAIL.MODAL.TS_TITLE') },
      { key: 'intitule',  label: t('AFFAIRES.DETAIL.MODAL.TS_INTITULE') },
      // Clé propre au TS : `INVOICES.AMOUNT` dit « Montant facturé », or c'est ici le
      // `montant_estime` d'un travail supplémentaire, qui n'est pas encore facturé.
      { key: 'montant',   label: t('AFFAIRES.DETAIL.MODAL.TS_AMOUNT'), align: 'right' },
      { key: 'statut',    label: t('AFFAIRES.DETAIL.INVOICES.STATUS'), type: 'badge' },
      { key: 'integre',   label: t('AFFAIRES.DETAIL.MODAL.TS_INTEGRATED_AT') },
    ];
  });

  readonly tsRows = computed<TableRow[]>(() => this.filteredTs().map(ts => ({
    reference: ts.referenceTs,
    intitule:  ts.intitule,
    montant:   this.currency.transform(ts.montantEstime, ts.devise || this.affaireDevise()),
    statut:    { label: this.enumText('TS_STATUT', ts.statut),
                 options: { variant: TS_STATUT_BADGE[ts.statut] ?? 'neutral', dot: true } } satisfies BadgeCell,
    integre:   this.formatDate(ts.integreAuBudgetAt),
    _source:   ts,
  })));

  readonly tsConfig = computed<TableConfig>(() => ({
    showHeader: false,
    hoverable:  true,
    emptyMessage: this.translate.instant(
      this.tsList().length === 0 ? 'AFFAIRES.DETAIL.OVERVIEW.NO_TS' : 'AFFAIRES.DETAIL.TOOLBAR.NO_MATCH'),
    actions: this.tsActions(),
  }));

  readonly invoiceColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'numero',   label: t('AFFAIRES.DETAIL.INVOICES.NUMBER') },
      { key: 'type',     label: t('AFFAIRES.DETAIL.INVOICES.TYPE') },
      { key: 'emission', label: t('AFFAIRES.DETAIL.INVOICES.EMITTED') },
      { key: 'echeance', label: t('AFFAIRES.DETAIL.INVOICES.DUE') },
      { key: 'montant',  label: t('AFFAIRES.DETAIL.INVOICES.AMOUNT'), align: 'right' },
      { key: 'statut',   label: t('AFFAIRES.DETAIL.INVOICES.STATUS'), type: 'badge' },
    ];
  });

  readonly invoiceRows = computed<TableRow[]>(() => this.filteredInvoices().map(inv => ({
    numero:   inv.invoiceNumber ?? '—',
    type:     this.enumText('INVOICE_TYPE', inv.invoiceType),
    emission: this.formatDate(inv.dateEmission),
    echeance: this.formatDate(inv.dateEcheance),
    montant:  this.currency.transform(inv.montantTtc, inv.devise || this.affaireDevise()),
    // Statut lisible ET coloré : la pastille était neutre pour tous les statuts, donc
    // « Payée » et « En litige » se présentaient exactement pareil.
    statut:   { label: this.enumText('INVOICE_STATUT', inv.statut),
                options: { variant: INVOICE_STATUT_BADGE[inv.statut ?? ''] ?? 'neutral', dot: true } } satisfies BadgeCell,
    _editable: this.canEditInvoice(inv),
    _source:   inv,
  })));

  readonly invoiceConfig = computed<TableConfig>(() => ({
    showHeader: false,
    hoverable:  true,
    emptyMessage: this.translate.instant(
      this.invoices().length === 0 ? 'AFFAIRES.DETAIL.SECTIONS.NO_INVOICES' : 'AFFAIRES.DETAIL.TOOLBAR.NO_MATCH'),
    actions: this.invoiceActions(),
  }));

  readonly paymentColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'date',     label: t('AFFAIRES.DETAIL.PAYMENTS.DATE') },
      { key: 'facture',  label: t('AFFAIRES.DETAIL.PAYMENTS.INVOICE') },
      { key: 'methode',  label: t('AFFAIRES.DETAIL.PAYMENTS.METHOD') },
      { key: 'ref',      label: t('AFFAIRES.DETAIL.PAYMENTS.REFERENCE') },
      { key: 'montant',  label: t('AFFAIRES.DETAIL.PAYMENTS.AMOUNT'), align: 'right' },
    ];
  });

  readonly paymentRows = computed<TableRow[]>(() => this.filteredPayments().map(p => ({
    date:    this.formatDate(p.paymentDate),
    facture: p.invoiceNumber ?? '—',
    methode: this.enumText('PAYMENT_METHOD', p.paymentMethod),
    ref:     p.bankReference ?? '—',
    montant: this.currency.transform(p.amountLocal, p.currency || this.affaireDevise()),
    _source: p,
  })));

  readonly paymentConfig = computed<TableConfig>(() => ({
    showHeader: false,
    hoverable:  true,
    emptyMessage: this.translate.instant(
      this.payments().length === 0 ? 'AFFAIRES.DETAIL.SECTIONS.NO_PAYMENTS' : 'AFFAIRES.DETAIL.TOOLBAR.NO_MATCH'),
    actions: this.paymentActions(),
  }));

  // ── Actions de ligne ─────────────────────────────────────────────────────
  //
  // Sur `config.actions`, plus dans une colonne `dafCell="_actions"` projetée : les
  // prédicats `hidden` / `disabled` par ligne de `TableAction` (4.17.0) rendent le
  // conditionnel possible sans réimplémenter à la main le style de bouton de la lib
  // (§6b rule 4). Les trois colonnes projetées de cette page ont disparu avec.
  //
  // `id` résout l'icône quand elle est standard (`view` → visibility, `edit` → stylus) ;
  // les validations TS passent une icône explicite. La cellule d'actions de la lib
  // s'occupe déjà du stopPropagation.

  readonly tsActions = computed<TableAction[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      {
        id: 'view', tooltip: t('AFFAIRES.DETAIL.TOOLBAR.VIEW'),
        onClick: row => this.openTsView(row['_source'] as TsDto),
      },
      {
        id: 'validate-tech', icon: 'fact_check', tooltip: t('AFFAIRES.DETAIL.TS.VALIDATE_TECH'),
        hidden:  row => !this.canValidateTechnique(row['_source'] as TsDto),
        onClick: row => this.openTsValidation(row['_source'] as TsDto, 'technique'),
      },
      {
        id: 'validate-comm', icon: 'handshake', tooltip: t('AFFAIRES.DETAIL.TS.VALIDATE_COMM'),
        hidden:  row => !this.canValidateCommerciale(row['_source'] as TsDto),
        onClick: row => this.openTsValidation(row['_source'] as TsDto, 'commerciale'),
      },
    ];
  });

  readonly invoiceActions = computed<TableAction[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      {
        id: 'view', tooltip: t('AFFAIRES.DETAIL.TOOLBAR.VIEW'),
        onClick: row => this.openInvoiceView(row['_source'] as AffaireInvoiceItem),
      },
      {
        // Grisée plutôt que cachée : une facture non modifiable reste une facture, et
        // faire disparaître l'action d'une ligne sur deux se lit comme un bug.
        id: 'edit', tooltip: t('AFFAIRES.DETAIL.TOOLBAR.EDIT'),
        disabled: row => !this.canEditInvoice(row['_source'] as AffaireInvoiceItem),
        onClick:  row => this.editInvoice(row['_source'] as AffaireInvoiceItem),
      },
    ];
  });

  readonly paymentActions = computed<TableAction[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      {
        id: 'view', tooltip: t('AFFAIRES.DETAIL.TOOLBAR.VIEW'),
        onClick: row => this.openPaymentView(row['_source'] as AffairePaymentItem),
      },
      {
        id: 'edit', tooltip: t('AFFAIRES.DETAIL.TOOLBAR.EDIT'),
        onClick: () => this.goToPayments(),
      },
    ];
  });

  // ═══ Drawer : échéances + activité ════════════════════════════════════════

  readonly activityDrawerConfig = computed<DrawerConfig>(() => {
    this.translate.currentLang();
    return {
      title:      this.translate.instant('AFFAIRES.DETAIL.OVERVIEW.DRAWER_TITLE'),
      icon:       'insights',
      side:       'right',
      width:      '460px',
      closeLabel: this.translate.instant('AFFAIRES.DETAIL.OVERVIEW.DRAWER_BTN'),
      // L'onglet de bord de la lib remplace le bouton qu'il y avait dans pageActions
      // (~200 px de la ligne de titre). Pas de collision avec le FAB de devise du
      // shell : le tab est `fixed top-1/2` (centré verticalement), le FAB est en bas.
      showToggle: true,
      // Le marqueur d'alerte (4.18.0). Point simple, sans `count` : « il y a quelque
      // chose » se lit plus vite qu'un « 1 ». Il reste visible panneau ouvert — c'est une
      // condition active, pas du non-lu : il disparaît quand le RAF repasse sous le seuil,
      // pas quand on a regardé.
      //
      // Le libellé distingue les deux niveaux : dire « vigilance » sur une affaire qui a
      // déjà dépassé son budget sous-estime ce qui se passe. Le dépassement allume le point
      // même si le seuil de l'affaire est mal paramétré (> 100 %), sans quoi le cas le plus
      // grave serait le seul non signalé.
      signal: (this.rafAlertActive() || this.budgetOverrun())
        ? {
            tone:  'danger',
            label: this.translate.instant(this.budgetOverrun()
              ? 'AFFAIRES.DETAIL.SIDEBAR.BUDGET_OVERRUN_TITLE'
              : 'AFFAIRES.DETAIL.SIDEBAR.RAF_ALERT_TITLE'),
            pulse: true,
          }
        : undefined,
    };
  });

  readonly deadlineColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'tache',    label: t('AFFAIRES.DETAIL.OVERVIEW.TASK') },
      { key: 'echeance', label: t('AFFAIRES.DETAIL.INVOICES.DUE') },
      { key: 'priorite', label: t('AFFAIRES.DETAIL.OVERVIEW.PRIORITY'), type: 'badge', align: 'right' },
    ];
  });

  readonly deadlineRows = computed<TableRow[]>(() => {
    const a    = this.affaire();
    const now  = Date.now();
    const t    = (k: string, p?: Record<string, string>) => this.translate.instant(k, p);
    const rows: { date: string; tache: string; priority: string }[] = [];

    for (const inv of this.invoices()) {
      if (!inv.dateEcheance) continue;
      if (inv.statut && SETTLED_INVOICE_STATUTS.has(inv.statut)) continue;
      rows.push({
        date:     inv.dateEcheance,
        tache:    t('AFFAIRES.DETAIL.OVERVIEW.DEADLINE_INVOICE', { ref: inv.invoiceNumber ?? '—' }),
        priority: this.priorityOf(inv.dateEcheance, now),
      });
    }

    if (a?.dateFin && a.statut !== 'CLOTUREE' && a.statut !== 'ARCHIVEE') {
      rows.push({
        date:     a.dateFin,
        tache:    t('AFFAIRES.DETAIL.OVERVIEW.DEADLINE_END'),
        priority: this.priorityOf(a.dateFin, now),
      });
    }

    return rows
      .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime())
      .slice(0, 6)
      .map(r => ({
        tache:    r.tache,
        echeance: this.formatDate(r.date),
        priorite: {
          label:   t(`AFFAIRES.DETAIL.OVERVIEW.PRIORITY_${r.priority.toUpperCase()}`),
          options: { variant: PRIORITY_BADGE[r.priority], dot: true },
        } satisfies BadgeCell,
      }));
  });

  readonly deadlineConfig = computed<TableConfig>(() => ({
    showHeader:   false,
    emptyMessage: this.translate.instant('AFFAIRES.DETAIL.OVERVIEW.NO_DEADLINES'),
  }));

  readonly activities = computed<ActivityRow[]>(() => {
    const a    = this.affaire();
    const cur  = this.affaireDevise();
    const rows: ActivityRow[] = [];

    for (const p of this.payments()) {
      if (!p.paymentDate) continue;
      rows.push({
        id: `pay-${p.id}`, icon: 'payments',
        titleKey: 'AFFAIRES.DETAIL.OVERVIEW.ACT_PAYMENT',
        params: { ref: p.invoiceNumber ?? '—' },
        sub: `${this.money(p.amountLocal, p.currency || cur)} • ${this.formatDate(p.paymentDate)}`,
        ts: new Date(p.paymentDate).getTime(),
      });
    }

    for (const inv of this.invoices()) {
      if (!inv.dateEmission) continue;
      rows.push({
        id: `inv-${inv.id}`, icon: 'receipt_long',
        titleKey: 'AFFAIRES.DETAIL.OVERVIEW.ACT_INVOICE',
        params: { ref: inv.invoiceNumber ?? '—' },
        sub: `${this.money(inv.montantTtc, inv.devise || cur)} • ${this.formatDate(inv.dateEmission)}`,
        ts: new Date(inv.dateEmission).getTime(),
      });
    }

    for (const ts of this.tsList()) {
      const integrated = !!ts.integreAuBudgetAt;
      const when = integrated ? ts.integreAuBudgetAt! : ts.createdAt;
      rows.push({
        id: `ts-${ts.id}`, icon: 'add_task',
        titleKey: integrated
          ? 'AFFAIRES.DETAIL.OVERVIEW.ACT_TS_INTEGRATED'
          : 'AFFAIRES.DETAIL.OVERVIEW.ACT_TS_CREATED',
        params: { ref: ts.referenceTs },
        sub: `${this.money(ts.montantEstime, ts.devise || cur)} • ${this.formatDate(when)}`,
        ts: new Date(when).getTime(),
      });
    }

    if (a) {
      if (a.updatedAt) {
        rows.push({
          id: 'affaire-updated', icon: 'edit_note',
          titleKey: 'AFFAIRES.DETAIL.OVERVIEW.ACT_UPDATED', params: {},
          sub: this.formatDate(a.updatedAt), ts: new Date(a.updatedAt).getTime(),
        });
      }
      rows.push({
        id: 'affaire-created', icon: 'flag',
        titleKey: 'AFFAIRES.DETAIL.OVERVIEW.ACT_CREATED', params: {},
        sub: `${this.money(a.budgetPrevisionnel)} • ${this.formatDate(a.createdAt)}`,
        ts: new Date(a.createdAt).getTime(),
      });
    }

    return rows.sort((x, y) => y.ts - x.ts).slice(0, 8);
  });

  // ═══ Chargement ═══════════════════════════════════════════════════════════

  readonly availableTransitions = computed(() => {
    const a = this.affaire();
    return a ? (STATUT_TRANSITIONS[a.statut] ?? []) : [];
  });

  ngOnInit(): void {
    this.svc.getPays().subscribe(list => this.paysList.set(list));
    this.loadAll();
  }

  loadAll(): void {
    const id = this.numId;
    if (!id) {
      this.error.set(this.translate.instant('AFFAIRES.DETAIL.INVALID_ID'));
      this.firstLoad.set(false);
      return;
    }
    this.error.set(null);

    this.svc.getAffaire(id).subscribe({
      next: a => {
        this.affaire.set(a);
        this.firstLoad.set(false);
        this.loadRaf();
        this.loadKpis();
        this.loadTs();
        this.loadInvoices();
        this.loadPayments();
        this.loadTeamAvatars(a);
      },
      error: () => {
        this.error.set(this.translate.instant('AFFAIRES.DETAIL.LOAD_ERROR'));
        this.firstLoad.set(false);
      },
    });
  }

  loadRaf():      void { this.svc.getAffaireRaf(this.numId).subscribe({ next: r => this.raf.set(r) }); }
  loadKpis():     void { this.svc.getAffaireKpis(this.numId).subscribe({ next: k => this.kpis.set(k) }); }
  loadTs():       void { this.svc.getTS(this.numId).subscribe({ next: ts => this.tsList.set(ts) }); }
  loadInvoices(): void { this.svc.getAffaireInvoices(this.numId).subscribe({ next: i => this.invoices.set(i) }); }
  loadPayments(): void { this.svc.getAffairePayments(this.numId).subscribe({ next: p => this.payments.set(p) }); }

  /**
   * Photos de l'équipe, via rh-service. Sans `error` handler : le service ne rejette
   * jamais (une panne RH renvoie une liste vide) et l'absence de photo se dégrade en
   * initiales, donc il n'y a rien à signaler à l'utilisateur.
   */
  loadTeamAvatars(a: AffaireDetail): void {
    const ids = this.teamUserIds(a);
    if (ids.length === 0) return;
    this.avatarSvc.resolve(ids).subscribe({
      next: rows => {
        this.avatars.set(new Map(rows.map(r => [r.userId, r])));

        // `daf-avatar` retombe sur les initiales dans trois cas indistinguables à l'écran :
        // pas de ligne pour cet utilisateur, `photo_url` nul en base, ou image en erreur.
        // En `debug` (masqué par défaut dans la console de Chrome, visible en « Verbose »)
        // pour ne pas faire de bruit tout en gardant la boucle de diagnostic fermée :
        // l'URL affichée est cliquable, et c'est elle qui dit si le fichier existe.
        for (const id of ids) {
          const row = rows.find(r => r.userId === id);
          console.debug(`[avatars] user ${id} →`,
            !row              ? 'aucune ligne RH (utilisateur inconnu ou profil supprimé)'
            : !row.profileId  ? 'pas de profil RH (initiales attendues)'
            : !row.photoUrl   ? 'profil sans photo (initiales attendues)'
            :                   this.avatarSvc.photoUrl(row));
        }
      },
    });
  }

  // ═══ Actions ══════════════════════════════════════════════════════════════

  validerBudget(): void {
    if (this.budgetLoading()) return;
    this.budgetLoading.set(true);
    this.actionError.set(null);
    this.svc.validerBudget(this.numId).subscribe({
      next: () => { this.budgetLoading.set(false); this.loadAll(); },
      error: err => {
        this.budgetLoading.set(false);
        this.actionError.set(err?.error?.message ?? this.translate.instant('AFFAIRES.DETAIL.BUDGET_ERROR'));
      },
    });
  }

  /**
   * Saisie d'un frais remboursable, dans une modale de taille moyenne : elle ne contient
   * que le formulaire, donc elle n'a pas besoin de la largeur d'un tableau.
   */
  private expensesModalRef: { close: () => void } | null = null;

  openExpenses(): void {
    this.expensesModalRef = this.modals.open({
      title: this.translate.instant('AFFAIRES.DETAIL.MODAL.EXPENSES_TITLE'),
      icon:  'receipt_long',
      size:  'md',
      body:  this.expensesTpl(),
      // Annuler / Soumettre côte à côte dans le pied, comme les modales de statut et de
      // validation TS. Le formulaire n'a plus de bouton à lui.
      buttons: [
        {
          label: this.translate.instant('AFFAIRES.DETAIL.MODAL.CANCEL'),
          variant: 'secondary',
          action: r => { this.expenseForm()?.cancel(); r.close(); },
        },
        {
          label: this.translate.instant('AFFAIRES.EXPENSES.FORM.SUBMIT'),
          variant: 'primary',
          // Pas de `r.close()` ici : `submit()` est asynchrone et c'est `(submitted)` qui
          // ferme, une fois l'enregistrement confirmé. Fermer tout de suite masquerait
          // une erreur serveur et laisserait croire que le frais est enregistré.
          action: () => { this.expenseForm()?.submit(); },
        },
      ],
    });
  }

  /**
   * Après enregistrement : on ferme et on bascule sur l'onglet « Frais », où la ligne
   * qui vient d'être créée est visible. Rester dans un formulaire vidé ne dit pas si
   * l'enregistrement a abouti.
   */
  onExpenseSubmitted(): void {
    this.expensesModalRef?.close();
    this.expensesModalRef = null;
    this.activeTab.set('frais');
  }

  openStatutModal(): void {
    const transitions = this.availableTransitions();
    if (transitions.length === 0) return;
    this.targetStatut.set(transitions[0]);
    this.motif.set('');
    this.modalError.set(null);

    const ref = this.modals.open({
      title: this.translate.instant('AFFAIRES.DETAIL.MODAL.STATUS_TITLE'),
      icon:  'swap_horiz',
      size:  'md',
      body:  this.statutTpl(),
      buttons: [
        { label: this.translate.instant('AFFAIRES.DETAIL.MODAL.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label: this.translate.instant('AFFAIRES.DETAIL.MODAL.CONFIRM'),
          variant: 'primary',
          action: () => this.submitStatut(ref),
        },
      ],
    });
  }

  private submitStatut(ref: { close: () => void }): void {
    const statut = this.targetStatut();
    if (!statut) return;
    this.modalError.set(null);
    this.svc.changerStatut(this.numId, { newStatut: statut, reason: this.motif().trim() || null }).subscribe({
      next: () => { ref.close(); this.loadAll(); },
      error: err => this.modalError.set(
        err?.error?.message ?? this.translate.instant('AFFAIRES.DETAIL.STATUS_ERROR')),
    });
  }

  readonly statutRadioOptions = computed<RadioOption[]>(() => {
    this.translate.currentLang();
    return this.availableTransitions().map(s => ({
      value: s,
      label: this.translate.instant(STATUT_LABELS[s] ?? s),
    }));
  });

  readonly motifFieldOptions = computed<FormFieldOptions>(() => ({
    label:       this.translate.instant('AFFAIRES.DETAIL.MODAL.REASON'),
    type:        'textarea',
    rows:        3,
    maxLength:   500,
    fullWidth:   true,
    placeholder: this.translate.instant('AFFAIRES.DETAIL.MODAL.REASON_PLACEHOLDER'),
  }));

  // ── Validation d'un TS ───────────────────────────────────────────────────

  canValidateTechnique(ts: TsDto): boolean {
    return ts.statut === 'CREATED' && this.store.hasPermission('FACT_VALID_TECHNIQUE_TS');
  }

  canValidateCommerciale(ts: TsDto): boolean {
    return ts.statut === 'VALID_TECHNIQUE' && this.store.hasPermission('FACT_VALID_COMMERCIALE_TS');
  }

  readonly tsValidationSummary = computed(() => {
    const target = this.tsValidationTarget();
    if (!target) return '';
    return `${target.ts.referenceTs} · ${target.ts.intitule} — `
      + this.money(target.ts.montantEstime, target.ts.devise || this.affaireDevise());
  });

  readonly tsNotesFieldOptions = computed<FormFieldOptions>(() => ({
    label:     this.translate.instant('AFFAIRES.DETAIL.TS.NOTES'),
    type:      'textarea',
    rows:      3,
    maxLength: 500,
    fullWidth: true,
  }));

  openTsValidation(ts: TsDto, step: 'technique' | 'commerciale'): void {
    this.tsValidationTarget.set({ ts, step });
    this.tsNotes.set('');
    this.modalError.set(null);

    const ref = this.modals.open({
      title: this.translate.instant(step === 'technique'
        ? 'AFFAIRES.DETAIL.TS.VALIDATE_TECH'
        : 'AFFAIRES.DETAIL.TS.VALIDATE_COMM'),
      icon: step === 'technique' ? 'fact_check' : 'handshake',
      size: 'md',
      body: this.tsValidationTpl(),
      buttons: [
        { label: this.translate.instant('AFFAIRES.DETAIL.MODAL.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label: this.translate.instant('AFFAIRES.DETAIL.MODAL.CONFIRM'),
          variant: 'primary',
          action: () => this.submitTsValidation(ref),
        },
      ],
    });
  }

  private submitTsValidation(ref: { close: () => void }): void {
    const target = this.tsValidationTarget();
    if (!target) return;
    const notes = this.tsNotes().trim() || null;
    const call  = target.step === 'technique'
      ? this.svc.validerTechnique(target.ts.id, { notes })
      : this.svc.validerCommerciale(target.ts.id, { notes });

    this.modalError.set(null);
    call.subscribe({
      next: () => { ref.close(); this.tsValidationTarget.set(null); this.loadTs(); this.loadRaf(); },
      error: err => this.modalError.set(
        err?.error?.message ?? this.translate.instant('AFFAIRES.DETAIL.TS.VALIDATE_ERROR')),
    });
  }

  // ── Consultation d'une ligne ─────────────────────────────────────────────

  private openRowModal(row: RowDetail): void {
    this.modalRowState.set(row);
    const buttons = [
      { label: this.translate.instant('AFFAIRES.DETAIL.MODAL.CLOSE'), variant: 'secondary' as const,
        action: (r: { close: () => void }) => r.close() },
    ];
    if (row.openAction) {
      buttons.push({
        label: this.translate.instant(row.openAction.labelKey),
        variant: 'primary' as unknown as 'secondary',
        action: (r: { close: () => void }) => { r.close(); row.openAction!.run(); },
      });
    }
    this.modals.open({
      title: `${this.translate.instant(row.titleKey)} — ${row.ref}`,
      icon:  'visibility',
      size:  'md',
      body:  this.rowDetailTpl(),
      buttons,
    });
  }

  /**
   * Détail d'une facture. Les champs optionnels ne sont ajoutés que s'ils portent une
   * valeur : une ligne « Motif d'avoir — » sur une facture ordinaire, ou une période
   * vide sur un acompte, allongent la fenêtre sans rien apprendre.
   */
  openInvoiceView(inv: AffaireInvoiceItem): void {
    const devise = inv.devise || this.affaireDevise();
    const fields: DetailField[] = [
      { label: 'AFFAIRES.DETAIL.INVOICES.TYPE',    value: this.enumText('INVOICE_TYPE', inv.invoiceType) },
      { label: 'AFFAIRES.DETAIL.INVOICES.STATUS',  value: this.enumText('INVOICE_STATUT', inv.statut) },
      { label: 'AFFAIRES.DETAIL.INFO.CLIENT',      value: inv.clientNom ?? this.affaire()?.clientName ?? '—' },
    ];
    if (inv.billingMode) {
      fields.push({ label: 'AFFAIRES.DETAIL.INFO.BILLING_MODE', value: this.enumText('BILLING_MODE', inv.billingMode) });
    }
    if (inv.periodFrom || inv.periodTo) {
      fields.push({ label: 'AFFAIRES.DETAIL.INVOICES.PERIOD',
                    value: `${this.formatDate(inv.periodFrom)} — ${this.formatDate(inv.periodTo)}` });
    }
    if (inv.progressPct != null) {
      fields.push({ label: 'AFFAIRES.DETAIL.INVOICES.PROGRESS', value: `${inv.progressPct} %` });
    }
    fields.push(
      { label: 'AFFAIRES.DETAIL.INVOICES.AMOUNT_HT',  value: this.money(inv.montantHt ?? null, devise) },
      { label: 'AFFAIRES.DETAIL.INVOICES.AMOUNT_TVA', value: this.money(inv.montantTva ?? null, devise) },
      { label: 'AFFAIRES.DETAIL.INVOICES.AMOUNT',     value: this.money(inv.montantTtc, devise) },
      { label: 'AFFAIRES.DETAIL.INVOICES.SUBMITTED',  value: this.formatDate(inv.submittedAt) },
      { label: 'AFFAIRES.DETAIL.INVOICES.EMITTED',    value: this.formatDate(inv.dateEmission) },
      { label: 'AFFAIRES.DETAIL.INVOICES.SENT',       value: this.formatDate(inv.sentAt) },
      { label: 'AFFAIRES.DETAIL.INVOICES.DUE',        value: this.formatDate(inv.dateEcheance) },
    );
    if (inv.creditNoteReason) {
      fields.push({ label: 'AFFAIRES.DETAIL.INVOICES.CREDIT_REASON', value: inv.creditNoteReason });
    }
    if (inv.disputeOpenedAt) {
      fields.push({ label: 'AFFAIRES.DETAIL.INVOICES.DISPUTE',
                    value: `${this.formatDate(inv.disputeOpenedAt)} → ${this.formatDate(inv.disputeResolvedAt)}` });
    }
    if (inv.notes) {
      fields.push({ label: 'AFFAIRES.DETAIL.INFO.NOTES', value: inv.notes });
    }

    this.openRowModal({
      titleKey: 'AFFAIRES.DETAIL.MODAL.INVOICE_TITLE',
      ref:      inv.invoiceNumber ?? `#${inv.id}`,
      fields,
      openAction: { labelKey: 'AFFAIRES.DETAIL.MODAL.OPEN_INVOICE', run: () => this.goToInvoice(inv.id) },
    });
  }

  openPaymentView(p: AffairePaymentItem): void {
    const devise = p.currency || this.affaireDevise();
    this.openRowModal({
      titleKey: 'AFFAIRES.DETAIL.MODAL.PAYMENT_TITLE',
      ref:      p.invoiceNumber ?? `#${p.id}`,
      fields: [
        { label: 'AFFAIRES.DETAIL.PAYMENTS.DATE',      value: this.formatDate(p.paymentDate) },
        { label: 'AFFAIRES.DETAIL.PAYMENTS.INVOICE',   value: p.invoiceNumber ?? '—' },
        { label: 'AFFAIRES.DETAIL.PAYMENTS.METHOD',    value: this.enumText('PAYMENT_METHOD', p.paymentMethod) },
        { label: 'AFFAIRES.DETAIL.PAYMENTS.REFERENCE', value: p.bankReference ?? '—' },
        { label: 'AFFAIRES.DETAIL.PAYMENTS.AMOUNT',    value: this.money(p.amountLocal, devise) },
        { label: 'AFFAIRES.DETAIL.SIDEBAR.CREATED_AT', value: this.formatDate(p.recordedAt) },
        { label: 'AFFAIRES.DETAIL.INFO.NOTES',         value: p.notes ?? '—' },
      ],
      openAction: { labelKey: 'AFFAIRES.DETAIL.MODAL.OPEN_PAYMENTS', run: () => this.goToPayments() },
    });
  }

  /**
   * Détail d'un TS. Les deux validations sont montrées avec leur date ET leur note :
   * c'est l'historique de la décision, et c'est ce qu'on vient vérifier. Les notes
   * n'apparaissent que lorsqu'elles existent.
   */
  openTsView(ts: TsDto): void {
    const fields: DetailField[] = [
      { label: 'AFFAIRES.DETAIL.MODAL.TS_INTITULE',      value: ts.intitule },
      { label: 'AFFAIRES.DETAIL.MODAL.TS_AMOUNT',        value: this.money(ts.montantEstime, ts.devise || this.affaireDevise()) },
      { label: 'AFFAIRES.DETAIL.INVOICES.STATUS',        value: this.enumText('TS_STATUT', ts.statut) },
      { label: 'AFFAIRES.DETAIL.MODAL.TS_PERIMETRE',     value: ts.perimetre ?? '—' },
      { label: 'AFFAIRES.DETAIL.MODAL.TS_IMPACT',        value: ts.impactBudgetaire ?? '—' },
      { label: 'AFFAIRES.DETAIL.TS.VALID_TECH_AT',       value: this.formatDate(ts.validTechniqueAt) },
    ];
    if (ts.validTechniqueNotes) {
      fields.push({ label: 'AFFAIRES.DETAIL.TS.VALID_TECH_NOTES', value: ts.validTechniqueNotes });
    }
    fields.push({ label: 'AFFAIRES.DETAIL.TS.VALID_COMM_AT', value: this.formatDate(ts.validCommercialeAt) });
    if (ts.validCommercialeNotes) {
      fields.push({ label: 'AFFAIRES.DETAIL.TS.VALID_COMM_NOTES', value: ts.validCommercialeNotes });
    }
    fields.push(
      { label: 'AFFAIRES.DETAIL.MODAL.TS_INTEGRATED_AT', value: this.formatDate(ts.integreAuBudgetAt) },
      { label: 'AFFAIRES.DETAIL.SIDEBAR.CREATED_AT',     value: this.formatDate(ts.createdAt) },
      { label: 'AFFAIRES.DETAIL.INFO.NOTES',             value: ts.description ?? '—' },
    );

    this.openRowModal({ titleKey: 'AFFAIRES.DETAIL.MODAL.TS_TITLE', ref: ts.referenceTs, fields });
  }

  // ── Édition d'une ligne ──────────────────────────────────────────────────
  //
  // Il n'existe pas d'API de mise à jour ligne-à-ligne : une facture ne se modifie
  // que par son propre écran (et seulement tant qu'elle est modifiable), un paiement
  // se gère dans le module Paiements.

  canEditInvoice(inv: AffaireInvoiceItem): boolean {
    return EDITABLE_INVOICE_STATUTS.has(inv.statut ?? '');
  }

  editInvoice(inv: AffaireInvoiceItem): void {
    if (this.canEditInvoice(inv)) this.goToInvoice(inv.id);
  }

  // ── Navigation ───────────────────────────────────────────────────────────

  // Plus de `goBack()` : le retour à la liste est le lien du fil d'Ariane. La méthode
  // pointait `['../..']` (soit `/finance`) et écrasait ce lien.
  openEdit():     void { this.router.navigate(['edit'],   { relativeTo: this.route }); }

  /**
   * Nouveau TS — le corps du formulaire dans une `daf-modal`, avec le bouton de
   * confirmation de la modale plutôt qu'un pied de page interne.
   *
   * `submit()` renvoie `false` quand la saisie est incomplète : la fenêtre reste alors
   * ouverte sur ses messages d'erreur, au lieu de se refermer en silence.
   */
  openTsForm(): void {
    this.tsFormModalRef = this.modals.open({
      title: this.translate.instant('AFFAIRES.ts.form.title'),
      icon:  'post_add',
      size:  'md',
      body:  this.tsFormTpl(),
      buttons: [
        {
          label: this.translate.instant('AFFAIRES.ts.actions.cancel'),
          variant: 'secondary',
          action: r => { this.tsForm()?.cancel(); r.close(); },
        },
        {
          label: this.translate.instant('AFFAIRES.ts.form.create'),
          variant: 'primary',
          action: () => { this.tsForm()?.submit(); },
        },
      ],
    });
  }

  /**
   * « Nouvelle facture » ouvre l'ASSISTANT de création, affaire déjà sélectionnée — et
   * non plus la liste des factures filtrée, qui obligeait à recliquer sur « Nouvelle
   * facture » puis à rechercher l'affaire qu'on venait de quitter.
   * `step-affaire` lit `?affaire=` et joue sa propre sélection (RAF, mode, TS compris).
   */
  goToInvoicing(): void {
    this.router.navigate(['../../invoicing', 'new'], {
      relativeTo: this.route,
      queryParams: { affaire: this.numId },
    });
  }

  private goToInvoice(id: number): void {
    this.router.navigate(['../../invoicing', id], { relativeTo: this.route });
  }

  goToPayments(): void {
    this.router.navigate(['../../recouvrement'], { relativeTo: this.route, queryParams: { affaire: this.numId } });
  }

  onTsFormClosed(saved: boolean): void {
    this.tsFormModalRef?.close();
    this.tsFormModalRef = null;
    if (saved) { this.loadTs(); this.loadRaf(); }
  }

  // ═══ Export CSV ═══════════════════════════════════════════════════════════

  exportTs(): void {
    const t = (k: string) => this.translate.instant(k);
    this.downloadCsv(
      `TS_${this.affaire()?.reference ?? this.numId}`,
      [t('AFFAIRES.DETAIL.MODAL.TS_TITLE'), t('AFFAIRES.DETAIL.MODAL.TS_INTITULE'),
       t('AFFAIRES.DETAIL.MODAL.TS_AMOUNT'), t('AFFAIRES.DETAIL.INFO.CURRENCY'),
       t('AFFAIRES.DETAIL.INVOICES.STATUS'), t('AFFAIRES.DETAIL.MODAL.TS_INTEGRATED_AT')],
      this.filteredTs().map(ts => [
        ts.referenceTs, ts.intitule, ts.montantEstime, ts.devise,
        this.enumText('TS_STATUT', ts.statut), this.formatDate(ts.integreAuBudgetAt),
      ]),
    );
  }

  exportInvoices(): void {
    const t = (k: string) => this.translate.instant(k);
    this.downloadCsv(
      `Factures_${this.affaire()?.reference ?? this.numId}`,
      [t('AFFAIRES.DETAIL.INVOICES.NUMBER'), t('AFFAIRES.DETAIL.INVOICES.TYPE'),
       t('AFFAIRES.DETAIL.INVOICES.EMITTED'), t('AFFAIRES.DETAIL.INVOICES.DUE'),
       t('AFFAIRES.DETAIL.INVOICES.AMOUNT'), t('AFFAIRES.DETAIL.INFO.CURRENCY'),
       t('AFFAIRES.DETAIL.INVOICES.STATUS')],
      this.filteredInvoices().map(i => [
        i.invoiceNumber, i.invoiceType, this.formatDate(i.dateEmission), this.formatDate(i.dateEcheance),
        i.montantTtc, i.devise || this.affaireDevise(), i.statut,
      ]),
    );
  }

  exportPayments(): void {
    const t = (k: string) => this.translate.instant(k);
    this.downloadCsv(
      `Paiements_${this.affaire()?.reference ?? this.numId}`,
      [t('AFFAIRES.DETAIL.PAYMENTS.DATE'), t('AFFAIRES.DETAIL.PAYMENTS.INVOICE'),
       t('AFFAIRES.DETAIL.PAYMENTS.METHOD'), t('AFFAIRES.DETAIL.PAYMENTS.REFERENCE'),
       t('AFFAIRES.DETAIL.PAYMENTS.AMOUNT'), t('AFFAIRES.DETAIL.INFO.CURRENCY')],
      this.filteredPayments().map(p => [
        this.formatDate(p.paymentDate), p.invoiceNumber, p.paymentMethod, p.bankReference,
        p.amountLocal, p.currency || this.affaireDevise(),
      ]),
    );
  }

  /**
   * CSV séparé par `;` avec BOM UTF-8 : c'est ce qu'Excel en locale FR ouvre sans
   * assistant d'import ni accents cassés.
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

  // ═══ Formatage ════════════════════════════════════════════════════════════

  /** Montant dans la devise d'affichage courante — même pipe que le reste du module. */
  private money(v: number | null | undefined, devise?: string): string {
    return this.currency.transform(v ?? null, devise ?? this.affaireDevise());
  }

  formatPct(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v) + '%';
  }

  // `undefined` admis en plus de `null` : les champs de facture ajoutés au modèle sont
  // optionnels (`periodFrom?`, `sentAt?`…), et une date absente s'affiche « — » dans les
  // deux cas. Élargir la signature évite de semer des `?? null` sur chaque appel.
  formatDate(d: string | null | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  private priorityOf(date: string, now: number): 'high' | 'medium' | 'standard' {
    const days = (new Date(date).getTime() - now) / 86_400_000;
    return days < 0 ? 'high' : days <= 15 ? 'medium' : 'standard';
  }
}
