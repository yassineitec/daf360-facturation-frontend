import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonComponent, SectionCardComponent, SelectComponent, SelectOption } from '@khalilrebhiitec/daf360';
import { PermissionDirective } from '../../../shared/permission.directive';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { SubcontractingService } from '../subcontracting.service';
import {
  CostInvoiceOstLinkDto, NOT_LINKABLE_INVOICE_STATUSES, OstCandidateDto,
} from '../subcontracting.model';

/**
 * Bloc « Sous-traitance » de la fiche d'une facture fournisseur (V145) : l'ordre de
 * sous-traitance auquel la facture est imputée, ou le moyen de l'imputer à un OST en cours
 * de la même entité. Imputer crée le coût ST (HT, date, devise de la facture) ; retirer
 * l'imputation supprime ce coût — la facture elle-même n'est jamais modifiée.
 */
@Component({
  selector: 'app-cost-invoice-ost-link',
  imports: [TranslatePipe, ButtonComponent, SectionCardComponent, SelectComponent, PermissionDirective, DisplayCurrencyPipe],
  template: `
    <daf-section-card>
      <div class="flex flex-col gap-3 p-6">
        <p class="text-label-caps font-extrabold uppercase tracking-widest text-on-surface-variant">
          {{ 'SUBCONTRACTING.LINK.SECTION_TITLE' | translate }}
        </p>

        @if (error()) {
          <div class="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{{ error() }}</div>
        }

        @if (loading()) {
          <p class="text-body-sm text-on-surface-variant">…</p>
        } @else if (link(); as l) {
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex min-w-0 flex-col gap-0.5">
              <span class="text-body-md font-bold text-on-surface">
                {{ 'SUBCONTRACTING.LINK.LINKED_TO' | translate : { ost: l.referenceOst } }}
                · {{ l.montant | displayCurrency : l.devise }}
              </span>
              <span class="text-body-sm text-on-surface-variant">
                {{ 'SUBCONTRACTING.LINK.LINKED_AFFAIRE' | translate : { affaire: affaireLabel(l) } }}
              </span>
              @if (l.sousTraitantName) {
                <span class="text-body-sm text-on-surface-variant">
                  {{ 'SUBCONTRACTING.LINK.LINKED_ST' | translate : { st: l.sousTraitantName } }}
                </span>
              }
            </div>
            <daf-button *appHasPermission="'FACT_MANAGE_COST'"
              [options]="{ variant: 'danger', size: 'sm', loading: saving(), iconStart: 'link_off',
                           label: 'SUBCONTRACTING.LINK.UNLINK' | translate }"
              (onClick)="unlink()" />
          </div>
        } @else {
          <p class="text-body-sm text-on-surface-variant">{{ 'SUBCONTRACTING.LINK.NOT_LINKED' | translate }}</p>
          @if (!linkable()) {
            <p class="text-body-sm text-outline">{{ 'SUBCONTRACTING.LINK.NOT_LINKABLE_STATUS' | translate }}</p>
          } @else {
            <ng-container *appHasPermission="'FACT_MANAGE_COST'">
              @if (!picking()) {
                <div>
                  <daf-button
                    [options]="{ variant: 'teal', size: 'sm', iconStart: 'handshake',
                                 label: 'SUBCONTRACTING.LINK.LINK_TO_OST' | translate }"
                    (onClick)="startPicking()" />
                </div>
              } @else if (candidates().length === 0 && !candidatesLoading()) {
                <p class="text-body-sm text-outline">{{ 'SUBCONTRACTING.LINK.NO_CANDIDATE' | translate }}</p>
              } @else {
                <div class="flex flex-wrap items-end gap-3">
                  <div class="min-w-[260px] flex-1">
                    <daf-select
                      [options]="candidateOptions()"
                      [config]="{ label: ('SUBCONTRACTING.LINK.SELECT_OST' | translate),
                                  placeholder: ('SUBCONTRACTING.LINK.SELECT_OST_PH' | translate),
                                  searchable: true, fullWidth: true }"
                      [selected]="selectedOrdre() ? [selectedOrdre()!] : []"
                      (selectedChange)="selectedOrdre.set($event[0] || null)" />
                  </div>
                  <daf-button
                    [options]="{ variant: 'primary', size: 'sm', loading: saving(), disabled: !selectedOrdre(),
                                 label: 'SUBCONTRACTING.LINK.CONFIRM' | translate }"
                    (onClick)="confirmLink()" />
                  <daf-button
                    [options]="{ variant: 'ghost', size: 'sm', label: 'SUBCONTRACTING.LINK.CANCEL' | translate }"
                    (onClick)="picking.set(false)" />
                </div>
                <p class="text-[11px] text-outline">{{ 'SUBCONTRACTING.LINK.AMOUNT_NOTE' | translate }}</p>
              }
            </ng-container>
          }
        }
      </div>
    </daf-section-card>
  `,
})
export class CostInvoiceOstLinkComponent {
  invoiceId     = input.required<number>();
  invoiceStatus = input<string | null>(null);

  private readonly svc = inject(SubcontractingService);
  private readonly translate = inject(TranslateService);

  readonly link              = signal<CostInvoiceOstLinkDto | null>(null);
  readonly loading           = signal(true);
  readonly error             = signal<string | null>(null);
  readonly saving            = signal(false);
  readonly picking           = signal(false);
  readonly candidates        = signal<OstCandidateDto[]>([]);
  readonly candidatesLoading = signal(false);
  readonly selectedOrdre     = signal<string | null>(null);

  readonly linkable = computed(() => !NOT_LINKABLE_INVOICE_STATUSES.includes(this.invoiceStatus() ?? ''));

  readonly candidateOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    const match = this.translate.instant('SUBCONTRACTING.LINK.SUPPLIER_MATCH');
    return this.candidates().map(c => ({
      value: String(c.ordreId),
      label: `${c.referenceOst} — ${c.affaireReference}${c.affaireIntitule ? ' ' + c.affaireIntitule : ''}`
        + `${c.sousTraitantName ? ' · ' + c.sousTraitantName : ''}${c.matchesSupplier ? ' (' + match + ')' : ''}`,
    }));
  });

  constructor() {
    effect(() => {
      const id = this.invoiceId();
      untracked(() => this.load(id));
    });
  }

  private load(id: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.picking.set(false);
    this.svc.getInvoiceOstLink(id).subscribe({
      next: l => { this.link.set(l ?? null); this.loading.set(false); },
      error: () => { this.link.set(null); this.loading.set(false); },
    });
  }

  startPicking(): void {
    this.picking.set(true);
    this.selectedOrdre.set(null);
    this.candidatesLoading.set(true);
    this.svc.listOstCandidates(this.invoiceId()).subscribe({
      next: l => {
        this.candidates.set(l);
        if (l.length && l[0].matchesSupplier) this.selectedOrdre.set(String(l[0].ordreId));
        this.candidatesLoading.set(false);
      },
      error: () => { this.candidates.set([]); this.candidatesLoading.set(false); },
    });
  }

  confirmLink(): void {
    const ordre = this.selectedOrdre();
    if (!ordre) return;
    this.saving.set(true);
    this.error.set(null);
    this.svc.linkInvoiceToOst(this.invoiceId(), Number(ordre)).subscribe({
      next: () => { this.saving.set(false); this.load(this.invoiceId()); },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? this.translate.instant('SUBCONTRACTING.LINK.ERROR'));
      },
    });
  }

  unlink(): void {
    this.saving.set(true);
    this.error.set(null);
    this.svc.unlinkInvoice(this.invoiceId()).subscribe({
      next: () => { this.saving.set(false); this.load(this.invoiceId()); },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? this.translate.instant('SUBCONTRACTING.LINK.UNLINK_ERROR'));
      },
    });
  }

  affaireLabel(l: CostInvoiceOstLinkDto): string {
    return [l.affaireReference, l.affaireIntitule].filter(Boolean).join(' — ');
  }
}
