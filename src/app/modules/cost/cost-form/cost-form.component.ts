import {
  Component, OnInit, inject, signal, computed, DestroyRef,
} from '@angular/core';
import { CommonModule }         from '@angular/common';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { FormsModule }          from '@angular/forms';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { takeUntilDestroyed }   from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of, lastValueFrom } from 'rxjs';
import { CostService }          from '../cost.service';
import { AffaireService }       from '../../affaires/affaire.service';
import type { AffaireListItem, PaysRefDto } from '../../affaires/affaire.model';
import {
  CreateCostLineRequest,
  ListValueDto, ForexPreviewDto, CircuitPreviewDto,
  SupplierSearchItem, formatAmount,
} from '../cost.model';
import { SelectComponent, SelectOption, FormFieldComponent } from '@khalilrebhiitec/daf360';

@Component({
  selector: 'app-cost-form',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, TranslatePipe, SelectComponent, FormFieldComponent],
  templateUrl: './cost-form.component.html',
})
export class CostFormComponent implements OnInit {
  private readonly costSvc    = inject(CostService);
  private readonly affaireSvc = inject(AffaireService);
  private readonly router     = inject(Router);
  private readonly route      = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translate  = inject(TranslateService);

  editId     = signal<number | null>(null);
  isEditMode = computed(() => this.editId() !== null);

  paysList   = signal<PaysRefDto[]>([]);
  currencies = signal<ListValueDto[]>([]);
  costTypes  = signal<ListValueDto[]>([]);
  affaires   = signal<AffaireListItem[]>([]);
  suppliers  = signal<SupplierSearchItem[]>([]);

  // D3 cost-management taxonomy migration (V78) — global lists (COST_CATEGORY has
  // pays_id = NULL for all 12 rows), loaded once in ngOnInit(), independent of the
  // chosen pays (unlike the old per-pays cost_categories dropdown it replaces).
  costCategories    = signal<ListValueDto[]>([]);
  costSubCategories = signal<ListValueDto[]>([]);

  paysId              = signal<number | null>(null);
  costCategoryId      = signal<number | null>(null);
  costCategoryLabel   = signal<string>('');
  costSubCategoryId   = signal<number | null>(null);
  costSubCategoryLabel = signal<string>('');
  transactionDate     = signal<string>('');
  description         = signal<string>('');
  netAmountLocal      = signal<number | null>(null);
  currencyId          = signal<number | null>(null);
  supplierId          = signal<number | null>(null);
  supplierQuery       = signal<string>('');
  affaireId           = signal<number | null>(null);
  notes               = signal<string>('');
  costTypeId          = signal<number | null>(null);

  // D3 Tunisian tax fields (V78) — only meaningful once a real supplier is selected
  // (see showTaxFields below). Rates are fractions (0.19, not 19), matching the
  // static option values and the backend's storage convention.
  fodecRate       = signal<number | null>(null);
  tvaRate         = signal<number | null>(null);
  timbreAmount    = signal<number | null>(null);
  autresTaxesRate = signal<number | null>(null);

  forexPreview    = signal<ForexPreviewDto | null>(null);
  circuitPreview  = signal<CircuitPreviewDto | null>(null);
  previewLoading  = signal<boolean>(false);
  isPageLoading   = signal<boolean>(false);
  isSaving        = signal<boolean>(false);
  error           = signal<string | null>(null);
  pendingFiles    = signal<File[]>([]);

  private readonly supplierSearch$ = new Subject<string>();

  // ── daf-select option lists ─────────────────────────────────────────────────
  paysOptions = computed<SelectOption[]>(() =>
    this.paysList().map(p => ({ value: String(p.id), label: `${p.frenchLabel} (${p.isoCode})` }))
  );
  currencyOptions = computed<SelectOption[]>(() =>
    this.currencies().map(c => ({ value: String(c.id), label: `${c.code} — ${c.labelFr}` }))
  );
  affaireOptions = computed<SelectOption[]>(() =>
    this.affaires().map(a => ({ value: String(a.id), label: `${a.reference} — ${a.intitule}` }))
  );
  costTypeOptions = computed<SelectOption[]>(() =>
    this.costTypes().map(t => ({ value: String(t.id), label: t.labelFr }))
  );

  // ── D3 taxonomy migration (V78): cascading category / sub-category ──────────
  // Same id|label composite-value daf-select pattern as SUPPLIER_CATEGORY in
  // supplier-new.component.ts (typeSelectOptions/onTypeSelect). Categories whose
  // sourceType is AUTO_PUSH are excluded — manual creation is blocked for them
  // server-side too (CostLineService.doCreateCostLine()).
  readonly costCategorySelectOptions = computed<SelectOption[]>(() =>
    this.costCategories()
      .filter(c => c.sourceType !== 'AUTO_PUSH')
      .map(c => ({ value: c.id + '|' + c.labelFr, label: c.labelFr })));

  onCostCategorySelect(values: string[]): void {
    const value = values[0] ?? '';
    if (!value) {
      this.costCategoryId.set(null); this.costCategoryLabel.set('');
      this.costSubCategoryId.set(null); this.costSubCategoryLabel.set('');
      return;
    }
    const sep = value.indexOf('|');
    const id  = Number(value.substring(0, sep));
    this.costCategoryId.set(id);
    this.costCategoryLabel.set(value.substring(sep + 1));
    // Changing category invalidates any previously chosen sub-category.
    this.costSubCategoryId.set(null);
    this.costSubCategoryLabel.set('');
    // Nice-to-have: auto-select when the category has exactly one sub-category.
    const matches = this.costSubCategories().filter(s => s.parentValueId === id);
    if (matches.length === 1) {
      this.costSubCategoryId.set(matches[0].id);
      this.costSubCategoryLabel.set(matches[0].labelFr);
    }
    this.onAmountOrCurrencyChange();
  }

  readonly filteredCostSubCategories = computed<ListValueDto[]>(() =>
    this.costSubCategories().filter(s => s.parentValueId === this.costCategoryId()));

  readonly costSubCategorySelectOptions = computed<SelectOption[]>(() =>
    this.filteredCostSubCategories().map(s => ({ value: s.id + '|' + s.labelFr, label: s.labelFr })));

  onCostSubCategorySelect(values: string[]): void {
    const value = values[0] ?? '';
    if (!value) { this.costSubCategoryId.set(null); this.costSubCategoryLabel.set(''); return; }
    const sep = value.indexOf('|');
    this.costSubCategoryId.set(Number(value.substring(0, sep)));
    this.costSubCategoryLabel.set(value.substring(sep + 1));
  }

  /** Wrap a numeric id into the string[] shape daf-select's `selected` expects. */
  selArr(id: number | null): string[] { return [id !== null ? String(id) : '']; }

  selectedCurrencyCode = computed(() =>
    this.currencies().find(c => c.id === this.currencyId())?.code ?? null
  );

  canSave = computed(() =>
    !!this.paysId() &&
    !!this.costCategoryId() &&
    !!this.transactionDate() &&
    this.description().trim().length > 0 &&
    (this.netAmountLocal() ?? 0) > 0 &&
    !!this.currencyId()
  );

  readonly formatAmt = formatAmount;

  // ── D3 Tunisian tax fields (V78) ─────────────────────────────────────────────
  // Shown only once a real supplier is picked via the autocomplete -- NOT merely
  // when the Libre/Base toggle is flipped, per the confirmed reading of "if we
  // don't have a supplier, the amount is enough with the principal columns."
  readonly showTaxFields = computed(() => this.supplierId() !== null);

  readonly fodecOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    return [
      { value: '0',    label: this.translate.instant('COST.FORM.TAX.FODEC_OPT_0') },
      { value: '0.01', label: this.translate.instant('COST.FORM.TAX.FODEC_OPT_1') },
    ];
  });

  readonly tvaOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    return [
      { value: '0.19', label: this.translate.instant('COST.FORM.TAX.TVA_OPT_19') },
      { value: '0.13', label: this.translate.instant('COST.FORM.TAX.TVA_OPT_13') },
      { value: '0.07', label: this.translate.instant('COST.FORM.TAX.TVA_OPT_7') },
      { value: '0',    label: this.translate.instant('COST.FORM.TAX.TVA_OPT_0') },
    ];
  });

  readonly timbreOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    // NOTE: value is '1', not '1.000' -- selArr()/[selected] round-trips the stored
    // number through String(), and String(+'1.000') is '1', not '1.000'. Using a
    // non-canonical value string here would make the daf-select fail to show the
    // option as selected after the user picks it. The *label* still reads "1.000 DT"
    // as specified; only the underlying value is normalized.
    return [
      { value: '1', label: this.translate.instant('COST.FORM.TAX.TIMBRE_OPT_1') },
      { value: '0', label: this.translate.instant('COST.FORM.TAX.TIMBRE_OPT_0') },
    ];
  });

  readonly autresTaxesOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    // Same canonical-value note as timbreOptions above: '0.1', not '0.10'.
    return [
      { value: '0',     label: this.translate.instant('COST.FORM.TAX.AUTRES_TAXES_OPT_0') },
      { value: '0.01',  label: this.translate.instant('COST.FORM.TAX.AUTRES_TAXES_OPT_1') },
      { value: '0.015', label: this.translate.instant('COST.FORM.TAX.AUTRES_TAXES_OPT_1_5') },
      { value: '0.03',  label: this.translate.instant('COST.FORM.TAX.AUTRES_TAXES_OPT_3') },
      { value: '0.05',  label: this.translate.instant('COST.FORM.TAX.AUTRES_TAXES_OPT_5') },
      { value: '0.1',   label: this.translate.instant('COST.FORM.TAX.AUTRES_TAXES_OPT_10') },
      { value: '0.15',  label: this.translate.instant('COST.FORM.TAX.AUTRES_TAXES_OPT_15') },
      { value: '0.25',  label: this.translate.instant('COST.FORM.TAX.AUTRES_TAXES_OPT_25') },
    ];
  });

  /**
   * Client-side live preview only — mirrors the exact server-side formula in
   * CostLineService.doCreateCostLine() (HT + FODEC + TVA + Timbre; RS excluded).
   * The authoritative computation always happens server-side on save.
   */
  readonly ttcPreview = computed<number | null>(() => {
    if (!this.showTaxFields()) return null;
    const ht = this.netAmountLocal();
    if (ht == null) return null;
    const fodecAmt = ht * (this.fodecRate() ?? 0);
    const tvaAmt   = ht * (this.tvaRate() ?? 0);
    const timbre   = this.timbreAmount() ?? 0;
    return ht + fodecAmt + tvaAmt + timbre;
  });

  ngOnInit(): void {
    const idStr = this.route.snapshot.paramMap.get('id');
    if (idStr) {
      this.editId.set(+idStr);
      this.loadExisting(+idStr);
    } else {
      this.transactionDate.set(new Date().toISOString().slice(0, 10));
      this.prefillFromQueryParams();
    }

    this.affaireSvc.getPays()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(list => this.paysList.set(list));

    // Global lists (pays=0 sentinel), independent of the chosen pays -- same idiom
    // already established for SUPPLIER_CATEGORY in supplier-new.component.ts.
    this.costSvc.getListValues('COST_CATEGORY', 0)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.costCategories.set(v));
    this.costSvc.getListValues('COST_SUB_CATEGORY', 0)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.costSubCategories.set(v));

    this.supplierSearch$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => {
        const pid = this.paysId();
        if (!pid || q.length < 2) return of([] as SupplierSearchItem[]);
        return this.costSvc.searchSuppliers(pid, q);
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(list => this.suppliers.set(list));
  }

  private loadExisting(id: number): void {
    this.isPageLoading.set(true);
    this.costSvc.getCostLine(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: line => {
        this.isPageLoading.set(false);
        if (line.paysId) this.onPaysChange(line.paysId);
        if (line.transactionDate) this.transactionDate.set(line.transactionDate.slice(0, 10));
        this.description.set(line.label ?? '');
        this.costCategoryId.set(line.costCategoryId);
        this.costCategoryLabel.set(line.costCategoryLabel ?? '');
        this.costSubCategoryId.set(line.costSubCategoryId);
        this.costSubCategoryLabel.set(line.costSubCategoryLabel ?? '');
        this.netAmountLocal.set(line.netAmountLocal);
        this.currencyId.set(line.currencyId);
        this.supplierId.set(line.supplierId);
        if (line.supplierId != null) {
          this.costSvc.getSupplier(line.supplierId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: s => this.supplierQuery.set(s.name),
            error: () => {}, // supplier lookup failing here shouldn't block loading the rest of the line
          });
        }
        this.affaireId.set(line.affaireId);
        this.notes.set(line.notes ?? '');
        this.costTypeId.set(line.costTypeId);
        this.fodecRate.set(line.fodecRate);
        this.tvaRate.set(line.tvaRate);
        this.timbreAmount.set(line.timbreAmount);
        this.autresTaxesRate.set(line.autresTaxesRate);
      },
      error: () => {
        this.isPageLoading.set(false);
        this.error.set(this.translate.instant('COST.FORM.LOAD_ERROR'));
      },
    });
  }

  /**
   * Pre-fills Pays + Fournisseur when this form is opened from a supplier's own detail
   * page (its "Nouvelle ligne de coût" button — see
   * CostLineDetailComponent.goToNewLineForSupplier()). Absent for every other entry
   * point into this route (e.g. the flat list page's own "Nouvelle ligne" button passes
   * no query params at all), so this is a pure no-op there.
   */
  private prefillFromQueryParams(): void {
    const params = this.route.snapshot.queryParamMap;
    const paysIdParam = params.get('paysId');
    const supplierIdParam = params.get('supplierId');

    if (paysIdParam) {
      this.onPaysChange(+paysIdParam);
    }
    if (supplierIdParam) {
      const sid = +supplierIdParam;
      this.supplierId.set(sid);
      this.costSvc.getSupplier(sid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: s => this.supplierQuery.set(s.name),
        error: () => {}, // supplier lookup failing here shouldn't block the rest of the form
      });
    }
  }

  onPaysChange(id: number | null): void {
    const pid = id ? Number(id) : null;
    this.paysId.set(pid);
    if (!pid) return;

    this.costSvc.getListValues('CURRENCY', pid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => this.currencies.set(v));
    this.costSvc.getListValues('COST_TYPE', pid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => this.costTypes.set(v));
    this.affaireSvc.getAffaires({ paysId: pid, size: 200 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(p => this.affaires.set(p.content));
  }

  onSupplierQueryChange(q: string): void {
    this.supplierQuery.set(q);
    if (!q) this.supplierId.set(null);
    this.supplierSearch$.next(q);
  }

  selectSupplier(s: SupplierSearchItem): void {
    this.supplierId.set(s.id);
    this.supplierQuery.set(s.name);
    this.suppliers.set([]);
  }

  onAmountOrCurrencyChange(): void {
    const amount = this.netAmountLocal();
    const currId = this.currencyId();
    const pid    = this.paysId();
    if (!amount || !currId || !pid) {
      this.forexPreview.set(null);
      this.circuitPreview.set(null);
      return;
    }
    const curr = this.currencies().find(c => c.id === currId);
    if (!curr) return;
    this.previewLoading.set(true);
    this.costSvc.getForexPreview(amount, curr.code).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: fx => {
        this.forexPreview.set(fx);
        this.refreshCircuitPreview(pid, curr.code);
      },
      error: () => { this.forexPreview.set(null); this.previewLoading.set(false); },
    });
  }

  /**
   * The approval circuit is keyed on the line's own TTC (gross) amount, mirroring
   * CostApprovalService.submitForApproval()'s server-side threshold check — NOT the HT
   * amount shown in the "Devise" forex panel above, which stays HT-based on purpose.
   * Re-run whenever the HT amount, currency, or any tax field changes: ttcPreview()
   * already recomputes from all of those, this just re-converts it to EUR and re-fetches
   * the circuit preview. Falls back to the HT amount when there's no supplier/tax
   * context yet (ttcPreview() returns null in that case, and gross == net server-side
   * too when there's no supplier — see doCreateCostLine()'s useTaxBlock branch).
   */
  private refreshCircuitPreview(paysId: number, currencyCode: string): void {
    const ttcAmount = this.ttcPreview() ?? this.netAmountLocal();
    if (!ttcAmount) {
      this.circuitPreview.set(null);
      this.previewLoading.set(false);
      return;
    }
    this.costSvc.getForexPreview(ttcAmount, currencyCode).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: fx => {
        this.costSvc.getCircuitPreview(fx.montantEur, paysId, null, this.costCategoryId())
          .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: cp => { this.circuitPreview.set(cp); this.previewLoading.set(false); },
          error: () => this.previewLoading.set(false),
        });
      },
      error: () => this.previewLoading.set(false),
    });
  }

  /**
   * Tax-rate changes (FODEC/TVA/Timbre Fiscal) affect ttcPreview() and therefore the
   * approval circuit, but NOT the HT amount or its forex conversion — so only the
   * circuit preview needs to be refreshed here, unlike onAmountOrCurrencyChange().
   */
  onTaxFieldChange(): void {
    const currId = this.currencyId();
    const pid    = this.paysId();
    const curr   = this.currencies().find(c => c.id === currId);
    if (!curr || !pid) return;
    this.previewLoading.set(true);
    this.refreshCircuitPreview(pid, curr.code);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;
    const added = Array.from(input.files).filter(f => f.size <= 10 * 1024 * 1024);
    this.pendingFiles.update(prev => [...prev, ...added]);
    input.value = '';
  }

  removeFile(i: number): void {
    this.pendingFiles.update(prev => prev.filter((_, idx) => idx !== i));
  }

  saveDraft(): void { this.doSave(false); }
  submitLine(): void { this.doSave(true); }

  private doSave(submit: boolean): void {
    if (!this.canSave()) return;
    const date = this.transactionDate();
    const [year, month] = date.split('-').map(Number);
    const hasSupplier = this.supplierId() !== null;
    const req: CreateCostLineRequest = {
      paysId:            this.paysId()!,
      costCategoryId:    this.costCategoryId()!,
      costSubCategoryId: this.costSubCategoryId() ?? undefined,
      transactionDate:   date,
      periodYear:        year,
      periodMonth:       month,
      description:       this.description().trim(),
      netAmountLocal:    this.netAmountLocal()!,
      currencyId:        this.currencyId()!,
      supplierId:        this.supplierId() ?? undefined,
      affaireId:         this.affaireId() ?? undefined,
      notes:             this.notes() || undefined,
      costTypeId:        this.costTypeId() ?? undefined,
      fodecRate:         hasSupplier ? (this.fodecRate() ?? undefined) : undefined,
      tvaRate:           hasSupplier ? (this.tvaRate() ?? undefined) : undefined,
      timbreAmount:      hasSupplier ? (this.timbreAmount() ?? undefined) : undefined,
      autresTaxesRate:   hasSupplier ? (this.autresTaxesRate() ?? undefined) : undefined,
    };

    this.isSaving.set(true);
    this.error.set(null);

    const save$ = this.editId()
      ? this.costSvc.updateCostLine(this.editId()!, req)
      : this.costSvc.createCostLine(req);

    save$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: line => {
        const uploads = this.pendingFiles().map(f =>
          lastValueFrom(this.costSvc.addAttachment(line.id, f)).catch(() => null)
        );
        Promise.all(uploads).then(() => {
          this.pendingFiles.set([]);
          if (submit) {
            this.costSvc.submitCostLine(line.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
              next:  () => { this.isSaving.set(false); this.router.navigate(this.isEditMode() ? ['../..'] : ['..'], { relativeTo: this.route }); },
              error: err => { this.isSaving.set(false); this.error.set(err.error?.message ?? this.translate.instant('COST.FORM.SUBMIT_ERROR')); },
            });
          } else {
            this.isSaving.set(false);
            this.router.navigate(this.isEditMode() ? ['../..'] : ['..'], { relativeTo: this.route });
          }
        });
      },
      error: err => {
        this.isSaving.set(false);
        this.error.set(err.error?.message ?? this.translate.instant('COST.FORM.GENERIC_ERROR'));
      },
    });
  }

  fmtFileSize(bytes: number): string {
    if (bytes < 1024)     return this.translate.instant('COST.FORM.UNIT_BYTES', { n: bytes });
    if (bytes < 1048576)  return this.translate.instant('COST.FORM.UNIT_KB', { n: (bytes / 1024).toFixed(1) });
    return this.translate.instant('COST.FORM.UNIT_MB', { n: (bytes / 1048576).toFixed(1) });
  }

  levelBg(level: string): string {
    return ({ L1: '#f1f5f9', L2: '#dbeafe', L3: '#fef3c7', L4: '#ffdad6' } as Record<string, string>)[level] ?? '#f1f5f9';
  }

  levelColor(level: string): string {
    return ({ L1: '#475569', L2: '#1d4ed8', L3: '#92400e', L4: '#ba1a1a' } as Record<string, string>)[level] ?? '#475569';
  }
}
