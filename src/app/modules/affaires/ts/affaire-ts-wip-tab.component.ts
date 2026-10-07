import { Component, EventEmitter, Input, OnInit, Output, computed, effect, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, CardComponent, CheckboxComponent, FormFieldComponent, StatusBadgeComponent,
  DataTableComponent, DafCellDirective, TableColumn, TableConfig, TableRow, BadgeCell,
} from '@khalilrebhiitec/daf360';
import { BillingService, LineDetailDto, TsBatchDto, TsPendingCarryForwardDto } from '../billing/billing.service';
import { RowSelection } from '../billing/row-selection';
import { TsDto } from '../affaire.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { TS_BATCH_STATUT_BADGE } from '../../../shared/enum-labels';
import { tableTools } from '../../../shared/table-tools';
import { EmailPreviewModalComponent } from '../wip/email-preview-modal.component';

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
    DataTableComponent, DafCellDirective, EmailPreviewModalComponent,
  ],
  providers: [DisplayCurrencyPipe],
  template: `
    <div class="flex flex-col gap-6">
      @if (errorMsg()) {
        <div class="rounded-lg bg-danger/10 px-3 py-2 text-body-sm text-danger">{{ errorMsg() }}</div>
      }

      <!-- ── TS prêts à facturer ──────────────────────────────────────────── -->
      <daf-card [options]="{ variant: 'glass', radius: 'xl', padding: 'md', hoverable: true }">
        <div class="flex flex-col gap-4">
          <h3 class="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
            <span class="material-symbols-outlined text-[18px]">receipt_long</span>
            {{ 'AFFAIRES.WIP.TS_ELIGIBLE_TITLE' | translate }}
          </h3>

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
            <p class="text-body-sm text-on-surface-variant">{{ 'AFFAIRES.WIP.LOADING' | translate }}</p>
          } @else if (eligible().length === 0) {
            <p class="text-body-sm text-on-surface-variant">{{ 'AFFAIRES.WIP.TS_ELIGIBLE_EMPTY' | translate }}</p>
          } @else {
            <daf-data-table
              [columns]="eligibleColumns()"
              [rows]="eligibleRows()"
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
      </daf-card>

      <!-- ── Soumissions en cours ─────────────────────────────────────────── -->
      @if (loadingActive()) {
        <p class="text-body-sm text-on-surface-variant">{{ 'AFFAIRES.WIP.LOADING' | translate }}</p>
      } @else if (active().length > 0) {
        <daf-card [options]="{ variant: 'glass', radius: 'xl', padding: 'md', hoverable: true }">
          <div class="flex flex-col gap-4">
            <h3 class="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
              <span class="material-symbols-outlined text-[18px]">pending_actions</span>
              {{ 'AFFAIRES.WIP.TS_ACTIVE_TITLE' | translate }}
            </h3>

            <daf-data-table
              [columns]="activeColumns()"
              [rows]="activeRows()"
              [config]="activeConfig()">

              <ng-template dafCell="actions" let-row>
                @if (row['_raw'].statut === 'EN_ATTENTE_CLIENT') {
                  <div class="flex items-end justify-end gap-2">
                    <daf-form-field
                      [value]="getClientAmountInput(row['_raw'].batchId)"
                      (valueChange)="setClientAmountInput(row['_raw'].batchId, $any($event))"
                      [options]="{ label: ('AFFAIRES.WIP.CLIENT_AMOUNT_LABEL' | translate),
                                    type: 'number', fullWidth: true,
                                    hint: ('AFFAIRES.WIP.CLIENT_AMOUNT_HINT' | translate) }" />
                    <daf-button
                      [options]="{ variant: 'teal', label: ('AFFAIRES.WIP.CLIENT_AMOUNT_CONFIRM' | translate),
                                    loading: submittingClientBatch() === row['_raw'].batchId,
                                    disabled: getClientAmountInput(row['_raw'].batchId) === null ||
                                              getClientAmountInput(row['_raw'].batchId)! < 0 ||
                                              getClientAmountInput(row['_raw'].batchId)! > row['_raw'].combinedMontant }"
                      (onClick)="confirmClientAmount(row['_raw'])" />
                  </div>
                }
              </ng-template>
            </daf-data-table>

            @if (clientAmountError()) {
              <p class="text-body-sm text-danger">{{ clientAmountError() }}</p>
            }
          </div>
        </daf-card>
      }

      <!-- ── Historique ───────────────────────────────────────────────────── -->
      @if (loadingHistory()) {
        <p class="text-body-sm text-on-surface-variant">{{ 'AFFAIRES.WIP.LOADING' | translate }}</p>
      } @else if (history().length > 0) {
        <daf-card [options]="{ variant: 'glass', radius: 'xl', padding: 'md', hoverable: true }">
          <div class="flex flex-col gap-4">
            <h3 class="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
              <span class="material-symbols-outlined text-[18px]">history</span>
              {{ 'AFFAIRES.WIP.TS_HISTORY_TITLE' | translate }}
            </h3>

            <daf-data-table [columns]="historyColumns()" [rows]="historyRows()" [config]="historyConfig()">
              <!-- Même montant/colonne "Facturé" que la carte AV (tauxHistoryColumns/Rows,
                   dafCell="factureProgress") : X/Y + badge Complet/Partiel, X calculé en
                   remontant la chaîne carriedForwardFromLineId jusqu'à son dernier maillon
                   (findChainTail) -- une relance partielle (client ou assistant de facturation)
                   laisse X < Y sans jamais changer Y (originalMontant, fixe depuis la
                   soumission). -->
              <ng-template dafCell="factureProgress" let-row>
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

              <ng-template dafCell="statut" let-row>
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
            </daf-data-table>
          </div>
        </daf-card>
      }

      <app-email-preview-modal #emailPreviewModal />
    </div>
  `,
  styleUrl: './affaire-ts-wip-tab.component.scss',
})
export class AffaireTsWipTabComponent implements OnInit {
  @Input({ required: true }) affaire!: { id: number; devise: string };
  @Output() readonly dataChanged = new EventEmitter<void>();

  private readonly svc       = inject(BillingService);
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);

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
  }

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
    return [
      { key: 'select',    label: '', type: 'custom', width: '40px' },
      { key: 'reference', label: t('AFFAIRES.WIP.TS_COL_REFERENCE'), type: 'custom' },
      { key: 'intitule',  label: t('AFFAIRES.WIP.TS_COL_INTITULE') },
      { key: 'montant',   label: t('AFFAIRES.WIP.TS_COL_MONTANT'), align: 'right',
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
    return [
      { key: 'reference', label: t('AFFAIRES.WIP.TS_COL_REFERENCE') },
      { key: 'montant',   label: t('AFFAIRES.WIP.TS_COL_MONTANT'), align: 'right' },
      { key: 'statut',    label: t('AFFAIRES.WIP.TS_COL_STATUT'), type: 'badge' },
      { key: 'actions',   label: t('AFFAIRES.WIP.TS_COL_ACTIONS'), type: 'custom', align: 'right' },
    ];
  });

  readonly activeRows = computed<TableRow[]>(() => this.active().map(b => ({
    id:        b.batchId,
    reference: this.batchReferences(b),
    montant:   this.currency.transform(b.combinedMontant, this.affaire.devise),
    statut:    { label: this.translate.instant('AFFAIRES.WIP.BATCH_STATUS_' + b.statut),
                 options: { variant: this.tsBatchBadgeVariant(b.statut), size: 'sm' } } satisfies BadgeCell,
    _raw:      b,
  } satisfies TableRow)));

  readonly activeConfig = computed<TableConfig>(() => ({
    showHeader: true,
    hoverable:  false,
    ...tableTools(this.translate),
  }));

  // ── Colonnes/lignes "Historique" ────────────────────────────────────────────
  readonly historyColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'reference',    label: t('AFFAIRES.WIP.TS_COL_REFERENCE') },
      { key: 'montant',      label: t('AFFAIRES.WIP.TS_COL_MONTANT'), align: 'right' },
      { key: 'montantClient', label: t('AFFAIRES.WIP.TS_COL_MT_CLIENT'), align: 'right' },
      { key: 'factureProgress', label: t('AFFAIRES.WIP.COL_FACTURE_PROGRESS'), type: 'custom' },
      { key: 'statut',       label: t('AFFAIRES.WIP.TS_COL_STATUT'), type: 'custom' },
      { key: 'date',         label: t('AFFAIRES.WIP.TS_COL_DATE') },
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
    return this.history().map(b => {
      // batchId EST l'id de la ligne leader (convention établie par submitTs()/toBatchDto()) —
      // c'est elle, et seulement elle, qui porte jamais un wipCarriedForward pour ce batch.
      const leaderLine = lines.find(l => l.id === b.batchId) ?? null;
      const tail = leaderLine ? this.findChainTail(leaderLine, lines) : null;
      const remainderPending = tail ? Number((tail.wipCarriedForward ?? 0).toFixed(3)) : null;
      const montantFacture = remainderPending !== null
        ? Number((b.originalMontant - remainderPending).toFixed(3))
        : null;
      const isComplete = remainderPending !== null && remainderPending < 0.01;
      return {
        id:             b.batchId,
        reference:      this.batchReferences(b),
        montant:        this.currency.transform(b.originalMontant, this.affaire.devise),
        montantClient:  b.clientApprovedAmount != null ? this.currency.transform(b.clientApprovedAmount, this.affaire.devise) : '—',
        date:           this.formatDate(b.billingDate),
        _raw:           b,
        _remainderPending: remainderPending,
        _montantFacture:   montantFacture,
        _isComplete:       isComplete,
      } satisfies TableRow;
    });
  });

  readonly historyConfig = computed<TableConfig>(() => ({
    showHeader: true,
    hoverable:  false,
    emptyMessage: this.translate.instant('AFFAIRES.WIP.TS_HISTORY_EMPTY'),
    ...tableTools(this.translate),
  }));

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
  }

  private loadHistory(): void {
    this.loadingHistory.set(true);
    this.svc.getAllTsLinesByAffaire(this.affaire.id).subscribe({
      next:  list => { this.history.set(list); this.loadingHistory.set(false); },
      error: () => this.loadingHistory.set(false),
    });
    this.loadTsLineHistory();
  }

  /** Feeds historyRows' chain-walk (findChainTail) — loaded alongside loadHistory() so it
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
        this.emailPreviewModal().open(preview, done => this.doSubmitSelection(tsIds, done));
      },
      error: err => {
        this.submitting.set(false);
        this.errorMsg.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.TS_SUBMIT_ERROR'));
      },
    });
  }

  private doSubmitSelection(tsIds: number[], done: (errorMessage?: string) => void): void {
    this.svc.submitTs(this.affaire.id, tsIds).subscribe({
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
