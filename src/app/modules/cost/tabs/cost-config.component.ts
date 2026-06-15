import {
  Component, OnInit, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CostService } from '../cost.service';
import { FactListService } from '../../../core/fact-list.service';
import { ClientService } from '../../clients/client.service';
import {
  CostCategoryDto, CostApprovalThresholdDto, ListValueDto, ListTypeDto,
  UpdateCostCategoryLabelRequest,
} from '../cost.model';
import { PaysRefDto } from '../../affaires/affaire.model';
import { forkJoin } from 'rxjs';

type ListTab = 'CURRENCY' | 'COST_TYPE' | 'PAYMENT_METHOD' | 'RECURRENCE_FREQUENCY';

@Component({
  selector: 'app-cost-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cost-config.component.html',
  styleUrl: './cost-config.component.scss',
})
export class CostConfigComponent implements OnInit {
  private readonly svc         = inject(CostService);
  private readonly factListSvc = inject(FactListService);
  private readonly clientSvc   = inject(ClientService);

  paysList = signal<PaysRefDto[]>([]);
  paysId   = signal<number>(0);

  // Thresholds
  thresholds      = signal<CostApprovalThresholdDto[]>([]);
  editThreshold   = signal<{ [id: number]: Partial<CostApprovalThresholdDto> }>({});
  thresholdSaving = signal<number | null>(null);
  thresholdError  = signal<string | null>(null);

  // Categories
  categories        = signal<CostCategoryDto[]>([]);
  editingCategoryId = signal<number | null>(null);
  isSavingCategory  = signal(false);
  categoryEditForm  = signal<UpdateCostCategoryLabelRequest>({});

  // List management
  activeListTab = signal<ListTab>('CURRENCY');
  listValues    = signal<ListValueDto[]>([]);
  listTypes     = signal<ListTypeDto[]>([]);
  listLoading   = signal(false);
  listError     = signal<string | null>(null);

  newValue   = { code: '', labelFr: '', labelEn: '', isDefault: false };
  isCreating = signal(false);
  createError = signal<string | null>(null);

  readonly LIST_TABS: ListTab[] = ['CURRENCY', 'COST_TYPE', 'PAYMENT_METHOD', 'RECURRENCE_FREQUENCY'];
  readonly LIST_TAB_LABELS: Record<ListTab, string> = {
    CURRENCY:             'Devises',
    COST_TYPE:            'Types de coût',
    PAYMENT_METHOD:       'Modes de paiement',
    RECURRENCE_FREQUENCY: 'Fréquences',
  };

  isLoading   = signal(false);
  serverError = signal<string | null>(null);

  ngOnInit(): void {
    this.isLoading.set(true);
    forkJoin({
      myPays: this.clientSvc.getMyPays(),
      allPays: this.clientSvc.getPays(),
    }).subscribe({
      next: ({ myPays, allPays }) => {
        this.paysList.set(allPays);
        const resolved = myPays ?? (allPays.length > 0 ? allPays[0].id : 0);
        if (resolved > 0) {
          this.paysId.set(resolved);
          this.loadAll();
        } else {
          this.serverError.set('Aucun pays configuré.');
          this.isLoading.set(false);
        }
      },
      error: () => {
        this.serverError.set('Impossible de charger les pays.');
        this.isLoading.set(false);
      },
    });
  }

  selectPays(id: number): void {
    if (id === this.paysId()) return;
    this.paysId.set(id);
    this.editThreshold.set({});
    this.editingCategoryId.set(null);
    this.loadAll();
  }

  private loadAll(): void {
    const pid = this.paysId();
    if (!pid) return;
    this.isLoading.set(true);
    this.serverError.set(null);
    forkJoin([
      this.svc.getThresholds(pid),
      this.svc.getCategories(pid),
    ]).subscribe({
      next: ([thresholds, categories]) => {
        this.thresholds.set(thresholds);
        this.categories.set(categories);
        this.isLoading.set(false);
      },
      error: err => {
        this.serverError.set(err.error?.message ?? 'Erreur de chargement.');
        this.isLoading.set(false);
      },
    });
    this.loadListTab(this.activeListTab());
  }

  // ── Threshold editing ──────────────────────────────────────────────────────

  getEdit(id: number): Partial<CostApprovalThresholdDto> {
    return this.editThreshold()[id] ?? {};
  }

  patchThreshold(id: number, field: string, value: string | number): void {
    this.editThreshold.update(m => ({ ...m, [id]: { ...m[id], [field]: value } }));
  }

  startEdit(t: CostApprovalThresholdDto): void {
    this.editThreshold.update(m => ({
      ...m,
      [t.id]: { minAmountEur: t.minAmountEur, maxAmountEur: t.maxAmountEur, approverRoleCode: t.approverRoleCode },
    }));
  }

  saveThreshold(t: CostApprovalThresholdDto): void {
    const patch = this.getEdit(t.id);
    if (!patch) return;
    this.thresholdSaving.set(t.id);
    this.thresholdError.set(null);
    this.svc.updateThreshold(t.id, patch as any).subscribe({
      next: updated => {
        this.thresholds.update(list => list.map(x => x.id === updated.id ? updated : x));
        this.editThreshold.update(m => { const c = { ...m }; delete c[t.id]; return c; });
        this.thresholdSaving.set(null);
      },
      error: err => {
        this.thresholdError.set(err.error?.message ?? 'Erreur de sauvegarde.');
        this.thresholdSaving.set(null);
      },
    });
  }

  cancelEdit(id: number): void {
    this.editThreshold.update(m => { const c = { ...m }; delete c[id]; return c; });
  }

  // ── Category label editing ────────────────────────────────────────────────

  startEditCategory(cat: CostCategoryDto): void {
    this.editingCategoryId.set(cat.id);
    this.categoryEditForm.set({
      labelFr:       cat.labelFr,
      labelEn:       cat.labelEn       ?? '',
      descriptionFr: cat.descriptionFr ?? '',
      descriptionEn: cat.descriptionEn ?? '',
    });
  }

  cancelCategoryEdit(): void {
    this.editingCategoryId.set(null);
    this.categoryEditForm.set({});
  }

  saveCategoryLabel(cat: CostCategoryDto): void {
    const form = this.categoryEditForm();
    this.isSavingCategory.set(true);
    this.svc.updateCategory(cat.id, form).subscribe({
      next: updated => {
        this.categories.update(list => list.map(c => c.id === updated.id ? updated : c));
        this.editingCategoryId.set(null);
        this.categoryEditForm.set({});
        this.isSavingCategory.set(false);
      },
      error: err => {
        this.serverError.set(err.error?.message ?? 'Erreur de sauvegarde.');
        this.isSavingCategory.set(false);
      },
    });
  }

  patchCategoryForm(field: keyof UpdateCostCategoryLabelRequest, value: string): void {
    this.categoryEditForm.update(f => ({ ...f, [field]: value }));
  }

  // ── List management ───────────────────────────────────────────────────────

  selectListTab(tab: ListTab): void {
    this.activeListTab.set(tab);
    this.loadListTab(tab);
  }

  loadListTab(tab: ListTab): void {
    const pid = this.paysId();
    if (!pid) return;
    this.listLoading.set(true);
    this.listError.set(null);
    this.factListSvc.refreshListValues(tab, pid).subscribe({
      next: values => {
        this.listValues.set(values);
        this.listLoading.set(false);
      },
      error: err => {
        this.listError.set(err.error?.message ?? 'Erreur de chargement.');
        this.listLoading.set(false);
      },
    });
  }

  createValue(): void {
    const pid = this.paysId();
    if (!this.newValue.code || !this.newValue.labelFr || !pid) return;
    this.isCreating.set(true);
    this.createError.set(null);
    this.factListSvc.createListValue(this.activeListTab(), {
      typeCode:  this.activeListTab(),
      paysId:    pid,
      code:      this.newValue.code,
      labelFr:   this.newValue.labelFr,
      labelEn:   this.newValue.labelEn || undefined,
      isDefault: this.newValue.isDefault,
    }).subscribe({
      next: created => {
        this.listValues.update(list => [...list, created]);
        this.newValue = { code: '', labelFr: '', labelEn: '', isDefault: false };
        this.isCreating.set(false);
      },
      error: err => {
        this.createError.set(err.error?.message ?? 'Erreur de création.');
        this.isCreating.set(false);
      },
    });
  }

  deactivate(id: number): void {
    if (!confirm('Désactiver cette valeur ?')) return;
    this.factListSvc.deactivateListValue(id).subscribe({
      next: () => this.listValues.update(list => list.filter(v => v.id !== id)),
      error: err => this.listError.set(err.error?.message ?? 'Erreur.'),
    });
  }
}
