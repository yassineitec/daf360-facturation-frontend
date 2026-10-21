import {
  Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, Renderer2,
  computed, effect, inject, signal, untracked, viewChild,
} from '@angular/core';
import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, CardComponent, CheckboxComponent, FormFieldComponent, StatusBadgeComponent,
  DataTableComponent, DafCellDirective, TableColumn, TableConfig, TableRow, BadgeCell,
  TabsComponent, TabItem, LoadingComponent, AccordionCardComponent, MultiDatePickerComponent, MetricCardComponent,
  SearchToolbarComponent, SearchToolbarFilterConfig, FilterField, FilterResult, PaginationComponent,
} from '@khalilrebhiitec/daf360';
import { TsProgressService, TsTauxSubmitBody } from './ts-progress.service';
import { TsProgressSummaryDto, TsTauxDto } from './ts-progress.model';
import { BillingService, LineDetailDto } from '../billing/billing.service';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { WIP_TAUX_STATUT_BADGE } from '../../../shared/enum-labels';
import { EmailPreviewModalComponent } from '../wip/email-preview-modal.component';
import { ExportService } from '../../../core/export.service';
import {
  TableSort, delegatedSort, searchTableRows, sortTableRows, tableTools, toTableSort,
} from '../../../shared/table-tools';

/** Valeurs à plat du panneau Filtres : texte pour un select/montant, dates pour une plage. */
type TsFilterValues = Record<string, string | Date[] | null>;

/**
 * The "TS WIP" affaire tab — a TS is treated as a sub-affaire: its montantEstime plays the
 * ceiling role Affaire.contractAmount plays for AV, and progress against it is declared
 * period by period through the exact same submit -> client-notify-by-email ->
 * client-responds (possibly partially) -> DF-validates -> invoiced loop AV already uses
 * (TsProgressBillingService mirrors ProgressBillingService method-for-method). See
 * docs/superpowers/specs/2026-10-15-ts-wip-sub-affaire-design.md.
 *
 * Two-level view: a selector lists the affaire's INTEGRE/FACTURE TS with their cumulative
 * progress; selecting one opens its own AV-style declaration panel (period, %/amount toggle,
 * manual-verify checkbox, pending-client-response, history) scoped to that TS's id.
 */
@Component({
  selector: 'app-affaire-ts-wip-tab',
  standalone: true,
  imports: [
    TranslatePipe, DisplayCurrencyPipe,
    ButtonComponent, CardComponent, CheckboxComponent, FormFieldComponent, StatusBadgeComponent,
    DataTableComponent, DafCellDirective, TabsComponent, LoadingComponent, AccordionCardComponent,
    MultiDatePickerComponent, SearchToolbarComponent, PaginationComponent, NgTemplateOutlet,
    MetricCardComponent, EmailPreviewModalComponent,
  ],
  providers: [DisplayCurrencyPipe],
  styleUrl: './affaire-ts-wip-tab.component.scss',
  template: `
    <div class="flex flex-col gap-6">
      @if (errorMsg()) {
        <div class="rounded-lg bg-danger/10 px-3 py-2 text-body-sm text-danger">{{ errorMsg() }}</div>
      }

      <!-- ── Sélecteur de TS ─────────────────────────────────────────────── -->
      <!-- Un seul écran, comme l'onglet WIP : l'accordéon « Travaux supplémentaires » (même
           daf-accordion-card / classe wip-accordion que les cartes de affaire-wip-tab)
           liste les TS ; un clic sur une ligne choisit le TS et REFERME l'accordéon, dont
           le titre rappelle alors le TS en cours. Le panneau du TS s'affiche juste dessous.
           Le premier TS est sélectionné d'office (voir loadSummaries). -->
      @if (summaries().length > 0) {
        <daf-accordion-card class="wip-accordion"
          [options]="{ title: selectorTitle(), icon: 'receipt_long', variant: 'outlined', radius: 'lg' }"
          [(open)]="selectorOpen">
          <daf-data-table [columns]="selectorColumns()" [rows]="selectorRows()" [config]="selectorConfig()"
            (rowClick)="onTsRowClick($event)">
            <ng-template dafCell="selected" let-row>
              @if (row['id'] === selectedTsId()) {
                <span class="material-symbols-outlined text-[18px] text-tertiary" aria-hidden="true">check_circle</span>
              }
            </ng-template>
            <ng-template dafCell="reference" let-row>
              <span class="font-mono text-[12px] font-bold text-tertiary">{{ row['reference'] }}</span>
            </ng-template>
          </daf-data-table>
        </daf-accordion-card>
      }

      @if (loadingSummaries() && summaries().length === 0) {
        <daf-loading class="ts-loading" [message]="'AFFAIRES.WIP.LOADING' | translate" />
      } @else if (summaries().length === 0) {
        <p class="text-body-sm text-on-surface-variant">{{ 'AFFAIRES.WIP.TS_SELECTOR_EMPTY' | translate }}</p>
      } @else if (selectedTs(); as ts) {
        <!-- ── Panneau de déclaration pour le TS sélectionné ───────────────── -->

        <!-- Variante 'default' (fond + ombre légère) et non 'outlined' : sans la bordure
             qui dessinait un cadre noir autour du panneau du TS. -->
        <daf-card [options]="{ variant: 'default', radius: 'lg' }">
          <div class="flex flex-col gap-4 p-4">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h3 class="text-headline-sm text-on-surface m-0">
                {{ ts.referenceTs }} — {{ ts.intitule }}
              </h3>
              <daf-badge [label]="'ENUMS.TS_STATUT.' + ts.statut | translate"
                [options]="{ variant: ts.statut === 'FACTURE' ? 'success' : 'warning', size: 'sm' }" />
            </div>
            <!-- Les 3 chiffres du TS sur daf-metric-card, la tuile KPI de la lib — même
                 composant et même palette icône/couleur que la rangée KPI de la fiche affaire
                 (kpiTiles de affaire-detail). Classes de couleur en littéraux complets, pour
                 le scan Tailwind. Une colonne sur mobile, trois dès 640px. -->
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <daf-metric-card
                [label]="'AFFAIRES.WIP.TS_COL_MONTANT' | translate"
                [value]="ts.montantEstime | displayCurrency : ts.devise"
                [options]="{ icon: 'receipt_long', iconColor: 'text-primary', iconBg: 'bg-primary/10',
                             valueColor: 'text-primary' }" />
              <daf-metric-card
                [label]="'AFFAIRES.WIP.TS_COL_CUMUL_PCT' | translate"
                [value]="ts.cumulTauxValide + '%'"
                [options]="{ icon: 'pending_actions', iconColor: 'text-teal', iconBg: 'bg-teal/10',
                             valueColor: 'text-primary' }" />
              <daf-metric-card
                [label]="'AFFAIRES.WIP.TS_COL_REMAINING' | translate"
                [value]="ts.remainingMontant | displayCurrency : ts.devise"
                [options]="{ icon: 'account_balance_wallet', iconColor: 'text-warning', iconBg: 'bg-warning/10',
                             valueColor: 'text-primary' }" />
            </div>

            @if (ts.statut !== 'FACTURE') {
              <div class="h-px bg-outline-variant/40"></div>

              <!-- Formulaire de déclaration -->
              <div class="self-start w-fit">
                <daf-tabs variant="pill" [tabs]="modeTabs()" [active]="inputMode()" (activeChange)="onModeTabChange($event)"
                  [tabsLabel]="'AFFAIRES.WIP.TAUX_MODE_ARIA' | translate" idPrefix="ts-wip-mode" />
              </div>

              <!-- Même ligne que la saisie AV de affaire-wip-tab : le champ % / montant, puis
                   la pastille d'actions (calendrier de la période + soumettre), puis la
                   période choisie. Le spaceur invisible reprend le style du <label> de
                   daf-form-field pour aligner la pastille sur le champ, pas sur son label. -->
              <div class="flex flex-wrap gap-3 items-start">
                <div class="taux-field-compact w-full sm:w-64">
                  @if (inputMode() === 'POURCENTAGE') {
                    <daf-form-field [value]="newTauxValue()" (valueChange)="newTauxValue.set(parseNumberInput($event))"
                      [options]="{ type: 'number', label: ('AFFAIRES.WIP.TS_TAUX_LABEL' | translate), fullWidth: true }" />
                  } @else {
                    <daf-form-field [value]="newAmountValue()" (valueChange)="newAmountValue.set(parseNumberInput($event))"
                      [options]="{ type: 'number', label: ('AFFAIRES.WIP.TS_MONTANT_LABEL' | translate), fullWidth: true }" />
                  }
                </div>

                <div class="flex flex-col gap-1.5">
                  <span class="invisible text-[10px] font-semibold uppercase tracking-wider" aria-hidden="true">&nbsp;</span>
                  <div class="wip-icon-actions w-fit h-10 flex items-center gap-1
                              bg-white/90 backdrop-blur-sm p-1 rounded-lg border border-outline-variant shadow-sm">
                    <daf-button #tsDatePickerTrigger
                      [options]="{ variant: 'ghost', size: 'sm', iconStart: 'calendar_month', title: ('AFFAIRES.WIP.PERIOD' | translate) }"
                      (onClick)="toggleDatePicker()" />
                    <daf-button [options]="{ variant: 'ghost', size: 'sm', iconStart: 'send',
                                              title: ('AFFAIRES.WIP.TS_SUBMIT' | translate),
                                              loading: submittingTaux(), disabled: !canSubmitTaux() || !manualVerified() || submittingTaux() }"
                      (onClick)="submitTaux()" />
                    @if (editingTauxId()) {
                      <daf-button [options]="{ variant: 'ghost', size: 'sm', iconStart: 'close', title: ('AFFAIRES.WIP.CANCEL_EDIT' | translate) }"
                        (onClick)="cancelEdit()" />
                    }
                  </div>
                </div>

                <div class="flex flex-col gap-1.5">
                  <span class="invisible text-[10px] font-semibold uppercase tracking-wider" aria-hidden="true">&nbsp;</span>
                  <span class="h-10 flex items-center text-[10px] font-semibold uppercase tracking-wider text-outline whitespace-nowrap">
                    {{ formatPeriod(periodDateFrom(), periodDateTo()) }}
                  </span>
                </div>
              </div>

              @if (wipPreview(); as preview) {
                <p class="text-[12px] text-on-surface-variant">
                  {{ 'AFFAIRES.WIP.TS_PREVIEW_AMOUNT' | translate }}: <strong>{{ preview | displayCurrency : ts.devise }}</strong>
                </p>
              }

              <daf-form-field [value]="tauxComment()" (valueChange)="tauxComment.set($any($event))"
                [options]="{ type: 'textarea', label: ('AFFAIRES.WIP.TS_COMMENT_LABEL' | translate), fullWidth: true }" />

              <daf-checkbox [checked]="manualVerified()"
                [options]="{ label: ('AFFAIRES.WIP.MANUAL_VERIFY_LABEL' | translate) }"
                (checkedChange)="manualVerified.set($event)" />

              @if (tauxError()) {
                <p class="text-body-sm text-danger">{{ tauxError() }}</p>
              }
            }
          </div>
        </daf-card>

        @if (loadingTaux()) {
          <daf-loading class="ts-loading" [message]="'AFFAIRES.WIP.LOADING' | translate" />
        } @else if (tauxHistory().length > 0) {
          <!-- Titre + Recherche/Filtres dans une même carte, comme les historiques de
               affaire-wip-tab ; [table] ajoute à droite de Filtres la réinitialisation et le
               choix des colonnes du tableau juste dessous. -->
          <!-- À droite du titre : le compteur et les actions Export Excel / Afficher tout,
               dans la même pastille révélée au survol que l'historique Livrable de
               affaire-wip-tab. -->
          <daf-card [options]="{ variant: 'glass', padding: 'none', radius: 'xl' }"
            (mouseenter)="historyCardHovered.set(true)"
            (mouseleave)="historyCardHovered.set(false)">
            <div class="ts-toolbar-title flex items-center justify-between gap-2">
              <h3 class="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                <span class="material-symbols-outlined text-[18px]">history</span>
                {{ 'AFFAIRES.WIP.TS_HISTORY_TITLE' | translate }}
              </h3>
              <div class="flex items-center gap-2">
                <daf-badge [label]="tauxHistory().length + ' ' + ('AFFAIRES.WIP.HISTORY_COUNT_UNIT' | translate)"
                  [options]="{ variant: 'neutral', size: 'sm' }" />
                <div class="wip-icon-actions flex items-center gap-1 transition-opacity duration-200
                            bg-white/90 backdrop-blur-sm p-1 rounded-lg border border-outline-variant shadow-sm"
                  [class.opacity-0]="!historyCardHovered()"
                  [class.opacity-100]="historyCardHovered()"
                  [class.pointer-events-none]="!historyCardHovered()">
                  <daf-button [options]="{ variant: 'ghost', size: 'sm', iconStart: 'download',
                                            title: ('AFFAIRES.WIP.EXPORT_EXCEL' | translate),
                                            disabled: !filteredHistoryRows().length, loading: exporting() }"
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
            <ng-template dafCell="mtClient" let-row>
              <ng-container [ngTemplateOutlet]="mtClientCell" [ngTemplateOutletContext]="{ $implicit: row, editable: true }" />
            </ng-template>
            <ng-template dafCell="factureProgress" let-row>
              <ng-container [ngTemplateOutlet]="factureProgressCell" [ngTemplateOutletContext]="{ $implicit: row }" />
            </ng-template>
          </daf-data-table>
          @if (clientAmountError()) {
            <p class="text-[12px] text-danger">{{ clientAmountError() }}</p>
          }
        } @else {
          <p class="text-body-sm text-on-surface-variant">{{ 'AFFAIRES.WIP.TS_HISTORY_EMPTY' | translate }}</p>
        }
      }

      <!-- Cellules partagées par le tableau Historique ET la popup "Afficher tout" (un
           dafCell appartient à UN daf-data-table, d'où le relais par ngTemplateOutlet). -->
      <ng-template #factureProgressCell let-row>
        @if (row['_remainderPending'] === null) {
          —
        } @else {
          <div class="flex flex-col gap-1">
            <span class="text-[12px] whitespace-nowrap">
              {{ row['_montantFacture'] | displayCurrency : historyDevise() }} / {{ row['_raw'].montantIncremental | displayCurrency : historyDevise() }}
            </span>
            @if (row['_isComplete']) {
              <daf-badge [label]="'AFFAIRES.WIP.FACTURE_COMPLETE' | translate"
                [options]="{ variant: 'success', size: 'sm', dot: true }" />
            } @else {
              <daf-badge [label]="'AFFAIRES.WIP.FACTURE_PARTIAL' | translate:{ amount: (row['_remainderPending'] | displayCurrency : historyDevise()) }"
                [options]="{ variant: 'warning', size: 'sm', dot: true }" />
            }
          </div>
        }
      </ng-template>

      <!-- « Mt client » — même cellule que dafCell="mtClient" de l'historique AV de
           affaire-wip-tab : un petit champ tant que la ligne attend le client (seulement si
           editable, pas dans la popup en lecture seule), sinon le montant confirmé, sinon —. -->
      <ng-template #mtClientCell let-row let-editable="editable">
        @if (editable && $any(row['_line'])?.statut === 'EN_ATTENTE_CLIENT') {
          <!-- daf-form-field de la lib (même champ que le taux / montant du formulaire) :
               aligné à droite comme un montant de colonne, sans devise ; le montant
               déclaré en placeholder (champ vide = on l'accepte, voir confirmClientAmount) ;
               message d'erreur de la lib si le montant saisi dépasse les bornes. -->
          <div class="mt-client-field w-32">
            <daf-form-field
              [value]="getClientAmountInput($any(row['_line']).id)"
              (valueChange)="setClientAmountInput($any(row['_line']).id, parseNumberInput($event))"
              [options]="{ type: 'number', align: 'end', fullWidth: true,
                           placeholder: $any(row['_line']).montantHt + '',
                           error: isClientAmountValid($any(row['_line'])) ? '' : ('AFFAIRES.WIP.CLIENT_AMOUNT_HINT' | translate) }" />
          </div>
        } @else if ($any(row['_line'])?.clientApprovedAmount != null) {
          {{ $any(row['_line']).clientApprovedAmount | displayCurrency : historyDevise() }}
        } @else {
          —
        }
      </ng-template>

      <!-- Popup "Afficher tout" de l'historique, EN PLEIN ÉCRAN — même coquille que la popup
           Historique de affaire-wip-tab (portail sous <body>, voir historyOverlayRef dans le
           .ts), mêmes recherche/filtres que le tableau de l'onglet, plus tri sur tout le jeu
           filtré, pagination et export. Lecture seule : sans la colonne Actions, la
           modification se fait depuis le formulaire de l'onglet. -->
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
                @if (selectedTs(); as ts) {
                  <span class="font-mono text-[14px] font-bold text-tertiary">{{ ts.referenceTs }}</span>
                }
              </h2>
              <button type="button" (click)="showHistoryPopup.set(false)"
                class="w-9 h-9 flex items-center justify-center rounded-lg text-on-surface-variant
                       hover:text-on-surface hover:bg-surface-container transition-colors"
                [attr.aria-label]="'ADMIN.COMMON.CLOSE' | translate">
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
                                          disabled: !filteredHistoryRows().length, loading: exporting() }"
                  (onClick)="exportHistoryExcel(sortedHistoryRows())" />
              </div>
              <daf-data-table #historyPopupTable [columns]="historyPopupColumns()" [rows]="paginatedHistoryRows()" [config]="historyPopupConfig()"
                (sortChange)="onHistoryPopupSort($event)" (resetClick)="onHistoryPopupSort(null)">
                <ng-template dafCell="mtClient" let-row>
                  <ng-container [ngTemplateOutlet]="mtClientCell" [ngTemplateOutletContext]="{ $implicit: row, editable: false }" />
                </ng-template>
                <ng-template dafCell="factureProgress" let-row>
                  <ng-container [ngTemplateOutlet]="factureProgressCell" [ngTemplateOutletContext]="{ $implicit: row }" />
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

      <!-- Panneau du calendrier de la période — même principe que avDatePickerPanel de
           affaire-wip-tab : toujours présent dans le DOM (hors des @if, sinon il pourrait
           être détruit pendant qu'il est sous <body>), déplacé vers <body> et positionné
           en fixed au-dessus de l'icône à l'ouverture (voir positionPortal()). -->
      <div #tsDatePickerPanel
        [style.display]="showDatePicker() ? 'block' : 'none'"
        [style.visibility]="datePickerVisible() ? 'visible' : 'hidden'"
        class="wip-date-picker-panel shadow-xl rounded-lg">
        <daf-multi-date-picker #tsPicker
          [value]="dateRange()"
          (valueChange)="onDateRangeChange($event)"
          [config]="{ selectionMode: 'range', inline: true, fullWidth: false }" />
        <button type="button" class="wip-date-picker-confirm-btn" (click)="closeDatePicker()">
          {{ 'AFFAIRES.WIP.APPLY' | translate }}
        </button>
      </div>

      <app-email-preview-modal #emailPreviewModal />
    </div>
  `,
})
export class AffaireTsWipTabComponent implements OnInit, OnDestroy {
  @Input({ required: true }) affaire!: { id: number; devise: string; reference?: string | null };
  @Output() readonly dataChanged = new EventEmitter<void>();

  private readonly svc        = inject(TsProgressService);
  private readonly billingSvc = inject(BillingService);
  private readonly translate  = inject(TranslateService);
  private readonly currency   = inject(DisplayCurrencyPipe);
  private readonly renderer   = inject(Renderer2);
  private readonly document   = inject(DOCUMENT);
  private readonly exportSvc  = inject(ExportService);
  /** Export Excel en cours — état de chargement des deux boutons d'export. */
  readonly exporting = signal(false);

  private readonly emailPreviewModal = viewChild.required<EmailPreviewModalComponent>('emailPreviewModal');

  errorMsg = signal<string | null>(null);

  // ── Sélecteur ──────────────────────────────────────────────────────────
  loadingSummaries = signal(false);
  summaries        = signal<TsProgressSummaryDto[]>([]);
  selectedTsId     = signal<number | null>(null);
  readonly selectedTs = computed<TsProgressSummaryDto | null>(() =>
    this.summaries().find(s => s.tsId === this.selectedTsId()) ?? null);

  /** Accordéon « Travaux supplémentaires » — ouvert à l'arrivée pour montrer la liste,
   * refermé dès qu'un TS est choisi (voir onTsRowClick). */
  selectorOpen = signal(true);

  /** Titre de l'accordéon : rappelle le TS en cours quand la liste est repliée. */
  readonly selectorTitle = computed(() => {
    this.translate.currentLang();
    const title = this.translate.instant('AFFAIRES.WIP.TS_SELECTOR_TITLE');
    const ts = this.selectedTs();
    return ts ? `${title} — ${ts.referenceTs} · ${ts.intitule}` : title;
  });

  readonly selectorColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const raw = (row: TableRow) => row['_raw'] as TsProgressSummaryDto;
    return [
      { key: 'selected',  label: '', type: 'custom', width: '40px' },
      { key: 'reference', label: t('AFFAIRES.WIP.TS_COL_REFERENCE'), type: 'custom', sortable: true },
      { key: 'intitule',  label: t('AFFAIRES.WIP.TS_COL_INTITULE'), sortable: true },
      { key: 'montant',   label: t('AFFAIRES.WIP.TS_COL_MONTANT'), sortable: true,
        sortAccessor: row => raw(row).montantEstime },
      { key: 'cumulPct',  label: t('AFFAIRES.WIP.TS_COL_CUMUL_PCT'), sortable: true,
        sortAccessor: row => raw(row).cumulTauxValide },
      { key: 'remaining', label: t('AFFAIRES.WIP.TS_COL_REMAINING'), sortable: true,
        sortAccessor: row => raw(row).remainingMontant },
      { key: 'statut',    label: t('AFFAIRES.WIP.TS_COL_STATUT'), type: 'badge', sortable: true },
    ];
  });

  readonly selectorRows = computed<TableRow[]>(() => this.summaries().map(s => ({
    id:         s.tsId,
    reference:  s.referenceTs,
    intitule:   s.intitule,
    montant:    this.currency.transform(s.montantEstime, s.devise),
    cumulPct:   s.cumulTauxValide + '%',
    remaining:  this.currency.transform(s.remainingMontant, s.devise),
    // ENUMS.TS_STATUT (« Intégré au budget » / « Facturé ») : la clé BATCH_STATUS_INTEGRE
    // utilisée avant n'existe pas et s'affichait brute.
    statut:     { label: this.translate.instant('ENUMS.TS_STATUT.' + s.statut),
                  options: { variant: s.statut === 'FACTURE' ? 'success' : 'warning', dot: true } } satisfies BadgeCell,
    _raw:       s,
  } satisfies TableRow)));

  readonly selectorConfig = computed<TableConfig>(() => ({
    showHeader: false,
    hoverable:  true,
    emptyMessage: this.translate.instant('AFFAIRES.WIP.TS_SELECTOR_EMPTY'),
  }));

  /** Clic sur une ligne : choisit ce TS et referme l'accordéon. */
  onTsRowClick(row: TableRow): void {
    const ts = row['_raw'] as TsProgressSummaryDto;
    if (ts.tsId !== this.selectedTsId()) this.selectTs(ts);
    this.selectorOpen.set(false);
  }

  /** Passe à un autre TS : on referme ce qui appartenait au précédent (calendrier, popup)
   * et on vide son historique avant de charger celui du nouveau. */
  selectTs(ts: TsProgressSummaryDto): void {
    if (this.showDatePicker()) this.closeDatePicker();
    this.showHistoryPopup.set(false);
    this.tauxHistory.set([]);
    this.lineHistory.set([]);
    this.clientAmountInputs.set(new Map());
    this.clientAmountError.set(null);
    this.selectedTsId.set(ts.tsId);
    this.resetForm();
    this.loadTauxHistory();
    this.loadLineHistory();
  }

  // ── Formulaire de déclaration ────────────────────────────────────────────
  private readonly now = new Date();
  periodDateFrom = signal(this.toIso(new Date(this.now.getFullYear(), this.now.getMonth(), 1)));
  periodDateTo   = signal(this.toIso(new Date(this.now.getFullYear(), this.now.getMonth() + 1, 0)));
  inputMode      = signal<'POURCENTAGE' | 'MONTANT'>('POURCENTAGE');
  newTauxValue   = signal<number | null>(null);
  newAmountValue = signal<number | null>(null);
  tauxComment    = signal('');
  manualVerified = signal(false);
  submittingTaux = signal(false);
  tauxError      = signal<string | null>(null);
  editingTauxId  = signal<number | null>(null);

  readonly modeTabs = computed<TabItem[]>(() => [
    { id: 'POURCENTAGE', label: this.translate.instant('AFFAIRES.WIP.TAUX_MODE_PERCENT') },
    { id: 'MONTANT',     label: this.translate.instant('AFFAIRES.WIP.TAUX_MODE_AMOUNT') },
  ]);

  // ── Calendrier de la période — repris de celui de la saisie AV de affaire-wip-tab
  // (showAvDatePicker/avDateRange/positionPortal...) : une seule plage choisie dans un
  // daf-multi-date-picker inline, ouvert au-dessus de l'icône calendrier. ──
  showDatePicker = signal(false);
  private datePickerPositioned = signal(false);
  readonly datePickerVisible = computed(() => this.showDatePicker() && this.datePickerPositioned());

  private readonly datePickerPanelRef = viewChild<ElementRef<HTMLElement>>('tsDatePickerPanel');
  private readonly datePickerTriggerRef = viewChild('tsDatePickerTrigger', { read: ElementRef });
  private readonly pickerRef = viewChild<MultiDatePickerComponent>('tsPicker');

  /** Vrai quand la sélection a été vidée ("Effacer", le "x" d'une date, ou le 1er clic d'une
   * nouvelle plage — les trois font émettre `null` à la lib) : le calendrier s'affiche vide,
   * mais periodDateFrom/periodDateTo gardent la dernière période valide. */
  private pickerCleared = signal(false);

  /** Référence mise en cache : `[value]` est relu à chaque détection de changements, et un
   * nouveau tableau à chaque fois ré-imposerait l'ancienne plage à la lib (annulant
   * "Effacer" et la date de début en attente d'une nouvelle plage). */
  private rangeCache: { from: string; to: string; range: Date[] } | null = null;

  dateRange(): Date[] | null {
    if (this.pickerCleared()) return null;
    const from = this.periodDateFrom();
    const to = this.periodDateTo();
    const c = this.rangeCache;
    if (!c || c.from !== from || c.to !== to) {
      this.rangeCache = { from, to, range: [new Date(from + 'T00:00:00'), new Date(to + 'T00:00:00')] };
    }
    return this.rangeCache!.range;
  }

  onDateRangeChange(value: Date | Date[] | null): void {
    // `null` = sélection vidée : on vide le calendrier et on le laisse ouvert.
    if (value === null) {
      this.pickerCleared.set(true);
      return;
    }
    if (!Array.isArray(value) || value.length !== 2) return;
    this.periodDateFrom.set(this.toIso(value[0]));
    this.periodDateTo.set(this.toIso(value[1]));
    this.pickerCleared.set(false);
    // Ne se referme pas tout seul : seul "Confirmer" (ou Échap) referme, comme en AV.
  }

  toggleDatePicker(): void {
    if (this.showDatePicker()) {
      this.closeDatePicker();
      return;
    }
    this.showDatePicker.set(true);
    // Après un rendu : le panneau doit être affiché pour que sa hauteur soit mesurable.
    requestAnimationFrame(() => this.positionPortal());
  }

  closeDatePicker(): void {
    this.showDatePicker.set(false);
    this.datePickerPositioned.set(false);
    // Fermé sans plage complète : on abandonne la date de début en attente.
    const picker = this.pickerRef();
    if (picker?.pendingRangeStart()) picker.reset();
    this.pickerCleared.set(false);
  }

  /** Même positionnement que positionPortal() de affaire-wip-tab : panneau déplacé sous
   * <body>, en fixed, toujours au-dessus de l'icône et calé sur son bord droit, borné à 8px
   * des bords de la fenêtre — jamais coupé par la carte. */
  private positionPortal(): void {
    const panel = this.datePickerPanelRef()?.nativeElement;
    const trigger = this.datePickerTriggerRef()?.nativeElement as HTMLElement | undefined;
    if (!panel || !trigger) return;
    if (panel.parentElement !== this.document.body) {
      this.renderer.appendChild(this.document.body, panel);
    }
    // `fixed` + hors écran AVANT de mesurer, pour ne jamais lire une position en flux normal.
    this.renderer.setStyle(panel, 'position', 'fixed');
    this.renderer.setStyle(panel, 'top', '-9999px');
    this.renderer.setStyle(panel, 'left', '-9999px');
    this.renderer.setStyle(panel, 'z-index', '9999');

    const triggerRect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const gap = 8;
    let left = triggerRect.right - panelRect.width;
    left = Math.max(8, Math.min(left, window.innerWidth - panelRect.width - 8));
    const top = Math.max(8, triggerRect.top - gap - panelRect.height);
    this.renderer.setStyle(panel, 'top', `${top}px`);
    this.renderer.setStyle(panel, 'left', `${left}px`);
    this.datePickerPositioned.set(true);
  }

  /** En mode plage, le "x" d'une date de daf-multi-date-picker vide TOUTE la sélection. On
   * intercepte le clic en phase de capture : l'AUTRE date devient le début d'une nouvelle
   * plage en attente — même astuce que keepOtherDateOnChipRemove() de affaire-wip-tab. */
  private readonly onChipRemoveCapture = (event: MouseEvent): void => {
    const panel = this.datePickerPanelRef()?.nativeElement;
    const picker = this.pickerRef();
    const chipButtons = 'span.rounded-full > button';
    const btn = (event.target as HTMLElement | null)?.closest?.(chipButtons);
    const range = picker?.value();
    if (!panel || !picker || !btn || !panel.contains(btn) || !Array.isArray(range) || range.length !== 2) return;
    const idx = Array.from(panel.querySelectorAll(chipButtons)).indexOf(btn);
    if (idx !== 0 && idx !== 1) return;
    event.stopPropagation();
    picker.value.set(null); // → onDateRangeChange(null) : calendrier vidé, reste ouvert
    picker.pendingRangeStart.set(range[1 - idx]);
  };

  @HostListener('document:keydown.escape')
  onEscapeForDatePicker(): void {
    if (this.showDatePicker()) this.closeDatePicker();
  }

  /** Même affichage que formatWipPeriod() de affaire-wip-tab : « Octobre 2026 » pour un mois
   * calendaire complet, sinon « 2026-10-05 → 2026-10-20 ». */
  formatPeriod(dateFrom: string, dateTo: string): string {
    const from = new Date(dateFrom + 'T00:00:00');
    const to = new Date(dateTo + 'T00:00:00');
    const lastDayOfFromMonth = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
    const isFullMonth = from.getDate() === 1
      && from.getFullYear() === to.getFullYear()
      && from.getMonth() === to.getMonth()
      && to.getDate() === lastDayOfFromMonth;
    if (!isFullMonth) return `${dateFrom} → ${dateTo}`;
    const locale = this.translate.currentLang() === 'en' ? 'en-GB' : 'fr-FR';
    const label = from.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    return label.charAt(0).toLocaleUpperCase() + label.slice(1);
  }

  onModeTabChange(id: string): void {
    if (id === 'POURCENTAGE' || id === 'MONTANT') this.inputMode.set(id);
  }

  parseNumberInput(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  readonly effectiveTauxPercent = computed<number | null>(() => {
    const ts = this.selectedTs();
    if (!ts) return null;
    if (this.inputMode() === 'POURCENTAGE') return this.newTauxValue();
    const amount = this.newAmountValue();
    if (amount === null || !ts.montantEstime) return null;
    if (amount === ts.remainingMontant) return Number((100 - ts.cumulTauxValide).toFixed(6));
    return Number(((amount / ts.montantEstime) * 100).toFixed(6));
  });

  readonly canSubmitTaux = computed(() => {
    const ts = this.selectedTs();
    if (!ts) return false;
    if (this.inputMode() === 'MONTANT') {
      const amount = this.newAmountValue();
      return amount !== null && amount > 0 && amount <= ts.remainingMontant;
    }
    const taux = this.effectiveTauxPercent();
    if (taux === null || taux <= 0) return false;
    return Number((ts.cumulTauxValide + taux).toFixed(6)) <= 100;
  });

  readonly wipPreview = computed<number | null>(() => {
    const ts = this.selectedTs();
    const taux = this.effectiveTauxPercent();
    if (!ts || taux === null) return null;
    if (Number((ts.cumulTauxValide + taux).toFixed(6)) === 100 && ts.remainingMontant > 0) {
      return ts.remainingMontant;
    }
    return Number(((taux * ts.montantEstime) / 100).toFixed(3));
  });

  private resetForm(): void {
    if (this.showDatePicker()) this.closeDatePicker();
    this.periodDateFrom.set(this.toIso(new Date(this.now.getFullYear(), this.now.getMonth(), 1)));
    this.periodDateTo.set(this.toIso(new Date(this.now.getFullYear(), this.now.getMonth() + 1, 0)));
    this.inputMode.set('POURCENTAGE');
    this.newTauxValue.set(null);
    this.newAmountValue.set(null);
    this.tauxComment.set('');
    this.manualVerified.set(false);
    this.editingTauxId.set(null);
    this.tauxError.set(null);
  }

  private buildSubmitBody(): TsTauxSubmitBody {
    return {
      periodDateFrom: this.periodDateFrom(),
      periodDateTo: this.periodDateTo(),
      tauxSaisi: this.inputMode() === 'POURCENTAGE' ? (this.newTauxValue() ?? 0) : 0,
      commentaire: this.tauxComment() || null,
      montantSaisi: this.inputMode() === 'MONTANT' ? this.newAmountValue() : null,
    };
  }

  submitTaux(): void {
    const tsId = this.selectedTsId();
    if (!tsId || !this.canSubmitTaux() || this.submittingTaux()) return;
    this.submittingTaux.set(true);
    this.tauxError.set(null);
    const body = this.buildSubmitBody();
    this.svc.previewTauxEmail(tsId, body).subscribe({
      next: preview => {
        this.submittingTaux.set(false);
        this.emailPreviewModal().open(preview, (subject, mailBody, done) =>
          this.doSubmitTaux(tsId, { ...body, emailSubject: subject, emailBody: mailBody }, done));
      },
      error: err => {
        this.submittingTaux.set(false);
        this.tauxError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.TS_SUBMIT_ERROR'));
      },
    });
  }

  private doSubmitTaux(tsId: number, body: TsTauxSubmitBody, done: (errorMessage?: string) => void): void {
    const editingId = this.editingTauxId();
    const obs = editingId ? this.svc.updateTaux(editingId, body) : this.svc.submitTaux(tsId, body);
    obs.subscribe({
      next: () => {
        done();
        this.resetForm();
        this.loadTauxHistory();
        this.loadLineHistory();
        this.loadSummaries();
        this.dataChanged.emit();
      },
      error: err => done(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.TS_SUBMIT_ERROR')),
    });
  }

  editTaux(taux: TsTauxDto): void {
    this.editingTauxId.set(taux.id);
    this.periodDateFrom.set(taux.periodDateFrom);
    this.periodDateTo.set(taux.periodDateTo);
    this.inputMode.set('POURCENTAGE');
    this.newTauxValue.set(taux.tauxSaisi);
    this.tauxComment.set(taux.commentaire ?? '');
    this.manualVerified.set(false);
  }

  cancelEdit(): void {
    this.resetForm();
  }

  deleteTaux(taux: TsTauxDto): void {
    if (!confirm(this.translate.instant('AFFAIRES.WIP.TS_DELETE_CONFIRM'))) return;
    this.svc.deleteTaux(taux.id).subscribe({
      next: () => {
        this.loadTauxHistory();
        this.loadLineHistory();
        this.loadSummaries();
        this.dataChanged.emit();
      },
      error: err => this.errorMsg.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.TS_SUBMIT_ERROR')),
    });
  }

  // ── Historique des déclarations ──────────────────────────────────────────
  loadingTaux = signal(false);
  tauxHistory = signal<TsTauxDto[]>([]);

  private loadTauxHistory(): void {
    const tsId = this.selectedTsId();
    if (!tsId) return;
    this.loadingTaux.set(true);
    this.svc.getTauxHistory(tsId).subscribe({
      next:  list => { this.tauxHistory.set(list); this.loadingTaux.set(false); },
      error: () => this.loadingTaux.set(false),
    });
  }

  readonly historyColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    // Mêmes colonnes, libellés et ordre que tauxHistoryColumns de affaire-wip-tab
    // (historique AV). Tri local sur les valeurs brutes (l'historique arrive entier, sans
    // pagination) : la cellule affiche du texte formaté, qui ne se trie ni chronologiquement
    // ni numériquement. Le cumul reste celui de la ligne, il ne change pas avec le tri.
    const raw = (row: TableRow) => row['_raw'] as TsTauxDto;
    return [
      { key: 'periode',  label: t('AFFAIRES.WIP.COL_PERIOD'), sortable: true,
        sortAccessor: row => raw(row).periodDateFrom },
      { key: 'taux',     label: t('AFFAIRES.WIP.COL_TAUX'), sortable: true,
        sortAccessor: row => raw(row).tauxSaisi },
      { key: 'cumul',    label: t('AFFAIRES.WIP.COL_CUMUL'), sortable: true,
        sortAccessor: row => row['_cumul'] as number },
      { key: 'montant',  label: t('AFFAIRES.WIP.COL_INCREMENT'), sortable: true,
        sortAccessor: row => raw(row).montantIncremental },
      // Même colonne que « MT Client » de l'historique AV : saisie inline en attente client.
      { key: 'mtClient', label: t('AFFAIRES.WIP.COL_MT_CLIENT'), type: 'custom', sortable: true,
        sortAccessor: row => (row['_line'] as (LineDetailDto & { clientApprovedAmount?: number | null }) | null)
          ?.clientApprovedAmount ?? null },
      { key: 'factureProgress', label: t('AFFAIRES.WIP.COL_FACTURE_PROGRESS'), type: 'custom', sortable: true,
        sortAccessor: row => row['_montantFacture'] as number | null },
      { key: 'statut',   label: t('AFFAIRES.WIP.COL_STATUS'), type: 'badge', sortable: true },
    ];
  });

  readonly historyRows = computed<TableRow[]>(() => {
    const devise = this.selectedTs()?.devise ?? this.affaire.devise;
    const lines = this.lineHistory();
    let runningCumul = 0;
    return this.tauxHistory().map(t => {
      // Arrondi à 6 décimales à chaque étape, comme tauxHistoryRows de affaire-wip-tab :
      // l'addition flottante dérive (33.846 + 11.109 → 44.955000000000005).
      runningCumul = Number((runningCumul + t.tauxSaisi).toFixed(6));
      return {
        id:       t.id,
        periode:  this.formatPeriod(t.periodDateFrom, t.periodDateTo),
        taux:     t.tauxSaisi + '%',
        cumul:    runningCumul + '%',
        _cumul:   runningCumul,
        montant:  this.currency.transform(t.montantIncremental, devise),
        // Pastille de la lib avec point coloré, comme le statut de l'historique AV — son
        // libellé est lu par la recherche et le tri.
        statut:   { label: this.translate.instant('ENUMS.WIP_TAUX_STATUT.' + t.statut),
                    options: { variant: this.tauxBadgeVariant(t.statut), dot: true } } satisfies BadgeCell,
        _raw:     t,
        _line:    t.billingLineId != null ? lines.find(l => l.id === t.billingLineId) ?? null : null,
        ...this.factureProgress(t, lines),
      } satisfies TableRow;
    });
  });

  readonly historyConfig = computed<TableConfig>(() => ({
    // false comme tauxHistoryConfig de affaire-wip-tab : masque la barre de titre de la
    // carte du tableau (vide ici, le titre est déjà dans la carte Recherche/Filtres).
    showHeader: false,
    hoverable:  false,
    emptyMessage: this.translate.instant('AFFAIRES.WIP.NO_HISTORY'),
    ...tableTools(this.translate),
    // Les 3 mêmes boutons de ligne, dans le même ordre, que tauxHistoryConfig de
    // affaire-wip-tab (historique AV) : Modifier, Supprimer (rouge, `danger`), Valider le
    // montant client. La lib n'a pas d'état de chargement par ligne : `disabled` pendant
    // l'envoi de la réponse client en tient lieu, comme en AV.
    actions: [
      {
        id:      'edit',
        icon:    'edit',
        tooltip: this.translate.instant('AFFAIRES.WIP.EDIT'),
        onClick: (row: TableRow) => this.editTaux(row['_raw'] as TsTauxDto),
        hidden:  (row: TableRow) => !this.isTauxEditable(row),
      },
      {
        id:      'delete',
        icon:    'delete',
        tooltip: this.translate.instant('AFFAIRES.WIP.DELETE'),
        variant: 'danger',
        onClick: (row: TableRow) => this.deleteTaux(row['_raw'] as TsTauxDto),
        hidden:  (row: TableRow) => !this.isTauxEditable(row),
      },
      {
        id:      'validateClient',
        icon:    'check_circle',
        tooltip: this.translate.instant('AFFAIRES.WIP.VALIDATE_CLIENT_AMOUNT'),
        onClick: (row: TableRow) => this.confirmClientAmount(row['_line'] as LineDetailDto, row['_raw'] as TsTauxDto),
        hidden:   (row: TableRow) => !this.isAwaitingClient(row),
        disabled: (row: TableRow) => !this.isClientAmountValid(row['_line'] as LineDetailDto)
          || this.submittingClientTauxId() === (row['_raw'] as TsTauxDto).id,
      },
    ],
  }));

  /** La ligne liée attend encore la réponse du client. */
  private isAwaitingClient(row: TableRow): boolean {
    return (row['_line'] as LineDetailDto | null)?.statut === 'EN_ATTENTE_CLIENT';
  }

  /** Modifiable / supprimable tant que la DF n'a pas statué — même règle qu'en AV. */
  private isTauxEditable(row: TableRow): boolean {
    const statut = (row['_raw'] as TsTauxDto).statut;
    return statut === 'EN_ATTENTE' || statut === 'REFUSE';
  }

  // ── Recherche + Filtres de l'historique — mêmes champs et même mécanique que
  // tauxHistoryFilterFields de affaire-wip-tab (historique AV). ──
  readonly historySearch  = signal('');
  readonly historyFilters = signal<TsFilterValues>({});

  readonly historyFilterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [{
      name:    'statut',
      label:   t('AFFAIRES.WIP.TS_COL_STATUT'),
      type:    'select',
      // Limité aux statuts réellement présents dans l'historique.
      options: [...new Set(this.tauxHistory().map(x => x.statut))].sort()
        .map(value => ({ value, label: t('ENUMS.WIP_TAUX_STATUT.' + value) })),
    }, {
      name:  'period',
      label: t('AFFAIRES.WIP.COL_PERIOD'),
      type:  'daterange',
    }, {
      name: 'amountMin', label: t('AFFAIRES.WIP.HISTORY_FILTER_AMOUNT_MIN'), type: 'text',
      placeholder: t('AFFAIRES.WIP.HISTORY_FILTER_AMOUNT_PH'),
    }, {
      name: 'amountMax', label: t('AFFAIRES.WIP.HISTORY_FILTER_AMOUNT_MAX'), type: 'text',
      placeholder: t('AFFAIRES.WIP.HISTORY_FILTER_AMOUNT_PH'),
    }, {
      name:    'invoicing',
      label:   t('AFFAIRES.WIP.FILTER_INVOICING'),
      type:    'select',
      options: (['NONE', 'PARTIAL', 'FULL'] as const)
        .map(value => ({ value, label: t('AFFAIRES.WIP.FILTER_INVOICING_' + value) })),
    }, {
      name:    'clientAmount',
      label:   t('AFFAIRES.WIP.FILTER_CLIENT_AMOUNT'),
      type:    'select',
      options: (['PENDING', 'ENTERED'] as const)
        .map(value => ({ value, label: t('AFFAIRES.WIP.FILTER_CLIENT_AMOUNT_' + value) })),
    }];
  });

  readonly historyFilterConfig = computed<SearchToolbarFilterConfig>(() => ({
    initialValues: this.filterSeed(this.historyFilters(), ['statut', 'invoicing', 'clientAmount']),
  }));

  onHistoryFilterApply(result: FilterResult): void {
    this.historyFilters.set(this.normalizeFilters(result, ['period']));
  }

  readonly filteredHistoryRows = computed(() => {
    const f      = this.historyFilters();
    const statut = this.filterText(f, 'statut');
    const range  = this.dayRange(f['period']);
    const min    = this.parseAmount(this.filterText(f, 'amountMin'));
    const max    = this.parseAmount(this.filterText(f, 'amountMax'));
    const billed = this.filterText(f, 'invoicing');
    const client = this.filterText(f, 'clientAmount');
    const rows = this.historyRows().filter(row => {
      const t    = row['_raw'] as TsTauxDto;
      const line = row['_line'] as (LineDetailDto & { clientApprovedAmount?: number | null }) | null;
      if (statut && t.statut !== statut) return false;
      // Chevauchement : la période de la déclaration croise la plage choisie.
      if (range && !(t.periodDateFrom.slice(0, 10) <= range[1] && t.periodDateTo.slice(0, 10) >= range[0])) return false;
      if (min != null && t.montantIncremental < min) return false;
      if (max != null && t.montantIncremental > max) return false;
      if (billed && this.historyInvoicing(row) !== billed) return false;
      if (client === 'PENDING' && line?.statut !== 'EN_ATTENTE_CLIENT') return false;
      if (client === 'ENTERED' && line?.clientApprovedAmount == null) return false;
      return true;
    });
    return searchTableRows(rows, this.historyColumns(), this.historySearch());
  });

  /** Devise des montants de l'historique (cellules partagées tableau / popup). */
  historyDevise(): string {
    return this.selectedTs()?.devise ?? this.affaire.devise;
  }

  // ── Historique : actions de la carte + popup "Afficher tout" — même mécanique que la
  // popup Historique de affaire-wip-tab / de l'ancien onglet TS. ──
  /** Révèle la pastille Export / Afficher tout au survol de la carte. */
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

  /** La popup est en lecture seule : pas de colonne Actions. */
  readonly historyPopupColumns = computed(() => this.historyColumns());

  /** La popup est en lecture seule : mêmes outils que le tableau de l'onglet, sans ses
   * boutons de ligne. */
  readonly historyPopupConfig = computed<TableConfig>(() => ({
    ...this.historyConfig(),
    actions: [],
    ...delegatedSort(untracked(this.historyPopupSort)),
  }));

  readonly sortedHistoryRows = computed(() =>
    sortTableRows(this.filteredHistoryRows(), this.historyPopupColumns(), this.historyPopupSort()));

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

  /** Recherche, tri et taille de page repassent à la page 0 — sinon une page 3 resterait
   * affichée après une recherche qui ne renvoie qu'une page de résultats. */
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

  /** Export généré par le backend (WipExportController) — reçoit les lignes déjà filtrées
   * (carte) ou filtrées + triées (popup) : on envoie leurs ids, dans cet ordre, et le serveur
   * relit ces déclarations en base. */
  exportHistoryExcel(rows: TableRow[]): void {
    const tsId = this.selectedTsId();
    if (!rows.length || !tsId) return;
    const ref = this.selectedTs()?.referenceTs ?? this.affaire.reference ?? String(this.affaire.id);
    this.exportSvc.download(
      this.exportSvc.tsHistory(this.affaire.id, tsId, rows.map(r => (r['_raw'] as TsTauxDto).id)),
      `Historique_${ref}.xlsx`, this.exporting);
  }

  /** Avancement de la facturation d'une déclaration — mêmes valeurs que la colonne
   *  « Facturé » (`_isComplete` / `_montantFacture`, voir historyRows). */
  private historyInvoicing(row: TableRow): 'NONE' | 'PARTIAL' | 'FULL' {
    if (row['_isComplete']) return 'FULL';
    const done = row['_montantFacture'] as number | null;
    return done != null && done >= 0.01 ? 'PARTIAL' : 'NONE';
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

  tauxBadgeVariant(statut: string) {
    return WIP_TAUX_STATUT_BADGE[statut] ?? 'neutral';
  }

  /** Same mechanic as AffaireWipTabComponent.findChainTail() (AV) / the old TS batch tab's
   * own factureProgress(): a partial client confirmation never modifies the declaration's own
   * BillingLine — it just sets that line's wipCarriedForward. Walking carriedForwardFromLineId
   * forward finds whatever later line (if any) picked that remainder up; the tail's own
   * wipCarriedForward is what's still genuinely outstanding right now. */
  private findChainTail(line: LineDetailDto, lines: LineDetailDto[]): LineDetailDto {
    let tail = line;
    for (let i = 0; i < 50; i++) {
      const next = lines.find(l => l.carriedForwardFromLineId === tail.id);
      if (!next) break;
      tail = next;
    }
    return tail;
  }

  /** Fields read by the history table's "Facturé" cell (factureProgress column): how much of
   * this declaration's montantIncremental has actually been confirmed/billed so far. */
  private factureProgress(taux: TsTauxDto, lines: LineDetailDto[]) {
    const originLine = taux.billingLineId != null ? lines.find(l => l.id === taux.billingLineId) ?? null : null;
    const tail = originLine ? this.findChainTail(originLine, lines) : null;
    const remainderPending = tail ? Number((tail.wipCarriedForward ?? 0).toFixed(3)) : null;
    const montantFacture = remainderPending !== null
      ? Number((taux.montantIncremental - remainderPending).toFixed(3))
      : null;
    return {
      _remainderPending: remainderPending,
      _montantFacture:   montantFacture,
      _isComplete:       remainderPending !== null && remainderPending < 0.01,
    };
  }

  // ── Réponse client en attente ─────────────────────────────────────────────
  lineHistory = signal<LineDetailDto[]>([]);

  private loadLineHistory(): void {
    const tsId = this.selectedTsId();
    if (!tsId || !this.affaire?.id) return;
    this.billingSvc.getBillingLinesDetailed(this.affaire.id).subscribe({
      next:  lines => this.lineHistory.set(lines.filter(l => l.billingMode === 'TS' && l.tsId === tsId)),
      error: () => this.lineHistory.set([]),
    });
  }

  clientAmountInputs    = signal<Map<number, number | null>>(new Map());
  submittingClientTauxId = signal<number | null>(null);
  clientAmountError     = signal<string | null>(null);

  getClientAmountInput(lineId: number): number | null {
    return this.clientAmountInputs().get(lineId) ?? null;
  }

  setClientAmountInput(lineId: number, value: number | null): void {
    const map = new Map(this.clientAmountInputs());
    map.set(lineId, value);
    this.clientAmountInputs.set(map);
  }

  /** ✔ actif sauf pour un montant saisi hors bornes — un champ vide est valide (voir
   * confirmClientAmount), comme le `disabled` de l'action validateClient de l'historique AV. */
  isClientAmountValid(line: LineDetailDto): boolean {
    const input = this.getClientAmountInput(line.id);
    return input === null || (input >= 0 && input <= line.montantHt);
  }

  /** Champ vide = le client accepte tout le montant déclaré — même repli que
   * confirmAvClientAmount() de affaire-wip-tab. */
  confirmClientAmount(line: LineDetailDto, taux: TsTauxDto): void {
    const amount = this.getClientAmountInput(line.id) ?? line.montantHt;
    const tsId = this.selectedTsId();
    if (amount < 0 || amount > line.montantHt
      || !tsId || this.submittingClientTauxId() !== null) return;
    this.submittingClientTauxId.set(taux.id);
    this.clientAmountError.set(null);
    this.svc.enterClientAmount(tsId, taux.id, amount).subscribe({
      next: () => {
        this.submittingClientTauxId.set(null);
        this.setClientAmountInput(line.id, null);
        this.loadLineHistory();
        this.loadTauxHistory();
        this.dataChanged.emit();
      },
      error: err => {
        this.submittingClientTauxId.set(null);
        this.clientAmountError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.CLIENT_AMOUNT_ERROR'));
      },
    });
  }

  // ── Chargement initial ────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadSummaries();
    this.document.addEventListener('click', this.onChipRemoveCapture, true);
  }

  ngOnDestroy(): void {
    // Le panneau du calendrier a pu être déplacé sous <body> : Angular ne le nettoiera pas
    // tout seul puisqu'il n'est plus là où le template l'a créé.
    this.document.removeEventListener('click', this.onChipRemoveCapture, true);
    this.datePickerPanelRef()?.nativeElement.remove();
    // Même raison pour la popup "Afficher tout" si l'onglet est quitté popup ouverte.
    this.historyOverlayPortaled?.remove();
    this.historyOverlayPortaled = null;
  }

  constructor() {
    // Popup "Afficher tout" déplacée sous <body> — même portail que historyOverlayRef de
    // affaire-wip-tab : `position: fixed` se cale sur le premier ancêtre portant un
    // transform/filter (sidebar du shell, daf-card 'glass'), pas sur le viewport ; sans ça
    // la popup ne couvrirait pas toute la page.
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

  private loadSummaries(): void {
    if (!this.affaire?.id) return;
    this.loadingSummaries.set(true);
    this.svc.getSummaryForAffaire(this.affaire.id).subscribe({
      next: list => {
        this.summaries.set(list);
        this.loadingSummaries.set(false);
        // Premier chargement (ou TS courant disparu de la liste) : on ouvre d'office le
        // premier TS, il n'y a plus d'écran « liste » où en choisir un. Un rechargement
        // après une action garde le TS en cours.
        const current = this.selectedTsId();
        if (list.length && (current === null || !list.some(s => s.tsId === current))) {
          this.selectTs(list[0]);
        }
      },
      error: () => this.loadingSummaries.set(false),
    });
  }

  private toIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
