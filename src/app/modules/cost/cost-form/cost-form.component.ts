import {
  Component, OnInit, inject, signal, computed, DestroyRef,
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
  CreateCostInvoiceRequest, CostInvoiceDto,
  ListValueDto, ForexPreviewDto, CircuitPreviewDto,
  SupplierSearchItem, formatAmount,
  FACT_EDIT_VALIDATED_COST, VALIDATED_EDITABLE_STATUSES, OTHER_TAX_TYPE_LIST,
} from '../cost.model';
import { UserStore } from '../../../core/user.store';
import {
  ButtonComponent, ButtonOptions, CardComponent, CheckboxComponent, FieldMessageComponent, FileUploadComponent,
  FormFieldComponent, PageComponent, PageHeaderComponent, SelectComponent, SelectOption,
} from '@khalilrebhiitec/daf360';
import type {
  BreadcrumbItem, CardOptions, FileUploadConfig, PageHeaderBadge, UploadedFile,
} from '@khalilrebhiitec/daf360';

/**
 * One line of the invoice being entered. `key` is a client-side identity for `@for`
 * tracking; `id` is the server line id in edit mode (kept on save), null for a new line.
 */
interface LineForm {
  key: number;
  id: number | null;
  costCategoryId: number | null;
  costCategoryLabel: string;
  costSubCategoryId: number | null;
  costSubCategoryLabel: string;
  description: string;
  netAmountLocal: number | null;
  /** Typed VAT — only used without a supplier (no tax block). */
  vatAmountLocal: number | null;
  /** Fractions (0.01, 0.19), like the backend. Supplier invoices only. */
  fodecRate: number | null;
  tvaRate: number | null;
  affaireId: number | null;
  costTypeId: number | null;
  /**
   * V102 — part of the line is outside the VAT scope. Ticked by hand on a STANDARD supplier,
   * always on for a travel agency. Supplier invoices only.
   */
  hasNonTaxable: boolean;
  /** V102 — the part of the HT subject to FODEC / TVA / RS (used when hasNonTaxable). */
  vatBaseLocal: number | null;
  /** V102, travel agency only — the line amount as printed (TTC); the HT is derived from it. */
  lineTtcInput: number | null;
}

/** One "autre taxe" of the invoice (V95): a type and/or a free label, and a typed amount. */
interface OtherTaxForm {
  key: number;
  taxTypeId: number | null;
  label: string;
  amountLocal: number | null;
}

/**
 * Cost invoice entry (V93) — a supplier invoice holding one or more cost lines.
 *
 * Header: pays, supplier (optional), the supplier's invoice number (required with a
 * supplier, unique per supplier — checked server-side), invoice date, due date, currency.
 * Lines: category / sub-category, description, HT, and — with a supplier — their own
 * FODEC and TVA rate (fixed formula, unchanged); without a supplier, a typed VAT amount.
 * Invoice-level: stamp duty and retenue à la source, once per invoice (supplier only), and
 * any number of "autres taxes" — free amounts, typed or labelled, added to the TTC (V95).
 * TVA = (base + FODEC) × rate, base = the taxable part of the HT (the whole HT unless part of
 * the line is outside the VAT scope, V102). The RS is applied only when ticked, on
 * base + FODEC + TVA (or on the TVA), and is deducted.
 *
 * A travel-agency supplier (profile AGENCE_VOYAGE) is entered as printed: line TTC, base
 * TVA, rate; the HT is derived (TTC − TVA) and HT − base is the part outside the VAT scope.
 *
 * Every amount shown here is a preview; the server recomputes all of them on save.
 */
@Component({
  selector: 'app-cost-form',
  standalone: true,
  imports: [
    CommonModule, FormsModule, TranslatePipe,
    PageComponent, PageHeaderComponent, CardComponent, ButtonComponent, CheckboxComponent, FieldMessageComponent,
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
  private readonly userStore  = inject(UserStore);

  editId        = signal<number | null>(null);
  editReference = signal<string | null>(null);
  isEditMode    = computed(() => this.editId() !== null);

  // ── Edit after validation, DAF only (V94, workshop item #5) ──────────────────
  /** Status of the invoice being edited (null on a new invoice). */
  editStatus    = signal<string | null>(null);
  /** Mandatory reason for an edit after validation, recorded in the change history. */
  justification = signal<string>('');
  readonly canEditValidated = computed(() => this.userStore.hasPermission(FACT_EDIT_VALIDATED_COST));
  /** Editing an APPROVED / POSTED invoice as the DAF: status kept, justification required. */
  readonly validatedMode = computed(() =>
    this.editStatus() !== null && VALIDATED_EDITABLE_STATUSES.includes(this.editStatus()!) && this.canEditValidated());
  /** Loaded invoice that this user may not edit at all (submitted, or validated without the DAF right). */
  readonly lockedForUser = computed(() => {
    const s = this.editStatus();
    return s !== null && s !== 'DRAFT' && s !== 'RETURNED' && !this.validatedMode();
  });

  paysList   = signal<PaysRefDto[]>([]);
  currencies = signal<ListValueDto[]>([]);
  costTypes  = signal<ListValueDto[]>([]);
  affaires   = signal<AffaireListItem[]>([]);
  suppliers  = signal<SupplierSearchItem[]>([]);

  /** VAT_RATE configurable list — the per-line TVA options (rates stay a fixed formula). */
  vatRates   = signal<ListValueDto[]>([]);
  /** WITHHOLDING_RATE configurable list (V92) — RS rates of the pays, each with its base. */
  withholdingRates = signal<ListValueDto[]>([]);
  /** OTHER_TAX_TYPE configurable list (V95) — kinds of "autres taxes" of the pays. */
  otherTaxTypes = signal<ListValueDto[]>([]);

  costCategories    = signal<ListValueDto[]>([]);
  costSubCategories = signal<ListValueDto[]>([]);

  // ── Header ──────────────────────────────────────────────────────────────────
  paysId                = signal<number | null>(null);
  supplierId            = signal<number | null>(null);
  supplierQuery         = signal<string>('');
  supplierInvoiceNumber = signal<string>('');
  invoiceDate           = signal<string>('');
  paymentDueDate        = signal<string>('');
  currencyId            = signal<number | null>(null);
  notes                 = signal<string>('');

  // ── Invoice-level taxes (supplier only) ─────────────────────────────────────
  timbreAmount = signal<number | null>(null);
  /** The finance manager ticks it to apply a retenue à la source; off by default. */
  rsApplied    = signal<boolean>(false);
  rsRate       = signal<number | null>(null);
  /** Calculation profile of the selected supplier (V102); STANDARD without supplier. */
  supplierProfile = signal<'STANDARD' | 'AGENCE_VOYAGE'>('STANDARD');
  /** "Autres taxes" (V95) — any invoice, with or without supplier. */
  otherTaxes   = signal<OtherTaxForm[]>([]);
  private nextTaxKey = 1;

  // ── Lines ───────────────────────────────────────────────────────────────────
  private nextKey = 1;
  lines = signal<LineForm[]>([this.emptyLine()]);

  forexPreview    = signal<ForexPreviewDto | null>(null);
  circuitPreview  = signal<CircuitPreviewDto | null>(null);
  previewLoading  = signal<boolean>(false);
  isPageLoading   = signal<boolean>(false);
  isSaving        = signal<boolean>(false);
  error           = signal<string | null>(null);
  pendingFiles    = signal<UploadedFile[]>([]);

  readonly sectionCard: CardOptions = { variant: 'glass', padding: 'lg', radius: 'xl' };
  /** A line inside the lines card — flat, so it reads as part of the card, not a card of its own. */
  readonly lineCard: CardOptions = { variant: 'outlined', padding: 'md', radius: 'lg' };

  readonly attachmentConfig: FileUploadConfig = {
    accept:    '.pdf,.jpg,.jpeg,.png',
    multiple:  true,
    maxSizeMb: 10,
  };

  private readonly supplierSearch$ = new Subject<string>();
  /** Any change that moves the totals or the categories → one debounced preview refresh. */
  private readonly previewRefresh$ = new Subject<void>();

  /** Edit mode: the invoice's currency code, used to re-point a currency the pays overrides. */
  private invoiceCurrencyCode: string | null = null;

  // ── Option lists ────────────────────────────────────────────────────────────
  paysOptions = computed<SelectOption[]>(() =>
    this.paysList().map(p => ({ value: String(p.id), label: `${p.frenchLabel} (${p.isoCode})` })));
  currencyOptions = computed<SelectOption[]>(() =>
    this.currencies().map(c => ({ value: String(c.id), label: `${c.code} — ${this.valueLabel(c)}` })));
  affaireOptions = computed<SelectOption[]>(() =>
    this.affaires().map(a => ({ value: String(a.id), label: `${a.reference} — ${a.intitule}` })));
  costTypeOptions = computed<SelectOption[]>(() =>
    this.costTypes().map(t => ({ value: String(t.id), label: this.valueLabel(t) })));

  /** AUTO_PUSH categories are fed by other modules and refused for manual entry. Value = `id|labelFr`. */
  readonly costCategorySelectOptions = computed<SelectOption[]>(() =>
    this.costCategories()
      .filter(c => c.sourceType !== 'AUTO_PUSH')
      .map(c => ({ value: c.id + '|' + c.labelFr, label: this.valueLabel(c) })));

  /** Sub-categories of a line's category — matched by parent CODE (country overrides are new rows). */
  subCategoryOptions(line: LineForm): SelectOption[] {
    const code = this.costCategories().find(c => c.id === line.costCategoryId)?.code;
    if (!code) return [];
    return this.costSubCategories()
      .filter(s => s.parentValueCode === code)
      .map(s => ({ value: s.id + '|' + s.labelFr, label: this.valueLabel(s) }));
  }

  private valueLabel(v: ListValueDto): string {
    return this.translate.currentLang() === 'en' ? (v.labelEn || v.labelFr) : v.labelFr;
  }

  /** Wrap a numeric id into the string[] shape daf-select's `selected` expects. */
  selArr(id: number | null): string[] { return [id !== null ? String(id) : '']; }

  selectedCurrencyCode = computed(() =>
    this.currencies().find(c => c.id === this.currencyId())?.code ?? null);

  // ── Taxes (fixed, unchanged) ────────────────────────────────────────────────

  /** Tax block (FODEC / TVA rate / stamp / RS) only with a real supplier. */
  readonly hasSupplier = computed(() => this.supplierId() !== null);

  /** Travel agency: lines entered as printed — line TTC, base TVA, rate (V102). */
  readonly isAgency = computed(() => this.hasSupplier() && this.supplierProfile() === 'AGENCE_VOYAGE');

  readonly fodecOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    return [
      { value: '0',    label: this.translate.instant('COST.FORM.TAX.FODEC_OPT_0') },
      { value: '0.01', label: this.translate.instant('COST.FORM.TAX.FODEC_OPT_1') },
    ];
  });

  /** VAT_RATE list → fraction values (ratePct 19 → '0.19'). */
  readonly tvaOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    return this.vatRates().map(v => ({
      value: v.ratePct != null ? (v.ratePct / 100).toString() : '0',
      label: this.valueLabel(v),
    }));
  });

  /** Value '1', not '1.000': selArr() round-trips the number through String(). */
  readonly timbreOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    return [
      { value: '1', label: this.translate.instant('COST.FORM.TAX.TIMBRE_OPT_1') },
      { value: '0', label: this.translate.instant('COST.FORM.TAX.TIMBRE_OPT_0') },
    ];
  });

  /** WITHHOLDING_RATE list → fraction values; the label names the base. */
  readonly rsOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    return this.withholdingRates()
      .filter(v => v.ratePct != null)
      .map(v => ({
        value: (v.ratePct! / 100).toString(),
        label: `${this.valueLabel(v)} — ${this.translate.instant('COST.FORM.TAX.RS_BASE_' + (v.taxBase === 'TVA' ? 'TVA' : 'HT_FOD_TVA'))}`,
      }));
  });

  /** RS base of the chosen rate: the TVA amount, else HT + FODEC + TVA (older bases included). */
  private readonly selectedRsBase = computed<'HT_FOD_TVA' | 'TVA'>(() => {
    const rate = this.rsRate();
    if (rate == null) return 'HT_FOD_TVA';
    const pct = Math.round(rate * 10000) / 100;
    return this.withholdingRates().find(v => v.ratePct === pct)?.taxBase === 'TVA' ? 'TVA' : 'HT_FOD_TVA';
  });

  /** OTHER_TAX_TYPE list as select options. */
  readonly otherTaxTypeOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    return this.otherTaxTypes().map(v => ({ value: String(v.id), label: this.valueLabel(v) }));
  });

  readonly rsBaseLabel = computed(() => {
    this.translate.currentLang();
    return this.translate.instant('COST.FORM.TAX.RS_BASE_' + this.selectedRsBase());
  });

  // ── Amount previews (mirror CostInvoiceService; rounded to 3 decimals like it) ─

  private static r3(n: number): number { return Math.round(n * 1000) / 1000; }

  /** Part of the line still to send as a base: only with a supplier and a split line. */
  private usesVatBase(l: LineForm): boolean {
    return this.hasSupplier() && (l.hasNonTaxable || this.isAgency());
  }

  /** V102 — the part of the HT subject to FODEC / TVA / RS (the whole HT on a standard line). */
  lineBase(l: LineForm): number {
    return this.usesVatBase(l) ? (l.vatBaseLocal ?? 0) : (l.netAmountLocal ?? 0);
  }

  /** V102 — HT − base: the part outside the VAT scope. */
  lineNonTaxable(l: LineForm): number {
    return this.usesVatBase(l) ? CostFormComponent.r3((l.netAmountLocal ?? 0) - (l.vatBaseLocal ?? 0)) : 0;
  }

  /** A split line needs 0 ≤ base ≤ HT (an agency line: TTC ≥ base + TVA). */
  lineBaseValid(l: LineForm): boolean {
    if (!this.usesVatBase(l)) return true;
    if (l.vatBaseLocal == null || l.vatBaseLocal < 0) return false;
    return this.lineNonTaxable(l) >= 0;
  }

  lineFodec(l: LineForm): number {
    if (this.isAgency()) return 0;   // agencies invoice no FODEC
    return this.hasSupplier() && l.fodecRate ? CostFormComponent.r3(this.lineBase(l) * l.fodecRate) : 0;
  }

  /** TVA = (base + FODEC) × rate (V95, base V102). */
  lineVat(l: LineForm): number {
    if (this.hasSupplier() && l.tvaRate != null) {
      return CostFormComponent.r3((this.lineBase(l) + this.lineFodec(l)) * l.tvaRate);
    }
    return l.vatAmountLocal ?? 0;
  }

  lineTtc(l: LineForm): number {
    return (l.netAmountLocal ?? 0) + this.lineFodec(l) + this.lineVat(l);
  }

  /**
   * Agency line: HT = printed TTC − TVA, the TVA coming from the base and the rate alone.
   * Re-derived after every change of TTC, base or rate.
   */
  private deriveAgencyHt(l: LineForm): LineForm {
    if (!this.isAgency()) return l;
    const vat = l.tvaRate != null ? CostFormComponent.r3((l.vatBaseLocal ?? 0) * l.tvaRate) : 0;
    const ht = l.lineTtcInput != null ? CostFormComponent.r3(l.lineTtcInput - vat) : null;
    return { ...l, fodecRate: null, hasNonTaxable: true, netAmountLocal: ht };
  }

  readonly totals = computed(() => {
    const lines = this.lines();
    let ht = 0, base = 0, nonTaxable = 0, fodec = 0, vat = 0, linesTtc = 0;
    for (const l of lines) {
      ht += l.netAmountLocal ?? 0;
      base += this.lineBase(l);
      nonTaxable += this.lineNonTaxable(l);
      fodec += this.lineFodec(l);
      vat += this.lineVat(l);
      linesTtc += this.lineTtc(l);
    }
    const timbre = this.hasSupplier() ? (this.timbreAmount() ?? 0) : 0;
    const other = this.otherTaxes().reduce((sum, t) => sum + CostFormComponent.r3(t.amountLocal ?? 0), 0);
    // Autres taxes are added to the TTC; the RS is deducted from what is paid.
    const ttc = linesTtc + timbre + other;
    let rs = 0;
    const rate = this.hasSupplier() && this.rsApplied() ? this.rsRate() : null;
    if (rate) {
      // Timbre, autres taxes and the part outside the VAT scope are never in the base (V101, V102).
      const amount = this.selectedRsBase() === 'TVA' ? vat : base + fodec + vat;
      rs = CostFormComponent.r3(amount * rate);
    }
    return { ht, nonTaxable, fodec, vat, timbre, other, ttc, rs, netToPay: ttc - rs };
  });

  /** TVA per rate, like the invoice detail's breakdown: rates ascending, typed VAT last. */
  readonly vatBreakdown = computed(() => {
    const byRate = new Map<string, { rate: number | null; base: number; vat: number }>();
    for (const l of this.lines()) {
      const rate = this.hasSupplier() && l.tvaRate != null ? l.tvaRate : null;
      const key = rate === null ? 'manual' : String(rate);
      const acc = byRate.get(key) ?? { rate, base: 0, vat: 0 };
      acc.base += this.lineBase(l) + this.lineFodec(l);   // TVA base = base + FODEC
      acc.vat += this.lineVat(l);
      byRate.set(key, acc);
    }
    return [...byRate.values()]
      .filter(b => b.vat !== 0 || b.rate !== null)
      .sort((a, b) => (a.rate ?? 99) - (b.rate ?? 99));
  });

  pct(rate: number): string { return String(Math.round(rate * 10000) / 100); }

  // ── Validation ──────────────────────────────────────────────────────────────

  /** An "autre taxe" needs a non-zero amount and a type or a label (as the server checks). */
  otherTaxComplete(t: OtherTaxForm): boolean {
    return !!t.amountLocal && (t.taxTypeId !== null || t.label.trim().length > 0);
  }

  private lineComplete(l: LineForm): boolean {
    return !!l.costCategoryId && l.description.trim().length > 0 && (l.netAmountLocal ?? 0) > 0
      && this.lineBaseValid(l);
  }

  readonly invoiceNumberMissing = computed(() =>
    this.hasSupplier() && this.supplierInvoiceNumber().trim().length === 0);

  /** RS ticked but no rate chosen. */
  readonly rsRateMissing = computed(() =>
    this.hasSupplier() && this.rsApplied() && this.rsRate() == null);

  canSave = computed(() =>
    !this.lockedForUser() &&
    (!this.validatedMode() || this.justification().trim().length >= 5) &&
    !!this.paysId() &&
    !!this.invoiceDate() &&
    !!this.currencyId() &&
    !this.invoiceNumberMissing() &&
    !this.rsRateMissing() &&
    this.lines().length > 0 &&
    this.lines().every(l => this.lineComplete(l)) &&
    this.otherTaxes().every(t => this.otherTaxComplete(t)));

  readonly formatAmt = formatAmount;

  // ── Page header ─────────────────────────────────────────────────────────────

  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    const root: BreadcrumbItem = { label: this.translate.instant('COST.TABS.LINES'), link: ['/finance/cost'] };
    const id = this.editId();
    if (id === null) {
      return [root, { label: this.translate.instant('COST.FORM.TITLE_NEW') }];
    }
    return [
      root,
      { label: this.editReference() ?? `#${id}`, link: ['/finance/cost', id] },
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
      ? this.translate.instant('COST.FORM.SUB_EDIT', { id: this.editReference() ?? this.editId() })
      : this.translate.instant('COST.FORM.SUB_NEW');
  });

  readonly headerBadges = computed<PageHeaderBadge[]>(() => {
    this.translate.currentLang();
    return this.validatedMode()
      ? [{ label: this.translate.instant('COST.FORM.VALIDATED_BADGE'), variant: 'warning', dot: true }]
      : [{ label: this.translate.instant('COST.FORM.DRAFT_BADGE'), variant: 'teal', dot: true }];
  });

  readonly submitButtonOptions = computed<ButtonOptions>(() => {
    this.translate.currentLang();
    return {
      variant:   'teal',
      pill:      true,
      label:     this.translate.instant(this.validatedMode() ? 'COST.FORM.FOOT_SAVE_VALIDATED' : 'COST.FORM.FOOT_SUBMIT'),
      iconStart: this.validatedMode() ? 'save' : 'send',
      loading:   this.isSaving(),
      disabled:  !this.canSave() || this.isSaving(),
    };
  });

  readonly addLineButtonOptions = computed<ButtonOptions>(() => {
    this.translate.currentLang();
    return {
      variant: 'secondary', size: 'sm', iconStart: 'add',
      label: this.translate.instant('COST.FORM.ADD_LINE'),
      disabled: !this.paysId(),
    };
  });

  readonly addOtherTaxButtonOptions = computed<ButtonOptions>(() => {
    this.translate.currentLang();
    return {
      variant: 'secondary', size: 'sm', iconStart: 'add',
      label: this.translate.instant('COST.FORM.OTHER_TAX.ADD'),
      disabled: !this.paysId(),
    };
  });

  /** From an edit, back to the invoice itself; from a new invoice, back to the list. */
  cancel(): void {
    const id = this.editId();
    this.router.navigate(id !== null ? ['/finance/cost', id] : ['/finance/cost']);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  ngOnInit(): void {
    const idStr = this.route.snapshot.paramMap.get('id');
    if (idStr) {
      this.editId.set(+idStr);
      this.loadExisting(+idStr);
    } else {
      this.invoiceDate.set(new Date().toISOString().slice(0, 10));
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

    this.previewRefresh$.pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshPreviews());
  }

  private loadExisting(id: number): void {
    this.isPageLoading.set(true);
    this.costSvc.getCostInvoice(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: inv => {
        this.isPageLoading.set(false);
        this.fillFrom(inv);
      },
      error: () => {
        this.isPageLoading.set(false);
        this.error.set(this.translate.instant('COST.FORM.LOAD_ERROR'));
      },
    });
  }

  private fillFrom(inv: CostInvoiceDto): void {
    this.editReference.set(inv.reference);
    this.editStatus.set(inv.status);
    if (this.lockedForUser()) {
      this.error.set(this.translate.instant('COST.FORM.LOCKED_ERROR', { status: inv.status }));
    }
    this.invoiceCurrencyCode = inv.currency;
    this.onPaysChange(inv.paysId);
    this.supplierId.set(inv.supplierId);
    this.supplierQuery.set(inv.supplierName ?? '');
    this.supplierInvoiceNumber.set(inv.supplierInvoiceNumber ?? '');
    this.invoiceDate.set(inv.invoiceDate?.slice(0, 10) ?? '');
    this.paymentDueDate.set(inv.paymentDueDate?.slice(0, 10) ?? '');
    this.currencyId.set(inv.currencyId);
    this.notes.set(inv.notes ?? '');
    this.timbreAmount.set(inv.timbreAmount);
    this.rsApplied.set(inv.rsRate != null);
    this.rsRate.set(inv.rsRate);
    this.otherTaxes.set((inv.otherTaxes ?? []).map(t => ({
      key: this.nextTaxKey++,
      taxTypeId: t.taxTypeId,
      label: t.label ?? '',
      amountLocal: t.amountLocal,
    })));
    this.lines.set(inv.lines.map(l => ({
      key: this.nextKey++,
      id: l.id,
      costCategoryId: l.costCategoryId,
      costCategoryLabel: l.costCategoryLabel ?? '',
      costSubCategoryId: l.costSubCategoryId,
      costSubCategoryLabel: l.costSubCategoryLabel ?? '',
      description: l.label ?? '',
      netAmountLocal: l.netAmountLocal,
      vatAmountLocal: l.vatAmountLocal,
      fodecRate: l.fodecRate,
      tvaRate: l.tvaRate,
      affaireId: l.affaireId,
      costTypeId: l.costTypeId,
      hasNonTaxable: l.vatBaseLocal != null,
      vatBaseLocal: l.vatBaseLocal ?? null,
      lineTtcInput: l.grossAmountLocal,
    })));
    if (inv.supplierId !== null) this.loadSupplierProfile(inv.supplierId);
    this.schedulePreview();
  }

  /** Reads the supplier's calculation profile (V102) and switches the line entry to it. */
  private loadSupplierProfile(supplierId: number): void {
    this.costSvc.getSupplier(supplierId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: s => this.setSupplierProfile(s.costCalcProfile ?? 'STANDARD'),
      error: () => {},
    });
  }

  /**
   * Switching to a travel agency turns each line into "as printed": its current TTC becomes
   * the typed line amount and its HT the base, so nothing entered is lost. Back to STANDARD,
   * the lines keep their HT and base (the "partie hors champ" box stays ticked).
   */
  private setSupplierProfile(profile: 'STANDARD' | 'AGENCE_VOYAGE'): void {
    const wasAgency = this.isAgency();
    const ttcs = new Map(this.lines().map(l => [l.key, CostFormComponent.r3(this.lineTtc(l))]));
    this.supplierProfile.set(profile);
    if (this.isAgency() && !wasAgency) {
      this.lines.update(ls => ls.map(l => this.deriveAgencyHt({
        ...l,
        vatBaseLocal: l.vatBaseLocal ?? l.netAmountLocal,
        lineTtcInput: l.lineTtcInput ?? (l.netAmountLocal != null ? ttcs.get(l.key)! : null),
      })));
    }
    this.schedulePreview();
  }

  /** The RS box: unticking drops the rate; ticking picks the rate when the pays has only one. */
  onRsAppliedChange(applied: boolean): void {
    this.rsApplied.set(applied);
    if (!applied) {
      this.rsRate.set(null);
    } else if (this.rsRate() == null && this.withholdingRates().filter(v => v.ratePct != null).length === 1) {
      this.rsRate.set(this.withholdingRates().find(v => v.ratePct != null)!.ratePct! / 100);
    }
  }

  /** The "partie hors champ TVA" box of a standard line: the base starts at the whole HT. */
  onNonTaxableToggle(line: LineForm, on: boolean): void {
    this.patchLine(line.key, {
      hasNonTaxable: on,
      vatBaseLocal: on ? (line.vatBaseLocal ?? line.netAmountLocal) : null,
    });
  }

  /** Pays + supplier pre-filled when opened from a supplier page ("Nouvelle facture"). */
  private prefillFromQueryParams(): void {
    const params = this.route.snapshot.queryParamMap;
    const paysIdParam = params.get('paysId');
    const supplierIdParam = params.get('supplierId');
    if (paysIdParam) this.onPaysChange(+paysIdParam);
    if (supplierIdParam) {
      const sid = +supplierIdParam;
      this.supplierId.set(sid);
      this.costSvc.getSupplier(sid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: s => {
          this.supplierQuery.set(s.name);
          this.setSupplierProfile(s.costCalcProfile ?? 'STANDARD');
        },
        error: () => {},
      });
    }
  }

  // ── Pays & per-pays lists ───────────────────────────────────────────────────

  onPaysChange(id: number | null): void {
    const pid = id ? Number(id) : null;
    this.paysId.set(pid);
    if (!pid) return;

    this.costSvc.getListValues('CURRENCY', pid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
      const previous = this.currencies();
      this.currencies.set(v);
      const cur = this.currencyId();
      if (cur !== null && !v.some(c => c.id === cur)) {
        const code = previous.find(c => c.id === cur)?.code ?? this.invoiceCurrencyCode;
        if (code) this.currencyId.set(v.find(c => c.code === code)?.id ?? null);
      }
      this.schedulePreview();
    });
    this.costSvc.getListValues('COST_TYPE', pid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
      const previous = this.costTypes();
      this.costTypes.set(v);
      this.reconcileLineIds(previous, v, 'costTypeId');
    });
    this.costSvc.getListValues('VAT_RATE', pid).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.vatRates.set(v));
    this.costSvc.getListValues('WITHHOLDING_RATE', pid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
      this.withholdingRates.set(v);
      const rate = this.rsRate();
      if (rate != null && !v.some(r => r.ratePct === Math.round(rate * 10000) / 100)) this.rsRate.set(null);
    });
    this.costSvc.getListValues(OTHER_TAX_TYPE_LIST, pid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
      const previous = this.otherTaxTypes();
      this.otherTaxTypes.set(v);
      // Same code in the new pays → re-pointed; gone → the row keeps its label only.
      this.otherTaxes.update(ts => ts.map(t => {
        if (t.taxTypeId === null || v.some(x => x.id === t.taxTypeId)) return t;
        const code = previous.find(x => x.id === t.taxTypeId)?.code;
        if (!code) return t;
        return { ...t, taxTypeId: v.find(x => x.code === code)?.id ?? null };
      }));
    });
    this.affaireSvc.getAffaires({ paysId: pid, size: 200 }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(p => {
      const previous = this.affaires();
      this.affaires.set(p.content);
      // Affaires have no shared code across countries: one from the old pays is dropped.
      this.lines.update(ls => ls.map(l =>
        l.affaireId !== null && !p.content.some(a => a.id === l.affaireId) && previous.some(a => a.id === l.affaireId)
          ? { ...l, affaireId: null } : l));
    });
    this.costSvc.getListValues('COST_CATEGORY', pid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
      const previous = this.costCategories();
      this.costCategories.set(v);
      this.reconcileCategories(previous, v);
    });
    this.costSvc.getListValues('COST_SUB_CATEGORY', pid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
      const previous = this.costSubCategories();
      this.costSubCategories.set(v);
      this.reconcileSubCategories(previous, v);
    });
  }

  /**
   * Keeps each line's category valid when the pays changes: same code in the new country
   * → re-pointed; gone → cleared with its sub-category. A selection absent from the
   * PREVIOUS list too is left alone (edit mode's first load).
   */
  private reconcileCategories(previous: ListValueDto[], next: ListValueDto[]): void {
    this.lines.update(ls => ls.map(l => {
      const id = l.costCategoryId;
      if (id === null || next.some(c => c.id === id)) return l;
      const code = previous.find(c => c.id === id)?.code;
      if (!code) return l;
      const match = next.find(c => c.code === code && c.sourceType !== 'AUTO_PUSH');
      return match
        ? { ...l, costCategoryId: match.id, costCategoryLabel: match.labelFr }
        : { ...l, costCategoryId: null, costCategoryLabel: '', costSubCategoryId: null, costSubCategoryLabel: '' };
    }));
    this.schedulePreview();
  }

  private reconcileSubCategories(previous: ListValueDto[], next: ListValueDto[]): void {
    this.lines.update(ls => ls.map(l => {
      const id = l.costSubCategoryId;
      if (id === null || next.some(s => s.id === id)) return l;
      const code = previous.find(s => s.id === id)?.code;
      if (!code) return l;
      const match = next.find(s => s.code === code);
      return { ...l, costSubCategoryId: match?.id ?? null, costSubCategoryLabel: match?.labelFr ?? '' };
    }));
  }

  private reconcileLineIds(previous: ListValueDto[], next: ListValueDto[], field: 'costTypeId'): void {
    this.lines.update(ls => ls.map(l => {
      const id = l[field];
      if (id === null || next.some(v => v.id === id)) return l;
      const code = previous.find(v => v.id === id)?.code;
      if (!code) return l;
      return { ...l, [field]: next.find(v => v.code === code)?.id ?? null };
    }));
  }

  /** The pays picker itself: a supplier belongs to one pays, so it is dropped on a real change. */
  onPaysSelected(id: number | null): void {
    if (id !== this.paysId()) {
      this.supplierId.set(null);
      this.supplierQuery.set('');
      this.suppliers.set([]);
      this.setSupplierProfile('STANDARD');
    }
    this.onPaysChange(id);
  }

  // ── Supplier ────────────────────────────────────────────────────────────────

  onSupplierQueryChange(q: string): void {
    this.supplierQuery.set(q);
    if (!q) { this.supplierId.set(null); this.setSupplierProfile('STANDARD'); }
    this.supplierSearch$.next(q);
  }

  selectSupplier(s: SupplierSearchItem): void {
    this.supplierId.set(s.id);
    this.supplierQuery.set(s.name);
    this.suppliers.set([]);
    this.setSupplierProfile(s.costCalcProfile ?? 'STANDARD');
  }

  // ── Lines ───────────────────────────────────────────────────────────────────

  private emptyLine(): LineForm {
    return {
      key: this.nextKey++, id: null,
      costCategoryId: null, costCategoryLabel: '', costSubCategoryId: null, costSubCategoryLabel: '',
      description: '', netAmountLocal: null, vatAmountLocal: null,
      fodecRate: null, tvaRate: null, affaireId: null, costTypeId: null,
      hasNonTaxable: false, vatBaseLocal: null, lineTtcInput: null,
    };
  }

  addLine(): void {
    this.lines.update(ls => [...ls, this.emptyLine()]);
  }

  removeLine(key: number): void {
    this.lines.update(ls => ls.length > 1 ? ls.filter(l => l.key !== key) : ls);
    this.schedulePreview();
  }

  patchLine(key: number, patch: Partial<LineForm>, refreshPreview = true): void {
    this.lines.update(ls => ls.map(l => l.key === key ? this.deriveAgencyHt({ ...l, ...patch }) : l));
    if (refreshPreview) this.schedulePreview();
  }

  onLineCategorySelect(line: LineForm, values: string[]): void {
    const value = values[0] ?? '';
    if (!value) {
      this.patchLine(line.key, { costCategoryId: null, costCategoryLabel: '', costSubCategoryId: null, costSubCategoryLabel: '' });
      return;
    }
    const sep = value.indexOf('|');
    const id = Number(value.substring(0, sep));
    const code = this.costCategories().find(c => c.id === id)?.code;
    const subs = this.costSubCategories().filter(s => !!code && s.parentValueCode === code);
    // A category with exactly one sub-category picks it straight away.
    this.patchLine(line.key, {
      costCategoryId: id, costCategoryLabel: value.substring(sep + 1),
      costSubCategoryId: subs.length === 1 ? subs[0].id : null,
      costSubCategoryLabel: subs.length === 1 ? subs[0].labelFr : '',
    });
  }

  onLineSubCategorySelect(line: LineForm, values: string[]): void {
    const value = values[0] ?? '';
    if (!value) { this.patchLine(line.key, { costSubCategoryId: null, costSubCategoryLabel: '' }, false); return; }
    const sep = value.indexOf('|');
    this.patchLine(line.key, {
      costSubCategoryId: Number(value.substring(0, sep)), costSubCategoryLabel: value.substring(sep + 1),
    }, false);
  }

  /** `$event[0]` of a daf-select holding fractions → number | null. */
  rateOf(values: string[]): number | null {
    return values[0] !== undefined && values[0] !== '' ? +values[0] : null;
  }

  numberOf(v: unknown): number | null {
    return v === null || v === undefined || v === '' ? null : +v;
  }

  trackLine = (_: number, l: LineForm) => l.key;

  // ── Autres taxes (V95) ──────────────────────────────────────────────────────

  addOtherTax(): void {
    this.otherTaxes.update(ts => [...ts, { key: this.nextTaxKey++, taxTypeId: null, label: '', amountLocal: null }]);
  }

  removeOtherTax(key: number): void {
    this.otherTaxes.update(ts => ts.filter(t => t.key !== key));
    this.schedulePreview();
  }

  /** "Type (label)", the type alone, or the label alone — for the totals. */
  otherTaxName(t: OtherTaxForm): string {
    const v = this.otherTaxTypes().find(x => x.id === t.taxTypeId);
    const type = v ? this.valueLabel(v) : null;
    const label = t.label.trim();
    if (type && label) return type + ' (' + label + ')';
    return type ?? (label || this.translate.instant('COST.FORM.OTHER_TAX.TITLE'));
  }

  patchOtherTax(key: number, patch: Partial<OtherTaxForm>): void {
    this.otherTaxes.update(ts => ts.map(t => t.key === key ? { ...t, ...patch } : t));
    this.schedulePreview();
  }

  // ── Previews (forex on the HT total, approval route on the TTC) ─────────────

  schedulePreview(): void { this.previewRefresh$.next(); }

  /**
   * Forex panel: the invoice HT total. Approval route: the invoice TTC converted to EUR,
   * against every category of its lines — the same inputs CostApprovalService uses on submit.
   */
  private refreshPreviews(): void {
    const t = this.totals();
    const pid = this.paysId();
    const curr = this.currencies().find(c => c.id === this.currencyId());
    if (!t.ht || !curr || !pid) {
      this.forexPreview.set(null);
      this.circuitPreview.set(null);
      return;
    }
    this.previewLoading.set(true);
    this.costSvc.getForexPreview(t.ht, curr.code).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: fx => this.forexPreview.set(fx),
      error: () => this.forexPreview.set(null),
    });
    const categoryIds = this.lines().map(l => l.costCategoryId);
    this.costSvc.getForexPreview(t.ttc, curr.code).pipe(
      switchMap(fx => this.costSvc.getCircuitPreview(fx.montantEur, pid, categoryIds)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: cp => { this.circuitPreview.set(cp); this.previewLoading.set(false); },
      error: () => { this.circuitPreview.set(null); this.previewLoading.set(false); },
    });
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  saveDraft(): void { this.doSave(false); }
  submitInvoice(): void { this.doSave(true); }

  private buildRequest(): CreateCostInvoiceRequest {
    const withSupplier = this.hasSupplier();
    return {
      paysId:                this.paysId()!,
      supplierId:            this.supplierId(),
      supplierInvoiceNumber: withSupplier ? this.supplierInvoiceNumber().trim() : null,
      invoiceDate:           this.invoiceDate(),
      paymentDueDate:        this.paymentDueDate() || null,
      currencyId:            this.currencyId()!,
      timbreAmount:          withSupplier ? this.timbreAmount() : null,
      rsRate:                withSupplier && this.rsApplied() ? this.rsRate() : null,
      notes:                 this.notes().trim() || null,
      otherTaxes: this.otherTaxes().map(t => ({
        taxTypeId:   t.taxTypeId,
        label:       t.label.trim() || null,
        amountLocal: t.amountLocal!,
      })),
      lines: this.lines().map(l => ({
        id:                l.id,
        costCategoryId:    l.costCategoryId,
        costSubCategoryId: l.costSubCategoryId,
        description:       l.description.trim(),
        netAmountLocal:    l.netAmountLocal!,
        vatBaseLocal:      this.usesVatBase(l) ? l.vatBaseLocal : null,
        vatAmountLocal:    withSupplier ? null : l.vatAmountLocal,
        fodecRate:         withSupplier && !this.isAgency() ? l.fodecRate : null,
        tvaRate:           withSupplier ? l.tvaRate : null,
        affaireId:         l.affaireId,
        costTypeId:        l.costTypeId,
      })),
    };
  }

  private doSave(submit: boolean): void {
    if (!this.canSave() || this.isSaving()) return;
    this.isSaving.set(true);
    this.error.set(null);
    const req = this.buildRequest();

    if (this.validatedMode()) {
      // DAF edit of an APPROVED / POSTED invoice: status kept, change recorded with its reason.
      this.costSvc.editValidatedCostInvoice(this.editId()!, req, this.justification().trim())
        .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: inv => {
            const uploads = this.pendingFiles().filter(f => !f.error).map(f =>
              lastValueFrom(this.costSvc.addAttachment(inv.id, f.file)).catch(() => null));
            Promise.all(uploads).then(() => {
              this.isSaving.set(false);
              this.router.navigate(['/finance/cost', inv.id]);   // back to the invoice
            });
          },
          error: err => {
            this.isSaving.set(false);
            this.error.set(err.error?.message ?? this.translate.instant('COST.FORM.GENERIC_ERROR'));
          },
        });
      return;
    }
    const save$ = this.editId()
      ? this.costSvc.updateCostInvoice(this.editId()!, req)
      : this.costSvc.createCostInvoice(req);

    save$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: inv => {
        // Oversized files (flagged by daf-file-upload) are never sent.
        const uploads = this.pendingFiles().filter(f => !f.error).map(f =>
          lastValueFrom(this.costSvc.addAttachment(inv.id, f.file)).catch(() => null));
        Promise.all(uploads).then(() => {
          this.pendingFiles.set([]);
          if (!submit) { this.done(); return; }
          this.costSvc.submitCostInvoice(inv.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next:  () => this.done(),
            error: err => {
              // Saved, but not submitted: stay in edit mode on the saved draft.
              this.isSaving.set(false);
              this.error.set(err.error?.message ?? this.translate.instant('COST.FORM.SUBMIT_ERROR'));
              if (!this.editId()) this.router.navigate(['/finance/cost', inv.id, 'edit']);
            },
          });
        });
      },
      error: err => {
        this.isSaving.set(false);
        this.error.set(err.error?.message ?? this.translate.instant('COST.FORM.GENERIC_ERROR'));
      },
    });
  }

  private done(): void {
    this.isSaving.set(false);
    this.router.navigate(['/finance/cost']);
  }

  levelBg(level: string): string {
    return ({ L1: '#f1f5f9', L2: '#dbeafe', L3: '#fef3c7', L4: '#ffdad6' } as Record<string, string>)[level] ?? '#f1f5f9';
  }

  levelColor(level: string): string {
    return ({ L1: '#475569', L2: '#1d4ed8', L3: '#92400e', L4: '#ba1a1a' } as Record<string, string>)[level] ?? '#475569';
  }
}
