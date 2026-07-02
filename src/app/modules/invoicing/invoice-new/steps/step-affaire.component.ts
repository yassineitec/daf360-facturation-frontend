import {
  Component, OnInit, inject, input, output, signal, computed,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { InvoiceService } from '../../invoice.service';
import { AffaireListItem, RafDetailsDto, TsDto } from '../../../affaires/affaire.model';
import { AffaireService } from '../../../affaires/affaire.service';

const VALID_BILLING_MODES = new Set(['AV', 'JAL', 'TM', 'CP', 'RMB']);

export interface StepAffaireValue {
  affaireId:   number | null;
  tsId:        number | null;
  invoiceType: string;
  clientId:    number | null;
  paysId:      number;
  currency:    string;
  billingMode: string;
}

@Component({
  selector: 'app-step-affaire',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  template: `
<div class="step-affaire">

  <!-- Affaire search -->
  <div class="field">
    <label>{{ 'INVOICING.STEP_AFFAIRE.AFFAIRE_LABEL' | translate }}</label>
    <div class="search-wrap">
      <span class="material-symbols-outlined search-icon-prefix">search</span>
      <input type="search" class="form-input form-input--search"
        [placeholder]="'INVOICING.STEP_AFFAIRE.SEARCH_PLACEHOLDER' | translate"
        [value]="searchQuery()" (input)="onSearchInput($event)"
        maxlength="100" autocomplete="off" />
    </div>

    @if (searching()) {
      <div class="search-hint">{{ 'INVOICING.STEP_AFFAIRE.SEARCHING' | translate }}</div>
    }

    @if (searchResults().length > 0 && !selectedAffaire()) {
      <div class="search-dropdown">
        @for (a of searchResults(); track a.id) {
          <div class="search-item" (click)="selectAffaire(a)">
            <span class="material-symbols-outlined si-icon">folder_open</span>
            <div>
              <span class="aff-ref">{{ a.reference }}</span>
              <span class="aff-name"> | {{ a.intitule }}</span>
              <p class="aff-client">{{ a.clientName }}</p>
            </div>
          </div>
        }
      </div>
    }

    @if (selectedAffaire()) {
      <div class="selected-affaire">
        <div class="sel-header">
          <span class="aff-ref">{{ selectedAffaire()!.reference }}</span>
          <span class="aff-name">{{ selectedAffaire()!.intitule }}</span>
          <button type="button" class="clear-btn" (click)="clearAffaire()"
            [title]="'INVOICING.STEP_AFFAIRE.DESELECT' | translate">&times;</button>
        </div>
        <div class="sel-kpis">
          <div class="kpi">
            <span class="kpi-label">{{ 'INVOICING.STEP_AFFAIRE.BUDGET' | translate }}</span>
            <span class="kpi-val">{{ formatAmount(selectedAffaire()!.budgetPrevisionnel ?? 0) }}</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">{{ 'INVOICING.STEP_AFFAIRE.RAF' | translate }}</span>
            @if (rafLoading()) {
              <span class="kpi-val">…</span>
            } @else {
              <span class="kpi-val" [class.raf-warn]="rafWarning()" [class.raf-block]="rafBlocked()">
                {{ rafDetails() ? formatAmount(rafDetails()!.rafDisponible) : '—' }}
              </span>
            }
          </div>
        </div>
        @if (rafBlocked()) {
          <div class="raf-alert raf-alert--block">
            <span class="material-symbols-outlined">block</span>
            {{ 'INVOICING.STEP_AFFAIRE.RAF_BLOCKED' | translate }}
          </div>
        } @else if (rafWarning()) {
          <div class="raf-alert raf-alert--warn">
            <span class="material-symbols-outlined">warning</span>
            {{ 'INVOICING.STEP_AFFAIRE.RAF_LOW' | translate: { pct: formatPct(rafPct()) } }}
          </div>
        }
      </div>
    }
  </div>

  <!-- Mode de facturation (affiché si l'affaire n'a pas de mode valide) -->
  @if (selectedAffaire() && !validBillingModeFromAffaire()) {
    <div class="field">
      <label>{{ 'INVOICING.STEP_AFFAIRE.BILLING_MODE_LABEL' | translate }}</label>
      <div class="form-select-wrap">
        <select class="form-input" [formControl]="form.controls['billingMode']"
          [class.invalid]="form.controls['billingMode'].invalid && form.controls['billingMode'].touched">
          <option value="">{{ 'INVOICING.STEP_AFFAIRE.SELECT' | translate }}</option>
          <option value="TM">{{ 'INVOICING.STEP_AFFAIRE.BILLING_MODES.TM' | translate }}</option>
          <option value="CP">{{ 'INVOICING.STEP_AFFAIRE.BILLING_MODES.CP' | translate }}</option>
          <option value="AV">{{ 'INVOICING.STEP_AFFAIRE.BILLING_MODES.AV' | translate }}</option>
          <option value="JAL">{{ 'INVOICING.STEP_AFFAIRE.BILLING_MODES.JAL' | translate }}</option>
          <option value="RMB">{{ 'INVOICING.STEP_AFFAIRE.BILLING_MODES.RMB' | translate }}</option>
        </select>
      </div>
      @if (form.controls['billingMode'].invalid && form.controls['billingMode'].touched) {
        <span class="error-msg">{{ 'INVOICING.STEP_AFFAIRE.BILLING_MODE_REQUIRED' | translate }}</span>
      }
    </div>
  }

  <!-- Type de facture -->
  <div class="field">
    <label>{{ 'INVOICING.STEP_AFFAIRE.TYPE_LABEL' | translate }}</label>
    <div class="form-select-wrap">
      <select class="form-input" [formControl]="form.controls['invoiceType']"
        [class.invalid]="form.controls['invoiceType'].invalid && form.controls['invoiceType'].touched">
        <option value="">{{ 'INVOICING.STEP_AFFAIRE.TYPE_SELECT' | translate }}</option>
        <option value="ACOMPTE">{{ 'INVOICING.STEP_AFFAIRE.INVOICE_TYPES.ACOMPTE' | translate }}</option>
        <option value="INTERMEDIAIRE">{{ 'INVOICING.STEP_AFFAIRE.INVOICE_TYPES.INTERMEDIAIRE' | translate }}</option>
        <option value="FINALE">{{ 'INVOICING.STEP_AFFAIRE.INVOICE_TYPES.FINALE' | translate }}</option>
        <option value="AVOIR">{{ 'INVOICING.STEP_AFFAIRE.INVOICE_TYPES.AVOIR' | translate }}</option>
      </select>
    </div>
    @if (form.controls['invoiceType'].invalid && form.controls['invoiceType'].touched) {
      <span class="error-msg">{{ 'INVOICING.STEP_AFFAIRE.TYPE_REQUIRED' | translate }}</span>
    }
  </div>

  <!-- TS associé (si affaire sélectionnée) -->
  @if (selectedAffaire() && tsList().length > 0) {
    <div class="field">
      <label>{{ 'INVOICING.STEP_AFFAIRE.TS_LABEL' | translate }}</label>
      <div class="form-select-wrap">
        <select class="form-input" [formControl]="form.controls['tsId']">
          <option [value]="null">{{ 'INVOICING.STEP_AFFAIRE.TS_NONE' | translate }}</option>
          @for (ts of tsList(); track ts.id) {
            <option [value]="ts.id">{{ ts.referenceTs }} — {{ ts.intitule }} ({{ formatAmount(ts.montantEstime) }})</option>
          }
        </select>
      </div>
    </div>
  }

  @if (showActions()) {
    <div class="step-actions">
      <button type="button" class="btn-cancel" (click)="cancel.emit()">
        <span class="material-symbols-outlined">close</span>
        {{ 'INVOICING.STEP_AFFAIRE.CANCEL' | translate }}
      </button>
      <button type="button" class="btn-next" (click)="next()" [disabled]="rafBlocked() || rafLoading()">
        {{ 'INVOICING.STEP_AFFAIRE.NEXT' | translate }}
        <span class="material-symbols-outlined">arrow_forward</span>
      </button>
    </div>
  }
</div>
  `,
  styleUrl: './step.component.scss',
})
export class StepAffaireComponent implements OnInit {
  private readonly invSvc = inject(InvoiceService);
  private readonly affSvc = inject(AffaireService);
  private readonly fb     = inject(FormBuilder);

  showActions = input<boolean>(true);
  nextStep    = output<StepAffaireValue>();
  cancel      = output<void>();

  searchQuery     = signal('');
  searchResults   = signal<AffaireListItem[]>([]);
  searching       = signal(false);
  selectedAffaire = signal<AffaireListItem | null>(null);
  rafDetails      = signal<RafDetailsDto | null>(null);
  rafLoading      = signal(false);
  tsList          = signal<TsDto[]>([]);

  private readonly search$ = new Subject<string>();

  form = this.fb.group({
    invoiceType:  ['', Validators.required],
    tsId:         [null as number | null],
    billingMode:  [''],
  });

  readonly validBillingModeFromAffaire = computed(() => {
    const bm = this.selectedAffaire()?.billingMode;
    return bm && VALID_BILLING_MODES.has(bm) ? bm : null;
  });

  readonly rafPct = computed(() => {
    const raf    = this.rafDetails();
    const budget = this.selectedAffaire()?.budgetPrevisionnel;
    if (!raf || !budget || budget === 0) return 100;
    return (raf.rafDisponible / budget) * 100;
  });
  readonly rafWarning = computed(() => this.rafPct() < 20 && this.rafPct() > 0);
  readonly rafBlocked = computed(() => {
    if (this.rafLoading()) return false;
    const raf = this.rafDetails();
    if (!raf) return false;
    return raf.rafDisponible <= 0;
  });

  ngOnInit(): void {
    this.search$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => { this.searching.set(true); return this.invSvc.searchAffaires(q); }),
    ).subscribe({
      next:  r => { this.searchResults.set(r); this.searching.set(false); },
      error: () => this.searching.set(false),
    });
  }

  onSearchInput(e: Event): void {
    const q = (e.target as HTMLInputElement).value;
    this.searchQuery.set(q);
    if (q.trim().length >= 2) this.search$.next(q.trim());
    else this.searchResults.set([]);
  }

  selectAffaire(a: AffaireListItem): void {
    this.selectedAffaire.set(a);
    this.rafDetails.set(null);
    this.searchResults.set([]);
    this.searchQuery.set(`${a.reference} — ${a.intitule}`);
    const bmCtrl = this.form.controls['billingMode'];
    const validBm = a.billingMode && VALID_BILLING_MODES.has(a.billingMode) ? a.billingMode : null;
    if (validBm) {
      bmCtrl.setValue(validBm);
      bmCtrl.clearValidators();
    } else {
      bmCtrl.setValue('');
      bmCtrl.setValidators([Validators.required]);
    }
    bmCtrl.updateValueAndValidity();

    this.rafLoading.set(true);
    this.affSvc.getAffaireRaf(a.id).subscribe({
      next:  r => { this.rafDetails.set(r); this.rafLoading.set(false); },
      error: () => this.rafLoading.set(false),
    });

    this.affSvc.getTS(a.id).subscribe({ next: r => this.tsList.set(r), error: () => {} });
  }

  clearAffaire(): void {
    this.selectedAffaire.set(null);
    this.rafDetails.set(null);
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.tsList.set([]);
    const bmCtrl = this.form.controls['billingMode'];
    bmCtrl.setValue('');
    bmCtrl.clearValidators();
    bmCtrl.updateValueAndValidity();
    this.form.patchValue({ tsId: null });
  }

  next(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.rafBlocked() || this.rafLoading()) return;
    const v = this.form.getRawValue();
    const aff = this.selectedAffaire();
    this.nextStep.emit({
      affaireId:   aff?.id ?? null,
      tsId:        v.tsId ?? null,
      invoiceType: v.invoiceType!,
      clientId:    aff?.clientId ?? null,
      paysId:      aff?.paysId ?? 0,
      currency:    aff?.devise ?? 'TND',
      billingMode: v.billingMode || this.validBillingModeFromAffaire() || '',
    });
  }

  formatAmount(v: number, devise = 'TND'): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: devise, minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v);
  }

  formatPct(v: number): string {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v);
  }
}
