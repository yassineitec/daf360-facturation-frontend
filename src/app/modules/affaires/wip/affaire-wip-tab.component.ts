import {
  Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output,
  Renderer2, ViewChild, WritableSignal,
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
      padding: 9px;
      border: none;
      background: transparent;
      color: var(--color-outline, #75777d);
      border-radius: 8px;
      box-shadow: none;
    }
    ::ng-deep .wip-icon-actions button:hover:not(:disabled) {
      color: var(--color-tertiary, #1a6b7c);
      background: var(--color-surface-container, #eceef0);
    }
    ::ng-deep .wip-icon-actions button .material-symbols-outlined {
      font-size: 22px;
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

    /* TEST : panneau du calendrier AV/Régie — même technique de spécificité que
       .wip-icon-actions ci-dessus (deux classes, 0,2,0, l'emporte sur la classe Tailwind
       seule de la lib sans !important).
       - Agrandi (min-width) mais moins que le premier essai (320px) : par défaut la
         grille de 7 colonnes tient sur ~236px, trop serré, 280px suffit sans être
         disproportionné.
       - "Effacer" (le seul bouton de ce footer en mode inline — la lib ne rend
         "Confirmer" qu'en dropdown + sélection multiple, jamais ici) déplacé à gauche
         (flex-start au lieu de justify-end) pour laisser la droite au bouton "Confirmer". */
    ::ng-deep .wip-date-picker-panel .bg-surface-container-lowest {
      min-width: 280px;
    }
    ::ng-deep .wip-date-picker-panel .justify-end {
      justify-content: flex-start;
    }
    /* Bouton "Confirmer" ajouté par ce composant (pas par la lib), positionné en absolu
       plutôt qu'en rangée à part pour retomber pile sur la même ligne que "Effacer" — le
       panneau (.wip-date-picker-panel) est déjà en position:fixed (posé par
       positionPortal() au runtime), ce qui suffit comme repère à cet absolu, sans avoir
       besoin d'ajouter position:relative ici. 8px/10px reprennent le padding du footer de
       la lib (pb-2/px-2.5) pour s'aligner exactement dessus.
       Mêmes classes texte-seul que le bouton "Effacer" de la lib (text-label-sm
       font-semibold uppercase tracking-wide, pas de fond) — juste une couleur différente
       (tertiary/teal) pour signaler l'action positive plutôt qu'un bouton plein noir. */
    .wip-date-picker-confirm-btn {
      position: absolute;
      right: 10px;
      bottom: 8px;
      background: transparent;
      border: none;
      padding: 0;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      color: var(--color-tertiary, #1a6b7c);
      cursor: pointer;
      transition: color 0.2s;
    }
    .wip-date-picker-confirm-btn:hover {
      color: var(--color-teal, #006b58);
    }
  `],
})
export class AffaireWipTabComponent implements OnInit, OnDestroy {
  @Input({ required: true }) affaire!: AffaireDetail;

  /**
   * Émis après CHAQUE écriture réussie de cet onglet, quel que soit le mode : soumission /
   * modification / suppression d'un taux AV, validation d'une période Régie, saisie du
   * montant confirmé par le client, annulation d'une ligne ou d'un batch, soumission de
   * livrables. La fiche affaire s'y abonne pour recharger ses tuiles (Backlog, WIP, Total
   * facturé…), qui dérivent toutes de ce que ces actions viennent d'écrire — sans ça elles
   * gardaient les valeurs du chargement initial de la page jusqu'au prochain F5.
   *
   * Volontairement SANS charge utile : l'onglet ne sait pas recalculer les indicateurs de
   * la fiche (ils agrègent aussi les factures et les paiements), il signale juste « quelque
   * chose a changé, va relire ». Un seul événement pour les trois modes, le parent n'ayant
   * aucune raison de les traiter différemment.
   */
  @Output() readonly dataChanged = new EventEmitter<void>();

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

  /** Même portail que historyOverlayRef ci-dessus, pour le popup "Détails" (showTmDetails) —
   * sans lui, il restait au fil de la vue plutôt que sous <body>, et se retrouvait cadré par
   * un ancêtre à backdrop-filter (une daf-card 'glass' de cet onglet) au lieu de se centrer
   * sur toute la page comme "Historique WIP". */
  private readonly detailsOverlayRef = viewChild<ElementRef<HTMLElement>>('detailsOverlay');
  private detailsOverlayPortaled: HTMLElement | null = null;

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

    effect(onCleanup => {
      const ref = this.detailsOverlayRef();
      if (!ref || !this.showTmDetails()) return;

      const node = ref.nativeElement;
      if (node.parentElement !== this.document.body) {
        this.renderer.appendChild(this.document.body, node);
        this.detailsOverlayPortaled = node;
      }

      onCleanup(() => {
        node.remove();
        if (this.detailsOverlayPortaled === node) this.detailsOverlayPortaled = null;
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
  /** Every BillingLine ever created for this affaire's AV taux submissions — same generic
   * endpoint RÉGIE's own tmHistory() reads (getBillingLinesDetailed), scoped implicitly to
   * FORFAIT since an affaire only ever has one active billing mode. Needed so
   * avPendingClientLines() below can find AV lines sitting at EN_ATTENTE_CLIENT, exactly the
   * same way RÉGIE's own pendingClientLines() filters tmHistory(). */
  avLineHistory = signal<LineDetailDto[]>([]);
  newTauxValue  = signal<number | null>(null);
  // Named to match this codebase's existing string-union convention (WipTauxStatut's
  // 'EN_ATTENTE'/'VALIDE'/'REFUSE' — French business terms, not English enum names). Whichever
  // mode is active, effectiveTauxPercent() below always converts to the percentage the backend
  // actually stores, so nothing downstream needs to know which mode was used.
  avInputMode    = signal<'POURCENTAGE' | 'MONTANT'>('POURCENTAGE');
  newAmountValue = signal<number | null>(null);

  /** AV's own Revue / Vérification manuelle / Validation / Réponse client rail — visually
   * the same 4 steps as the RÉGIE card's `wipStep`/`wipManualVerified` (see that section
   * further down), but AV's real lifecycle has no manual-verification-checkbox concept and
   * no client-confirmation concept, so this checkbox is new, local-only state, never sent
   * to the backend — exactly how RÉGIE's own `wipManualVerified` already works (see its own
   * comment: "never sent to the backend, never persisted"). Step 4 is now a real
   * client-confirmation wait (see avPendingClientLines below) — the original design's step-4
   * placeholder (DAF's decision, no literal client response) was superseded by the full
   * client-confirmation feature; see
   * docs/superpowers/specs/2026-09-21-av-client-confirmation-design.md. */
  avManualVerified = signal(false);

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

  /** Sum, not max — each VALIDE entry is now an INCREMENTAL percentage (see
   * docs/superpowers/specs/2026-09-22-av-incremental-taux-design.md), so "cumulative progress
   * so far" is the sum of every validated increment, mirroring the backend's own
   * sumValidatedTaux() change exactly. */
  readonly lastValidatedTaux = computed(() => {
    const vals = this.tauxHistory().filter(t => t.statut === 'VALIDE');
    // Rounded to 6 decimals (taux_saisi's column scale since V86): plain floating-point
    // addition drifts (e.g. 33.846 + 11.109 renders as 44.955000000000005) since binary
    // floats can't represent most decimal fractions exactly, and this value is shown
    // directly in the form hint below.
    return Number(vals.reduce((sum, t) => sum + t.tauxSaisi, 0).toFixed(6));
  });

  /** Amount counterpart of lastValidatedTaux — the stored VALIDE increments summed, mirroring
   * the backend's sumValidatedMontant(). What's left to declare is contract − this, read as
   * an amount rather than rebuilt from a percentage. */
  readonly lastValidatedMontant = computed(() => {
    const vals = this.tauxHistory().filter(t => t.statut === 'VALIDE');
    return Number(vals.reduce((sum, t) => sum + t.montantIncremental, 0).toFixed(3));
  });

  readonly remainingMontant = computed(() =>
    Number(((this.affaire.contractAmount ?? 0) - this.lastValidatedMontant()).toFixed(3)));

  readonly editingTaux = computed<WipTauxDto | null>(() =>
    this.tauxHistory().find(t => t.id === this.editingTauxId()) ?? null);

  /** AV's own equivalent of RÉGIE's pendingClientLines() — byte-for-byte the same filter,
   * just reading avLineHistory() instead of tmHistory(). Step 4 "Réponse client" is now real
   * (not a DAF-decision placeholder): reaching it means the client hasn't replied yet to the
   * BillingLine submitTaux()/updateTaux() created — see
   * docs/superpowers/specs/2026-09-21-av-client-confirmation-design.md. */
  readonly avPendingClientLines = computed(() =>
    this.avLineHistory().filter(l => l.statut === 'EN_ATTENTE_CLIENT'));

  /** 0-based, matches `daf-stepper`'s own `[currentStep]` convention (RÉGIE converts its
   * 1-based `wipStep` with `wipStep() - 1`; this one is 0-based from the start, so no
   * conversion is needed at the template call site). Checked in the same priority order
   * RÉGIE's own `wipMaxStepReached` uses: the "furthest/most real" condition first, falling
   * through to earlier, more local-only conditions only when it doesn't apply. Purely
   * derived — no imperative `.set()` anywhere, unlike RÉGIE's clickable `wipStep`, because
   * this rail isn't clickable (nothing to navigate to, see the template task). The moment
   * avLineHistory() refreshes and the pending line is no longer EN_ATTENTE_CLIENT, this
   * recomputes on its own and falls all the way back to step 1 (avManualVerified was already
   * reset to false at submission time) — mirroring RÉGIE's own rail exactly: it resets the
   * moment the CLIENT confirms, not once DAF also approves (DAF's decision plays out entirely
   * off-rail, on the approval queue). */
  readonly avStepIndex = computed<number>(() => {
    if (this.avPendingClientLines().length > 0) return 3; // step 4
    if (this.avManualVerified()) return 2;                    // step 3
    if (this.effectiveTauxPercent() !== null && this.canSubmitTaux()) return 1; // step 2
    return 0;                                                  // step 1
  });

  /** The percentage shown and checked in both modes. In MONTANT mode it is only DERIVED from
   * the typed amount (6 decimals, taux_saisi's scale) for display — the amount itself is what
   * gets submitted (montantSaisi, see submitTaux()), and the backend re-derives this same
   * percentage from it. Converting the amount to a rounded percentage and letting the backend
   * rebuild the amount from that is what used to change the saved amount (up to 0.0005 % of
   * the contract, e.g. 1 000 000 saved as 999 975). */
  readonly effectiveTauxPercent = computed<number | null>(() => {
    if (this.avInputMode() === 'POURCENTAGE') return this.newTauxValue();
    const amount = this.newAmountValue();
    const contractAmount = this.affaire.contractAmount;
    if (amount === null || !contractAmount) return null;
    // The exact remainder closes the cumul at exactly 100 %, same as the backend.
    if (amount === this.remainingMontant()) return Number((100 - this.lastValidatedTaux()).toFixed(6));
    return Number(((amount / contractAmount) * 100).toFixed(6));
  });

  /** Mirrors the backend's own 2 new rules exactly (see ProgressBillingService.
   * submitTauxAvancement()/updateTaux()): the entered value must be > 0 (a fresh delta of
   * zero or less isn't meaningful), and adding it to the cumulative-so-far must not exceed
   * 100%. No more distinction between "new" and "editing" — under the old cumulative model,
   * editing allowed re-submitting the SAME cumulative value (>=) while a fresh submission
   * required strictly exceeding it (>); that distinction doesn't have an equivalent meaning
   * once each entry is its own independent increment, so both cases now use the same rule. */
  readonly canSubmitTaux = computed(() => {
    if (this.avInputMode() === 'MONTANT') {
      // Checked as an amount, like the backend: a derived percentage could round a hair
      // over 100 % for an amount that fits exactly.
      const amount = this.newAmountValue();
      return amount !== null && amount > 0 && !!this.affaire.contractAmount
        && amount <= this.remainingMontant();
    }
    const taux = this.effectiveTauxPercent();
    if (taux === null || taux <= 0) return false;
    return Number((this.lastValidatedTaux() + taux).toFixed(6)) <= 100;
  });

  /** POURCENTAGE-mode preview of the amount the backend will store: taux % of the contract,
   * or — when this entry brings the cumul to exactly 100 % — the contract remainder, so the
   * affaire always totals its contract amount (see ProgressBillingService.resolveIncrement). */
  readonly avWipPreview = computed<number | null>(() => {
    const taux = this.effectiveTauxPercent();
    if (taux === null || !this.affaire.contractAmount) return null;
    if (Number((this.lastValidatedTaux() + taux).toFixed(6)) === 100 && this.remainingMontant() > 0) {
      return this.remainingMontant();
    }
    return Number(((taux * this.affaire.contractAmount) / 100).toFixed(3));
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
  readonly lastValidatedAmountHint = computed(() =>
    this.currency.transform(this.lastValidatedMontant(), this.affaire.devise));

  /** Same 4 i18n keys RÉGIE's own wipStepperSteps already uses (STEP_REVIEW/STEP_VERIFY/
   * STEP_VALIDATE/STEP_CLIENT) — no new i18n keys needed, matching this file's own
   * established convention of sharing plain-word keys across billing-mode branches. */
  readonly avStepperSteps = computed<StepperStep[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const idx = this.avStepIndex();
    return [
      { title: t('AFFAIRES.WIP.STEP_REVIEW') },
      { title: t('AFFAIRES.WIP.STEP_VERIFY') },
      { title: t('AFFAIRES.WIP.STEP_VALIDATE') },
      { title: t('AFFAIRES.WIP.STEP_CLIENT') },
    ].map((s, i) => ({ ...s, completed: i < idx, disabled: i > idx }));
  });

  /** `clickableSteps: false` (RÉGIE's is `true`) — this rail is a pure read-only reflection
   * of tauxHistory()/the entry form's own state, there's no per-step content to navigate to,
   * so no (stepClick) handler is needed at the template call site either. */
  readonly avStepperConfig = computed<StepperConfig>(() => {
    this.translate.currentLang();
    return {
      chrome: 'header-only',
      clickableSteps: false,
      stepperLabel: this.translate.instant('AFFAIRES.WIP.STEPPER_LABEL'),
    };
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

  /** Vrai quand la sélection du calendrier AV a été vidée ("Effacer", le "x" d'une date, ou
   * le 1er clic d'une nouvelle plage — les trois font émettre `null` à la lib) : le
   * calendrier s'affiche alors vide, mais periodDateFrom/periodDateTo gardent la dernière
   * période valide tant qu'une nouvelle plage complète n'a pas été choisie. */
  private avPickerCleared = signal(false);
  @ViewChild('avPicker') private avPickerRef?: MultiDatePickerComponent;

  /** Référence mise en cache : `[value]` est relu à chaque détection de changements, et un
   * nouveau tableau à chaque fois ré-imposerait l'ancienne plage à la lib (annulant
   * "Effacer" et la date de début en attente d'une nouvelle plage). */
  private avRangeCache: { from: string; to: string; range: Date[] } | null = null;

  avDateRange(): Date[] | null {
    if (this.avPickerCleared()) return null;
    const c = this.avRangeCache;
    if (!c || c.from !== this.periodDateFrom || c.to !== this.periodDateTo) {
      this.avRangeCache = {
        from: this.periodDateFrom,
        to: this.periodDateTo,
        range: [
          new Date(this.periodDateFrom + 'T00:00:00'),
          new Date(this.periodDateTo + 'T00:00:00'),
        ],
      };
    }
    return this.avRangeCache!.range;
  }

  onAvDateRangeChange(value: Date | Date[] | null): void {
    // `null` = sélection vidée ("Effacer", "x" d'une date, ou 1er clic d'une nouvelle
    // plage) : on vide le calendrier et on le laisse ouvert pour choisir une nouvelle plage.
    if (value === null) {
      this.avPickerCleared.set(true);
      return;
    }
    if (!Array.isArray(value) || value.length !== 2) return;
    this.periodDateFrom = this.toIso(value[0]);
    this.periodDateTo = this.toIso(value[1]);
    this.avPickerCleared.set(false);
    // Ne referme plus tout seul une fois les deux dates posées — seul le bouton
    // "Confirmer" (ou Échap) referme désormais, pour laisser le temps de vérifier/corriger
    // la plage avant de la valider.
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
    // Fermé sans plage complète : on abandonne la date de début en attente (la lib ne le
    // fait pas elle-même en mode inline) et le calendrier réaffiche la période conservée.
    if (this.avPickerRef?.pendingRangeStart()) this.avPickerRef.reset();
    this.avPickerCleared.set(false);
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
  /** Même rôle que avPickerCleared, pour le calendrier Régie/TM. */
  private tmPickerCleared = signal(false);
  @ViewChild('tmPicker') private tmPickerRef?: MultiDatePickerComponent;

  readonly tmDateRange = computed<Date[] | null>(() => this.tmPickerCleared() ? null : [
    new Date(this.tmDateFrom() + 'T00:00:00'),
    new Date(this.tmDateTo() + 'T00:00:00'),
  ]);

  onTmDateRangeChange(value: Date | Date[] | null): void {
    // Même cas que onAvDateRangeChange : `null` vide le calendrier et le laisse ouvert ;
    // tmDateFrom/tmDateTo (et donc l'aperçu) gardent la dernière période valide.
    if (value === null) {
      this.tmPickerCleared.set(true);
      return;
    }
    if (!Array.isArray(value) || value.length !== 2) return;
    this.tmDateFrom.set(this.toIso(value[0]));
    this.tmDateTo.set(this.toIso(value[1]));
    this.tmPickerCleared.set(false);
    this.loadTmPreview();
    // Ne referme plus tout seul une fois les deux bornes posées — seul le bouton
    // "Confirmer" (ou Échap) referme désormais, pour laisser le temps de vérifier/corriger
    // la plage avant de la valider.
  }

  /** TEST : boutons révélés au survol de la carte, même mécanisme que les cartes de
   * /rh/profiles (profile-grid-card.component.ts) — un signal par carte, mis à jour par
   * (mouseenter)/(mouseleave) sur `daf-section-card`/`daf-card`. Pas de signal pour la
   * carte Régie elle-même : sa pastille d'icônes (dont "Valider") est maintenant toujours
   * visible plutôt que révélée au survol — voir le commentaire à côté de ce bloc. */
  historyCardHovered = signal(false);

  /** TEST : même repli daf-accordion-card que la carte FORFAIT (voir forfaitDrawerOpen)
   * appliqué ici à la carte Régie Time & Materials. */
  regieDrawerOpen = signal(false);

  // ── LIVRABLE — mêmes pills d'icônes révélées au survol que Forfaitaire/Régie, un
  // signal dédié par carte (voir le commentaire ci-dessus). Pas de signal pour la carte
  // "Livrables en attente" elle-même : sa pastille (dont "Soumettre") est maintenant
  // toujours visible plutôt que révélée au survol — voir le commentaire à côté de ce
  // bloc côté HTML. ──────────────────────────
  livrableBatchesCardHovered  = signal(false);
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
      { key: 'budget',     label: t('AFFAIRES.WIP.COL_BUDGET_ALLOUE') },
      { key: 'pctActuel',  label: t('AFFAIRES.WIP.COL_PCT_ACTUEL') },
      { key: 'nouveauPct', label: t('AFFAIRES.WIP.COL_NOUVEAU_PCT'), type: 'custom' },
      { key: 'montant',    label: t('AFFAIRES.WIP.COL_AMOUNT') },
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
      { key: 'budget',     label: t('AFFAIRES.WIP.COL_BUDGET_ALLOUE') },
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
    // Voir closeAvDatePicker.
    if (this.tmPickerRef?.pendingRangeStart()) this.tmPickerRef.reset();
    this.tmPickerCleared.set(false);
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

  // Un clic n'importe où sur la page ne referme plus les calendriers AV/Régie, et choisir
  // les deux dates ne les referme plus non plus tout seul (voir onAvDateRangeChange/
  // onTmDateRangeChange) — seuls le bouton "Confirmer" ou Échap (onEscapeForDatePicker)
  // les referment désormais.

  /** En mode plage, le "x" d'une date de daf-multi-date-picker (removeDate()) vide TOUTE la
   * sélection, et n'indique pas quelle date a été cliquée (il émet juste `null`). On
   * intercepte donc le clic en phase de capture, AVANT le bouton de la lib : on retrouve la
   * date retirée par la position de sa pastille (même ordre que la plage : début, fin), et
   * l'AUTRE date devient le début d'une nouvelle plage en attente — un seul clic suffit
   * ensuite pour choisir la nouvelle borne.
   *
   * Écouté sur `document` (et non sur chaque panneau une fois pour toutes) : les panneaux
   * vivent sous des `@if` (ex. `loadingTaux()` pour AV) et n'existent pas encore au premier
   * rendu — les refs sont donc relues à chaque clic. Dépend du gabarit interne de la lib
   * (pastilles `span.rounded-full > button`) : si elle change, le clic retombe simplement sur
   * son comportement d'origine (tout vider). */
  private readonly onChipRemoveCapture = (event: MouseEvent): void => {
    this.keepOtherDateOnChipRemove(event, this.avDatePickerPanelRef?.nativeElement, this.avPickerRef)
      || this.keepOtherDateOnChipRemove(event, this.calDatePickerPanelRef?.nativeElement, this.tmPickerRef);
  };

  private keepOtherDateOnChipRemove(
    event: MouseEvent, panel: HTMLElement | undefined, picker: MultiDatePickerComponent | undefined,
  ): boolean {
    const chipButtons = 'span.rounded-full > button';
    const btn = (event.target as HTMLElement | null)?.closest?.(chipButtons);
    const range = picker?.value();
    if (!panel || !picker || !btn || !panel.contains(btn) || !Array.isArray(range) || range.length !== 2) {
      return false;
    }
    const idx = Array.from(panel.querySelectorAll(chipButtons)).indexOf(btn);
    if (idx !== 0 && idx !== 1) return false;
    event.stopPropagation();
    picker.value.set(null); // → onAv/onTmDateRangeChange(null) : calendrier vidé, reste ouvert
    picker.pendingRangeStart.set(range[1 - idx]);
    return true;
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
    this.document.removeEventListener('click', this.onChipRemoveCapture, true);
    this.calDatePickerPanelRef?.nativeElement.remove();
    this.avDatePickerPanelRef?.nativeElement.remove();
    this.historyOverlayPortaled?.remove();
    this.historyOverlayPortaled = null;
    this.detailsOverlayPortaled?.remove();
    this.detailsOverlayPortaled = null;
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
        this.dataChanged.emit();
      },
      error: err => {
        this.submittingClientLine.set(null);
        this.clientAmountError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.CLIENT_AMOUNT_ERROR'));
      },
    });
  }

  ngOnInit(): void {
    if (this.affaire.billingMode === 'FORFAIT') { this.loadTauxHistory(); this.loadAvLineHistory(); }
    if (this.affaire.billingMode === 'REGIE') { this.loadTmPreview(); this.loadTmHistory(); }
    if (this.affaire.billingMode === 'LIVRABLE') { this.loadLivrables(); this.loadActiveBatches(); }
    // Voir onChipRemoveCapture — capture (true) pour passer avant le bouton "x" de la lib.
    this.document.addEventListener('click', this.onChipRemoveCapture, true);
  }

  // ── AV actions ────────────────────────────────────────────────────────────

  loadTauxHistory(): void {
    this.loadingTaux.set(true);
    this.svc.getTauxHistory(this.affaire.id).subscribe({
      next:  h => { this.tauxHistory.set(h); this.loadingTaux.set(false); },
      error: () => this.loadingTaux.set(false),
    });
  }

  /** Every billing line for this affaire — same generic endpoint RÉGIE's own loadTmHistory()
   * reads, needed so avPendingClientLines() can find the line submitTauxAvancement()/
   * updateTaux() creates. Unlike loadTmHistory(), no stepper-reset call is needed here:
   * avStepIndex is a pure computed, it falls back on its own the moment avLineHistory()
   * no longer contains an EN_ATTENTE_CLIENT line. */
  loadAvLineHistory(): void {
    this.billingSvc.getBillingLinesDetailed(this.affaire.id).subscribe({
      next:  lines => this.avLineHistory.set(lines),
      error: () => {},
    });
  }

  // ── AV — client-approval workflow (mirrors RÉGIE's own pendingClientLines/
  // confirmClientAmount below, field-for-field, just scoped to AV's own line) ─────────
  avClientAmountInputs   = signal<Map<number, number | null>>(new Map());
  submittingAvClientLine = signal<number | null>(null);
  avClientAmountError    = signal<string | null>(null);

  getAvClientAmountInput(lineId: number): number | null {
    return this.avClientAmountInputs().get(lineId) ?? null;
  }

  setAvClientAmountInput(lineId: number, value: number | null): void {
    const map = new Map(this.avClientAmountInputs());
    map.set(lineId, value);
    this.avClientAmountInputs.set(map);
  }

  confirmAvClientAmount(line: LineDetailDto): void {
    // Empty input falls back to the calculated amount — clicking "validate" with nothing
    // typed means the client accepted the WIP-calculated figure as-is (see
    // docs/superpowers/specs/2026-09-22-av-inline-client-amount-design.md §4).
    const amount = this.getAvClientAmountInput(line.id) ?? line.montantHt;
    if (amount < 0 || amount > line.montantHt || this.submittingAvClientLine() !== null) return;
    this.submittingAvClientLine.set(line.id);
    this.avClientAmountError.set(null);
    this.svc.enterAvClientAmount(this.affaire.id, line.tauxAvancementId!, amount).subscribe({
      next: () => {
        this.submittingAvClientLine.set(null);
        this.setAvClientAmountInput(line.id, null);
        this.loadAvLineHistory();
        this.dataChanged.emit();
      },
      error: err => {
        this.submittingAvClientLine.set(null);
        this.avClientAmountError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.CLIENT_AMOUNT_ERROR'));
      },
    });
  }

  private preEditDateFrom = this.periodDateFrom;
  private preEditDateTo = this.periodDateTo;

  startEditTaux(t: WipTauxDto): void {
    // Le formulaire d'édition vit dans l'accordéon FORFAIT_ENTRY_TITLE — sans l'ouvrir ici,
    // un clic sur "Modifier" depuis le tableau d'historique (en dehors de l'accordéon)
    // préremplit le formulaire mais l'utilisateur ne le voit jamais s'il était fermé.
    this.forfaitDrawerOpen.set(true);
    this.preEditDateFrom = this.periodDateFrom;
    this.preEditDateTo = this.periodDateTo;
    this.editingTauxId.set(t.id);
    this.periodDateFrom = t.periodDateFrom;
    this.periodDateTo = t.periodDateTo;
    // Reopens in whichever mode reproduces the stored pair exactly: if taux % of the contract
    // gives back the stored amount it was a percentage entry; otherwise (an amount entry, or
    // a 100 % closing entry billed at the contract remainder) re-submitting the percentage
    // would shift the amount, so the stored amount is prefilled instead. The user can still
    // switch mode mid-edit.
    const fromPercent = Number(((t.tauxSaisi * (this.affaire.contractAmount ?? 0)) / 100).toFixed(3));
    const isAmountEntry = !!this.affaire.contractAmount && fromPercent !== t.montantIncremental;
    this.avInputMode.set(isAmountEntry ? 'MONTANT' : 'POURCENTAGE');
    this.newTauxValue.set(isAmountEntry ? null : t.tauxSaisi);
    this.newAmountValue.set(isAmountEntry ? t.montantIncremental : null);
    this.tauxComment = t.commentaire ?? '';
    this.tauxError.set(null);
    // Re-editing a value the user already reviewed once shouldn't force them to re-tick the
    // acknowledgment — but re-editing a REFUSED taux is effectively a fresh submission (a
    // new value going back to DAF), so it resets like any other fresh start.
    this.avManualVerified.set(false);
  }

  cancelEditTaux(): void {
    this.editingTauxId.set(null);
    this.avInputMode.set('POURCENTAGE');
    this.newTauxValue.set(null);
    this.newAmountValue.set(null);
    this.tauxComment = '';
    this.tauxError.set(null);
    this.avManualVerified.set(false);
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
      // MONTANT mode: the typed amount is the source of truth, stored as-is server-side.
      montantSaisi: this.avInputMode() === 'MONTANT' ? this.newAmountValue() : null,
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
        this.avManualVerified.set(false);
        this.editingTauxId.set(null);
        this.loadTauxHistory();
        this.loadAvLineHistory();
        this.dataChanged.emit();
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
        this.loadAvLineHistory();
        this.dataChanged.emit();
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
      { key: 'period',   label: t('AFFAIRES.WIP.COL_PERIOD') },
      { key: 'taux',     label: t('AFFAIRES.WIP.COL_TAUX') },
      { key: 'cumul',    label: t('AFFAIRES.WIP.COL_CUMUL') },
      { key: 'montant',  label: t('AFFAIRES.WIP.COL_INCREMENT') },
      { key: 'mtClient', label: t('AFFAIRES.WIP.COL_MT_CLIENT'), type: 'custom' },
      { key: 'statut',   label: t('AFFAIRES.WIP.COL_STATUS'), type: 'badge' },
    ];
  });

  /** `cumul` is a pure display aid — the running sum of `tauxSaisi` down the table in its
   * existing period-ascending order (the backend already returns tauxHistory() sorted by
   * periodDateFrom), regardless of each row's own statut. This is deliberately simpler than
   * the backend's own sumValidatedTaux() (which only sums VALIDE rows for real business
   * validation) — here it's just "what do all the entries through this row add up to,"
   * matching the plain reading of the user's own example (September 10%, October 5%, running
   * total 15%) without needing to special-case pending/refused rows in the UI. */
  readonly tauxHistoryRows = computed<TableRow[]>(() => {
    let runningCumul = 0;
    const lines = this.avLineHistory();
    return this.tauxHistory().map(t => {
      // Rounded to 6 decimals at every step, not just for display: plain floating-point
      // addition drifts (e.g. 33.846 + 11.109 renders as 44.955000000000005) since binary
      // floats can't represent most decimal fractions exactly. taux values themselves are
      // never stored with more than 6 decimals (NUMERIC(9,6) since V86), so the running
      // total shouldn't show more either.
      runningCumul = Number((runningCumul + t.tauxSaisi).toFixed(6));
      return {
        id:      t.id,
        period:  this.formatWipPeriod(t.periodDateFrom, t.periodDateTo),
        taux:    `${t.tauxSaisi}%`,
        cumul:   `${runningCumul}%`,
        montant: this.currency.transform(t.montantIncremental, this.affaire.devise),
        // mtClient itself isn't set here — it's a type: 'custom' column (see the
        // dafCell="mtClient" template in the .html), rendered from `_line` directly,
        // since its content is either an input, formatted text, or a dash depending on
        // the linked line's own state (see
        // docs/superpowers/specs/2026-09-22-av-inline-client-amount-design.md §3).
        statut:  { label: enumLabel(this.translate, 'WIP_TAUX_STATUT', t.statut),
                   options: { variant: WIP_TAUX_STATUT_BADGE[t.statut] ?? 'neutral', dot: true } } satisfies BadgeCell,
        _source: t,
        _line:   lines.find(l => l.tauxAvancementId === t.id) ?? null,
      } satisfies TableRow;
    });
  });

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
      {
        id:      'validateClient',
        icon:    'check_circle',
        tooltip: this.translate.instant('AFFAIRES.WIP.VALIDATE_CLIENT_AMOUNT'),
        onClick: (row: TableRow) => {
          const line = row['_line'] as LineDetailDto | null;
          if (line) this.confirmAvClientAmount(line);
        },
        hidden: (row: TableRow) => (row['_line'] as LineDetailDto | null)?.statut !== 'EN_ATTENTE_CLIENT',
        // A null input is now a valid "accept the calculated amount" choice (see
        // confirmAvClientAmount()'s fallback), so this only disables for an out-of-bounds
        // typed value or while this row's own confirm request is in flight — mirroring the
        // removed <daf-button>'s disabled condition, minus the now-invalid "null blocks
        // submit" half of it. TableAction has no per-row loading state, so this doubles as
        // the closest available substitute for the removed button's `loading` indicator.
        disabled: (row: TableRow) => {
          const line = row['_line'] as LineDetailDto | null;
          if (!line) return false;
          const input = this.getAvClientAmountInput(line.id);
          return (input !== null && (input < 0 || input > line.montantHt)) || this.submittingAvClientLine() === line.id;
        },
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
        this.dataChanged.emit();
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
        this.dataChanged.emit();
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
      { key: 'montant', label: t('AFFAIRES.WIP.COL_AMOUNT') },
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
        this.dataChanged.emit();
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
        this.dataChanged.emit();
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
        this.dataChanged.emit();
      },
      error: err => {
        this.submittingLivrableClientBatch.set(null);
        this.livrableClientAmountError.set(
          err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.CLIENT_AMOUNT_ERROR'));
      },
    });
  }
}
