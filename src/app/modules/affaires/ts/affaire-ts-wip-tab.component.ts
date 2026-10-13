import {
  Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, Renderer2,
  computed, effect, inject, signal, untracked, viewChild,
} from '@angular/core';
import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import * as XLSX from 'xlsx';
import {
  ButtonComponent, CardComponent, CheckboxComponent, FormFieldComponent, StatusBadgeComponent,
  DataTableComponent, DafCellDirective, TableColumn, TableConfig, TableRow, BadgeCell,
  AccordionCardComponent, SearchToolbarComponent, SearchToolbarFilterConfig, FilterField, FilterResult,
  PaginationComponent, LoadingComponent,
} from '@khalilrebhiitec/daf360';
import { BillingService, LineDetailDto, TsBatchDto, TsPendingCarryForwardDto } from '../billing/billing.service';
import { RowSelection } from '../billing/row-selection';
import { TsDto } from '../affaire.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { TS_BATCH_STATUT_BADGE } from '../../../shared/enum-labels';
import {
  TableSort, delegatedSort, searchTableRows, sortTableRows, tableTools, toTableSort,
} from '../../../shared/table-tools';
import { EmailPreviewModalComponent } from '../wip/email-preview-modal.component';

/** Valeurs à plat du panneau Filtres : texte pour un select/montant, dates pour une plage. */
type TsFilterValues = Record<string, string | Date[] | null>;

/**
 * The "TS WIP" affaire tab — gives Travaux Supplémentaires the same submit -> client
 * confirms -> DF validates path AffaireWipTabComponent already has for AV/Régie/Livrable,
 * including the client-amount step: the client may confirm LESS than the batch's calculated
 * total (never more), with the shortfall carried forward to the TS's next submission — same
 * mechanism and UI pattern as Livrable's own client-amount confirmation
 * (TsBillingService.enterClientAmountForBatch mirrors LivrableBillingService's method of the
 * same name exactly). See docs/superpowers/specs/2026-10-05-ts-wip-design.md.
 *
 * Rebuilt on the @khalilrebhiitec/daf360 library components (daf-card/daf-data-table/
 * daf-button/daf-badge) instead of hand-rolled <table>/<button> — same visual language as
 * the Livrable section of affaire-wip-tab.component.ts (its "WIP en attente"/"En attente de
 * réponse client"/"Historique" cards are the direct reference for this tab's 3 sections).
 */
@Component({
  selector: 'app-affaire-ts-wip-tab',
  standalone: true,
  imports: [
    TranslatePipe, DisplayCurrencyPipe, RouterLink,
    ButtonComponent, CardComponent, CheckboxComponent, FormFieldComponent, StatusBadgeComponent,
    DataTableComponent, DafCellDirective, EmailPreviewModalComponent, AccordionCardComponent,
    SearchToolbarComponent, PaginationComponent, LoadingComponent, NgTemplateOutlet,
  ],
  providers: [DisplayCurrencyPipe],
  template: `
    <div class="flex flex-col gap-6">
      @if (errorMsg()) {
        <div class="rounded-lg bg-danger/10 px-3 py-2 text-body-sm text-danger">{{ errorMsg() }}</div>
      }

      <!-- ── TS prêts à facturer ──────────────────────────────────────────── -->
      <!-- Même repli daf-accordion-card que les cartes Forfait/Régie/Livrable de
           affaire-wip-tab (classe wip-accordion : voir le .scss) — l'en-tête entier est
           le déclencheur, le chevron et l'état ouvert/fermé sont gérés par la lib. -->
      <daf-accordion-card class="wip-accordion"
        [options]="{ title: ('AFFAIRES.WIP.TS_ELIGIBLE_TITLE' | translate), icon: 'receipt_long', variant: 'outlined', radius: 'lg' }"
        [(open)]="eligibleDrawerOpen">
        <div class="flex flex-col gap-4">

          <!-- Solde TS non facturé (carry-forward) : action en un clic, distincte de la
               sélection multiple des TS ci-dessous — le montant a déjà été approuvé par le
               client lors de la confirmation partielle d'origine, aucune nouvelle
               confirmation n'est nécessaire (va directement en EN_ATTENTE_DF). -->
          @if (pendingCarryForward().length > 0) {
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
              <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span class="text-label-caps font-extrabold uppercase tracking-widest text-warning">
                  {{ 'AFFAIRES.WIP.TS_CARRY_FORWARD_TITLE' | translate }}
                </span>
                <span class="font-mono text-[12px] font-bold text-tertiary">{{ pendingCarryForward()[0].tsReference }}</span>
                <span class="text-body-md font-bold text-on-surface">
                  {{ pendingCarryForward()[0].montant | displayCurrency : pendingCarryForward()[0].devise }}
                </span>
              </div>
              <daf-button
                [options]="{ variant: 'teal', label: ('AFFAIRES.WIP.TS_CARRY_FORWARD_SUBMIT' | translate),
                              loading: submittingCarryForward() }"
                (onClick)="submitCarryForward()" />
            </div>
          }

          @if (loadingEligible()) {
            <daf-loading class="ts-loading" [message]="'AFFAIRES.WIP.LOADING' | translate" />
          } @else if (eligible().length === 0) {
            <p class="text-body-sm text-on-surface-variant">{{ 'AFFAIRES.WIP.TS_ELIGIBLE_EMPTY' | translate }}</p>
          } @else {
            <!-- Recherche + Filtres — [card]="false" : déjà dans la daf-accordion-card, comme
                 la barre du tableau Livrable en attente de affaire-wip-tab. -->
            <daf-search-toolbar [card]="false"
              [placeholder]="'COMMON.TABLE.SEARCH_PLACEHOLDER' | translate"
              [value]="eligibleSearch()" [debounce]="200"
              (valueChange)="eligibleSearch.set($event)"
              [filterFields]="eligibleFilterFields()"
              [filterConfig]="eligibleFilterConfig()"
              (filterApply)="onEligibleFilterApply($event)"
              [table]="eligibleTable" />
            <daf-data-table #eligibleTable
              [columns]="eligibleColumns()"
              [rows]="filteredEligibleRows()"
              [config]="eligibleConfig()">

              <ng-template dafCell="select" let-row>
                <daf-checkbox
                  [checked]="selection.ids().has(row['id'])"
                  (checkedChange)="selection.toggle(row['id'], affaire.id)" />
              </ng-template>

              <ng-template dafCell="reference" let-row>
                <span class="font-mono text-[12px] font-bold text-tertiary">{{ row['reference'] }}</span>
              </ng-template>
            </daf-data-table>

            @if (selection.ids().size > 0) {
              <!-- Nouveau pour la cohérence avec AV/Régie/Livrable (voir tsManualVerified
                   dans le .ts) — TS n'avait aucune vérification manuelle avant. Remise à
                   false dès que la sélection change (voir l'effect() du constructeur). -->
              <daf-checkbox
                [checked]="tsManualVerified()"
                [options]="{ label: ('AFFAIRES.WIP.MANUAL_VERIFY_LABEL' | translate) }"
                (checkedChange)="tsManualVerified.set($event)" />

              <!-- Même avertissement "Reporté / Nouveau calcul / Total à valider" que la carte
                   Régie (voir affaire-wip-tab.component.html, bloc carriedForwardAmount) — le
                   solde non facturé ci-dessus (pendingCarryForward) est automatiquement replié
                   sur CETTE soumission par TsBillingService.submitTs() dès qu'elle contient au
                   moins un nouveau TS (voir buildTsLines côté backend) : sans ce bloc, le
                   montant affiché ("Total sélectionné") ne correspondait pas à ce qui allait
                   réellement être soumis. -->
              @if (pendingCarryForward().length > 0) {
                <div class="rounded-lg bg-warning/10 border border-warning/30 p-3 flex flex-col gap-1">
                  <p class="text-[12px] font-semibold text-warning">{{ 'AFFAIRES.WIP.TS_CARRY_FORWARD_TITLE' | translate }}</p>
                  <div class="grid grid-cols-3 gap-2 text-[12px]">
                    <span>{{ 'AFFAIRES.WIP.CARRIED_FORWARD_PREVIOUS' | translate }}:
                      <strong>{{ pendingCarryForward()[0].montant | displayCurrency : pendingCarryForward()[0].devise }}</strong></span>
                    <span>{{ 'AFFAIRES.WIP.CARRIED_FORWARD_NEW' | translate }}:
                      <strong>{{ selectedTotal() | displayCurrency : affaire.devise }}</strong></span>
                    <span>{{ 'AFFAIRES.WIP.CARRIED_FORWARD_TOTAL' | translate }}:
                      <strong>{{ selectedTotalWithCarryForward() | displayCurrency : affaire.devise }}</strong></span>
                  </div>
                </div>
              }

              <!-- Même habillage "pastille d'icônes" que les boutons Soumettre AV/Régie/
                   Livrable (voir .wip-icon-actions dans le .scss) pour une cohérence visuelle
                   totale entre les 4 modes WIP. -->
              <div class="grid items-end gap-4" style="grid-template-columns: auto 1fr auto;">
                <div style="grid-column:1">
                  <p class="text-[11px] uppercase tracking-wide text-on-surface-variant">
                    {{ 'AFFAIRES.WIP.TS_SELECTED_COUNT' | translate: { count: selection.ids().size } }}
                  </p>
                  <p class="text-[20px] font-black text-success">
                    {{ selectedTotalWithCarryForward() | displayCurrency : affaire.devise }}
                  </p>
                </div>
                <div style="grid-column:3" class="wip-icon-actions flex items-center gap-1
                            bg-white/90 backdrop-blur-sm p-1 rounded-lg border border-outline-variant shadow-sm">
                  <daf-button [options]="{ variant: 'ghost', size: 'sm', iconStart: 'send',
                                            title: ('AFFAIRES.WIP.TS_SUBMIT' | translate),
                                            loading: submitting(), disabled: !tsManualVerified() || submitting() }"
                    (onClick)="submitSelection()" />
                </div>
              </div>
            }
          }
        </div>
      </daf-accordion-card>

      <!-- ── Soumissions en cours ─────────────────────────────────────────── -->
      @if (loadingActive()) {
        <daf-loading class="ts-loading" [message]="'AFFAIRES.WIP.LOADING' | translate" />
      } @else if (active().length > 0) {
        <!-- Tableau sans daf-card, posé directement dans l'onglet comme le tableau
             d'historique de affaire-wip-tab. -->
        <div class="flex flex-col gap-4">
          <!-- Titre + Recherche/Filtres dans une même carte : daf-search-toolbar n'a pas
               d'emplacement de titre, on reprend donc sa propre carte (mêmes options que
               celle qu'elle dessine avec [card]=true) et on y pose le titre au-dessus. -->
          <daf-card [options]="{ variant: 'glass', padding: 'none', radius: 'xl' }">
            <h3 class="ts-toolbar-title flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
              <span class="material-symbols-outlined text-[18px]">pending_actions</span>
              {{ 'AFFAIRES.WIP.TS_ACTIVE_TITLE' | translate }}
            </h3>
            <daf-search-toolbar [card]="false"
              [placeholder]="'COMMON.TABLE.SEARCH_PLACEHOLDER' | translate"
              [value]="activeSearch()" [debounce]="200"
              (valueChange)="activeSearch.set($event)"
              [filterFields]="activeFilterFields()"
              [filterConfig]="activeFilterConfig()"
              (filterApply)="onActiveFilterApply($event)"
              [table]="activeTable" />
          </daf-card>
          <daf-data-table #activeTable
            [columns]="activeColumns()"
            [rows]="filteredActiveRows()"
            [config]="activeConfig()">

            <ng-template dafCell="factureProgress" let-row>
              <ng-container [ngTemplateOutlet]="factureProgressCell" [ngTemplateOutletContext]="{ $implicit: row }" />
            </ng-template>

            <ng-template dafCell="actions" let-row>
              @if (row['_raw'].statut === 'EN_ATTENTE_CLIENT') {
                <!-- Confirmer = petit bouton icône (même check_circle que l'action
                     "validateClient" de l'historique AV de affaire-wip-tab), placé AVANT le
                     champ du montant ; le libellé passe en infobulle (title). -->
                <div class="flex items-center justify-end gap-2">
                  <div class="wip-icon-actions flex items-center">
                    <daf-button
                      [options]="{ variant: 'ghost', size: 'sm', iconStart: 'check_circle',
                                    title: ('AFFAIRES.WIP.CLIENT_AMOUNT_CONFIRM' | translate),
                                    loading: submittingClientBatch() === row['_raw'].batchId,
                                    disabled: getClientAmountInput(row['_raw'].batchId) === null ||
                                              getClientAmountInput(row['_raw'].batchId)! < 0 ||
                                              getClientAmountInput(row['_raw'].batchId)! > row['_raw'].combinedMontant }"
                      (onClick)="confirmClientAmount(row['_raw'])" />
                  </div>
                  <daf-form-field
                    [value]="getClientAmountInput(row['_raw'].batchId)"
                    (valueChange)="setClientAmountInput(row['_raw'].batchId, $any($event))"
                    [options]="{ label: ('AFFAIRES.WIP.CLIENT_AMOUNT_LABEL' | translate),
                                  type: 'number', fullWidth: true,
                                  hint: ('AFFAIRES.WIP.CLIENT_AMOUNT_HINT' | translate) }" />
                </div>
              }
            </ng-template>
          </daf-data-table>

          @if (clientAmountError()) {
            <p class="text-body-sm text-danger">{{ clientAmountError() }}</p>
          }
        </div>
      }

      <!-- ── Historique ───────────────────────────────────────────────────── -->
      @if (loadingHistory()) {
        <daf-loading class="ts-loading" [message]="'AFFAIRES.WIP.LOADING' | translate" />
      } @else if (history().length > 0) {
        <!-- Sans daf-card, même raison que "Soumissions en cours" ci-dessus. -->
        <div class="flex flex-col gap-4">
          <!-- Même carte titre + barre que "Soumissions en cours" ci-dessus, plus à droite du
               titre le compteur et les actions Export Excel / Afficher tout — même pastille
               révélée au survol que la carte Historique Livrable de affaire-wip-tab. -->
          <daf-card [options]="{ variant: 'glass', padding: 'none', radius: 'xl' }"
            (mouseenter)="historyCardHovered.set(true)"
            (mouseleave)="historyCardHovered.set(false)">
            <div class="ts-toolbar-title flex items-center justify-between gap-2">
              <h3 class="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                <span class="material-symbols-outlined text-[18px]">history</span>
                {{ 'AFFAIRES.WIP.TS_HISTORY_TITLE' | translate }}
              </h3>
              <div class="flex items-center gap-2">
                <daf-badge [label]="history().length + ' ' + ('AFFAIRES.WIP.HISTORY_COUNT_UNIT' | translate)"
                  [options]="{ variant: 'neutral', size: 'sm' }" />
                <div class="wip-icon-actions flex items-center gap-1 transition-opacity duration-200
                            bg-white/90 backdrop-blur-sm p-1 rounded-lg border border-outline-variant shadow-sm"
                  [class.opacity-0]="!historyCardHovered()"
                  [class.opacity-100]="historyCardHovered()"
                  [class.pointer-events-none]="!historyCardHovered()">
                  <daf-button [options]="{ variant: 'ghost', size: 'sm', iconStart: 'download',
                                            title: ('AFFAIRES.WIP.EXPORT_EXCEL' | translate),
                                            disabled: !filteredHistoryRows().length }"
                    (onClick)="exportHistoryExcel(filteredHistoryRows())" />
                  <daf-button [options]="{ variant: 'ghost', size: 'sm', iconStart: 'open_in_full',
                                            title: ('AFFAIRES.WIP.HISTORY_SHOW_ALL' | translate) }"
                    (onClick)="openHistoryPopup()" />
                </div>
              </div>
            </div>
            <daf-search-toolbar [card]="false"
              [placeholder]="'COMMON.TABLE.SEARCH_PLACEHOLDER' | translate"
              [value]="historySearch()" [debounce]="200"
              (valueChange)="historySearch.set($event)"
              [filterFields]="historyFilterFields()"
              [filterConfig]="historyFilterConfig()"
              (filterApply)="onHistoryFilterApply($event)"
              [table]="historyTable" />
          </daf-card>
          <daf-data-table #historyTable [columns]="historyColumns()" [rows]="filteredHistoryRows()" [config]="historyConfig()">
            <ng-template dafCell="factureProgress" let-row>
              <ng-container [ngTemplateOutlet]="factureProgressCell" [ngTemplateOutletContext]="{ $implicit: row }" />
            </ng-template>
            <ng-template dafCell="statut" let-row>
              <ng-container [ngTemplateOutlet]="historyStatutCell" [ngTemplateOutletContext]="{ $implicit: row }" />
            </ng-template>
          </daf-data-table>
        </div>
      }

      <!-- Cellules partagées par les tableaux Soumissions en cours, Historique ET la popup "Afficher tout" (un
           dafCell appartient à UN daf-data-table, d'où le relais par ngTemplateOutlet). -->

      <!-- Même montant/colonne "Facturé" que la carte AV (tauxHistoryColumns/Rows,
           dafCell="factureProgress") : X/Y + badge Complet/Partiel, X calculé en
           remontant la chaîne carriedForwardFromLineId jusqu'à son dernier maillon
           (findChainTail) -- une relance partielle (client ou assistant de facturation)
           laisse X < Y sans jamais changer Y (originalMontant, fixe depuis la
           soumission). -->
      <ng-template #factureProgressCell let-row>
        @if (row['_remainderPending'] === null) {
          —
        } @else {
          <div class="flex flex-col gap-1">
            <span class="text-[12px] whitespace-nowrap">
              {{ row['_montantFacture'] | displayCurrency : affaire.devise }} / {{ row['_raw'].originalMontant | displayCurrency : affaire.devise }}
            </span>
            @if (row['_isComplete']) {
              <daf-badge [label]="'AFFAIRES.WIP.FACTURE_COMPLETE' | translate"
                [options]="{ variant: 'success', size: 'sm', dot: true }" />
            } @else {
              <daf-badge [label]="'AFFAIRES.WIP.FACTURE_PARTIAL' | translate:{ amount: (row['_remainderPending'] | displayCurrency:affaire.devise) }"
                [options]="{ variant: 'warning', size: 'sm', dot: true }" />
            }
          </div>
        }
      </ng-template>

      <ng-template #historyStatutCell let-row>
        <!-- invoiceId n'est renseigné qu'une fois FACTURE (voir TsBillingService),
             sa seule présence suffit -- pas besoin de revérifier row['_raw'].statut. -->
        <daf-badge [label]="'AFFAIRES.WIP.BATCH_STATUS_' + row['_raw'].statut | translate"
          [options]="{ variant: tsBatchBadgeVariant(row['_raw'].statut), size: 'sm' }" />
        @if (row['_raw'].invoiceId) {
          <a [routerLink]="['/finance/invoicing', row['_raw'].invoiceId]"
            class="mt-1 block text-[11px] font-semibold text-tertiary hover:underline">
            {{ 'AFFAIRES.DETAIL.MODAL.OPEN_INVOICE' | translate }}
          </a>
        }
      </ng-template>

      <!-- Popup "Afficher tout" de l'historique TS, EN PLEIN ÉCRAN — même coquille que la
           popup Historique Livrable de affaire-wip-tab (portail sous <body>, voir
           historyOverlayRef dans le .ts), mêmes recherche/filtres que le tableau de
           l'onglet, plus tri sur tout le jeu filtré, pagination et export. -->
      @if (showHistoryPopup()) {
        <div #historyOverlay class="fixed inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm"
             style="z-index:9999"
             (click)="showHistoryPopup.set(false)">
          <div class="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
               style="width:calc(100vw - 120px); height:90vh;"
               (click)="$event.stopPropagation()">
            <div class="flex items-center justify-between px-8 py-6 border-b border-outline-variant/20 shrink-0">
              <h2 class="flex items-center gap-3 text-headline-lg text-on-surface m-0 p-0">
                <span class="material-symbols-outlined text-primary">history</span>
                {{ 'AFFAIRES.WIP.TS_HISTORY_TITLE' | translate }}
              </h2>
              <button type="button" (click)="showHistoryPopup.set(false)"
                class="w-9 h-9 flex items-center justify-center rounded-lg text-on-surface-variant
                       hover:text-on-surface hover:bg-surface-container transition-colors"
                [attr.aria-label]="'ADMIN.COMMON.BACK' | translate">
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
            <div class="flex-1 overflow-y-auto px-8 py-6 flex flex-col gap-3">
              <div class="flex items-center gap-2 bg-white rounded-xl p-2">
                <daf-search-toolbar class="flex-1" [card]="false"
                  [placeholder]="'COMMON.TABLE.SEARCH_PLACEHOLDER' | translate"
                  [value]="historySearch()" [debounce]="200"
                  (valueChange)="onHistoryPopupSearch($event)"
                  [filterFields]="historyFilterFields()"
                  [filterConfig]="historyFilterConfig()"
                  (filterApply)="onHistoryFilterApply($event)"
                  [table]="historyPopupTable" />
                <daf-button [options]="{ variant: 'ghost', size: 'sm', iconStart: 'download',
                                          label: ('AFFAIRES.WIP.EXPORT_EXCEL' | translate),
                                          disabled: !filteredHistoryRows().length }"
                  (onClick)="exportHistoryExcel(sortedHistoryRows())" />
              </div>
              <daf-data-table #historyPopupTable [columns]="historyColumns()" [rows]="paginatedHistoryRows()" [config]="historyPopupConfig()"
                (sortChange)="onHistoryPopupSort($event)" (resetClick)="onHistoryPopupSort(null)">
                <ng-template dafCell="factureProgress" let-row>
                  <ng-container [ngTemplateOutlet]="factureProgressCell" [ngTemplateOutletContext]="{ $implicit: row }" />
                </ng-template>
                <ng-template dafCell="statut" let-row>
                  <ng-container [ngTemplateOutlet]="historyStatutCell" [ngTemplateOutletContext]="{ $implicit: row }" />
                </ng-template>
              </daf-data-table>
              <daf-pagination class="wip-pagination"
                [currentPage]="historyPage()"
                [totalPages]="historyTotalPages()"
                [totalElements]="filteredHistoryRows().length"
                [pageSize]="historyPageSize()"
                [perPageLabel]="'AFFAIRES.WIP.HISTORY_PER_PAGE' | translate"
                [summaryLabel]="'AFFAIRES.WIP.HISTORY_SUMMARY' | translate"
                [firstPageLabel]="'AFFAIRES.WIP.HISTORY_FIRST_PAGE' | translate"
                [lastPageLabel]="'AFFAIRES.WIP.HISTORY_LAST_PAGE' | translate"
                [config]="{ showFirstLast: true }"
                (pageChange)="historyPage.set($event)"
                (pageSizeChange)="onHistoryPageSizeChange($event)" />
            </div>
          </div>
        </div>
      }

      <app-email-preview-modal #emailPreviewModal />
    </div>
  `,
  styleUrl: './affaire-ts-wip-tab.component.scss',
})
export class AffaireTsWipTabComponent implements OnInit, OnDestroy {
  /** `reference` ne sert qu'au nom du fichier Excel exporté (repli sur l'id). */
  @Input({ required: true }) affaire!: { id: number; devise: string; reference?: string | null };
  @Output() readonly dataChanged = new EventEmitter<void>();

  private readonly svc       = inject(BillingService);
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);
  private readonly document  = inject(DOCUMENT);
  private readonly renderer  = inject(Renderer2);

  /** Popup partagée avec AffaireWipTabComponent (AV/Régie/Livrable) montrant l'email de
   * confirmation client avant le vrai envoi — voir email-preview-modal.component.ts. */
  private readonly emailPreviewModal = viewChild.required<EmailPreviewModalComponent>('emailPreviewModal');

  readonly selection = new RowSelection();

  loadingEligible = signal(false);
  loadingActive   = signal(false);
  loadingHistory  = signal(false);
  eligible  = signal<TsDto[]>([]);
  active    = signal<TsBatchDto[]>([]);
  history   = signal<TsBatchDto[]>([]);
  /** Every TS BillingLine ever created for this affaire, flat (not grouped by batch) — same
   * generic endpoint AffaireWipTabComponent's own avLineHistory reads (getBillingLinesDetailed),
   * needed so historyRows' findChainTail() can see consumer lines a manual "Ajouter un solde
   * WIP non facturé" invoice pick created, even though they may not share the original
   * batch's batchId. */
  tsLineHistory = signal<LineDetailDto[]>([]);
  submitting = signal(false);
  errorMsg   = signal<string | null>(null);

  /** Nouveau pour la cohérence avec AV's avManualVerified/Régie's wipManualVerified/
   * Livrable's livrableManualVerified — jamais envoyée au backend, purement locale. Remise à
   * false dès que la sélection change (ajout/retrait d'un TS) : une vérification faite sur un
   * montant ne doit pas rester valable pour un montant différent. */
  tsManualVerified = signal(false);

  constructor() {
    effect(() => {
      this.selection.ids();
      this.tsManualVerified.set(false);
    });

    // Popup "Afficher tout" déplacée sous <body> — même portail que historyOverlayRef de
    // AffaireWipTabComponent : `position: fixed` se cale sur le premier ancêtre portant un
    // transform/filter (conteneur de la sidebar du shell, daf-card 'glass'), pas sur le
    // viewport ; sans ça la popup ne couvrirait pas toute la page.
    effect(onCleanup => {
      const ref = this.historyOverlayRef();
      if (!ref || !this.showHistoryPopup()) return;

      const node = ref.nativeElement;
      if (node.parentElement !== this.document.body) {
        this.renderer.appendChild(this.document.body, node);
        this.historyOverlayPortaled = node;
      }

      onCleanup(() => {
        // Angular retire la vue du `@if` de son parent D'ORIGINE : le nœud ayant été déplacé
        // sous <body>, on le retire nous-mêmes avant.
        node.remove();
        if (this.historyOverlayPortaled === node) this.historyOverlayPortaled = null;
      });
    });
  }

  ngOnDestroy(): void {
    // Déplacée sous <body>, la popup n'est plus là où le template l'a créée : Angular ne la
    // nettoierait pas seul si l'onglet est quitté popup ouverte.
    this.historyOverlayPortaled?.remove();
    this.historyOverlayPortaled = null;
  }

  // ── Historique : actions de la carte + popup "Afficher tout" ──────────────────
  /** Révèle la pastille Export / Afficher tout au survol de la carte, comme
   * livrableHistoryCardHovered de AffaireWipTabComponent. */
  historyCardHovered = signal(false);
  showHistoryPopup   = signal(false);

  private readonly historyOverlayRef = viewChild<ElementRef<HTMLElement>>('historyOverlay');
  private historyOverlayPortaled: HTMLElement | null = null;

  /** Pagination de la popup — `currentPage` de daf-pagination est 0-indexé. */
  historyPage     = signal(0);
  historyPageSize = signal(20);

  /** Tri de la popup : elle pagine côté client, le tri porte donc sur tout le jeu filtré
   * AVANT la découpe (sortTableRows) et la config passe `manualSort` pour que la lib ne
   * retrie pas la seule page affichée. */
  readonly historyPopupSort = signal<TableSort | null>(null);

  readonly historyPopupConfig = computed<TableConfig>(() => ({
    ...this.historyConfig(),
    ...delegatedSort(untracked(this.historyPopupSort)),
  }));

  readonly sortedHistoryRows = computed(() =>
    sortTableRows(this.filteredHistoryRows(), this.historyColumns(), this.historyPopupSort()));

  readonly historyTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredHistoryRows().length / this.historyPageSize())));

  readonly paginatedHistoryRows = computed(() => {
    const size = this.historyPageSize();
    const page = Math.min(this.historyPage(), this.historyTotalPages() - 1);
    return this.sortedHistoryRows().slice(page * size, page * size + size);
  });

  openHistoryPopup(): void {
    this.historyPage.set(0);
    this.showHistoryPopup.set(true);
  }

  /** Recherche, filtres, tri et taille de page repassent à la page 0 — sinon une page 3
   * resterait affichée après un filtre qui ne renvoie qu'une page de résultats. */
  onHistoryPopupSearch(value: string): void {
    this.historySearch.set(value);
    this.historyPage.set(0);
  }

  onHistoryPopupSort(event: Parameters<typeof toTableSort>[0]): void {
    this.historyPopupSort.set(toTableSort(event));
    this.historyPage.set(0);
  }

  onHistoryPageSizeChange(size: number): void {
    this.historyPageSize.set(size);
    this.historyPage.set(0);
  }

  /** Export xlsx de l'historique TS — même bibliothèque et même schéma que
   * exportLivrableHistoryExcel() de AffaireWipTabComponent. Reçoit les lignes déjà
   * filtrées (carte) ou filtrées + triées (popup) : on exporte ce qui est affiché. */
  exportHistoryExcel(rows: TableRow[]): void {
    if (!rows.length) return;
    const t = (k: string) => this.translate.instant(k);
    const data = rows.map(row => {
      const b = row['_raw'] as TsBatchDto;
      const facture = row['_montantFacture'] as number | null;
      return {
        [t('AFFAIRES.WIP.TS_COL_REFERENCE')]:     this.batchReferences(b),
        [t('AFFAIRES.WIP.TS_COL_MONTANT')]:       this.currency.transform(b.originalMontant, this.affaire.devise),
        [t('AFFAIRES.WIP.TS_COL_MT_CLIENT')]:     b.clientApprovedAmount != null
          ? this.currency.transform(b.clientApprovedAmount, this.affaire.devise) : '—',
        [t('AFFAIRES.WIP.COL_FACTURE_PROGRESS')]: facture != null
          ? this.currency.transform(facture, this.affaire.devise) : '—',
        [t('AFFAIRES.WIP.TS_COL_STATUT')]:        t('AFFAIRES.WIP.BATCH_STATUS_' + b.statut),
        [t('AFFAIRES.WIP.TS_COL_DATE')]:          this.formatDate(b.billingDate),
      };
    });
    const wb = XLSX.utils.book_new();
    // Nom d'onglet Excel : 31 caractères max.
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), t('AFFAIRES.WIP.TS_HISTORY_TITLE').slice(0, 31));
    const affaireRef = this.affaire.reference ?? String(this.affaire.id);
    XLSX.writeFile(wb, `Historique_TS_${affaireRef}.xlsx`);
  }

  /** Repli de la carte "TS prêts à facturer" — fermée par défaut, comme
   * forfaitDrawerOpen/regieDrawerOpen/livrableDrawerOpen de AffaireWipTabComponent. */
  eligibleDrawerOpen = signal(false);

  pendingCarryForward    = signal<TsPendingCarryForwardDto[]>([]);
  submittingCarryForward = signal(false);

  // ── Client-amount confirmation — même pattern que AffaireWipTabComponent's own
  // livrableClientAmountInputs: starts empty (no pre-fill) for every batch until the user
  // types a value, matching the real, established behavior exactly. ──
  clientAmountInputs    = signal<Map<number, number | null>>(new Map());
  submittingClientBatch = signal<number | null>(null);
  clientAmountError     = signal<string | null>(null);

  // ── Colonnes/lignes "TS prêts à facturer" ──────────────────────────────────
  readonly eligibleColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    // Même tri local sur valeurs brutes que activeColumns/historyColumns. La case à cocher
    // reste non triable (et sans libellé, donc ignorée par la recherche).
    return [
      { key: 'select',    label: '', type: 'custom', width: '40px' },
      { key: 'reference', label: t('AFFAIRES.WIP.TS_COL_REFERENCE'), type: 'custom', sortable: true },
      { key: 'intitule',  label: t('AFFAIRES.WIP.TS_COL_INTITULE'), sortable: true },
      { key: 'montant',   label: t('AFFAIRES.WIP.TS_COL_MONTANT'), align: 'right', sortable: true,
        sortAccessor: row => (row['_raw'] as TsDto).montantEstime },
    ];
  });

  readonly eligibleRows = computed<TableRow[]>(() => this.eligible().map(ts => ({
    id:        ts.id,
    reference: ts.referenceTs,
    intitule:  ts.intitule,
    montant:   this.currency.transform(ts.montantEstime, ts.devise),
    _raw:      ts,
  } satisfies TableRow)));

  readonly eligibleConfig = computed<TableConfig>(() => ({
    showHeader: true,
    hoverable:  false,
    emptyMessage: this.translate.instant('AFFAIRES.WIP.TS_ELIGIBLE_EMPTY'),
    ...tableTools(this.translate),
  }));

  readonly selectedTotal = computed(() => {
    const ids = this.selection.ids();
    return this.eligible()
      .filter(ts => ids.has(ts.id))
      .reduce((sum, ts) => sum + ts.montantEstime, 0);
  });

  /** What submitSelection() will actually submit — TsBillingService.submitTs() silently folds
   * any pending carry-forward onto the first line of a new submission (see buildTsLines), so
   * the amount shown to the user before they click "Soumettre" must include it too, exactly
   * like Régie's own carriedForwardAmount + totalSell display. */
  readonly selectedTotalWithCarryForward = computed(() =>
    this.selectedTotal() + (this.pendingCarryForward()[0]?.montant ?? 0));

  // ── Colonnes/lignes "Soumissions en cours" ─────────────────────────────────
  readonly activeColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    // Tri local sur les valeurs brutes (le montant affiché est une chaîne formatée), comme
    // tauxHistoryColumns de AffaireWipTabComponent. La colonne Actions (saisie) reste non triable.
    const raw = (row: TableRow) => row['_raw'] as TsBatchDto;
    return [
      { key: 'reference', label: t('AFFAIRES.WIP.TS_COL_REFERENCE'), sortable: true },
      { key: 'montant',   label: t('AFFAIRES.WIP.TS_COL_MONTANT'), align: 'right', sortable: true,
        sortAccessor: row => raw(row).combinedMontant },
      // Mêmes colonnes « Mt client » et « Facturé » que historyColumns.
      { key: 'montantClient', label: t('AFFAIRES.WIP.TS_COL_MT_CLIENT'), align: 'right', sortable: true,
        sortAccessor: row => raw(row).clientApprovedAmount },
      { key: 'factureProgress', label: t('AFFAIRES.WIP.COL_FACTURE_PROGRESS'), type: 'custom', sortable: true,
        sortAccessor: row => row['_montantFacture'] as number | null },
      { key: 'statut',    label: t('AFFAIRES.WIP.TS_COL_STATUT'), type: 'badge', sortable: true },
      { key: 'actions',   label: t('AFFAIRES.WIP.TS_COL_ACTIONS'), type: 'custom', align: 'right' },
    ];
  });

  readonly activeRows = computed<TableRow[]>(() => {
    const lines = this.tsLineHistory();
    return this.active().map(b => ({
      id:        b.batchId,
      reference: this.batchReferences(b),
      montant:   this.currency.transform(b.combinedMontant, this.affaire.devise),
      montantClient: this.formatClientAmount(b),
      statut:    { label: this.translate.instant('AFFAIRES.WIP.BATCH_STATUS_' + b.statut),
                   options: { variant: this.tsBatchBadgeVariant(b.statut), size: 'sm' } } satisfies BadgeCell,
      _raw:      b,
      ...this.factureProgress(b, lines),
    } satisfies TableRow));
  });

  readonly activeConfig = computed<TableConfig>(() => ({
    showHeader: true,
    hoverable:  false,
    ...tableTools(this.translate),
  }));

  // ── Colonnes/lignes "Historique" ────────────────────────────────────────────
  readonly historyColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    // Même tri local sur valeurs brutes que activeColumns ; la date se trie sur la valeur ISO
    // (la cellule affiche '15 sept. 2026', qui ne se trie pas chronologiquement).
    const raw = (row: TableRow) => row['_raw'] as TsBatchDto;
    return [
      { key: 'reference',    label: t('AFFAIRES.WIP.TS_COL_REFERENCE'), sortable: true },
      { key: 'montant',      label: t('AFFAIRES.WIP.TS_COL_MONTANT'), align: 'right', sortable: true,
        sortAccessor: row => raw(row).originalMontant },
      { key: 'montantClient', label: t('AFFAIRES.WIP.TS_COL_MT_CLIENT'), align: 'right', sortable: true,
        sortAccessor: row => raw(row).clientApprovedAmount },
      { key: 'factureProgress', label: t('AFFAIRES.WIP.COL_FACTURE_PROGRESS'), type: 'custom', sortable: true,
        sortAccessor: row => row['_montantFacture'] as number | null },
      { key: 'statut',       label: t('AFFAIRES.WIP.TS_COL_STATUT'), type: 'custom', sortable: true },
      { key: 'date',         label: t('AFFAIRES.WIP.TS_COL_DATE'), sortable: true,
        sortAccessor: row => raw(row).billingDate },
    ];
  });

  /** Même mécanique que AffaireWipTabComponent.findChainTail() (AV) : une relance de facture
   * (manuelle, via "Ajouter un solde WIP non facturé") ou une confirmation client partielle ne
   * MODIFIE jamais la ligne d'origine -- elle crée une nouvelle BillingLine dont
   * carriedForwardFromLineId pointe vers la précédente, avec son propre wipCarriedForward plus
   * petit. Remonter jusqu'au dernier maillon donne donc ce qui reste réellement non facturé
   * MAINTENANT, quel que soit le nombre de relances déjà survenues. Plafonné à 50 sauts, même
   * garde-fou qu'AV contre une chaîne corrompue qui boucle sur elle-même. */
  private findChainTail(line: LineDetailDto, lines: LineDetailDto[]): LineDetailDto {
    let tail = line;
    for (let i = 0; i < 50; i++) {
      const next = lines.find(l => l.carriedForwardFromLineId === tail.id);
      if (!next) break;
      tail = next;
    }
    return tail;
  }

  readonly historyRows = computed<TableRow[]>(() => {
    const lines = this.tsLineHistory();
    return this.history().map(b => ({
      id:             b.batchId,
      reference:      this.batchReferences(b),
      montant:        this.currency.transform(b.originalMontant, this.affaire.devise),
      montantClient:  this.formatClientAmount(b),
      date:           this.formatDate(b.billingDate),
      // Libellé texte du statut (rendu par dafCell="statut") — lu par la recherche.
      statut:         this.translate.instant('AFFAIRES.WIP.BATCH_STATUS_' + b.statut),
      _raw:           b,
      ...this.factureProgress(b, lines),
    } satisfies TableRow));
  });

  /** Champs `_remainderPending` / `_montantFacture` / `_isComplete` lus par la cellule
   * « Facturé » (factureProgressCell), partagés par Soumissions en cours et Historique.
   * batchId EST l'id de la ligne leader (convention établie par submitTs()/toBatchDto()) —
   * c'est elle, et seulement elle, qui porte jamais un wipCarriedForward pour ce batch. */
  private factureProgress(b: TsBatchDto, lines: LineDetailDto[]) {
    const leaderLine = lines.find(l => l.id === b.batchId) ?? null;
    const tail = leaderLine ? this.findChainTail(leaderLine, lines) : null;
    const remainderPending = tail ? Number((tail.wipCarriedForward ?? 0).toFixed(3)) : null;
    const montantFacture = remainderPending !== null
      ? Number((b.originalMontant - remainderPending).toFixed(3))
      : null;
    return {
      _remainderPending: remainderPending,
      _montantFacture:   montantFacture,
      _isComplete:       remainderPending !== null && remainderPending < 0.01,
    };
  }

  private formatClientAmount(b: TsBatchDto): string {
    return b.clientApprovedAmount != null
      ? this.currency.transform(b.clientApprovedAmount, this.affaire.devise) : '—';
  }

  readonly historyConfig = computed<TableConfig>(() => ({
    showHeader: true,
    hoverable:  false,
    emptyMessage: this.translate.instant('AFFAIRES.WIP.TS_HISTORY_EMPTY'),
    ...tableTools(this.translate),
  }));

  // ── Recherche + Filtres des trois tableaux — même mécanique que tauxHistory* de
  // AffaireWipTabComponent (daf-search-toolbar + panneau Filtres, valeurs à plat). ──
  readonly eligibleSearch  = signal('');
  readonly eligibleFilters = signal<TsFilterValues>({});

  readonly eligibleFilterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    return [...this.amountRangeFields(), {
      name:  'integre',
      label: this.translate.instant('AFFAIRES.WIP.TS_FILTER_INTEGRE_AT'),
      type:  'daterange',
    }];
  });

  readonly eligibleFilterConfig = computed<SearchToolbarFilterConfig>(() => ({
    initialValues: this.filterSeed(this.eligibleFilters(), []),
  }));

  onEligibleFilterApply(result: FilterResult): void {
    this.eligibleFilters.set(this.normalizeFilters(result, ['integre']));
  }

  /** Ne filtre que l'AFFICHAGE : une case cochée puis masquée par la recherche reste dans
   * la sélection (selectedTotal lit eligible(), pas ces lignes) — même comportement que la
   * sélection des livrables en attente de AffaireWipTabComponent. */
  readonly filteredEligibleRows = computed(() => {
    const f     = this.eligibleFilters();
    const min   = this.parseAmount(this.filterText(f, 'amountMin'));
    const max   = this.parseAmount(this.filterText(f, 'amountMax'));
    const range = this.dayRange(f['integre']);
    const rows = this.eligibleRows().filter(row => {
      const ts = row['_raw'] as TsDto;
      if (min != null && ts.montantEstime < min) return false;
      if (max != null && ts.montantEstime > max) return false;
      // Un TS sans date d'intégration est exclu dès qu'une plage est choisie.
      const day = ts.integreAuBudgetAt?.slice(0, 10) ?? '';
      if (range && !(day && day >= range[0] && day <= range[1])) return false;
      return true;
    });
    return searchTableRows(rows, this.eligibleColumns(), this.eligibleSearch());
  });

  readonly activeSearch  = signal('');
  readonly activeFilters = signal<TsFilterValues>({});

  readonly activeFilterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    return [this.statutField(this.active()), ...this.amountRangeFields(), this.tsField(this.active())];
  });

  readonly activeFilterConfig = computed<SearchToolbarFilterConfig>(() => ({
    initialValues: this.filterSeed(this.activeFilters(), ['statut', 'ts']),
  }));

  onActiveFilterApply(result: FilterResult): void {
    this.activeFilters.set(this.normalizeFilters(result));
  }

  readonly filteredActiveRows = computed(() => {
    const f      = this.activeFilters();
    const statut = this.filterText(f, 'statut');
    const min    = this.parseAmount(this.filterText(f, 'amountMin'));
    const max    = this.parseAmount(this.filterText(f, 'amountMax'));
    const ts     = this.filterText(f, 'ts');
    const rows = this.activeRows().filter(row => {
      const b = row['_raw'] as TsBatchDto;
      if (statut && b.statut !== statut) return false;
      if (min != null && b.combinedMontant < min) return false;
      if (max != null && b.combinedMontant > max) return false;
      if (ts && !this.batchHasTs(b, ts)) return false;
      return true;
    });
    return searchTableRows(rows, this.activeColumns(), this.activeSearch());
  });

  readonly historySearch  = signal('');
  readonly historyFilters = signal<TsFilterValues>({});

  readonly historyFilterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [this.statutField(this.history()), {
      name:  'date',
      label: t('AFFAIRES.WIP.TS_COL_DATE'),
      type:  'daterange',
    }, ...this.amountRangeFields(), {
      name:    'invoicing',
      label:   t('AFFAIRES.WIP.FILTER_INVOICING'),
      type:    'select',
      options: (['NONE', 'PARTIAL', 'FULL'] as const)
        .map(value => ({ value, label: t('AFFAIRES.WIP.FILTER_INVOICING_' + value) })),
    }, this.tsField(this.history())];
  });

  readonly historyFilterConfig = computed<SearchToolbarFilterConfig>(() => ({
    initialValues: this.filterSeed(this.historyFilters(), ['statut', 'invoicing', 'ts']),
  }));

  onHistoryFilterApply(result: FilterResult): void {
    this.historyFilters.set(this.normalizeFilters(result, ['date']));
    this.historyPage.set(0);
  }

  readonly filteredHistoryRows = computed(() => {
    const f      = this.historyFilters();
    const statut = this.filterText(f, 'statut');
    const range  = this.dayRange(f['date']);
    const min    = this.parseAmount(this.filterText(f, 'amountMin'));
    const max    = this.parseAmount(this.filterText(f, 'amountMax'));
    const billed = this.filterText(f, 'invoicing');
    const ts     = this.filterText(f, 'ts');
    const rows = this.historyRows().filter(row => {
      const b = row['_raw'] as TsBatchDto;
      const day = b.billingDate?.slice(0, 10) ?? '';
      if (statut && b.statut !== statut) return false;
      if (range && !(day >= range[0] && day <= range[1])) return false;
      if (min != null && b.originalMontant < min) return false;
      if (max != null && b.originalMontant > max) return false;
      if (billed && this.historyInvoicing(row) !== billed) return false;
      if (ts && !this.batchHasTs(b, ts)) return false;
      return true;
    });
    return searchTableRows(rows, this.historyColumns(), this.historySearch());
  });

  /** Avancement de la facturation d'un lot — mêmes valeurs que la colonne « Facturé »
   *  (`_isComplete` / `_montantFacture`, voir historyRows). */
  private historyInvoicing(row: TableRow): 'NONE' | 'PARTIAL' | 'FULL' {
    if (row['_isComplete']) return 'FULL';
    const done = row['_montantFacture'] as number | null;
    return done != null && done >= 0.01 ? 'PARTIAL' : 'NONE';
  }

  /** Select « Statut » limité aux statuts réellement présents dans le tableau. */
  private statutField(batches: TsBatchDto[]): FilterField {
    return {
      name:    'statut',
      label:   this.translate.instant('AFFAIRES.WIP.TS_COL_STATUT'),
      type:    'select',
      options: [...new Set(batches.map(b => b.statut))].sort()
        .map(value => ({ value, label: this.translate.instant('AFFAIRES.WIP.BATCH_STATUS_' + value) })),
    };
  }

  /** Select « TS concerné » : les références TS présentes dans les lots du tableau (un lot
   * peut en regrouper plusieurs — voir TsBatchDto.entries). */
  private tsField(batches: TsBatchDto[]): FilterField {
    const refs = batches.flatMap(b => b.entries.map(e => e.referenceTs))
      .filter((r): r is string => !!r);
    return {
      name:       'ts',
      label:      this.translate.instant('AFFAIRES.WIP.TS_FILTER_TS'),
      type:       'select',
      searchable: true,
      options:    [...new Set(refs)].sort().map(value => ({ value, label: value })),
    };
  }

  /** Vrai si le lot contient le TS de référence `ref` (parmi ses éventuels TS groupés). */
  private batchHasTs(batch: TsBatchDto, ref: string): boolean {
    return batch.entries.some(e => e.referenceTs === ref);
  }

  /** Champs « Montant HT min / max », mêmes libellés que affaire-wip-tab. */
  private amountRangeFields(): FilterField[] {
    const t = (k: string) => this.translate.instant(k);
    return [{
      name: 'amountMin', label: t('AFFAIRES.WIP.HISTORY_FILTER_AMOUNT_MIN'), type: 'text',
      placeholder: t('AFFAIRES.WIP.HISTORY_FILTER_AMOUNT_PH'),
    }, {
      name: 'amountMax', label: t('AFFAIRES.WIP.HISTORY_FILTER_AMOUNT_MAX'), type: 'text',
      placeholder: t('AFFAIRES.WIP.HISTORY_FILTER_AMOUNT_PH'),
    }];
  }

  /** Résultat du panneau Filtres → valeurs à plat (voir `TsFilterValues`). */
  private normalizeFilters(result: FilterResult, dateKeys: string[] = []): TsFilterValues {
    const out: TsFilterValues = {};
    for (const key of Object.keys(result)) {
      const v = result[key];
      if (dateKeys.includes(key)) {
        out[key] = Array.isArray(v) && v.length ? v as Date[] : null;
      } else {
        out[key] = Array.isArray(v) ? ((v[0] as string) ?? '') : (typeof v === 'string' ? v : '');
      }
    }
    return out;
  }

  /** Valeurs à plat → `initialValues` du panneau (un select y attend `string[]`). */
  private filterSeed(values: TsFilterValues, selectKeys: string[]): FilterResult {
    const seed: Record<string, string | string[] | Date[] | null> = {};
    for (const [key, v] of Object.entries(values)) {
      seed[key] = selectKeys.includes(key) ? (typeof v === 'string' && v ? [v] : []) : v;
    }
    return seed as FilterResult;
  }

  private filterText(values: TsFilterValues, key: string): string {
    const v = values[key];
    return typeof v === 'string' ? v : '';
  }

  /** Plage du panneau (1 ou 2 dates) → bornes en jours 'yyyy-MM-dd', ou null si vide. */
  private dayRange(v: unknown): [string, string] | null {
    if (!Array.isArray(v) || !v.length) return null;
    return [this.toIso(v[0] as Date), this.toIso((v[1] ?? v[0]) as Date)];
  }

  /** Borne de montant saisie en texte ('1 500,50' accepté) → nombre, ou null si vide/invalide. */
  private parseAmount(raw: string): number | null {
    const s = raw.replace(/\s/g, '').replace(',', '.');
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  /** Date locale → 'yyyy-MM-dd' (jamais toISOString(), qui décale d'un jour selon le fuseau). */
  private toIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  tsBatchBadgeVariant(statut: string) {
    return TS_BATCH_STATUT_BADGE[statut] ?? 'neutral';
  }

  ngOnInit(): void {
    this.loadEligible();
    this.loadActive();
    this.loadHistory();
    this.loadPendingCarryForward();
  }

  private loadEligible(): void {
    this.loadingEligible.set(true);
    this.svc.getEligibleTs(this.affaire.id).subscribe({
      next:  list => { this.eligible.set(list); this.loadingEligible.set(false); },
      error: () => this.loadingEligible.set(false),
    });
  }

  private loadPendingCarryForward(): void {
    this.svc.getPendingTsCarryForward(this.affaire.id).subscribe({
      next:  list => this.pendingCarryForward.set(list),
      error: () => this.pendingCarryForward.set([]),
    });
  }

  submitCarryForward(): void {
    if (this.submittingCarryForward()) return;
    this.submittingCarryForward.set(true);
    this.errorMsg.set(null);
    this.svc.submitTsCarryForward(this.affaire.id).subscribe({
      next: () => {
        this.submittingCarryForward.set(false);
        this.loadPendingCarryForward();
        this.loadActive();
        this.dataChanged.emit();
      },
      error: err => {
        this.submittingCarryForward.set(false);
        this.errorMsg.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.TS_SUBMIT_ERROR'));
      },
    });
  }

  private loadActive(): void {
    this.loadingActive.set(true);
    this.svc.getActiveTsBatches(this.affaire.id).subscribe({
      next:  list => { this.active.set(list); this.loadingActive.set(false); },
      error: () => this.loadingActive.set(false),
    });
    this.loadTsLineHistory();
  }

  private loadHistory(): void {
    this.loadingHistory.set(true);
    this.svc.getAllTsLinesByAffaire(this.affaire.id).subscribe({
      next:  list => { this.history.set(list); this.loadingHistory.set(false); },
      error: () => this.loadingHistory.set(false),
    });
  }

  /** Feeds activeRows'/historyRows' chain-walk (findChainTail) — loaded alongside loadActive()
   * (appelé partout où loadHistory() l'est, plus après une soumission) so it
   * stays in sync with every action that can create or update a carry-forward link (a new
   * submission, a client confirmation, "Facturer le solde"). */
  private loadTsLineHistory(): void {
    this.svc.getBillingLinesDetailed(this.affaire.id).subscribe({
      next:  lines => this.tsLineHistory.set(lines.filter(l => l.billingMode === 'TS')),
      error: () => this.tsLineHistory.set([]),
    });
  }

  /** Fetches the read-only email preview and opens the shared popup — the real submit
   * (doSubmitSelection below, byte-for-byte what this method used to do directly) only runs
   * if the user clicks "Envoyer" inside it. Same two-step pattern as AffaireWipTabComponent's
   * submitTaux()/validateTm()/submitLivrables(). */
  submitSelection(): void {
    const tsIds = [...this.selection.ids()];
    if (tsIds.length === 0 || this.submitting() || !this.tsManualVerified()) return;
    this.submitting.set(true);
    this.errorMsg.set(null);
    this.svc.previewTsEmail(this.affaire.id, tsIds).subscribe({
      next: preview => {
        this.submitting.set(false);
        this.emailPreviewModal().open(preview, (subject, body, done) => this.doSubmitSelection(tsIds, subject, body, done));
      },
      error: err => {
        this.submitting.set(false);
        this.errorMsg.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.TS_SUBMIT_ERROR'));
      },
    });
  }

  private doSubmitSelection(tsIds: number[], subject: string, body: string,
                             done: (errorMessage?: string) => void): void {
    this.svc.submitTs(this.affaire.id, tsIds, subject, body).subscribe({
      next: () => {
        done();
        this.selection.clear();
        this.loadEligible();
        this.loadActive();
        this.dataChanged.emit();
      },
      error: err => done(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.TS_SUBMIT_ERROR')),
    });
  }

  getClientAmountInput(batchId: number): number | null {
    return this.clientAmountInputs().get(batchId) ?? null;
  }

  setClientAmountInput(batchId: number, value: number | null): void {
    const map = new Map(this.clientAmountInputs());
    map.set(batchId, value);
    this.clientAmountInputs.set(map);
  }

  confirmClientAmount(batch: TsBatchDto): void {
    const amount = this.getClientAmountInput(batch.batchId);
    if (amount === null || amount < 0 || amount > batch.combinedMontant
      || this.submittingClientBatch() !== null) return;
    this.submittingClientBatch.set(batch.batchId);
    this.clientAmountError.set(null);
    this.svc.confirmTsClient(this.affaire.id, batch.batchId, amount).subscribe({
      next: () => {
        this.submittingClientBatch.set(null);
        this.setClientAmountInput(batch.batchId, null);
        this.loadActive();
        this.loadHistory();
        this.dataChanged.emit();
      },
      error: err => {
        this.submittingClientBatch.set(null);
        this.clientAmountError.set(
          err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.CLIENT_AMOUNT_ERROR'));
      },
    });
  }

  batchReferences(batch: TsBatchDto): string {
    return batch.entries.map(e => e.referenceTs).filter(Boolean).join(', ');
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
