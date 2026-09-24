import {
  Component, OnInit, inject, signal, computed, DestroyRef, WritableSignal,
} from '@angular/core';
import { CommonModule }         from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
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
import {
  ButtonComponent, ButtonOptions, CardComponent, FieldMessageComponent, FileUploadComponent,
  FormFieldComponent, PageComponent, PageHeaderComponent, SelectComponent, SelectOption,
} from '@khalilrebhiitec/daf360';
import type {
  BreadcrumbItem, CardOptions, FileUploadConfig, PageHeaderBadge, UploadedFile,
} from '@khalilrebhiitec/daf360';

@Component({
  selector: 'app-cost-form',
  standalone: true,
  imports: [
    CommonModule, FormsModule, TranslatePipe,
    PageComponent, PageHeaderComponent, CardComponent, ButtonComponent, FieldMessageComponent,
    SelectComponent, FormFieldComponent, FileUploadComponent,
  ],
  templateUrl: './cost-form.component.html',
  styleUrl:    './cost-form.component.scss',
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

  // D3 cost-management taxonomy (V78) — loaded per pays in onPaysChange(), like every
  // other list on this form: the backend returns that country's own rows plus the global
  // ones it has not overridden or switched off.
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
  pendingFiles    = signal<UploadedFile[]>([]);

  /**
   * The six form sections' card — the lib's `glass` card, with the hover lift used across
   * the modules. The lift comes from `.glass-card:hover` itself, so `hoverable` is left
   * off on purpose: it would only add `cursor-pointer`, which over text inputs and
   * selects wrongly signals the whole card is clickable.
   */
  readonly sectionCard: CardOptions = { variant: 'glass', padding: 'lg', radius: 'xl' };

  /** Same limits the former native input enforced: PDF/images, several at once, 10 MB each. */
  readonly attachmentConfig: FileUploadConfig = {
    accept:    '.pdf,.jpg,.jpeg,.png',
    multiple:  true,
    maxSizeMb: 10,
  };

  private readonly supplierSearch$ = new Subject<string>();

  /** Edit mode: the line's currency code, used to re-point a currency the pays overrides. */
  private lineCurrencyCode: string | null = null;

  // ── daf-select option lists ─────────────────────────────────────────────────
  paysOptions = computed<SelectOption[]>(() =>
    this.paysList().map(p => ({ value: String(p.id), label: `${p.frenchLabel} (${p.isoCode})` }))
  );
  currencyOptions = computed<SelectOption[]>(() =>
    this.currencies().map(c => ({ value: String(c.id), label: `${c.code} — ${this.valueLabel(c)}` }))
  );
  affaireOptions = computed<SelectOption[]>(() =>
    this.affaires().map(a => ({ value: String(a.id), label: `${a.reference} — ${a.intitule}` }))
  );
  costTypeOptions = computed<SelectOption[]>(() =>
    this.costTypes().map(t => ({ value: String(t.id), label: this.valueLabel(t) }))
  );

  // ── D3 taxonomy migration (V78): cascading category / sub-category ──────────
  // Same id|label composite-value daf-select pattern as SUPPLIER_CATEGORY in
  // supplier-new.component.ts (typeSelectOptions/onTypeSelect). Categories whose
  // sourceType is AUTO_PUSH are excluded — manual creation is blocked for them
  // server-side too (CostLineService.doCreateCostLine()).
  //
  // The option VALUE keeps the FR label (`id|labelFr`) because edit mode rebuilds the
  // selection from the line's own `costCategoryLabel`, which the backend sends in FR;
  // only the visible LABEL follows the UI language.
  readonly costCategorySelectOptions = computed<SelectOption[]>(() =>
    this.costCategories()
      .filter(c => c.sourceType !== 'AUTO_PUSH')
      .map(c => ({ value: c.id + '|' + c.labelFr, label: this.valueLabel(c) })));

  /** EN label in English (falling back to FR when a row has none), FR otherwise. */
  private valueLabel(v: ListValueDto): string {
    return this.translate.currentLang() === 'en' ? (v.labelEn || v.labelFr) : v.labelFr;
  }

  /** Code of the selected category — the key sub-categories are matched on. */
  private readonly selectedCategoryCode = computed(() =>
    this.costCategories().find(c => c.id === this.costCategoryId())?.code ?? null);

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
    const code = this.costCategories().find(c => c.id === id)?.code;
    const matches = this.costSubCategories().filter(s => !!code && s.parentValueCode === code);
    if (matches.length === 1) {
      this.costSubCategoryId.set(matches[0].id);
      this.costSubCategoryLabel.set(matches[0].labelFr);
    }
    this.onAmountOrCurrencyChange();
  }

  // Matched by parent CODE, not parentValueId: when a country overrides a global category
  // (new row, new id) the global sub-categories still point at the global row's id.
  readonly filteredCostSubCategories = computed<ListValueDto[]>(() => {
    const code = this.selectedCategoryCode();
    return code ? this.costSubCategories().filter(s => s.parentValueCode === code) : [];
  });

  readonly costSubCategorySelectOptions = computed<SelectOption[]>(() =>
    this.filteredCostSubCategories().map(s => ({ value: s.id + '|' + s.labelFr, label: this.valueLabel(s) })));

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

  // ── En-tête de page (daf-page-header) ────────────────────────────────────────
  // Absolute root link, like CostLineDetailComponent's own breadcrumbs: this form is
  // reached at both cost/new and cost/:id/edit, so a relative link would differ by mode.
  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    const root: BreadcrumbItem = { label: this.translate.instant('COST.TABS.LINES'), link: ['/finance/cost'] };
    const id = this.editId();
    if (id === null) {
      return [root, { label: this.translate.instant('COST.FORM.TITLE_NEW') }];
    }
    return [
      root,
      { label: `#${id}`, link: ['/finance/cost', id] },
      { label: this.translate.instant('COST.FORM.TITLE_EDIT') },
    ];
  });

  readonly pageTitle = computed(() => {
    this.translate.currentLang();
    return this.translate.instant(this.isEditMode() ? 'COST.FORM.TITLE_EDIT' : 'COST.FORM.TITLE_NEW');
  });

  readonly pageSubtitle = computed(() => {
    this.translate.currentLang();
    return this.isEditMode()
      ? this.translate.instant('COST.FORM.SUB_EDIT', { id: this.editId() })
      : this.translate.instant('COST.FORM.SUB_NEW');
  });

  /** The former hand-drawn pulsing "draft" pill, now a standard header badge. */
  readonly headerBadges = computed<PageHeaderBadge[]>(() => {
    this.translate.currentLang();
    return [{ label: this.translate.instant('COST.FORM.DRAFT_BADGE'), variant: 'teal', dot: true }];
  });

  /** The bar's single drawn action — same teal pill as the affaire wizard's "Suivant". */
  readonly submitButtonOptions = computed<ButtonOptions>(() => {
    this.translate.currentLang();
    return {
      variant:   'teal',
      pill:      true,
      label:     this.translate.instant('COST.FORM.FOOT_SUBMIT'),
      iconStart: 'send',
      loading:   this.isSaving(),
      disabled:  !this.canSave() || this.isSaving(),
    };
  });

  /** Same destination as the former `routerLink=".."` Cancel link. */
  cancel(): void {
    this.router.navigate(['..'], { relativeTo: this.route });
  }

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
        // The line carries its currency CODE: if the pays list shows a country override
        // of that currency (new row, new id), reconcileListValue() re-points by code.
        this.lineCurrencyCode = line.currency;
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

    // Every per-pays list gets the same treatment as the category: a selection carried
    // over from the previous pays is re-pointed (same code) or cleared, never left
    // pointing at another country's row — the backend now rejects those (RG_LIST_VALUE_PAYS).
    this.costSvc.getListValues('CURRENCY', pid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
      const previous = this.currencies();
      this.currencies.set(v);
      if (this.reconcileListValue(previous, v, this.currencyId, this.lineCurrencyCode)) {
        this.onAmountOrCurrencyChange();
      }
    });
    this.costSvc.getListValues('COST_TYPE', pid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
      const previous = this.costTypes();
      this.costTypes.set(v);
      this.reconcileListValue(previous, v, this.costTypeId);
    });
    this.affaireSvc.getAffaires({ paysId: pid, size: 200 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(p => {
        const previous = this.affaires();
        this.affaires.set(p.content);
        // Affaires have no shared code across countries: one from the old pays is simply dropped.
        const id = this.affaireId();
        if (id !== null && !p.content.some(a => a.id === id) && previous.some(a => a.id === id)) {
          this.affaireId.set(null);
        }
      });

    this.costSvc.getListValues('COST_CATEGORY', pid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
      const previous = this.costCategories();
      this.costCategories.set(v);
      this.reconcileCategory(previous, v);
    });
    this.costSvc.getListValues('COST_SUB_CATEGORY', pid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
      const previous = this.costSubCategories();
      this.costSubCategories.set(v);
      this.reconcileSubCategory(previous, v);
    });
  }

  /**
   * Keeps the chosen category valid when the pays changes. Same code in the new country
   * (global row, or that country's override of it) → re-point to that row; no longer
   * available → clear it, with its sub-category. A selection absent from the PREVIOUS
   * list too is left alone: that is edit mode's first load, where the line's own
   * category is set before any list has arrived.
   */
  private reconcileCategory(previous: ListValueDto[], next: ListValueDto[]): void {
    const id = this.costCategoryId();
    if (id === null || next.some(c => c.id === id)) return;
    const code = previous.find(c => c.id === id)?.code;
    if (!code) return;
    const match = next.find(c => c.code === code && c.sourceType !== 'AUTO_PUSH');
    if (match) {
      this.costCategoryId.set(match.id);
      this.costCategoryLabel.set(match.labelFr);
    } else {
      this.costCategoryId.set(null);  this.costCategoryLabel.set('');
      this.costSubCategoryId.set(null); this.costSubCategoryLabel.set('');
    }
    this.onAmountOrCurrencyChange();
  }

  /**
   * Generic form of reconcileCategory() for the plain per-pays lists (devise, type de
   * coût). Returns true when the selection changed. `knownCode` covers edit mode's first
   * load, where the selected id is not in any previous list yet but its code is known.
   */
  private reconcileListValue(previous: ListValueDto[], next: ListValueDto[],
                             selected: WritableSignal<number | null>, knownCode?: string | null): boolean {
    const id = selected();
    if (id === null || next.some(v => v.id === id)) return false;
    const code = previous.find(v => v.id === id)?.code ?? knownCode ?? null;
    if (!code) return false;
    selected.set(next.find(v => v.code === code)?.id ?? null);
    return true;
  }

  /**
   * The pays picker itself (a user choice, unlike edit-mode / query-param preloads). A
   * supplier belongs to exactly one pays and has no counterpart elsewhere, so it is
   * dropped when the pays really changes — the search box is scoped to the new pays.
   */
  onPaysSelected(id: number | null): void {
    if (id !== this.paysId()) {
      this.supplierId.set(null);
      this.supplierQuery.set('');
      this.suppliers.set([]);
    }
    this.onPaysChange(id);
  }

  /** Same rule as reconcileCategory(), for the sub-category. */
  private reconcileSubCategory(previous: ListValueDto[], next: ListValueDto[]): void {
    const id = this.costSubCategoryId();
    if (id === null || next.some(s => s.id === id)) return;
    const code = previous.find(s => s.id === id)?.code;
    if (!code) return;
    const match = next.find(s => s.code === code);
    this.costSubCategoryId.set(match?.id ?? null);
    this.costSubCategoryLabel.set(match?.labelFr ?? '');
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
        this.costSvc.getCircuitPreview(fx.montantEur, paysId, this.costCategoryId())
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
        // Files daf-file-upload flagged (over maxSizeMb) are never sent — the former
        // input dropped them at selection time instead.
        const uploads = this.pendingFiles().filter(f => !f.error).map(f =>
          lastValueFrom(this.costSvc.addAttachment(line.id, f.file)).catch(() => null)
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

  levelBg(level: string): string {
    return ({ L1: '#f1f5f9', L2: '#dbeafe', L3: '#fef3c7', L4: '#ffdad6' } as Record<string, string>)[level] ?? '#f1f5f9';
  }

  levelColor(level: string): string {
    return ({ L1: '#475569', L2: '#1d4ed8', L3: '#92400e', L4: '#ba1a1a' } as Record<string, string>)[level] ?? '#475569';
  }
}
