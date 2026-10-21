import {
  Component, OnInit, inject, input, output, signal, computed,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { TranslateService } from '@ngx-translate/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { InvoiceService } from '../../invoice.service';
import { AffaireListItem, RafDetailsDto, TsDto } from '../../../affaires/affaire.model';
import { AffaireService } from '../../../affaires/affaire.service';
import { FormFieldComponent, SelectComponent } from '@khalilrebhiitec/daf360';
import { FactListService } from '../../../../core/fact-list.service';
import { ListValueDto } from '../../../cost/cost.model';
import { invoiceTypeLabel } from '../../../../core/invoice-type-labels.service';

// `LIVRABLE` était absent : le mode existait mais était enregistré sous `JAL`, donc
// il passait par inadvertance. Maintenant qu'il est persisté sous son propre code, son
// absence ici rendrait toute affaire « livrables » non facturable. `JAL` reste accepté
// tant que des affaires antérieures à la migration le portent.
const VALID_BILLING_MODES = new Set(['FORFAIT', 'REGIE', 'LIVRABLE']);

export interface StepAffaireValue {
  affaireId:   number | null;
  tsId:        number | null;
  invoiceType: string;
  clientId:    number | null;
  paysId:      number;
  currency:    string;
  billingMode: string;
  /** The affaire's real contract amount -- used as the budget denominator for an ACOMPTE
   * line's percentage columns (see step-lines.component.ts's isAcompte()-gated logic).
   * Optional: only selectAffaire()'s own enrichment fetch populates it, and an ACOMPTE line
   * added before that fetch resolves falls back to treating it as unknown rather than
   * blocking on it. */
  contractAmount?: number | null;
  /** Number of DISTINCT affaires among this invoice's own lines -- only meaningful when
   * affaireId is null (a combined invoice). Lets the combined-invoice summary distinguish
   * "one affaire, several billing modes merged" from "genuinely several affaires" instead of
   * always saying "multi-affaires" even when it's really just one affaire combined across
   * modes (e.g. a FORFAIT line + a TS line from the same affaire). Undefined for an ordinary
   * single-affaire invoice, where it's meaningless. */
  combinedAffaireCount?: number;
}

@Component({
  selector: 'app-step-affaire',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, SelectComponent, FormFieldComponent],
  template: `
<div class="step-affaire">

  @if (isCombinedInvoice()) {
    <div class="selected-affaire combined-invoice-summary">
      @if (isSameAffaireCombined()) {
        <p class="section-title">{{ 'INVOICING.STEP_AFFAIRE.COMBINED_SAME_AFFAIRE_TITLE' | translate }}</p>
        <p class="search-hint">{{ 'INVOICING.STEP_AFFAIRE.COMBINED_SAME_AFFAIRE_HINT' | translate }}</p>
      } @else {
        <p class="section-title">{{ 'INVOICING.STEP_AFFAIRE.COMBINED_TITLE' | translate }}</p>
        <p class="search-hint">{{ 'INVOICING.STEP_AFFAIRE.COMBINED_HINT' | translate }}</p>
      }
    </div>
  }

  @if (!isCombinedInvoice()) {
  <!-- Affaire search -->
  <div class="field">
    <daf-form-field
      [options]="{
        label: ('INVOICING.STEP_AFFAIRE.AFFAIRE_LABEL' | translate),
        placeholder: ('INVOICING.STEP_AFFAIRE.SEARCH_PLACEHOLDER' | translate),
        type: 'search',
        prefixIcon: 'search'
      }"
      [value]="searchQuery()"
      (valueChange)="onSearchInput($event)" />

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
            <span class="kpi-val">{{ formatAmount(selectedAffaire()!.budgetPrevisionnel ?? 0, selectedAffaire()!.devise) }}</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">{{ 'INVOICING.STEP_AFFAIRE.RAF' | translate }}</span>
            @if (rafLoading()) {
              <span class="kpi-val">…</span>
            } @else {
              <span class="kpi-val" [class.raf-warn]="rafWarning()" [class.raf-block]="rafBlocked()">
                {{ rafDetails() ? formatAmount(rafDetails()!.rafDisponible, selectedAffaire()!.devise) : '—' }}
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
  }

  <!-- Mode de facturation (affiché si l'affaire n'a pas de mode valide) -->
  @if (selectedAffaire() && !validBillingModeFromAffaire()) {
    <div class="field">
      <label>{{ 'INVOICING.STEP_AFFAIRE.BILLING_MODE_LABEL' | translate }}</label>
      <daf-select
        [options]="billingModeOptions"
        [selected]="form.controls['billingMode'].value ? [form.controls['billingMode'].value] : []"
        [config]="billingSelectConfig"
        (selectedChange)="form.controls['billingMode'].setValue($event[0] || ''); form.controls['billingMode'].markAsTouched()" />
      @if (form.controls['billingMode'].invalid && form.controls['billingMode'].touched) {
        <span class="error-msg">{{ 'INVOICING.STEP_AFFAIRE.BILLING_MODE_REQUIRED' | translate }}</span>
      }
    </div>
  }

  <!-- Type de facture (nécessite une affaire sélectionnée : c'est son pays qui détermine
       quelles valeurs de la liste configurable INVOICE_TYPE proposer) -->
  @if (selectedAffaire()) {
    <div class="field">
      <label>{{ 'INVOICING.STEP_AFFAIRE.TYPE_LABEL' | translate }}</label>
      <daf-select
        [options]="invoiceTypeOptions()"
        [selected]="form.controls['invoiceType'].value ? [form.controls['invoiceType'].value] : []"
        [config]="typeSelectConfig"
        (selectedChange)="form.controls['invoiceType'].setValue($event[0] || ''); form.controls['invoiceType'].markAsTouched()" />
      @if (form.controls['invoiceType'].invalid && form.controls['invoiceType'].touched) {
        <span class="error-msg">{{ 'INVOICING.STEP_AFFAIRE.TYPE_REQUIRED' | translate }}</span>
      }
      @if (invoiceTypeOptions().length === 0) {
        <span class="error-msg">{{ 'INVOICING.STEP_AFFAIRE.NO_INVOICE_TYPE' | translate }}</span>
      }
    </div>
  }

  <!-- TS associé (si affaire sélectionnée) -->
  @if (selectedAffaire() && tsList().length > 0) {
    <div class="field">
      <label>{{ 'INVOICING.STEP_AFFAIRE.TS_LABEL' | translate }}</label>
      <daf-select
        [options]="tsSelectOptions()"
        [selected]="tsSelectedVal()"
        [config]="tsSelectConfig"
        (selectedChange)="form.controls['tsId'].setValue($event[0] ? +$event[0] : null)" />
    </div>
  }

  @if (showActions()) {
    <div class="step-actions">
      <button type="button" class="btn-cancel" (click)="cancel.emit()">
        <span class="material-symbols-outlined">close</span>
        {{ 'INVOICING.STEP_AFFAIRE.CANCEL' | translate }}
      </button>
      <button type="button" class="btn-next" (click)="next()" [disabled]="rafBlocked() || rafLoading() || (!selectedAffaire() && !isCombinedInvoice())">
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
  private readonly invSvc      = inject(InvoiceService);
  private readonly affSvc      = inject(AffaireService);
  private readonly route       = inject(ActivatedRoute);
  private readonly fb          = inject(FormBuilder);
  private readonly translate   = inject(TranslateService);
  private readonly factListSvc = inject(FactListService);

  readonly billingModeOptions = [
    { value: 'FORFAIT',  label: this.translate.instant('INVOICING.STEP_AFFAIRE.BILLING_MODES.FORFAIT')  },
    { value: 'REGIE',    label: this.translate.instant('INVOICING.STEP_AFFAIRE.BILLING_MODES.REGIE')    },
    { value: 'LIVRABLE', label: this.translate.instant('INVOICING.STEP_AFFAIRE.BILLING_MODES.LIVRABLE') },
  ];

  readonly typeSelectConfig    = { placeholder: this.translate.instant('INVOICING.STEP_AFFAIRE.TYPE_SELECT'), multiple: false, searchable: false, fullWidth: true };
  readonly billingSelectConfig = { placeholder: this.translate.instant('INVOICING.STEP_AFFAIRE.SELECT'),      multiple: false, searchable: false, fullWidth: true };
  readonly tsSelectConfig      = { placeholder: this.translate.instant('INVOICING.STEP_AFFAIRE.TS_NONE'),     multiple: false, searchable: true,  fullWidth: true };

  showActions = input<boolean>(true);
  /** Set when editing an existing draft — pre-selects the affaire and pre-fills the form
   * instead of starting from the usual empty search. */
  initialValue = input<StepAffaireValue | null>(null);
  nextStep    = output<StepAffaireValue>();
  cancel      = output<void>();

  searchQuery     = signal('');
  searchResults   = signal<AffaireListItem[]>([]);
  searching       = signal(false);
  selectedAffaire = signal<(AffaireListItem & { contractAmount?: number | null }) | null>(null);
  rafDetails      = signal<RafDetailsDto | null>(null);
  rafLoading      = signal(false);
  tsList          = signal<TsDto[]>([]);
  /** Valeurs de la liste INVOICE_TYPE (/finance/admin) pour le pays de l'affaire. */
  invoiceTypeValues  = signal<ListValueDto[]>([]);
  readonly invoiceTypeOptions = computed(() => this.invoiceTypeValues().map(v => ({
    value: v.code,
    label: invoiceTypeLabel([v], v.code, this.translate),
  })));

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

  /** True only when editing an existing invoice that has no single affaire (a combined,
   * multi-affaire invoice from a prior phase) -- never true when creating a new invoice,
   * since initialValue() is null in that case. Detects via the null affaireId alone --
   * the real, universal signal for "combined" (see DFValidationService) -- NOT
   * billingMode === 'MIXED': a combined invoice whose lines all share the same mode
   * keeps that single mode as its billingMode and only gets literal "MIXED" when the
   * combined lines actually span different modes. (A prior "hardening" commit added a
   * `&& iv.billingMode === 'MIXED'` conjunct here on the mistaken assumption that a null
   * affaireId always coincides with MIXED -- a live same-mode combined invoice disproved
   * that, so it's been reverted.) */
  readonly isCombinedInvoice = computed(() => {
    const iv = this.initialValue();
    return iv != null && iv.affaireId == null;
  });

  /** True only for a combined invoice that's ACTUALLY one affaire (multiple billing modes
   * merged), not several distinct ones -- defaults to treating it as genuinely multi-affaire
   * (the safer, more common case) if the count is ever missing OR zero (an invoice with no
   * lines isn't reachable through the wizard today, but a `0` is an "unknown" signal just
   * like `null`/`undefined`, not a real "1 affaire" one -- `??` alone wouldn't catch it since
   * `0` isn't nullish). */
  readonly isSameAffaireCombined = computed(() => {
    const iv = this.initialValue();
    const count = iv?.combinedAffaireCount;
    return iv != null && iv.affaireId == null && count != null && count > 0 && count <= 1;
  });

  readonly rafPct = computed(() => {
    const raf    = this.rafDetails();
    const budget = this.selectedAffaire()?.budgetPrevisionnel;
    if (!raf || !budget || budget === 0) return 100;
    return (raf.rafDisponible / budget) * 100;
  });
  readonly rafWarning = computed(() => this.rafPct() < 20 && this.rafPct() > 0);
  readonly tsSelectOptions = computed(() => [
    { value: '', label: this.translate.instant('INVOICING.STEP_AFFAIRE.TS_NONE') },
    ...this.tsList().map(ts => ({
      value: String(ts.id),
      label: `${ts.referenceTs} — ${ts.intitule} (${this.formatAmount(ts.montantEstime, this.selectedAffaire()?.devise)})`,
    })),
  ]);

  tsSelectedVal(): string[] {
    const v = this.form.controls['tsId'].value;
    return v != null ? [String(v)] : [];
  }

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

    const iv = this.initialValue();
    if (iv?.affaireId) {
      this.preselectForEdit(iv);
    } else if (iv) {
      // Combined invoice: nothing to search for or preselect -- iv already carries the
      // real clientId/paysId/currency/billingMode from the invoice itself (see next()
      // below, which just re-emits them unchanged).
      this.form.patchValue({ invoiceType: iv.invoiceType, billingMode: iv.billingMode });
    } else {
      this.preselectFromQuery();
    }
  }

  /** Loads the affaire (same path as a normal selection — RAF, TS list, invoice type
   * options all load the same way), then patches in the invoice's own saved values. */
  private preselectForEdit(iv: StepAffaireValue): void {
    this.affSvc.getAffaire(iv.affaireId!).subscribe({
      next: a => {
        this.selectAffaire(a);
        this.form.patchValue({
          invoiceType: iv.invoiceType,
          tsId:        iv.tsId,
          billingMode: iv.billingMode || this.form.controls['billingMode'].value,
        });
      },
      error: () => { /* affaire introuvable : repli sur la recherche libre */ },
    });
  }

  /**
   * `?affaire=<id>` — le bouton « Nouvelle facture » de la fiche affaire arrive ici avec
   * l'affaire déjà choisie.
   *
   * On passe par `selectAffaire()` plutôt que de poser l'id dans le formulaire : c'est
   * cette méthode qui déduit le mode de facturation, charge le RAF et la liste des TS.
   * Poser l'id seul donnerait un écran à moitié rempli, sans contrôle de RAF — donc une
   * facture créable sur une affaire sans reste à facturer.
   *
   * Un id inconnu (affaire supprimée, lien recopié) est ignoré en silence : l'étape
   * s'ouvre alors sur sa recherche habituelle, ce qui est exactement le repli utile.
   */
  private preselectFromQuery(): void {
    const raw = this.route.snapshot.queryParamMap.get('affaire');
    const id  = Number(raw);
    if (!raw || !Number.isFinite(id) || id <= 0) return;

    this.affSvc.getAffaire(id).subscribe({
      next:  a => this.selectAffaire(a),
      error: () => { /* affaire introuvable : on laisse la recherche libre */ },
    });
  }

  onSearchInput(value: string | number | null): void {
    const q = String(value ?? '').slice(0, 100);
    this.searchQuery.set(q);
    if (q.trim().length >= 2) this.search$.next(q.trim());
    else this.searchResults.set([]);
  }

  selectAffaire(a: AffaireListItem & { contractAmount?: number | null }): void {
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

    // ACOMPTE's percentage columns need the affaire's real contract amount as their budget
    // denominator (see StepAffaireValue.contractAmount). The search-result item this method
    // can be called with doesn't carry it (a lighter list endpoint) -- preselectForEdit/
    // preselectFromQuery already pass a full AffaireDetail that does, but fetching it here
    // unconditionally, same enrichment pattern as RAF/TS above, keeps this correct regardless
    // of which entry point was used rather than relying on the caller having already done it.
    this.affSvc.getAffaire(a.id).subscribe({
      next: detail => this.selectedAffaire.update(
        cur => cur ? { ...cur, contractAmount: detail.contractAmount } : cur),
      error: () => {},
    });

    this.factListSvc.getListValues('INVOICE_TYPE', a.paysId)
      .subscribe(values => this.invoiceTypeValues.set(values));
  }

  clearAffaire(): void {
    this.selectedAffaire.set(null);
    this.rafDetails.set(null);
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.tsList.set([]);
    this.invoiceTypeValues.set([]);
    const bmCtrl = this.form.controls['billingMode'];
    bmCtrl.setValue('');
    bmCtrl.clearValidators();
    bmCtrl.updateValueAndValidity();
    // invoiceType is only ever meaningful relative to a selected affaire (its options come
    // from that affaire's pays -- see selectAffaire()'s INVOICE_TYPE lookup), so clearing the
    // affaire without also clearing it would leave a stale value behind. Since invoiceType is
    // the form's only Validators.required control, leaving it set made the form stay valid
    // with no affaire selected at all, which let next() emit a malformed
    // { affaireId: null, billingMode: '' } draft -- not a real combined invoice, but
    // downstream isCombined()/isCombinedInvoice() checks (affaireId == null) would wrongly
    // treat it as one. Resetting it here, alongside tsId, closes that hole at the source.
    this.form.patchValue({ invoiceType: '', tsId: null });
  }

  next(): void {
    if (this.isCombinedInvoice()) {
      // No affaire was ever selected (there isn't one) and no RAF applies -- just re-emit
      // the invoice's own already-correct values unchanged.
      const iv = this.initialValue()!;
      this.nextStep.emit(iv);
      return;
    }
    // Belt-and-suspenders alongside clearAffaire() resetting invoiceType: for a brand-new
    // (non-combined) invoice there must be a real selected affaire to proceed. Relying solely
    // on form validity is fragile -- it's exactly how this hole opened in the first place (the
    // form stayed valid after clearing the affaire because invoiceType was untouched) -- so this
    // guards explicitly rather than only incidentally via Validators.required.
    if (!this.selectedAffaire()) return;
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
      contractAmount: aff?.contractAmount ?? null,
    });
  }

  formatAmount(v: number, devise = 'TND'): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: devise,
    }).format(v);
  }

  formatPct(v: number): string {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v);
  }
}
