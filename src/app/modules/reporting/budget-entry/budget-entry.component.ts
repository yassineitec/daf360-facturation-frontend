import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import {
  ButtonComponent, FormFieldComponent, PageComponent, PageHeaderComponent,
  SelectComponent, SelectOption,
} from '@khalilrebhiitec/daf360';
import { ClientService } from '../../clients/client.service';
import { PaysRefDto, paysLabel } from '../../affaires/affaire.model';
import { PaysFlagSelectComponent, PaysFlagOption } from '../../../shared/pays-flag-select/pays-flag-select.component';
import { UserStore } from '../../../core/user.store';
import { BudgetReferenceService } from '../budget-reference.service';
import { GroupCatalogueLineService } from '../group-catalogue-line.service';
import { BudgetLineUpsert, BudgetReferenceDto, GroupCatalogueLineDto } from '../pl-reporting.model';

/**
 * Mirrors `reporting-list.component.ts`'s own `DisplayCurrencyPipe` usage
 * (`this.currency.transform(period.ebitda, 'TND')`) — that screen hardcodes `'TND'` as the
 * source currency too, because `PaysRefDto` (`modules/affaires/affaire.model.ts`) carries no
 * reporting-currency field reachable from `ClientService.getPays()`/`getPaysInUse()`. There
 * is therefore no real per-pays currency to resolve here either; this constant is the same
 * known simplification Task 3.1 already shipped, not a new one introduced by this task.
 */
const DEFAULT_CURRENCY = 'TND';

const MONTH_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

/**
 * P&L Reporting (F.08, Task 3.3) — Budget Reference entry: pays + year selector, then a
 * 13-catalogue-line x 12-month editable grid, batch-saved in one `upsertLines` call.
 *
 * The 13 catalogue lines (REVENUE + the 12 COST_CATEGORY codes, V98 seed) are global
 * (`pays_id IS NULL`) reference data, loaded once from `GET /group-catalogue-lines`
 * (`GroupCatalogueLineService`) — a real read id + labels, not a hardcoded mirror of the
 * migration's seed values and not dependent on any `PlReport`/`BudgetLine` already existing
 * (a brand-new `BudgetReference` from `createOrGet` comes back with `lines: []`, so the grid
 * must be able to render and save against catalogue lines before any budget line exists for
 * this pays/year — which this endpoint makes possible).
 */
@Component({
  selector: 'app-budget-entry',
  imports: [
    ReactiveFormsModule, TranslatePipe, PageComponent, PageHeaderComponent, ButtonComponent,
    FormFieldComponent, SelectComponent, PaysFlagSelectComponent,
  ],
  host: { class: 'block' },
  templateUrl: './budget-entry.component.html',
})
export class BudgetEntryComponent implements OnInit {
  private readonly budgetSvc = inject(BudgetReferenceService);
  private readonly catalogueSvc = inject(GroupCatalogueLineService);
  private readonly clientSvc = inject(ClientService);
  private readonly userStore = inject(UserStore);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  catalogueLines = signal<GroupCatalogueLineDto[]>([]);
  readonly monthIndexes = MONTH_INDEXES;
  readonly catalogueLineIdByCode = computed(() =>
    new Map(this.catalogueLines().map(l => [l.code, l.id])));

  // ── Pays selector — same pattern as reporting-list.component.ts ────────────
  paysList = signal<PaysRefDto[]>([]);
  paysId   = signal<number>(0);

  readonly paysOptions = computed<PaysFlagOption[]>(() =>
    this.paysList().map(p => ({
      value: String(p.id),
      label: `${paysLabel(p, this.translate.currentLang())} (${p.isoCode})`,
      isoCode: p.isoCode,
    })));

  readonly paysSelectLabel = computed(() => {
    this.translate.currentLang();
    return this.translate.instant('REPORTING.PAYS.LABEL');
  });

  readonly paysSelectPlaceholder = computed(() => {
    this.translate.currentLang();
    return this.translate.instant('REPORTING.PAYS.SEARCH');
  });

  onPaysSelected(values: string[]): void {
    const id = Number(values[0]);
    if (Number.isFinite(id) && id > 0 && id !== this.paysId()) {
      this.paysId.set(id);
      this.loadBudget();
    }
  }

  // ── Year selector — "current year ± 1" per Task 3.3's brief ────────────────
  private readonly currentYear = new Date().getFullYear();
  year = signal<number>(this.currentYear);

  readonly yearOptions = computed<SelectOption[]>(() =>
    [this.currentYear - 1, this.currentYear, this.currentYear + 1]
      .map(y => ({ value: String(y), label: String(y) })));

  onYearSelected(values: string[]): void {
    const y = Number(values[0]);
    if (Number.isFinite(y) && y !== this.year()) {
      this.year.set(y);
      this.loadBudget();
    }
  }

  // ── State ────────────────────────────────────────────────────────────────
  firstLoad = signal(true);
  loading   = signal(false);
  saving    = signal(false);
  error     = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  budgetRef     = signal<BudgetReferenceDto | null>(null);
  budgetChecked = signal(false);

  readonly canManage = computed(() => this.userStore.hasPermission('FACT_MANAGE_PL_REPORT'));
  readonly canAdmin  = computed(() => this.userStore.hasPermission('FACT_ADMIN_PL_REPORT'));

  readonly showEmptyState = computed(() =>
    !this.loading() && this.budgetChecked() && !this.budgetRef());

  readonly emptyStateText = computed(() => {
    this.translate.currentLang();
    return this.translate.instant('REPORTING.BUDGET.EMPTY', { year: this.year() });
  });

  readonly createButtonLabel = computed(() => {
    this.translate.currentLang();
    return this.translate.instant('REPORTING.BUDGET.CREATE', { year: this.year() });
  });

  readonly approvedCdText = computed(() => {
    this.translate.currentLang();
    const ref = this.budgetRef();
    if (!ref?.approvedBy) return this.translate.instant('REPORTING.BUDGET.NOT_APPROVED_CD');
    return this.translate.instant('REPORTING.BUDGET.APPROVED_CD', {
      date: this.formatDate(ref.approvalDate), id: ref.approvedBy,
    });
  });

  readonly approvedGroupText = computed(() => {
    this.translate.currentLang();
    const ref = this.budgetRef();
    if (!ref?.groupApprovedBy) return this.translate.instant('REPORTING.BUDGET.NOT_APPROVED_GROUP');
    return this.translate.instant('REPORTING.BUDGET.APPROVED_GROUP', {
      date: this.formatDate(ref.approvalDate), id: ref.groupApprovedBy,
    });
  });

  // ── Form: one row per catalogue line x 12 month controls ────────────────
  form = this.fb.group({ grid: this.fb.array<FormGroup>([]) });

  private buildGrid(): FormArray {
    return this.fb.array(this.catalogueLines().map(() => this.fb.group({
      months: this.fb.array(MONTH_INDEXES.map(() => this.fb.control<number | null>(null))),
    })));
  }

  get gridArray(): FormArray { return this.form.get('grid') as FormArray; }

  private monthsArray(rowIndex: number): FormArray {
    return (this.gridArray.at(rowIndex) as FormGroup).get('months') as FormArray;
  }

  monthControl(rowIndex: number, monthIndex: number) {
    return this.monthsArray(rowIndex).at(monthIndex);
  }

  setMonthValue(rowIndex: number, monthIndex: number, raw: string | number | null): void {
    this.monthControl(rowIndex, monthIndex).setValue(raw === '' || raw == null ? null : Number(raw));
  }

  private resetGrid(): void {
    this.form.setControl('grid', this.buildGrid());
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.firstLoad.set(true);
    forkJoin({
      myPays:    this.clientSvc.getMyPays(),
      allPays:   this.clientSvc.getPays(),
      paysInUse: this.clientSvc.getPaysInUse(),
      catalogueLines: this.catalogueSvc.list(),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ myPays, allPays, paysInUse, catalogueLines }) => {
        const inUseIds = new Set(paysInUse.map(p => p.id));
        const pays = [
          ...allPays.filter(p => inUseIds.has(p.id)),
          ...allPays.filter(p => !inUseIds.has(p.id)),
        ];
        this.paysList.set(pays);
        this.catalogueLines.set([...catalogueLines].sort((a, b) => a.sortOrder - b.sortOrder));
        const resolved = myPays ?? (pays.length > 0 ? pays[0].id : 0);
        if (resolved > 0) {
          this.paysId.set(resolved);
          this.loadBudget();
        } else {
          this.firstLoad.set(false);
          this.error.set(this.translate.instant('REPORTING.ERROR_PAYS'));
        }
      },
      error: () => {
        this.firstLoad.set(false);
        this.error.set(this.translate.instant('REPORTING.ERROR_PAYS'));
      },
    });
  }

  lineLabel(meta: GroupCatalogueLineDto): string {
    return this.translate.currentLang() === 'en' ? meta.labelEn : meta.labelFr;
  }

  readonly monthLabels = computed(() => {
    const locale = this.translate.currentLang() === 'en' ? 'en-GB' : 'fr-FR';
    return MONTH_INDEXES.map(i => {
      const label = new Date(2000, i, 1).toLocaleDateString(locale, { month: 'short' });
      return label.charAt(0).toUpperCase() + label.slice(1);
    });
  });

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const locale = this.translate.currentLang() === 'en' ? 'en-GB' : 'fr-FR';
    return new Date(iso).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // ── Data ─────────────────────────────────────────────────────────────────
  loadBudget(): void {
    const paysId = this.paysId();
    if (!paysId) return;
    this.loading.set(true);
    this.error.set(null);
    this.successMessage.set(null);
    this.budgetChecked.set(false);
    this.budgetSvc.getByPaysAndYear(paysId, this.year())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ref => {
          this.budgetRef.set(ref);
          this.budgetChecked.set(true);
          this.loading.set(false);
          this.firstLoad.set(false);
          if (ref) this.populateGridFrom(ref); else this.resetGrid();
        },
        error: () => {
          this.error.set(this.translate.instant('REPORTING.BUDGET.LOAD_ERROR'));
          this.loading.set(false);
          this.firstLoad.set(false);
          this.budgetChecked.set(true);
        },
      });
  }

  createBudget(): void {
    const paysId = this.paysId();
    if (!paysId) return;
    this.saving.set(true);
    this.error.set(null);
    this.budgetSvc.createOrGet(paysId, this.year())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ref => {
          this.budgetRef.set(ref);
          this.saving.set(false);
          this.populateGridFrom(ref);
        },
        error: () => {
          this.saving.set(false);
          this.error.set(this.translate.instant('REPORTING.BUDGET.LOAD_ERROR'));
        },
      });
  }

  private populateGridFrom(ref: BudgetReferenceDto): void {
    this.resetGrid();
    if (!ref.lines.length) return;
    const codeById = new Map<number, string>();
    this.catalogueLines().forEach(l => codeById.set(l.id, l.code));
    for (const line of ref.lines) {
      const code = codeById.get(line.catalogueLineId);
      if (!code) continue;
      const rowIndex = this.catalogueLines().findIndex(c => c.code === code);
      if (rowIndex === -1) continue;
      this.monthControl(rowIndex, line.month - 1).setValue(line.amountLocal);
    }
  }

  // ── Save / approve ───────────────────────────────────────────────────────
  save(): void {
    const ref = this.budgetRef();
    const idByCode = this.catalogueLineIdByCode();
    if (!ref || idByCode.size === 0) return;
    this.saving.set(true);
    this.error.set(null);
    this.successMessage.set(null);

    const lines: BudgetLineUpsert[] = [];
    this.catalogueLines().forEach((meta, rowIndex) => {
      const catalogueLineId = idByCode.get(meta.code);
      if (catalogueLineId == null) return;
      for (const m of MONTH_INDEXES) {
        const raw = this.monthControl(rowIndex, m).value;
        lines.push({
          catalogueLineId,
          month: m + 1,
          amountLocal: raw == null ? 0 : Number(raw),
          currency: DEFAULT_CURRENCY,
        });
      }
    });

    this.budgetSvc.upsertLines(ref.id, { lines })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updatedLines => {
          this.budgetRef.update(r => (r ? { ...r, lines: updatedLines } : r));
          this.saving.set(false);
          this.successMessage.set(this.translate.instant('REPORTING.BUDGET.SAVE_SUCCESS'));
        },
        error: () => {
          this.saving.set(false);
          this.error.set(this.translate.instant('REPORTING.BUDGET.SAVE_ERROR'));
        },
      });
  }

  approveCd(): void {
    const ref = this.budgetRef();
    if (!ref) return;
    this.budgetSvc.approveCd(ref.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => this.budgetRef.set(r),
      error: () => this.error.set(this.translate.instant('REPORTING.BUDGET.SAVE_ERROR')),
    });
  }

  approveGroup(): void {
    const ref = this.budgetRef();
    if (!ref) return;
    this.budgetSvc.approveGroup(ref.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => this.budgetRef.set(r),
      error: () => this.error.set(this.translate.instant('REPORTING.BUDGET.SAVE_ERROR')),
    });
  }
}
