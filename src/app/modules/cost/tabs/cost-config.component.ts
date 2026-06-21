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
  UpdateCostCategoryLabelRequest, CreateCostCategoryRequest, CreateCostApprovalThresholdRequest,
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

  // ── Thresholds ────────────────────────────────────────────────────────────
  thresholds           = signal<CostApprovalThresholdDto[]>([]);
  editThreshold        = signal<{ [id: number]: Partial<CostApprovalThresholdDto> }>({});
  thresholdSaving      = signal<number | null>(null);
  thresholdError       = signal<string | null>(null);
  showAddThreshold     = signal(false);
  isCreatingThreshold  = signal(false);
  createThresholdError = signal<string | null>(null);
  newThreshold = { level: 'L2', minAmountEur: null as number | null, maxAmountEur: null as number | null, approverRoleCode: '' };

  // ── Categories ────────────────────────────────────────────────────────────
  categories         = signal<CostCategoryDto[]>([]);
  editingCategoryId  = signal<number | null>(null);
  isSavingCategory   = signal(false);
  categoryEditForm   = signal<UpdateCostCategoryLabelRequest>({});
  showAddCategory    = signal(false);
  isCreatingCategory = signal(false);
  createCatError     = signal<string | null>(null);
  newCat = { code: '', labelFr: '', labelEn: '', categoryNumber: null as number | null, isCapex: false, isDirect: false, isOverhead: false };

  // ── List management ───────────────────────────────────────────────────────
  activeListTab = signal<ListTab>('CURRENCY');
  listValues    = signal<ListValueDto[]>([]);
  listTypes     = signal<ListTypeDto[]>([]);
  listLoading   = signal(false);
  listError     = signal<string | null>(null);

  newValue    = { code: '', labelFr: '', labelEn: '', isDefault: false };
  isCreating  = signal(false);
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
    this.showAddThreshold.set(false);
    this.showAddCategory.set(false);
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

  // ── Threshold CRUD ────────────────────────────────────────────────────────

  getEdit(id: number): Partial<CostApprovalThresholdDto> {
    return this.editThreshold()[id] ?? {};
  }

  patchThreshold(id: number, field: string, value: string | number): void {
    this.editThreshold.update(m => ({ ...m, [id]: { ...m[id], [field]: value } }));
  }

  startEdit(t: CostApprovalThresholdDto): void {
    this.showAddThreshold.set(false);
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

  saveNewThreshold(): void {
    if (!this.newThreshold.level || this.newThreshold.minAmountEur === null) {
      this.createThresholdError.set('Niveau et montant minimum sont requis.');
      return;
    }
    const dto: CreateCostApprovalThresholdRequest = {
      paysId:           this.paysId(),
      level:            this.newThreshold.level,
      minAmountEur:     Number(this.newThreshold.minAmountEur),
      maxAmountEur:     this.newThreshold.maxAmountEur != null ? Number(this.newThreshold.maxAmountEur) : null,
      approverRoleCode: this.newThreshold.approverRoleCode || null,
    };
    this.isCreatingThreshold.set(true);
    this.createThresholdError.set(null);
    this.svc.createThreshold(dto).subscribe({
      next: created => {
        this.thresholds.update(list =>
          [...list, created].sort((a, b) => (a.minAmountEur as number) - (b.minAmountEur as number)),
        );
        this.newThreshold = { level: 'L2', minAmountEur: null, maxAmountEur: null, approverRoleCode: '' };
        this.showAddThreshold.set(false);
        this.isCreatingThreshold.set(false);
      },
      error: err => {
        this.createThresholdError.set(err.error?.message ?? 'Erreur de création.');
        this.isCreatingThreshold.set(false);
      },
    });
  }

  deleteThreshold(id: number): void {
    if (!confirm('Désactiver ce seuil d\'approbation ?')) return;
    this.svc.deactivateThreshold(id).subscribe({
      next: () => this.thresholds.update(list => list.filter(t => t.id !== id)),
      error: err => this.thresholdError.set(err.error?.message ?? 'Erreur de désactivation.'),
    });
  }

  // ── Category CRUD ─────────────────────────────────────────────────────────

  startEditCategory(cat: CostCategoryDto): void {
    this.showAddCategory.set(false);
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

  saveNewCategory(): void {
    if (!this.newCat.code || !this.newCat.labelFr || !this.newCat.labelEn || this.newCat.categoryNumber === null) {
      this.createCatError.set('Numéro, code, libellé FR et libellé EN sont requis.');
      return;
    }
    const dto: CreateCostCategoryRequest = {
      paysId:         this.paysId(),
      code:           this.newCat.code.trim().toUpperCase(),
      labelFr:        this.newCat.labelFr.trim(),
      labelEn:        this.newCat.labelEn.trim(),
      categoryNumber: Number(this.newCat.categoryNumber),
      isCapex:        this.newCat.isCapex,
      isDirect:       this.newCat.isDirect,
      isOverhead:     this.newCat.isOverhead,
    };
    this.isCreatingCategory.set(true);
    this.createCatError.set(null);
    this.svc.createCategory(dto).subscribe({
      next: created => {
        this.categories.update(list =>
          [...list, created].sort((a, b) => a.categoryNumber - b.categoryNumber),
        );
        this.newCat = { code: '', labelFr: '', labelEn: '', categoryNumber: null, isCapex: false, isDirect: false, isOverhead: false };
        this.showAddCategory.set(false);
        this.isCreatingCategory.set(false);
      },
      error: err => {
        this.createCatError.set(err.error?.message ?? 'Erreur de création.');
        this.isCreatingCategory.set(false);
      },
    });
  }

  deleteCategory(id: number): void {
    if (!confirm('Désactiver cette catégorie ? Les lignes de coût associées ne seront pas supprimées.')) return;
    this.svc.deactivateCategory(id).subscribe({
      next: () => this.categories.update(list => list.filter(c => c.id !== id)),
      error: err => this.serverError.set(err.error?.message ?? 'Erreur de désactivation.'),
    });
  }

  // ── List values ───────────────────────────────────────────────────────────

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
