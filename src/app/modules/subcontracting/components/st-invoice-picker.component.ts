import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonComponent } from '@khalilrebhiitec/daf360';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { SubcontractingService } from '../subcontracting.service';
import { CoutSTDto, LinkableCostInvoiceDto } from '../subcontracting.model';

/**
 * Choisir une facture fournisseur pour en faire un coût de l'OST (V145). Utilisé par les deux
 * panneaux de coûts d'un OST : l'onglet Sous-traitance de la fiche affaire et le module
 * Sous-traitance. Le serveur ne propose que les factures de l'entité de l'affaire, pas encore
 * rattachées, hors brouillon / renvoyée / rejetée ; si le sous-traitant a un fournisseur
 * associé, ses factures seules par défaut (bascule « Tous les fournisseurs »).
 */
@Component({
  selector: 'app-st-invoice-picker',
  imports: [TranslatePipe, ButtonComponent, DisplayCurrencyPipe],
  template: `
    <section class="flex flex-col gap-3 rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-body-md font-bold text-on-surface">{{ 'SUBCONTRACTING.LINK.PICKER_TITLE' | translate }}</span>
        <div class="flex overflow-hidden rounded-full border border-outline-variant/40 text-[12px]">
          <button type="button" class="px-3 py-1"
                  [class.bg-primary]="!tous()" [class.text-white]="!tous()"
                  (click)="setTous(false)">{{ 'SUBCONTRACTING.LINK.ONLY_SUPPLIER' | translate }}</button>
          <button type="button" class="px-3 py-1"
                  [class.bg-primary]="tous()" [class.text-white]="tous()"
                  (click)="setTous(true)">{{ 'SUBCONTRACTING.LINK.ALL_SUPPLIERS' | translate }}</button>
        </div>
      </div>

      @if (error()) {
        <div class="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{{ error() }}</div>
      }

      @if (loading()) {
        <p class="py-4 text-center text-body-sm text-on-surface-variant">…</p>
      } @else {
        <div class="flex max-h-72 flex-col gap-2 overflow-y-auto">
          @for (f of invoices(); track f.id) {
            <div class="flex items-center justify-between gap-3 rounded-lg border border-outline-variant/30
                        bg-surface-container-lowest px-3 py-2">
              <div class="flex min-w-0 flex-col">
                <span class="text-body-md font-bold text-on-surface">
                  {{ f.netAmount | displayCurrency : f.currency }}
                  <span class="ml-1 text-[11px] font-normal text-outline">HT</span>
                </span>
                <span class="truncate text-[12px] text-on-surface-variant">
                  {{ f.reference }} · {{ f.supplierName || '—' }}@if (f.supplierInvoiceNumber) { · n° {{ f.supplierInvoiceNumber }} }
                </span>
                <span class="text-[11px] text-outline">
                  {{ fmtDate(f.invoiceDate) }} · {{ f.status }}
                  @if (f.matchesSupplier) { · <span class="text-teal">{{ 'SUBCONTRACTING.LINK.SUPPLIER_MATCH' | translate }}</span> }
                </span>
              </div>
              <daf-button
                [options]="{ variant: 'teal', size: 'sm', loading: savingId() === f.id, disabled: savingId() !== null,
                             label: 'SUBCONTRACTING.LINK.ATTACH' | translate, iconStart: 'link' }"
                (onClick)="attach(f)" />
            </div>
          } @empty {
            <p class="py-4 text-center text-body-sm text-on-surface-variant">{{ 'SUBCONTRACTING.LINK.EMPTY' | translate }}</p>
          }
        </div>
      }

      <div class="flex items-center justify-between gap-2">
        <span class="text-[11px] text-outline">{{ 'SUBCONTRACTING.LINK.AMOUNT_NOTE' | translate }}</span>
        <daf-button [options]="{ variant: 'ghost', size: 'sm', label: 'SUBCONTRACTING.LINK.CANCEL' | translate }"
                    (onClick)="closed.emit()" />
      </div>
    </section>
  `,
})
export class StInvoicePickerComponent implements OnInit {
  ordreId = input.required<number>();
  /** Le coût créé — le parent recharge sa liste et l'OST. */
  linked = output<CoutSTDto>();
  closed = output<void>();

  private readonly svc = inject(SubcontractingService);
  private readonly translate = inject(TranslateService);

  readonly invoices = signal<LinkableCostInvoiceDto[]>([]);
  readonly loading  = signal(true);
  readonly error    = signal<string | null>(null);
  readonly tous     = signal(false);
  readonly savingId = signal<number | null>(null);

  ngOnInit(): void { this.load(); }

  setTous(v: boolean): void {
    if (this.tous() === v) return;
    this.tous.set(v);
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.listLinkableInvoices(this.ordreId(), this.tous()).subscribe({
      next: l => { this.invoices.set(l); this.loading.set(false); },
      error: () => {
        this.error.set(this.translate.instant('SUBCONTRACTING.LINK.LOAD_ERROR'));
        this.loading.set(false);
      },
    });
  }

  attach(f: LinkableCostInvoiceDto): void {
    this.savingId.set(f.id);
    this.error.set(null);
    this.svc.addCoutFromInvoice(this.ordreId(), f.id).subscribe({
      next: cout => {
        this.savingId.set(null);
        this.invoices.update(l => l.filter(x => x.id !== f.id));
        this.linked.emit(cout);
      },
      error: err => {
        this.savingId.set(null);
        this.error.set(err?.error?.message ?? this.translate.instant('SUBCONTRACTING.LINK.ERROR'));
      },
    });
  }

  fmtDate(d: string | null): string {
    return d ? new Date(d).toLocaleDateString(this.translate.currentLang() || 'fr') : '—';
  }
}
