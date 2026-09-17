import {
  Component, ElementRef, HostListener, Input, OnDestroy, OnInit, Renderer2, ViewChild, WritableSignal,
  effect, inject, signal, computed, viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import * as XLSX from 'xlsx';
import {
  ButtonComponent, CardComponent, HelpPopoverComponent, FormFieldComponent, MultiDatePickerComponent,
  StepperComponent, StepperStep, StepperConfig,
  DataTableComponent, DafCellDirective, TableColumn, TableConfig, TableRow, BadgeCell,
  SearchToolbarComponent, StatusBadgeComponent, FilterField, FilterResult,
  AccordionCardComponent, PaginationComponent, TabsComponent, TabItem,
} from '@khalilrebhiitec/daf360';
import { Router } from '@angular/router';
import { WipService } from './wip.service';
import { WipTauxDto, WipTauxStatut, WipTmHourDto, WipTmPreviewDto } from './wip.model';
import { BillingService, LineDetailDto } from '../billing/billing.service';
import { LivrableService } from '../livrable.service';
import { AffaireLivrableDto, LivrableBatchDto, LivrableBatchStatut } from '../livrable.model';
import { AffaireDetail } from '../affaire.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { isoWeek, isoWeekYear } from '../../../shared/iso-week';
import { BILLING_LINE_STATUT_BADGE, WIP_TAUX_STATUT_BADGE, LIVRABLE_STATUT_BADGE, LIVRABLE_BATCH_STATUT_BADGE, enumLabel } from '../../../shared/enum-labels';
import { WipTmDetailTableComponent } from './wip-tm-detail-table.component';
import { WipTmCollaboratorDetailComponent } from './wip-tm-collaborator-detail.component';

@Component({
  selector: 'app-affaire-wip-tab',
  standalone: true,
  imports: [
    TranslatePipe, ButtonComponent, CardComponent, HelpPopoverComponent, FormFieldComponent, MultiDatePickerComponent, StepperComponent,
    DataTableComponent, DafCellDirective, DisplayCurrencyPipe, WipTmDetailTableComponent, WipTmCollaboratorDetailComponent,
    SearchToolbarComponent, StatusBadgeComponent, AccordionCardComponent, PaginationComponent, TabsComponent,
  ],
  providers: [DisplayCurrencyPipe],
  templateUrl: './affaire-wip-tab.component.html',
  styles: [`
    /* TEST : habille les daf-button à l'intérieur de .wip-icon-actions pour qu'ils
       ressemblent aux boutons d'action de profile-grid-card.component.ts (/rh/profiles) —
       neutres, petits, la couleur ne change qu'au survol — plutôt que les fonds pleins
       "ghost"/"secondary"/"teal" de la lib. On garde daf-button (loading/disabled
       marchent toujours) : seule son apparence est retouchée ici, pas son mécanisme.
       Spécificité : .wip-icon-actions button (0,1,1) l'emporte déjà sur les classes
       utilitaires Tailwind (0,1,0) de la lib, pas besoin de !important. */
    ::ng-deep .wip-icon-actions button {
      padding: 6px;
      border: none;
      background: transparent;
      color: var(--color-outline, #75777d);
      border-radius: 6px;
      box-shadow: none;
    }
    ::ng-deep .wip-icon-actions button:hover:not(:disabled) {
      color: var(--color-tertiary, #1a6b7c);
      background: var(--color-surface-container, #eceef0);
    }
    ::ng-deep .wip-icon-actions button .material-symbols-outlined {
      font-size: 18px;
    }

    /* TEST : daf-accordion-card ne retire l'outline par défaut du navigateur qu'en
       'focus-visible:outline-none' — au clic SOURIS (pas clavier), le <button> d'en-tête
       garde l'outline natif (souvent un cadre noir/sombre selon le navigateur/l'OS),
       jamais retiré puisqu'un clic souris ne déclenche pas :focus-visible. On le retire
       nous-mêmes seulement quand ce n'est PAS un focus clavier (:not(:focus-visible)),
       pour ne rien casser côté accessibilité clavier. Classe partagée par les 3 modes
       (Forfaitaire/Régie/Livrable), pas juste le taux AV. */
    ::ng-deep .wip-accordion button:focus:not(:focus-visible) {
      outline: none;
    }

    /* TEST : champ "Nouveau taux cumulé" un peu moins haut que le h-11 (44px) par défaut
       de daf-form-field — même technique de spécificité que .wip-icon-actions ci-dessus
       (.taux-field-compact input, 0,1,1, l'emporte sur les classes Tailwind h-11/py-2.5
       de la lib sans !important). */
    ::ng-deep .taux-field-compact input {
      height: 38px;
      padding-top: 6px;
      padding-bottom: 6px;
    }

    /* TEST : daf-pagination place le résumé "1–20 sur 137" à gauche (justify-between,
       premier enfant) et les contrôles de page + sélecteur "par page" à droite (second
       enfant). On veut l'inverse : row-reverse sur son unique <div> racine inverse
       l'ordre visuel des deux (justify-between s'applique toujours, juste à l'ordre
       inversé), sans devoir recopier le template de la lib. */
    ::ng-deep .wip-pagination > div {
      flex-direction: row-reverse;
    }

    /* TEST : switch Pourcentage/Montant — daf-tabs (variant pill) recoloré en vert
       (même palette que .act-btn--green de affaire-ressources-tab.component.scss)
       au lieu du tertiary bleu/teal par défaut de la lib. Les classes Tailwind
       générées par daf-tabs (bg-tertiary-container, border-tertiary,
       text-on-tertiary-container) lisent ces variables CSS, qui héritent normalement
       à travers le DOM réel — pas besoin de ::ng-deep pour les redéfinir ici. */
    .wip-mode-tabs {
      --color-tertiary: #006b58;
      --color-tertiary-container: #d1fae5;
      --color-on-tertiary-container: #065f46;
    }

    /* Champ "Nouveau %" du tableau Livrable : les flèches haut/bas natives du navigateur
       (input type="number") débordaient du petit cadre custom (input sans bordure propre,
       bordure portée par son conteneur) — on les retire de la case et on les redessine
       juste à côté (.pct-stepper-btn ci-dessous), au lieu de les supprimer purement. */
    .pct-cell-input::-webkit-outer-spin-button,
    .pct-cell-input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .pct-cell-input[type='number'] {
      appearance: textfield;
      -moz-appearance: textfield;
    }
    .pct-stepper-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 11px;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--color-outline, #75777d);
      cursor: pointer;
    }
    .pct-stepper-btn:hover:not(:disabled) {
      color: var(--color-tertiary, #1a6b7c);
    }
    .pct-stepper-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .pct-stepper-btn .material-symbols-outlined {
      font-size: 14px;
    }
  `],
})
export class AffaireWipTabComponent implements OnInit, OnDestroy {
  @Input({ required: true }) affaire!: AffaireDetail;

  private readonly currency = inject(DisplayCurrencyPipe);
  private readonly svc = inject(WipService);
  private readonly billingSvc = inject(BillingService);
  private readonly livrableSvc = inject(LivrableService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly renderer = inject(Renderer2);
  private readonly document = inject(DOCUMENT);

  /** "Historique WIP" en plein écran (remplace la carte + le stepper) — tout
   * l'historique avec recherche + filtre Statut, plutôt qu'une popup plafonnée à
   * 900px (taille max native de ModalConfig, sans option pour aller plus loin). */
  showHistoryPage = signal(false);
  historySearch = signal('');
  historyStatut = signal('');

  /** Portalé sous <body> pendant qu'elle est ouverte — même raison que positionPortal()
   * plus bas pour les calendriers : `position: fixed` se cale sur le premier ancêtre avec
   * un `transform`/`filter`, pas sur le viewport, et le conteneur de la sidebar du shell en
   * est un — sans ça la popup s'arrêtait avant la sidebar au lieu de couvrir toute la page.
   * Une seule ref partagée entre les popups Régie et Livrable : un seul `billingMode` actif
   * à la fois, jamais les deux popups montées en même temps (voir positionPortal). */
  private readonly historyOverlayRef = viewChild<ElementRef<HTMLElement>>('historyOverlay');
  private historyOverlayPortaled: HTMLElement | null = null;

  constructor() {
    effect(onCleanup => {
      const ref = this.historyOverlayRef();
      if (!ref || !this.showHistoryPage()) return;

      const node = ref.nativeElement;
      if (node.parentElement !== this.document.body) {
        this.renderer.appendChild(this.document.body, node);
        this.historyOverlayPortaled = node;
      }

      onCleanup(() => {
        // Angular détruit la vue du `@if` en ciblant le parent D'ORIGINE du nœud — comme
        // on l'a déplacé sous <body>, il faut le retirer nous-mêmes avant, sans quoi Angular
        // tenterait de le retirer d'un parent qui n'est plus le sien.
        node.remove();
        if (this.historyOverlayPortaled === node) this.historyOverlayPortaled = null;
      });
    });
  }

  /** TEST : pagination daf-pagination de la lib sur les popups "Historique" (Régie et
   * Livrable) — partagée entre les deux comme historySearch/historyStatut ci-dessus
   * (une seule popup affichée à la fois, selon le mode). `currentPage` de daf-pagination
   * est 0-indexé. */
  historyPage = signal(0);
  historyPageSize = signal(20);

  /** Recherche/filtre/ouverture de la popup Historique repassent tous par ici pour
   * remettre `historyPage` à 0 — sinon une page 3 restait affichée après une recherche
   * qui ne renvoie qu'une page de résultats. */
  onHistorySearchChange(value: string): void {
    this.historySearch.set(value);
    this.historyPage.set(0);
  }

  onHistoryStatutReset(): void {
    this.historyStatut.set('');
    this.historyPage.set(0);
  }

  openHistoryPage(): void {
    this.historyPage.set(0);
    this.showHistoryPage.set(true);
  }

  onHistoryPageSizeChange(size: number): void {
    this.historyPageSize.set(size);
    this.historyPage.set(0);
  }

  private readonly now = new Date();
  // AV only — defaults to the current calendar month as a starting point, same as TM's
  // tmDateFrom/tmDateTo below, but freely editable to any range (see 2026-09-01 design spec).
  periodDateFrom = this.toIso(new Date(this.now.getFullYear(), this.now.getMonth(), 1));
  periodDateTo   = this.toIso(new Date(this.now.getFullYear(), this.now.getMonth() + 1, 0));

  // ── AV ──────────────────────────────────────────────────────────────────
  tauxHistory   = signal<WipTauxDto[]>([]);
  loadingTaux   = signal(false);
  newTauxValue  = signal<number | null>(null);
  // Named to match this codebase's existing string-union convention (WipTauxStatut's
  // 'EN_ATTENTE'/'VALIDE'/'REFUSE' — French business terms, not English enum names). Whichever
  // mode is active, effectiveTauxPercent() below always converts to the percentage the backend
  // actually stores, so nothing downstream needs to know which mode was used.
  avInputMode    = signal<'POURCENTAGE' | 'MONTANT'>('POURCENTAGE');
  newAmountValue = signal<number | null>(null);

  /** TEST : le switch Pourcentage/Montant devient un vrai `daf-tabs` (variant `pill`,
   * même composant que le bandeau d'onglets de la page /finance/affaires/:id) au lieu
   * des deux <button> faits main — coloré en vert via .wip-mode-tabs (styles du .ts)
   * plutôt que le tertiary (bleu/teal) par défaut de la lib. */
  readonly avModeTabs = computed<TabItem[]>(() => [
    { id: 'POURCENTAGE', label: this.translate.instant('AFFAIRES.WIP.TAUX_MODE_PERCENT') },
    { id: 'MONTANT',     label: this.translate.instant('AFFAIRES.WIP.TAUX_MODE_AMOUNT') },
  ]);

  onAvModeTabChange(id: string): void {
    if (id === 'POURCENTAGE' || id === 'MONTANT') this.avInputMode.set(id);
  }
  tauxComment   = '';
  tauxError     = signal<string | null>(null);
  submittingTaux= signal(false);
  editingTauxId = signal<number | null>(null);
  deleteTauxError = signal<string | null>(null);

  readonly lastValidatedTaux = computed(() => {
    const vals = this.tauxHistory().filter(t => t.statut === 'VALIDE');
    return vals.length > 0 ? Math.max(...vals.map(t => t.tauxSaisi)) : 0;
  });

  readonly editingTaux = computed<WipTauxDto | null>(() =>
    this.tauxHistory().find(t => t.id === this.editingTauxId()) ?? null);

  /** The single percentage every existing consumer (validation, preview, submit payload)
   * reads — regardless of whether the user is currently typing a percentage or an amount.
   * In MONTANT mode, converts amount -> percentage at the same 3-decimal precision
   * ProgressBillingService already uses for every currency calculation in this flow, so a
   * displayed amount never silently disagrees with what actually gets submitted. */
  readonly effectiveTauxPercent = computed<number | null>(() => {
    if (this.avInputMode() === 'POURCENTAGE') return this.newTauxValue();
    const amount = this.newAmountValue();
    const contractAmount = this.affaire.contractAmount;
    if (amount === null || !contractAmount) return null;
    return Number(((amount / contractAmount) * 100).toFixed(3));
  });

  readonly canSubmitTaux = computed(() => {
    const taux = this.effectiveTauxPercent();
    if (taux === null || taux > 100) return false;
    if (this.editingTauxId() !== null) return taux >= this.lastValidatedTaux();
    return taux > this.lastValidatedTaux();
  });

  readonly avWipPreview = computed<number | null>(() => {
    const taux = this.effectiveTauxPercent();
    if (taux === null || !this.affaire.contractAmount) return null;
    return (taux / 100) * this.affaire.contractAmount;
  });

  /** Inverse of avWipPreview, shown only in MONTANT mode: the equivalent percentage for
   * whatever amount the user just typed, so they can sanity-check it against
   * lastValidatedTaux() without doing the division themselves. */
  readonly avWipPreviewPercent = computed<number | null>(() => {
    if (this.avInputMode() !== 'MONTANT') return null;
    return this.effectiveTauxPercent();
  });

  /** The MONTANT-mode field's hint — the last-validated taux expressed as an amount instead
   * of a percentage. Computed in TS via the already-injected `currency` (DisplayCurrencyPipe
   * instance, used the same way elsewhere in this file, e.g. the LIVRABLE section's
   * `this.currency.transform(l.budgetAlloue, this.affaire.devise)`) rather than nesting a
   * pipe inside the template's `[options]` object-literal string concatenation — this file's
   * own convention is "format in a computed, read it plainly in the template" (see
   * avWipPreview()'s own top-level `| displayCurrency` usage), not deeply nested pipes. */
  readonly lastValidatedAmountHint = computed(() => {
    const amount = (this.lastValidatedTaux() / 100) * (this.affaire.contractAmount ?? 0);
    return this.currency.transform(amount, this.affaire.devise);
  });

  /** TEST : carte FORFAIT alignée sur la carte Régie — même mécanismes, mêmes raisons
   * (voir les commentaires détaillés à côté des signaux `regieCardHovered`/
   * `regieHelpOpen`/`showTmDatePicker` plus bas, tous identiques ici en substance). */
  forfaitCardHovered = signal(false);
  forfaitHelpOpen = signal(false);

  /** TEST : carte de saisie AV — repli sur un panneau EXTENSIBLE en ligne (au lieu du
   * `daf-drawer` latéral essayé plus tôt, qui collidait avec le drawer "Traçabilité &
   * alertes" déjà à la racine de affaire-detail.component.html) : le bouton de la ligne
   * d'en-tête du tableau Historique bascule ce signal, qui affiche/cache la carte juste
   * entre ce bouton et le tableau. */
  forfaitDrawerOpen = signal(false);

  /** Calendrier AV — même portail maison que celui de la carte Régie
   * (`showTmDatePicker`/`positionPortal`/etc.), sur `periodDateFrom`/`periodDateTo` (de
   * simples champs, pas des signaux : `avDateRange()` est une méthode ordinaire plutôt
   * qu'un `computed()`, réévaluée à chaque cycle de détection de changements — largement
   * suffisant ici, ce composant n'est pas OnPush). */
  showAvDatePicker = signal(false);
  private avDatePickerPositioned = signal(false);
  readonly avDatePickerVisible = computed(() => this.showAvDatePicker() && this.avDatePickerPositioned());

  @ViewChild('avDatePickerPanel') private avDatePickerPanelRef?: ElementRef<HTMLElement>;
  @ViewChild('avDatePickerTrigger', { read: ElementRef })
  private avDatePickerTriggerRef?: ElementRef<HTMLElement>;

  avDateRange(): Date[] {
    return [
      new Date(this.periodDateFrom + 'T00:00:00'),
      new Date(this.periodDateTo + 'T00:00:00'),
    ];
  }

  onAvDateRangeChange(value: Date | Date[] | null): void {
    // `value` arrive à `null` quand on clique "Effacer" dans le calendrier (reset() de
    // daf-multi-date-picker) — un AV a toujours besoin d'une période, donc il n'y a rien
    // de valide à appliquer ; on se contente de refermer le panneau. Sans ce cas, le
    // `return` du garde ci-dessous avalait l'événement en silence et "Effacer" ne
    // semblait rien faire (le panneau restait ouvert, la période affichée ne changeait
    // pas).
    if (value === null) {
      this.closeAvDatePicker();
      return;
    }
    if (!Array.isArray(value) || value.length !== 2) return;
    this.periodDateFrom = this.toIso(value[0]);
    this.periodDateTo = this.toIso(value[1]);
    this.closeAvDatePicker();
  }

  toggleAvDatePicker(): void {
    if (this.showAvDatePicker()) {
      this.closeAvDatePicker();
      return;
    }
    this.showAvDatePicker.set(true);
    requestAnimationFrame(() => this.positionPortal(
      this.avDatePickerPanelRef?.nativeElement,
      this.avDatePickerTriggerRef?.nativeElement,
      this.avDatePickerPositioned));
  }

  closeAvDatePicker(): void {
    this.showAvDatePicker.set(false);
    this.avDatePickerPositioned.set(false);
  }

  // ── TM ──────────────────────────────────────────────────────────────────
  // Arbitrary date range (no longer tied to a calendar month) — see
  // WipTmController/WipTmService. Defaults to the current month purely as a starting
  // point, same as AV's periodDateFrom/periodDateTo above; either date is freely editable.
  tmDateFrom = signal(this.toIso(new Date(this.now.getFullYear(), this.now.getMonth(), 1)));
  tmDateTo   = signal(this.toIso(new Date(this.now.getFullYear(), this.now.getMonth() + 1, 0)));

  /** TEST : un seul daf-multi-date-picker (selectionMode 'range') à la place des deux
   * daf-form-field Date début / Date fin — fait le pont vers les mêmes tmDateFrom/tmDateTo
   * ISO que le reste du composant utilise déjà (export Excel, aperçu, validation). */
  readonly tmDateRange = computed<Date[]>(() => [
    new Date(this.tmDateFrom() + 'T00:00:00'),
    new Date(this.tmDateTo() + 'T00:00:00'),
  ]);

  onTmDateRangeChange(value: Date | Date[] | null): void {
    if (!Array.isArray(value) || value.length !== 2) return;
    this.tmDateFrom.set(this.toIso(value[0]));
    this.tmDateTo.set(this.toIso(value[1]));
    this.loadTmPreview();
    // Les deux bornes sont posées : referme le calendrier, qui n'a pas de bouton
    // "Confirmer" en selectionMode 'range' (celui de la lib ne s'affiche qu'en 'multiple').
    this.closeDatePicker();
  }

  /** TEST : boutons révélés au survol de la carte, même mécanisme que les cartes de
   * /rh/profiles (profile-grid-card.component.ts) — un signal par carte, mis à jour par
   * (mouseenter)/(mouseleave) sur `daf-section-card`/`daf-card`. */
  regieCardHovered = signal(false);
  historyCardHovered = signal(false);

  /** TEST : même repli daf-accordion-card que la carte FORFAIT (voir forfaitDrawerOpen)
   * appliqué ici à la carte Régie Time & Materials. */
  regieDrawerOpen = signal(false);

  // ── LIVRABLE — mêmes pills d'icônes révélées au survol que Forfaitaire/Régie, un
  // signal dédié par carte (voir le commentaire ci-dessus). ──────────────────────────
  livrablePendingCardHovered  = signal(false);
  livrableBatchesCardHovered  = signal(false);
  livrableClientCardHovered   = signal(false);
  livrableHistoryCardHovered  = signal(false);

  /** TEST : même repli daf-accordion-card que la carte FORFAIT (voir forfaitDrawerOpen)
   * appliqué ici à la carte Livrables en attente. */
  livrableDrawerOpen = signal(false);

  livrableBatchBadgeVariant(statut: LivrableBatchStatut) {
    return LIVRABLE_BATCH_STATUT_BADGE[statut] ?? 'neutral';
  }

  /** Colonnes du tableau "Livrables en attente" — `nouveauPct` (input éditable) et
   * `statut` (badge du batch en cours, s'il y en a un) sont en `type: 'custom'`, rendues
   * via les `<ng-template dafCell>` du template, même mécanisme que
   * affaire-ressources-tab.component.html. */
  readonly livrablePendingColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'discipline', label: t('AFFAIRES.WIP.COL_DISCIPLINE') },
      { key: 'document',   label: t('AFFAIRES.WIP.COL_DOCUMENT') },
      { key: 'budget',     label: t('AFFAIRES.WIP.COL_BUDGET_ALLOUE'), align: 'right' },
      { key: 'pctActuel',  label: t('AFFAIRES.WIP.COL_PCT_ACTUEL'), align: 'right' },
      { key: 'nouveauPct', label: t('AFFAIRES.WIP.COL_NOUVEAU_PCT'), align: 'right', type: 'custom' },
      { key: 'montant',    label: t('AFFAIRES.WIP.COL_AMOUNT'), align: 'right' },
      { key: 'statut',     label: t('AFFAIRES.WIP.COL_STATUS'), type: 'custom' },
    ];
  });

  readonly livrablePendingRows = computed<TableRow[]>(() => this.pendingLivrables().map(l => ({
    id:         l.id,
    discipline: l.disciplineLabel,
    document:   l.documentNom,
    budget:     this.currency.transform(l.budgetAlloue, this.affaire.devise),
    pctActuel:  `${l.pctFacture}%`,
    montant:    this.currency.transform(this.incrementalAmount(l), this.affaire.devise),
    _raw:       l,
  } satisfies TableRow)));

  readonly livrablePendingConfig = computed<TableConfig>(() => ({
    showHeader:   true,
    hoverable:    true,
    loading:      this.loadingLivrables(),
    emptyMessage: this.translate.instant('AFFAIRES.WIP.LIVRABLE_EMPTY'),
  }));

  /** Batches `EN_ATTENTE_CLIENT` uniquement — même principe que `pendingClientLines` pour
   * Régie : un sous-ensemble d'`activeBatches()` qui a besoin du formulaire de
   * confirmation client, affiché dans un bloc séparé. */
  readonly livrableClientBatches = computed(() =>
    this.activeBatches().filter(b => b.statut === 'EN_ATTENTE_CLIENT'));

  /** Historique Livrable — même habillage (carte + daf-data-table + badge de statut) que
   * l'historique WIP de la carte Régie. */
  readonly livrableHistoryColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'discipline', label: t('AFFAIRES.WIP.COL_DISCIPLINE') },
      { key: 'document',   label: t('AFFAIRES.WIP.COL_DOCUMENT') },
      { key: 'budget',     label: t('AFFAIRES.WIP.COL_BUDGET_ALLOUE'), align: 'right' },
      { key: 'statut',     label: t('AFFAIRES.WIP.COL_STATUS'), type: 'badge' },
    ];
  });

  private toLivrableHistoryRow(l: AffaireLivrableDto): TableRow {
    return {
      id:         l.id,
      discipline: l.disciplineLabel,
      document:   l.documentNom,
      budget:     this.currency.transform(l.budgetAlloue, this.affaire.devise),
      statut:     { label: this.translate.instant('AFFAIRES.WIP.BATCH_STATUS_' + l.statut),
                    options: { variant: LIVRABLE_STATUT_BADGE[l.statut] ?? 'neutral', dot: true } } satisfies BadgeCell,
    } satisfies TableRow;
  }

  readonly livrableHistoryRows = computed<TableRow[]>(() =>
    this.livrableHistory().map(l => this.toLivrableHistoryRow(l)));

  readonly livrableHistoryConfig = computed<TableConfig>(() => ({
    showHeader:   true,
    hoverable:    false,
    emptyMessage: this.translate.instant('AFFAIRES.WIP.NO_HISTORY'),
  }));

  /** Popup "Afficher tout" — recherche + filtre Statut, même mécanisme
   * (historySearch/historyStatut/onHistoryFilterApply, déjà génériques) que la popup
   * Historique WIP de la carte Régie. */
  readonly livrableHistoryFilterFields = computed<FilterField[]>(() => [{
    name:    'statut',
    label:   this.translate.instant('AFFAIRES.WIP.COL_STATUS'),
    type:    'select',
    options: [...new Set(this.livrableHistory().map(l => l.statut))].sort()
      .map(value => ({ value, label: this.translate.instant('AFFAIRES.WIP.BATCH_STATUS_' + value) })),
  }]);

  readonly filteredLivrableHistory = computed<AffaireLivrableDto[]>(() => {
    const q      = this.historySearch().trim().toLowerCase();
    const statut = this.historyStatut();
    return this.livrableHistory()
      .filter(l => !statut || l.statut === statut)
      .filter(l => !q || `${l.disciplineLabel} ${l.documentNom}`.toLowerCase().includes(q));
  });

  readonly filteredLivrableHistoryRows = computed<TableRow[]>(() =>
    this.filteredLivrableHistory().map(l => this.toLivrableHistoryRow(l)));

  /** TEST : même pagination daf-pagination que la popup Régie — voir historyTotalPages/
   * paginatedHistoryRows plus bas, mêmes signaux historyPage/historyPageSize partagés. */
  readonly livrableHistoryTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredLivrableHistoryRows().length / this.historyPageSize())));

  readonly paginatedLivrableHistoryRows = computed<TableRow[]>(() => {
    const size = this.historyPageSize();
    const page = Math.min(this.historyPage(), this.livrableHistoryTotalPages() - 1);
    return this.filteredLivrableHistoryRows().slice(page * size, page * size + size);
  });

  /** Même bibliothèque (xlsx) et même schéma d'export que exportHistoryExcel() — appelé
   * depuis la carte (livrableHistory, tout) et depuis la popup (filteredLivrableHistory). */
  exportLivrableHistoryExcel(lines: AffaireLivrableDto[]): void {
    if (!lines.length) return;
    const t = (k: string) => this.translate.instant(k);
    const rows = lines.map(l => ({
      [t('AFFAIRES.WIP.COL_DISCIPLINE')]:    l.disciplineLabel,
      [t('AFFAIRES.WIP.COL_DOCUMENT')]:      l.documentNom,
      [t('AFFAIRES.WIP.COL_BUDGET_ALLOUE')]: this.currency.transform(l.budgetAlloue, this.affaire.devise),
      [t('AFFAIRES.WIP.COL_STATUS')]:        t('AFFAIRES.WIP.BATCH_STATUS_' + l.statut),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), t('AFFAIRES.WIP.HISTORY_TITLE'));
    const affaireRef = this.affaire.reference ?? String(this.affaire.id);
    XLSX.writeFile(wb, `Historique_Livrables_${affaireRef}.xlsx`);
  }

  /** TEST : popover (i) de la carte Régie — bouton maison en `position:absolute`
   * (top-3 right-3, comme profile-grid-card.component.ts) au lieu de l'en-tête auto de
   * `daf-section-card`, qui poussait le stepper vers le bas. `daf-help-popover` reste le
   * vrai composant de la lib (portail vers <body> déjà géré par lui) ; seul son
   * déclencheur (`open`) est piloté ici, hover/focus comme le fait la lib elle-même. */
  regieHelpOpen = signal(false);

  /** TEST v3 : le champ de date pleine largeur devient une icône (calendrier) parmi les
   * 3 autres. `daf-multi-date-picker` reste en mode `inline` (aucun déclencheur/portail à
   * lui, juste le panneau) — SES DEUX essais précédents ont chacun raté un point :
   *   1. panneau en `position:absolute` dans la carte → coupé par l'`overflow:hidden` de
   *      `daf-card` dès qu'il dépassait ;
   *   2. déclencheur natif de la lib (mode flottant, pas inline) → son propre portail vers
   *      <body> évite bien la coupe, mais (a) son gabarit (texte + icône "x" effacer +
   *      icône calendrier) ne se laisse pas réduire proprement à une icône seule en CSS, et
   *      (b) il choisit lui-même d'ouvrir en dessous quand il y a la place, jamais "toujours
   *      au-dessus" comme demandé.
   * Solution : notre PROPRE portail, minimal, sur le panneau `inline` (un simple <div> qu'on
   * écrit nous-mêmes) — déplacé vers <body> et positionné en `fixed`, ancré au-dessus du
   * bouton (jamais en dessous), donc jamais coupé ET toujours "en haut". */
  showTmDatePicker = signal(false);
  /** Passe à `true` seulement une fois `positionDatePicker()` exécuté — le panneau reste
   * `visibility:hidden` jusque-là pour ne pas flasher un instant dans le coin de la carte
   * (position par défaut du <div>) avant d'être déplacé vers <body> et repositionné. */
  private datePickerPositioned = signal(false);
  readonly datePickerVisible = computed(() => this.showTmDatePicker() && this.datePickerPositioned());

  @ViewChild('calDatePickerPanel') private calDatePickerPanelRef?: ElementRef<HTMLElement>;
  @ViewChild('calDatePickerTrigger', { read: ElementRef })
  private calDatePickerTriggerRef?: ElementRef<HTMLElement>;

  toggleDatePicker(): void {
    if (this.showTmDatePicker()) {
      this.closeDatePicker();
      return;
    }
    this.showTmDatePicker.set(true);
    // `requestAnimationFrame`, pas `queueMicrotask` : un microtask peut encore s'exécuter
    // AVANT qu'Angular n'ait appliqué le binding `[style.display]` (les deux sont mis en
    // file d'attente séparément, l'ordre entre les deux n'est pas garanti) — mesurer à ce
    // moment-là lit un panneau encore `display:none`, donc une hauteur de 0. Résultat
    // observé : le calcul « au-dessus » se faisait à partir du mauvais point de départ,
    // et le panneau semblait s'ouvrir vers le BAS. `requestAnimationFrame` ne s'exécute
    // qu'après qu'un rendu a eu lieu, donc après que le style ait bien été appliqué —
    // même raison que `place()` de la lib, qui a besoin de la vraie hauteur rendue.
    requestAnimationFrame(() => this.positionDatePicker());
  }

  closeDatePicker(): void {
    this.showTmDatePicker.set(false);
    this.datePickerPositioned.set(false);
  }

  private positionDatePicker(): void {
    this.positionPortal(
      this.calDatePickerPanelRef?.nativeElement,
      this.calDatePickerTriggerRef?.nativeElement,
      this.datePickerPositioned);
  }

  /** Partagé avec le calendrier AV (voir showAvDatePicker plus bas) — même carte, même
   * défilement, même besoin : un panneau déplacé sous <body>, ancré au-dessus de son
   * bouton, jamais coupé par la carte. Seule la mesure/le positionnement sont communs ;
   * chaque calendrier garde son propre signal `positioned`, ses propres refs et son
   * propre toggle/close (ils ne s'affichent jamais tous les deux à la fois de toute
   * façon, un seul billingMode étant actif à l'écran). */
  private positionPortal(
    panel: HTMLElement | undefined, trigger: HTMLElement | undefined,
    positioned: WritableSignal<boolean>,
  ): void {
    if (!panel || !trigger) return;
    if (panel.parentElement !== this.document.body) {
      this.renderer.appendChild(this.document.body, panel);
    }
    // `fixed` + hors écran AVANT de mesurer sa hauteur/largeur — même raison que place()
    // dans la lib ("pin size/position before reading offsetHeight"). Bug corrigé : au tout
    // premier clic, le panneau venait d'être rattaché à <body> et était encore en flux
    // normal (`position:static`, aucun style précédent à hériter) au moment de la mesure —
    // sa position dans le document tombait alors n'importe où (observé : dans la sidebar),
    // le temps d'un instant avant d'être replacé. Aux ouvertures suivantes, le style
    // `position:fixed` du clic précédent restait posé sur l'élément, ce qui masquait le
    // problème. En forçant `fixed` + hors écran dès le départ, à CHAQUE ouverture, il n'y a
    // plus jamais de flux normal à un instant T, donc plus jamais ce point de départ faux.
    this.renderer.setStyle(panel, 'position', 'fixed');
    this.renderer.setStyle(panel, 'top', '-9999px');
    this.renderer.setStyle(panel, 'left', '-9999px');
    this.renderer.setStyle(panel, 'z-index', '9999');

    const triggerRect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const gap = 8;
    // Calé sur le bord droit du déclencheur (comme les boutons alignés à droite de la
    // carte), borné à 8px du bord de la fenêtre des deux côtés.
    let left = triggerRect.right - panelRect.width;
    left = Math.max(8, Math.min(left, window.innerWidth - panelRect.width - 8));
    // TOUJOURS au-dessus du déclencheur, jamais en dessous — contrairement à `daf-select`/
    // `daf-multi-date-picker` flottant, qui choisissent selon la place disponible.
    const top = Math.max(8, triggerRect.top - gap - panelRect.height);
    this.renderer.setStyle(panel, 'top', `${top}px`);
    this.renderer.setStyle(panel, 'left', `${left}px`);
    positioned.set(true);
  }

  /** Ferme sur un clic hors du panneau ET hors du bouton déclencheur (sinon le clic qui
   * OUVRE le calendrier — capté ici aussi, car il remonte jusqu'à `document` — le
   * refermerait dans la foulée). Même garde que `onDocumentClick` de la lib. Gère les
   * deux calendriers (Régie et AV) : un seul est jamais monté à la fois (un seul
   * billingMode actif), donc pas de conflit entre les deux gardes. */
  @HostListener('document:click', ['$event'])
  onDocumentClickForDatePicker(event: MouseEvent): void {
    const target = event.target as Node;
    if (this.showTmDatePicker()) {
      if (this.calDatePickerPanelRef?.nativeElement.contains(target)) return;
      if (this.calDatePickerTriggerRef?.nativeElement.contains(target)) return;
      this.closeDatePicker();
    }
    if (this.showAvDatePicker()) {
      if (this.avDatePickerPanelRef?.nativeElement.contains(target)) return;
      if (this.avDatePickerTriggerRef?.nativeElement.contains(target)) return;
      this.closeAvDatePicker();
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeForDatePicker(): void {
    if (this.showTmDatePicker()) this.closeDatePicker();
    if (this.showAvDatePicker()) this.closeAvDatePicker();
  }

  ngOnDestroy(): void {
    // Les panneaux ont pu être déplacés sous <body> : Angular ne les nettoiera pas tout
    // seul puisqu'ils ne se trouvent plus là où le template les a créés (même raison que
    // le `onCleanup` de `portalPanel()` dans la lib, pour son propre portail).
    this.calDatePickerPanelRef?.nativeElement.remove();
    this.avDatePickerPanelRef?.nativeElement.remove();
    this.historyOverlayPortaled?.remove();
    this.historyOverlayPortaled = null;
  }

  tmPreview     = signal<WipTmPreviewDto | null>(null);
  loadingTm     = signal(false);
  tmError       = signal<string | null>(null);
  validatingTm  = signal(false);
  showTmDetails = signal(false);
  /** Texte du popover (i) de la carte Régie Time & Materials — `daf-section-card`
   * (`[help]`) l'affiche via `daf-help-popover`, le même mécanisme que les tuiles d'aide
   * de l'onglet Vue générale, à la place de l'ancien `<div>` en position absolue déclenché
   * par un signal maison. Les deux phrases de l'ancien texte sont jointes par un espace :
   * `help` est un simple texte interpolé, sans balisage pour un saut de ligne. */
  readonly tmHelpText = computed(() => {
    this.translate.currentLang();
    return `${this.translate.instant('AFFAIRES.WIP.TM_EXPLAIN')} ${this.translate.instant('AFFAIRES.WIP.TM_EXPLAIN_2')}`;
  });
  /** Which collaborator's granular hours are currently drilled into, within the Détails
   * panel — null shows the by-collaborator summary table instead. */
  selectedCollaboratorUserId = signal<number | null>(null);
  tmHistory     = signal<LineDetailDto[]>([]);
  loadingTmHistory = signal(false);

  // ── LIVRABLE ────────────────────────────────────────────────────────────
  // Each document already carries its own cumulative % billed (pctFacture) — this map
  // holds what the user has TYPED for each one so far this session, defaulting to that
  // same current value (i.e. "no change") until edited. A document only produces a
  // submission entry if its entered value ends up higher than its stored one.
  livrables            = signal<AffaireLivrableDto[]>([]);
  loadingLivrables     = signal(false);
  enteredPct           = signal<Map<number, number>>(new Map());
  submittingLivrables  = signal(false);
  livrableError        = signal<string | null>(null);
  editingBatchId        = signal<number | null>(null);
  activeBatches         = signal<LivrableBatchDto[]>([]);
  loadingActiveBatches  = signal(false);
  livrableClientAmountInputs   = signal<Map<number, number | null>>(new Map());
  submittingLivrableClientBatch = signal<number | null>(null);
  livrableClientAmountError    = signal<string | null>(null);
  livrableCancelError          = signal<string | null>(null);

  readonly pendingLivrables = computed(() =>
    this.livrables().filter(l => l.statut === 'A_FACTURER' || l.statut === 'EN_COURS'));
  readonly livrableHistory  = computed(() => this.livrables().filter(l => l.statut === 'FACTURE'));

  private changedEntries(): { livrableId: number; pctSaisi: number }[] {
    const entered = this.enteredPct();
    return this.pendingLivrables()
      .map(l => ({ livrableId: l.id, pctSaisi: entered.get(l.id) ?? l.pctFacture, current: l.pctFacture }))
      .filter(e => e.pctSaisi > e.current)
      .map(({ livrableId, pctSaisi }) => ({ livrableId, pctSaisi }));
  }

  readonly hasLivrableChanges = computed(() => this.changedEntries().length > 0);

  readonly totalToInvoice = computed(() => {
    const entered = this.enteredPct();
    return this.pendingLivrables().reduce((sum, l) => {
      const pct = entered.get(l.id) ?? l.pctFacture;
      const delta = Math.max(0, pct - l.pctFacture);
      return sum + (delta / 100) * l.budgetAlloue;
    }, 0);
  });

  /** The batch (if any) a document currently belongs to — null if it has no submission in
   * flight. */
  private findLivrableBatch(livrableId: number): LivrableBatchDto | null {
    return this.activeBatches().find(b => b.entries.some(e => e.livrableId === livrableId)) ?? null;
  }

  /** Drives the per-row status badge. */
  livrableBatchStatus(livrableId: number): LivrableBatchStatut | null {
    return this.findLivrableBatch(livrableId)?.statut ?? null;
  }

  /** A document's row is locked while it belongs to a batch OTHER than the one currently
   * being edited — editing a batch must not also unlock every unrelated in-flight document's
   * input, which would let the user add an unrelated document to the edit and have the
   * backend reject the whole submission over it (RG-FAC-LIV-007, "already has a pending
   * submission"). A document with no batch at all, or one that belongs to the batch actually
   * being edited, stays editable. */
  isLivrableRowLocked(livrableId: number): boolean {
    const batch = this.findLivrableBatch(livrableId);
    return batch !== null && batch.batchId !== this.editingBatchId();
  }

  // ── TM — Review / manual verification / validate / client-response stepper ──────
  // A thin progress rail over the SAME preview content below (chrome: 'header-only' —
  // the library's rail-only mode, same pattern as the affaire wizard) rather than a
  // content-switching wizard: step 1 (review) is just the preview already on screen,
  // step 2 gates Valider behind an explicit manual-verification acknowledgment, step 3
  // is the existing Valider action, step 4 is the client's reply — reaching it means at
  // least one billing line for this affaire is sitting at EN_ATTENTE_CLIENT, waiting for
  // its "montant validé par le client" to be entered (see pendingClientLines below).
  // See the WIP client-approval functional spec, 2026-08-27.
  wipStep           = signal(1);
  wipManualVerified = signal(false);

  /** Derived, not tracked imperatively — the frontier is always exactly what the real
   * data says it is (a preview to review, a manual check ticked, a line still awaiting
   * the client), so it can never drift out of sync with what's actually on screen. */
  readonly wipMaxStepReached = computed(() => {
    if (this.pendingClientLines().length > 0) return 4;
    if (this.wipManualVerified()) return 3;
    const p = this.tmPreview();
    if (p && (p.hours.length > 0 || p.carriedForwardAmount > 0)) return 2;
    return 1;
  });

  readonly wipStepperSteps = computed<StepperStep[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { title: t('AFFAIRES.WIP.STEP_REVIEW') },
      { title: t('AFFAIRES.WIP.STEP_VERIFY') },
      { title: t('AFFAIRES.WIP.STEP_VALIDATE') },
      { title: t('AFFAIRES.WIP.STEP_CLIENT') },
    ].map((s, i) => ({
      ...s,
      completed: i + 1 < this.wipMaxStepReached(),
      disabled:  i + 1 > this.wipMaxStepReached(),
    }));
  });

  readonly wipStepperConfig = computed<StepperConfig>(() => {
    this.translate.currentLang();
    return {
      chrome: 'header-only',
      clickableSteps: true,
      stepperLabel: this.translate.instant('AFFAIRES.WIP.STEPPER_LABEL'),
    };
  });

  onWipStepClick(index: number): void {
    const target = index + 1;
    if (target !== this.wipStep() && target <= this.wipMaxStepReached()) {
      this.wipStep.set(target);
    }
  }

  onManualVerifiedChange(checked: boolean): void {
    this.wipManualVerified.set(checked);
    if (checked) this.wipStep.set(3);
  }

  private resetWipStepper(): void {
    this.wipStep.set(1);
    this.wipManualVerified.set(false);
  }

  // ── TM — client-approval workflow (lines sitting at EN_ATTENTE_CLIENT) ───────────
  readonly pendingClientLines = computed(() => this.tmHistory().filter(l => l.statut === 'EN_ATTENTE_CLIENT'));
  clientAmountInputs   = signal<Map<number, number | null>>(new Map());
  submittingClientLine = signal<number | null>(null);
  clientAmountError    = signal<string | null>(null);

  /** Statuses a WIP T&M billing line can still be cancelled from — mirrors the backend's
   * WipTmController guard (blocked once FACTURE or already ANNULE). */
  private readonly cancellableTmStatuses = new Set([
    'EN_ATTENTE_CLIENT', 'EN_ATTENTE_DF', 'A_VERIFIER', 'RETOURNE',
  ]);
  cancelLineError = signal<string | null>(null);

  getClientAmountInput(lineId: number): number | null {
    return this.clientAmountInputs().get(lineId) ?? null;
  }

  setClientAmountInput(lineId: number, value: number | null): void {
    const map = new Map(this.clientAmountInputs());
    map.set(lineId, value);
    this.clientAmountInputs.set(map);
  }

  confirmClientAmount(line: LineDetailDto): void {
    const amount = this.getClientAmountInput(line.id);
    if (amount === null || amount < 0 || amount > line.montantHt || this.submittingClientLine() !== null) return;
    this.submittingClientLine.set(line.id);
    this.clientAmountError.set(null);
    this.svc.enterClientAmount(this.affaire.id, line.id, amount).subscribe({
      next: () => {
        this.submittingClientLine.set(null);
        this.setClientAmountInput(line.id, null);
        this.loadTmHistory();
      },
      error: err => {
        this.submittingClientLine.set(null);
        this.clientAmountError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.CLIENT_AMOUNT_ERROR'));
      },
    });
  }

  ngOnInit(): void {
    if (this.affaire.billingMode === 'FORFAIT') this.loadTauxHistory();
    if (this.affaire.billingMode === 'REGIE') { this.loadTmPreview(); this.loadTmHistory(); }
    if (this.affaire.billingMode === 'LIVRABLE') { this.loadLivrables(); this.loadActiveBatches(); }
  }

  // ── AV actions ────────────────────────────────────────────────────────────

  loadTauxHistory(): void {
    this.loadingTaux.set(true);
    this.svc.getTauxHistory(this.affaire.id).subscribe({
      next:  h => { this.tauxHistory.set(h); this.loadingTaux.set(false); },
      error: () => this.loadingTaux.set(false),
    });
  }

  private preEditDateFrom = this.periodDateFrom;
  private preEditDateTo = this.periodDateTo;

  startEditTaux(t: WipTauxDto): void {
    this.preEditDateFrom = this.periodDateFrom;
    this.preEditDateTo = this.periodDateTo;
    this.editingTauxId.set(t.id);
    this.periodDateFrom = t.periodDateFrom;
    this.periodDateTo = t.periodDateTo;
    // Always opens in POURCENTAGE mode — tauxSaisi is what's actually stored, so that's the
    // faithful starting point for an edit. The user can still switch to MONTANT mid-edit.
    this.avInputMode.set('POURCENTAGE');
    this.newTauxValue.set(t.tauxSaisi);
    this.newAmountValue.set(null);
    this.tauxComment = t.commentaire ?? '';
    this.tauxError.set(null);
  }

  cancelEditTaux(): void {
    this.editingTauxId.set(null);
    this.avInputMode.set('POURCENTAGE');
    this.newTauxValue.set(null);
    this.newAmountValue.set(null);
    this.tauxComment = '';
    this.tauxError.set(null);
    this.periodDateFrom = this.preEditDateFrom;
    this.periodDateTo = this.preEditDateTo;
  }

  submitTaux(): void {
    const taux = this.effectiveTauxPercent();
    if (taux === null || this.submittingTaux()) return;
    const editingId = this.editingTauxId();
    if (!this.canSubmitTaux()) return;
    this.submittingTaux.set(true);
    this.tauxError.set(null);
    const body = {
      periodDateFrom: this.periodDateFrom,
      periodDateTo: this.periodDateTo,
      tauxSaisi: taux,
      commentaire: this.tauxComment.trim() || null,
    };
    const request$ = editingId !== null
      ? this.svc.updateTaux(editingId, body)
      : this.svc.submitTaux(this.affaire.id, body);
    request$.subscribe({
      next: () => {
        this.submittingTaux.set(false);
        this.avInputMode.set('POURCENTAGE');
        this.newTauxValue.set(null);
        this.newAmountValue.set(null);
        this.tauxComment = '';
        this.editingTauxId.set(null);
        this.loadTauxHistory();
      },
      error: err => {
        this.submittingTaux.set(false);
        this.tauxError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.SUBMIT_ERROR'));
      },
    });
  }

  deleteTaux(tauxId: number): void {
    if (!confirm(this.translate.instant('AFFAIRES.WIP.DELETE_TAUX_CONFIRM'))) return;
    this.deleteTauxError.set(null);
    this.svc.deleteTaux(tauxId).subscribe({
      next: () => {
        if (this.editingTauxId() === tauxId) this.cancelEditTaux();
        this.loadTauxHistory();
      },
      error: err => this.deleteTauxError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.DELETE_TAUX_ERROR')),
    });
  }

  // ── Historique des taux (AV) — daf-data-table, même bibliothèque que tmHistoryColumns/
  // tmHistoryRows/tmHistoryConfig plus bas, remplace l'ancien <table> fait main. ─────────
  readonly tauxHistoryColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'period',  label: t('AFFAIRES.WIP.COL_PERIOD') },
      { key: 'taux',    label: t('AFFAIRES.WIP.COL_TAUX'), align: 'right' },
      { key: 'montant', label: t('AFFAIRES.WIP.COL_INCREMENT'), align: 'right' },
      { key: 'statut',  label: t('AFFAIRES.WIP.COL_STATUS'), type: 'badge' },
    ];
  });

  readonly tauxHistoryRows = computed<TableRow[]>(() => this.tauxHistory().map(t => ({
    id:      t.id,
    period:  this.formatWipPeriod(t.periodDateFrom, t.periodDateTo),
    taux:    `${t.tauxSaisi}%`,
    montant: this.currency.transform(t.montantIncremental, this.affaire.devise),
    statut:  { label: enumLabel(this.translate, 'WIP_TAUX_STATUT', t.statut),
               options: { variant: WIP_TAUX_STATUT_BADGE[t.statut] ?? 'neutral', dot: true } } satisfies BadgeCell,
    _source: t,
  } satisfies TableRow)));

  readonly tauxHistoryConfig = computed<TableConfig>(() => ({
    showHeader: true,
    hoverable:  false,
    emptyMessage: this.translate.instant('AFFAIRES.WIP.NO_HISTORY'),
    actions: [
      {
        id:      'edit',
        icon:    'edit',
        tooltip: this.translate.instant('AFFAIRES.WIP.EDIT'),
        onClick: (row: TableRow) => this.startEditTaux(row['_source'] as WipTauxDto),
        hidden:  (row: TableRow) => !this.isTauxEditable((row['_source'] as WipTauxDto).statut),
      },
      {
        id:      'delete',
        icon:    'delete',
        tooltip: this.translate.instant('AFFAIRES.WIP.DELETE'),
        variant: 'danger',
        onClick: (row: TableRow) => this.deleteTaux((row['_source'] as WipTauxDto).id),
        hidden:  (row: TableRow) => !this.isTauxEditable((row['_source'] as WipTauxDto).statut),
      },
    ],
  }));

  private isTauxEditable(statut: WipTauxStatut): boolean {
    return statut === 'EN_ATTENTE' || statut === 'REFUSE';
  }

  // ── TM actions ────────────────────────────────────────────────────────────

  toggleTmDetails(): void {
    this.showTmDetails.set(!this.showTmDetails());
    this.selectedCollaboratorUserId.set(null);
  }

  /** Two-sheet workbook from the data already on screen (no extra request) — "Résumé" one
   * row per collaborator (same aggregate as WipTmDetailTableComponent), "Détails" every
   * hour entry across every collaborator with a Collaborateur column added, so a manager
   * can filter/pivot the whole affaire's WIP in Excel instead of clicking through each
   * person one by one. */
  exportWipExcel(): void {
    const hours = this.tmPreview()?.hours ?? [];
    if (!hours.length) return;

    const byUser = new Map<number, { userFullName: string; totalHours: number; totalCost: number; days: Set<string> }>();
    for (const h of hours) {
      const entry = byUser.get(h.userId) ?? { userFullName: h.userFullName, totalHours: 0, totalCost: 0, days: new Set<string>() };
      entry.totalHours += h.hoursValidated;
      entry.totalCost  += h.costAmount;
      entry.days.add(h.workDate);
      byUser.set(h.userId, entry);
    }

    const t = (k: string) => this.translate.instant(k);
    const resumeRows = [...byUser.values()]
      .sort((a, b) => b.totalCost - a.totalCost)
      .map(e => ({
        [t('AFFAIRES.WIP.COL_COLLABORATOR')]: e.userFullName,
        [t('AFFAIRES.WIP.COL_DAYS')]:         e.days.size,
        [t('AFFAIRES.WIP.COL_HOURS')]:        Number(e.totalHours.toFixed(2)),
        [t('AFFAIRES.WIP.COL_COST')]:         Number(e.totalCost.toFixed(3)),
      }));

    const detailRows = hours
      .slice()
      .sort((a, b) => a.userFullName.localeCompare(b.userFullName) || a.workDate.localeCompare(b.workDate))
      .map((h: WipTmHourDto) => ({
        [t('AFFAIRES.WIP.COL_COLLABORATOR')]: h.userFullName,
        [t('AFFAIRES.WIP.COL_DATE')]:         this.fmtDateForExport(h.workDate),
        [t('AFFAIRES.WIP.COL_WEEK')]:         'S' + isoWeek(h.workDate),
        [t('AFFAIRES.WIP.COL_DISCIPLINE')]:   h.disciplineLabel ?? '',
        [t('AFFAIRES.WIP.COL_WBS')]:          h.wbsName ?? h.wbsId ?? '',
        [t('AFFAIRES.WIP.COL_DOCUMENT')]:     h.document ?? '',
        [t('AFFAIRES.WIP.COL_HOURS')]:        Number(h.hoursValidated.toFixed(2)),
        [t('AFFAIRES.WIP.COL_COST')]:         Number(h.costAmount.toFixed(3)),
      }));

    // One row per collaborator, one column per ISO week present in the data — lets a
    // manager see the shape of each person's effort across the period at a glance.
    const weekKeys = new Map<number, string>(); // sortable "yyyyww" key -> display label
    for (const h of hours) {
      const key = isoWeekYear(h.workDate) * 100 + isoWeek(h.workDate);
      if (!weekKeys.has(key)) weekKeys.set(key, 'S' + isoWeek(h.workDate));
    }
    const sortedWeekKeys = [...weekKeys.keys()].sort((a, b) => a - b);

    const hoursByUserWeek = new Map<number, Map<number, number>>();
    for (const h of hours) {
      const weekKey = isoWeekYear(h.workDate) * 100 + isoWeek(h.workDate);
      const perWeek = hoursByUserWeek.get(h.userId) ?? new Map<number, number>();
      perWeek.set(weekKey, (perWeek.get(weekKey) ?? 0) + h.hoursValidated);
      hoursByUserWeek.set(h.userId, perWeek);
    }

    const weeklyRows = [...byUser.entries()]
      .sort((a, b) => a[1].userFullName.localeCompare(b[1].userFullName))
      .map(([userId, e]) => {
        const perWeek = hoursByUserWeek.get(userId);
        const row: Record<string, string | number> = {
          [t('AFFAIRES.WIP.COL_COLLABORATOR')]: e.userFullName,
        };
        for (const weekKey of sortedWeekKeys) {
          row[weekKeys.get(weekKey)!] = Number((perWeek?.get(weekKey) ?? 0).toFixed(2));
        }
        row[t('AFFAIRES.WIP.COL_TOTAL')] = Number(e.totalHours.toFixed(2));
        return row;
      });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumeRows), t('AFFAIRES.WIP.EXPORT_SHEET_SUMMARY'));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), t('AFFAIRES.WIP.EXPORT_SHEET_DETAILS'));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(weeklyRows), t('AFFAIRES.WIP.EXPORT_SHEET_WEEKLY'));

    const affaireRef = this.affaire.reference ?? String(this.affaire.id);
    XLSX.writeFile(wb, `WIP_${affaireRef}_${this.tmDateFrom()}_${this.tmDateTo()}.xlsx`);
  }

  private fmtDateForExport(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  loadTmPreview(): void {
    if (this.tmDateFrom() > this.tmDateTo()) {
      this.tmError.set(this.translate.instant('AFFAIRES.WIP.DATE_RANGE_INVALID'));
      return;
    }
    this.loadingTm.set(true);
    this.tmError.set(null);
    this.selectedCollaboratorUserId.set(null);
    this.resetWipStepper();
    this.svc.previewTm(this.affaire.id, this.tmDateFrom(), this.tmDateTo()).subscribe({
      next: p => {
        this.tmPreview.set(p);
        this.loadingTm.set(false);
        // Step 1 (review) is satisfied the moment there's something to review — unlocks
        // step 2's manual-verification checkbox. Only advances the focused step, never
        // regresses it — if step 4 is already showing a pending client response, a fresh
        // preview for a new period must not steal focus away from it.
        if ((p.hours.length > 0 || p.carriedForwardAmount > 0) && this.wipStep() < 2) {
          this.wipStep.set(2);
        }
      },
      error: err => {
        this.tmPreview.set(null);
        this.loadingTm.set(false);
        this.tmError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.LOAD_ERROR'));
      },
    });
  }

  validateTm(): void {
    if (this.validatingTm() || this.tmDateFrom() > this.tmDateTo() || !this.wipManualVerified()) return;
    this.validatingTm.set(true);
    this.tmError.set(null);
    this.svc.validateTm(this.affaire.id, this.tmDateFrom(), this.tmDateTo()).subscribe({
      next: () => {
        this.validatingTm.set(false);
        this.showTmDetails.set(false);
        this.loadTmPreview();
        this.loadTmHistory();
        // The line just moved to EN_ATTENTE_CLIENT — focus the rail on step 4 even before
        // loadTmHistory()'s response confirms it (loadTmPreview()'s own reset runs first,
        // synchronously, so this has to come after it to win).
        this.wipStep.set(4);
      },
      error: err => {
        this.validatingTm.set(false);
        this.tmError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.VALIDATE_ERROR'));
      },
    });
  }

  /** Every WIP period already validated for this affaire — the TM branch had no history
   * view at all before, unlike AV's tauxHistory table below its own form. */
  loadTmHistory(): void {
    this.loadingTmHistory.set(true);
    this.billingSvc.getBillingLinesDetailed(this.affaire.id).subscribe({
      next: lines => {
        this.tmHistory.set(lines);
        this.loadingTmHistory.set(false);
        // The client's reply just got recorded for the last pending line and none remain —
        // step 4 is done, so the rail moves on to a fresh cycle. Guarded on wipStep() === 4
        // so this never fires from ngOnInit's own initial load.
        if (this.wipStep() === 4 && this.pendingClientLines().length === 0) this.resetWipStepper();
      },
      error: () => this.loadingTmHistory.set(false),
    });
  }

  isTmLineCancellable(statut: string): boolean {
    return this.cancellableTmStatuses.has(statut);
  }

  /** Cancelling releases the line's locked wip_tm_hours, so both the history table and the
   * current period's preview (which those hours may now fall back into) need a fresh reload. */
  cancelLine(billingLineId: number): void {
    if (!confirm(this.translate.instant('AFFAIRES.WIP.CANCEL_LINE_CONFIRM'))) return;
    this.cancelLineError.set(null);
    this.svc.cancelLine(this.affaire.id, billingLineId).subscribe({
      next: () => {
        this.setClientAmountInput(billingLineId, null);
        this.loadTmHistory();
        this.loadTmPreview();
      },
      error: err => this.cancelLineError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.CANCEL_LINE_ERROR')),
    });
  }

  // ── Historique WIP — daf-data-table, remplace l'ancien <table> fait main ───────────
  readonly tmHistoryColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'period',  label: t('AFFAIRES.WIP.COL_PERIOD') },
      { key: 'montant', label: t('AFFAIRES.WIP.COL_AMOUNT'), align: 'right' },
      { key: 'statut',  label: t('AFFAIRES.WIP.COL_STATUS'), type: 'badge' },
    ];
  });

  private toHistoryRow(l: LineDetailDto): TableRow {
    return {
      id:      l.id,
      period:  (l.periodDateFrom && l.periodDateTo) ? this.formatWipPeriod(l.periodDateFrom, l.periodDateTo) : `${l.periodMonth}/${l.periodYear}`,
      montant: this.currency.transform(l.montantHt, l.devise || this.affaire.devise),
      statut:  { label: enumLabel(this.translate, 'BILLING_LINE_STATUT', l.statut),
                 options: { variant: BILLING_LINE_STATUT_BADGE[l.statut] ?? 'neutral', dot: true } } satisfies BadgeCell,
      _source: l,
    };
  }

  readonly tmHistoryRows = computed<TableRow[]>(() => this.tmHistory().map(l => this.toHistoryRow(l)));

  readonly tmHistoryConfig = computed<TableConfig>(() => ({
    showHeader: true,
    hoverable:  false,
    emptyMessage: this.translate.instant('AFFAIRES.WIP.NO_HISTORY'),
    actions: [
      {
        id:      'cancel',
        icon:    'cancel',
        tooltip: this.translate.instant('AFFAIRES.WIP.CANCEL'),
        variant: 'danger',
        onClick: (row: TableRow) => this.cancelLine((row['_source'] as LineDetailDto).id),
        hidden:  (row: TableRow) => !this.isTmLineCancellable((row['_source'] as LineDetailDto).statut),
      },
    ],
  }));

  // ── Popup "Afficher tout" — recherche + filtre Statut sur l'historique complet ──────
  readonly historyFilterFields = computed<FilterField[]>(() => [{
    name:    'statut',
    label:   this.translate.instant('AFFAIRES.WIP.COL_STATUS'),
    type:    'select',
    options: [...new Set(this.tmHistory().map(l => l.statut))].sort()
      .map(value => ({ value, label: enumLabel(this.translate, 'BILLING_LINE_STATUT', value) })),
  }]);

  readonly filteredHistoryLines = computed<LineDetailDto[]>(() => {
    const q      = this.historySearch().trim().toLowerCase();
    const statut = this.historyStatut();
    return this.tmHistory()
      .filter(l => !statut || l.statut === statut)
      .filter(l => !q || `${l.periodDateFrom ?? ''} ${l.periodDateTo ?? ''} ${l.periodMonth}/${l.periodYear}`
        .toLowerCase().includes(q));
  });

  readonly filteredHistoryRows = computed<TableRow[]>(() =>
    this.filteredHistoryLines().map(l => this.toHistoryRow(l)));

  /** TEST : pagination daf-pagination — voir historyPage/historyPageSize plus haut. */
  readonly historyTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredHistoryRows().length / this.historyPageSize())));

  readonly paginatedHistoryRows = computed<TableRow[]>(() => {
    const size = this.historyPageSize();
    const page = Math.min(this.historyPage(), this.historyTotalPages() - 1);
    return this.filteredHistoryRows().slice(page * size, page * size + size);
  });

  /** Même bibliothèque (xlsx) et même schéma d'export que exportWipExcel() ci-dessus —
   * appelé depuis la carte (tmHistory, tout) et depuis la popup (filteredHistoryLines). */
  exportHistoryExcel(lines: LineDetailDto[]): void {
    if (!lines.length) return;
    const t = (k: string) => this.translate.instant(k);
    const rows = lines.map(l => ({
      [t('AFFAIRES.WIP.COL_PERIOD')]: (l.periodDateFrom && l.periodDateTo)
        ? this.formatWipPeriod(l.periodDateFrom, l.periodDateTo) : `${l.periodMonth}/${l.periodYear}`,
      [t('AFFAIRES.WIP.COL_AMOUNT')]: this.currency.transform(l.montantHt, l.devise || this.affaire.devise),
      [t('AFFAIRES.WIP.COL_STATUS')]: enumLabel(this.translate, 'BILLING_LINE_STATUT', l.statut),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), t('AFFAIRES.WIP.HISTORY_TITLE'));
    const affaireRef = this.affaire.reference ?? String(this.affaire.id);
    XLSX.writeFile(wb, `Historique_WIP_${affaireRef}.xlsx`);
  }

  /** `daf-filter` renders a select as `string[]` internally and emits a scalar — normalise both. */
  private asFilterValue(result: FilterResult, key: string): string {
    const v = result[key];
    if (Array.isArray(v)) return (v[0] as string) ?? '';
    return typeof v === 'string' ? v : '';
  }

  onHistoryFilterApply(result: FilterResult): void {
    this.historyStatut.set(this.asFilterValue(result, 'statut'));
    this.historyPage.set(0);
  }

  /** Local calendar date -> 'yyyy-MM-dd', deliberately not toISOString() (UTC-based, which
   * can shift the date by a day depending on the viewer's timezone offset). */
  private toIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Même repli que TreasuryDashboardComponent.locale() : langue de l'app -> locale ICU
   * pour Intl/toLocaleDateString. */
  private locale(): string {
    return this.translate.currentLang() === 'en' ? 'en-GB' : 'fr-FR';
  }

  /** "2026-01-01" → "2026-01-31" (mois calendaire complet, du 1er au dernier jour du même
   * mois) s'affiche "Janvier 2026" plutôt que la plage de dates — toute autre période
   * (partielle, ou à cheval sur plusieurs mois) garde l'ancien affichage "dateFrom → dateTo". */
  formatWipPeriod(dateFrom: string, dateTo: string): string {
    const from = new Date(dateFrom + 'T00:00:00');
    const to = new Date(dateTo + 'T00:00:00');
    const lastDayOfFromMonth = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
    const isFullMonth = from.getDate() === 1
      && from.getFullYear() === to.getFullYear()
      && from.getMonth() === to.getMonth()
      && to.getDate() === lastDayOfFromMonth;
    if (!isFullMonth) return `${dateFrom} → ${dateTo}`;
    const label = from.toLocaleDateString(this.locale(), { month: 'long', year: 'numeric' });
    return label.charAt(0).toLocaleUpperCase() + label.slice(1);
  }

  // ── LIVRABLE actions ──────────────────────────────────────────────────────

  loadLivrables(): void {
    this.loadingLivrables.set(true);
    this.livrableSvc.getLivrables(this.affaire.id).subscribe({
      next: l => {
        this.livrables.set(l);
        // Reset every editable field back to "no change yet" — each pending document
        // starts at its own current cumulative %.
        this.enteredPct.set(new Map(
          l.filter(x => x.statut !== 'FACTURE' && x.statut !== 'ANNULE').map(x => [x.id, x.pctFacture]),
        ));
        this.loadingLivrables.set(false);
      },
      error: () => this.loadingLivrables.set(false),
    });
  }

  loadActiveBatches(): void {
    this.loadingActiveBatches.set(true);
    this.livrableSvc.getActiveBatches(this.affaire.id).subscribe({
      next: b => { this.activeBatches.set(b); this.loadingActiveBatches.set(false); },
      error: () => this.loadingActiveBatches.set(false),
    });
  }

  private currentPct(id: number): number {
    return this.livrables().find(l => l.id === id)?.pctFacture ?? 0;
  }

  getEnteredPct(id: number): number {
    return this.enteredPct().get(id) ?? this.currentPct(id);
  }

  setEnteredPct(id: number, value: number): void {
    const current = this.currentPct(id);
    const clamped = Number.isFinite(value) ? Math.min(100, Math.max(current, value)) : current;
    const map = new Map(this.enteredPct());
    map.set(id, clamped);
    this.enteredPct.set(map);
  }

  /** Live preview of what this one row would add to the batch at its currently entered %
   * — zero if the user hasn't raised it above the document's current cumulative %. */
  incrementalAmount(l: AffaireLivrableDto): number {
    const entered = this.enteredPct().get(l.id) ?? l.pctFacture;
    const delta = Math.max(0, entered - l.pctFacture);
    return (delta / 100) * l.budgetAlloue;
  }

  startEditBatch(batch: LivrableBatchDto): void {
    this.editingBatchId.set(batch.batchId);
    const map = new Map(this.enteredPct());
    batch.entries.forEach(e => map.set(e.livrableId, e.pctSaisi));
    this.enteredPct.set(map);
    this.livrableError.set(null);
  }

  cancelEditBatch(): void {
    this.editingBatchId.set(null);
    this.enteredPct.set(new Map(
      this.livrables().filter(x => x.statut !== 'FACTURE' && x.statut !== 'ANNULE').map(x => [x.id, x.pctFacture]),
    ));
    this.livrableError.set(null);
  }

  /** Submits every document whose entered % was actually raised as one batch — lands on
   * EN_ATTENTE_CLIENT, waiting for the client's confirmation before DF ever sees it (see
   * docs/superpowers/specs/2026-09-04-livrable-df-approval-design.md). While editing an
   * existing batch, this calls editBatch instead, which returns a NEW batchId — the old one
   * is discarded either way once this resolves. */
  submitLivrables(): void {
    const entries = this.changedEntries();
    if (entries.length === 0 || this.submittingLivrables()) return;
    this.submittingLivrables.set(true);
    this.livrableError.set(null);
    const editingId = this.editingBatchId();
    const request$ = editingId !== null
      ? this.livrableSvc.editBatch(this.affaire.id, editingId, entries)
      : this.livrableSvc.submitLivrables(this.affaire.id, entries);
    request$.subscribe({
      next: () => {
        this.submittingLivrables.set(false);
        this.editingBatchId.set(null);
        this.loadLivrables();
        this.loadActiveBatches();
      },
      error: err => {
        this.submittingLivrables.set(false);
        this.livrableError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.LIVRABLE_ERROR'));
      },
    });
  }

  cancelBatch(batchId: number): void {
    if (!confirm(this.translate.instant('AFFAIRES.WIP.CANCEL_BATCH_CONFIRM'))) return;
    this.livrableCancelError.set(null);
    this.livrableSvc.cancelBatch(this.affaire.id, batchId).subscribe({
      next: () => {
        if (this.editingBatchId() === batchId) this.cancelEditBatch();
        this.setLivrableClientAmountInput(batchId, null);
        this.loadActiveBatches();
      },
      error: err => this.livrableCancelError.set(
        err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.CANCEL_BATCH_ERROR')),
    });
  }

  getLivrableClientAmountInput(batchId: number): number | null {
    return this.livrableClientAmountInputs().get(batchId) ?? null;
  }

  setLivrableClientAmountInput(batchId: number, value: number | null): void {
    const map = new Map(this.livrableClientAmountInputs());
    map.set(batchId, value);
    this.livrableClientAmountInputs.set(map);
  }

  confirmLivrableClientAmount(batch: LivrableBatchDto): void {
    const amount = this.getLivrableClientAmountInput(batch.batchId);
    if (amount === null || amount < 0 || amount > batch.combinedMontant
      || this.submittingLivrableClientBatch() !== null) return;
    this.submittingLivrableClientBatch.set(batch.batchId);
    this.livrableClientAmountError.set(null);
    this.livrableSvc.enterClientAmountForBatch(this.affaire.id, batch.batchId, amount).subscribe({
      next: () => {
        this.submittingLivrableClientBatch.set(null);
        this.setLivrableClientAmountInput(batch.batchId, null);
        // The batch just moved to EN_ATTENTE_DF, where editBatch() is no longer allowed —
        // close any edit form left open on it, same guard cancelBatch() already has above.
        if (this.editingBatchId() === batch.batchId) this.cancelEditBatch();
        this.loadActiveBatches();
      },
      error: err => {
        this.submittingLivrableClientBatch.set(null);
        this.livrableClientAmountError.set(
          err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.CLIENT_AMOUNT_ERROR'));
      },
    });
  }
}
